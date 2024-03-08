import * as vscode from 'vscode';
import * as path from 'path';
import {calculateProgressDiff, MAX_OUTPUT} from './calculateProgress';
import {setDiagnostics} from './displayErrors';
import {fetchData} from './apiService';
export let intervalId: NodeJS.Timer | null = null;
export const ABSTR = 'abstr';
export let uuid = '';

/**
 * 項目を横並びにするために文字列の後にスペースを追加する関数
 * 指定文字数までスペースを追加する
 * @param {string} str スペースを追加する文字列
 * @param {number} num 何文字までスペースを追加するかを指定する数
 * @return {string} num文字までスペースを追加した文字列
 */
function padSpace(str: string, num = 9) {
  const padding = ' ';
  return str + padding.repeat(num - str.length);
}

/**
 * @fn
 * プログレスバーの足りない「#」を追加する関数
 * エラーがあれば，その数もプログレスバーの横にappendされる
 * @param {vscode.OutputChannel} channel 出力先のチャンネル
 * @param {number} numberOfProgress プログレス数（「#」の数）
 * @param {number} numberOfErrors エラー数，プログレス横に出力される
 */
function addMissingHashTags(
    channel: vscode.OutputChannel,
    numberOfProgress: number,
    numberOfErrors: number,
) {
  if (MAX_OUTPUT < numberOfProgress) {
    return;
  }
  const appendChunk = '#'.repeat(MAX_OUTPUT - numberOfProgress);
  channel.append(appendChunk);
  // エラーがあれば、その数を出力
  if (numberOfErrors) {
    channel.append(` *${numberOfErrors}`);
  }
  channel.appendLine('');
}

/**
 * Mizarコマンドを実行するPromiseを返す関数
 * @param {vscode.OutputChannel} channel 結果を出力するチャンネル
 * @param {string} command 実行するコマンド、デフォルトでは"verifier"となっている
 * @param {vscode.Uri} uri 対象ファイルのuri
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * @param {string} repositoryUrl 連携しているリポジトリのURL
 * @return {Promise<string>}
 */
export async function mizarVerify(
    channel: vscode.OutputChannel,
    command: string = 'verifier',
    uri: vscode.Uri,
    diagnosticCollection: vscode.DiagnosticCollection,
    repositoryUrl: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 出力している「#」の数を保存する変数
    let numberOfProgress = 0;
    // Parser,MSM,Analyzer等のコマンドから取得した項目をpushするリスト
    // 出力から得た項目(Parser,MSM等)が「コマンドを実行してから初めて得た項目なのか」を判定するために利用する
    const trackedPhases: string[] = [];

    let currentCommand = 'makeenv';
    const fileName = path.basename(String(uri));
    const body = {fileName, repositoryUrl, command};
    const options = {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {'Content-Type': 'application/json; charset=utf-8'},
    };

    fetchData('verifier', options)
        .then((json) => {
          uuid = json.ID;
          const updateProgress = () => {
            fetchData(`verifier/${json.ID}`)
                .then((json) => {
                  if (json.queueNum > 0) {
                    channel.replace(
                        `Your verification request is in queue. 
                        There are ${json.queueNum} requests ahead.`,
                    );
                    if (intervalId) {
                      clearInterval(intervalId);
                    }
                    intervalId = null;
                    setTimeout(() => {
                      intervalId = setInterval(updateProgress, 1000);
                    }, 5000);
                  }
                  if (json.isMakeenvFinish && currentCommand === 'makeenv') {
                    if (json.isMakeenvSuccess) {
                      channel.clear();
                      channel.appendLine(json.makeenvText);
                      channel.appendLine(
                          `Running ${command} on ${uri.fsPath}\n`,
                      );
                      channel.appendLine(
                          '   Start |----------------------' +
                          '--------------------------->| End',
                      );
                      currentCommand = 'verifier';
                    } else {
                      setDiagnostics(json.errorList, uri, diagnosticCollection);
                      if (intervalId) {
                        clearInterval(intervalId);
                      }
                      intervalId = null;
                      reject(new Error('makeenv error'));
                    }
                  }
                  if (currentCommand === 'verifier') {
                    const errorMsg = '\n**** Some errors detected.';
                    const progressPhases = json.progressPhases;

                    if (
                      trackedPhases[trackedPhases.length - 1] ===
                      progressPhases[progressPhases.length - 1]
                    ) {
                      const progressDiff = calculateProgressDiff(
                          json.progressPercent,
                          numberOfProgress,
                      );
                      const appendChunk = '#'.repeat(progressDiff);
                      channel.append(appendChunk);
                      numberOfProgress += progressDiff;
                    } else {
                      if (trackedPhases.length !== 0) {
                        // 直前の項目の#がMAX_OUTPUT未満であれば，足りない分の「#」を追加
                        addMissingHashTags(
                            channel,
                            numberOfProgress,
                            json.numOfErrors,
                        );
                      }
                      // 新しい項目なので，プログレスを初期化する
                      numberOfProgress = 0;
                      progressPhases.forEach((phase: string, i: number) => {
                        if (phase === trackedPhases[i]) {
                          return;
                        } else if (i === progressPhases.length - 1) {
                          // 出力の項目を横並びにするために，スペースを補完する
                          channel.append(`${padSpace(phase)}:`);
                          // OutputChannelに追加した項目として，phasesにpush
                          trackedPhases.push(phase);
                          const progressDiff = calculateProgressDiff(
                              json.progressPercent,
                              numberOfProgress,
                          );
                          const appendChunk = '#'.repeat(progressDiff);
                          channel.append(appendChunk);
                          numberOfProgress += progressDiff;
                        } else {
                          // 出力の項目を横並びにするために，スペースを補完する
                          channel.append(`${padSpace(phase)}:`);
                          // OutputChannelに追加した項目として，phasesにpush
                          trackedPhases.push(phase);
                          const appendChunk = '#'.repeat(MAX_OUTPUT);
                          channel.appendLine(appendChunk);
                        }
                      });
                    }

                    if (json.isVerifierFinish) {
                      addMissingHashTags(
                          channel,
                          numberOfProgress,
                          json.numOfErrors,
                      );
                      channel.appendLine('\nEnd.');
                      if (!json.isVerifierSuccess) {
                        channel.appendLine(errorMsg);
                        setDiagnostics(
                            json.errorList,
                            uri,
                            diagnosticCollection,
                        );
                      }
                      if (intervalId) {
                        clearInterval(intervalId);
                      }
                      intervalId = null;
                      resolve();
                    }
                  }
                })
                .catch((error) => {
                  vscode.window.showErrorMessage(error);
                  if (intervalId) {
                    clearInterval(intervalId);
                  }
                  intervalId = null;
                  reject(error);
                });
          };

          if (intervalId) {
            clearInterval(intervalId);
          }
          intervalId = null;
          intervalId = setInterval(updateProgress, 1000);
          updateProgress();
        })
        .catch((error) => {
          vscode.window.showErrorMessage(error);
          reject(error);
        });
  });
}
