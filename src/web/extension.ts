import * as vscode from 'vscode';
import * as path from 'path';
import {DefinitionProvider} from './goToDefinition';
import {HoverProvider} from './hover';
import {intervalId, mizarVerify, uuid} from './mizarFunctions';
import {formatMizar} from './formatter';
import {commitChanges} from './autoCommit';
import {lintMizar} from './linter';
import {fetchData} from './apiService';

let isExecuting = false;

/**
 * コマンドを実行する関数を返す関数
 * @param {vscode.OutputChannel} channel
 * 結果を出力するチャンネル
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * diagnosticsをセットするための引数、セットにより問題パネルへ表示される
 * @param {vscode.Memento} globalState
 * @param {string} command 実行するコマンドの名前
 * @return {function} コマンドを実行する処理の関数
 */
function returnExecutingFunction(
    channel: vscode.OutputChannel,
    diagnosticCollection: vscode.DiagnosticCollection,
    globalState: vscode.Memento & {
    setKeysForSync(keys: readonly string[]): void;
  },
    command: string,
) {
  return async () => {
    if (isExecuting) {
      vscode.window.showInformationMessage(
          'Another command is already executing.',
      );
      return;
    }
    // アクティブなエディタがなければエラーを示して終了
    if (vscode.window.activeTextEditor === undefined) {
      vscode.window.showErrorMessage('Not currently in .miz file!!');
      return;
    }
    // アクティブなファイルのパスを取得
    const uri = vscode.window.activeTextEditor.document.uri;
    // 拡張子を確認し、mizarファイルでなければエラーを示して終了
    if (path.extname(uri.fsPath) !== '.miz') {
      vscode.window.showErrorMessage('Not currently in .miz file!!');
      return;
    }
    const OAuthToken = vscode.workspace.getConfiguration('Mizar').OAuthToken;

    const repositoryPath = uri.path.match(/^((\/[^/]+){2})/);
    if (repositoryPath === null) {
      return;
    }
    const repositoryUrl = 'https://github.com' + repositoryPath[0];

    if (!OAuthToken) {
      vscode.window.showErrorMessage(
          'You have to set "Mizar.OAuthToken" in settings.json.',
      );
      return;
    }
    isExecuting = true;
    channel.clear();
    channel.show(true);
    diagnosticCollection.clear();
    // コマンド実行前にファイルを保存
    await vscode.window.activeTextEditor.document.save();

    try {
      await commitChanges(globalState, uri, OAuthToken, repositoryPath[0]);
      // makeenvとverifierの実行
      await mizarVerify(
          channel,
          command,
          uri,
          diagnosticCollection,
          repositoryUrl,
      );
    } catch (error) {
      console.log(error);
    } finally {
      isExecuting = false;
    }
  };
}

interface StrStrDictionary {
  [key: string]: string;
}

const MIZAR_COMMANDS: StrStrDictionary = {
  'mizar-verify': 'verifier',
  'mizar-irrths': 'irrths',
  'mizar-relinfer': 'relinfer',
  'mizar-trivdemo': 'trivdemo',
  'mizar-reliters': 'reliters',
  'mizar-relprem': 'relprem',
  'mizar-irrvoc': 'irrvoc',
  'mizar-inacc': 'inacc',
  'mizar-chklab': 'chklab',
};

/**
 * 拡張機能が有効になった際に実行される始まりの関数
 * @param {vscode.ExtensionContext} context
 * 拡張機能専用のユーティリティーを集めたオブジェクト
 */
export function activate(context: vscode.ExtensionContext) {
  // verifierの実行結果を出力するチャンネル
  const channel = vscode.window.createOutputChannel('Mizar output');
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('mizar');
  channel.show(true);
  const globalState = context.globalState;

  // Mizarコマンドの登録
  for (const cmd in MIZAR_COMMANDS) {
    if (MIZAR_COMMANDS.hasOwnProperty(cmd)) {
      context.subscriptions.push(
          vscode.commands.registerCommand(
              cmd,
              returnExecutingFunction(
                  channel,
                  diagnosticCollection,
                  globalState,
                  MIZAR_COMMANDS[cmd],
              ),
          ),
      );
    }
  }

  const hover = new HoverProvider();
  context.subscriptions.push(
      vscode.languages.registerHoverProvider('Mizar', hover),
  );

  const definition = new DefinitionProvider();
  context.subscriptions.push(
      vscode.languages.registerDefinitionProvider('Mizar', definition),
  );

  const stopCommand = vscode.commands.registerCommand('stop-command', () => {
    if (intervalId) {
      clearInterval(intervalId);
      vscode.window.showInformationMessage('Command stopped!');
      fetchData(`verifier/${uuid}`, {method: 'DELETE'});
    }
    isExecuting = false;
  });
  context.subscriptions.push(stopCommand);

  const formatter = vscode.commands.registerCommand(
      'format-mizar',
      formatMizar,
  );
  context.subscriptions.push(formatter);

  const linter = vscode.commands.registerCommand(
      'lint-mizar',
      lintMizar(diagnosticCollection),
  );
  context.subscriptions.push(linter);

  // 変更があったファイル名を保存（重複を避ける）
  context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const changedFilePath = event.document.uri.path;
        const changedFilePaths =
          globalState.get<string[]>('changedFilePaths') || [];
        if (!changedFilePaths.includes(changedFilePath)) {
          changedFilePaths.push(changedFilePath);
          await globalState.update('changedFilePaths', changedFilePaths);
        }
      }),
  );

  // 削除されたファイル名を保存（重複を避ける）
  context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles(async (event) => {
        for (const deletedFile of event.files) {
          const deletedFilePath = deletedFile.path;
          const changedFilePaths =
            globalState.get<string[]>('changedFilePaths') || [];
          if (!changedFilePaths.includes(deletedFilePath)) {
            changedFilePaths.push(deletedFilePath);
            await globalState.update('changedFilePaths', changedFilePaths);
          }
        }
      }),
  );
}

// this method is called when your extension is deactivated
// eslint-disable-next-line require-jsdoc
export function deactivate() { }
