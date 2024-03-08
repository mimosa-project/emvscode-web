import * as vscode from 'vscode';
import {ABSTR} from './mizarFunctions';

/**
 * 同ファイル内のホバーの情報を抽出して返す関数
 * @param {vscode.TextDocument} document ホバーしているドキュメント（ファイル）
 * @param {vscode.Range} wordRange ホバー対象のワードの範囲
 * @return {vscode.Hover} 抽出したホバー情報
 */
function returnHover(
    document: vscode.TextDocument,
    wordRange: vscode.Range,
): vscode.Hover | undefined {
  const documentText = document.getText();
  const hoveredWord = document.getText(wordRange);
  // ホバーによって示されるテキストの開始・終了インデックスを格納する変数
  let startIndex = -1;
  let endIndex = -1;
  // 定義・定理・ラベルの参照する箇所のパターンをそれぞれ格納
  const definitionPattern = ':\\s*' + hoveredWord + '\\s*:';
  const theoremPattern = 'theorem\\s*' + hoveredWord + '\\s*:';
  const labelPattern = new RegExp(hoveredWord + '\\s*:', 'g');
  //
  const preHoveredText = documentText.substring(
      0,
      document.offsetAt(wordRange.start) - 1,
  );
  if ((startIndex = documentText.search(definitionPattern)) > -1) {
    // 定義を参照する場合
    startIndex = documentText.lastIndexOf('definition', startIndex);
    endIndex =
      startIndex +
      documentText.slice(startIndex).search(/\send\s*;/g) +
      '\nend;'.length;
  } else if ((startIndex = documentText.search(theoremPattern)) > -1) {
    // 定理を参照する場合
    endIndex =
      startIndex +
      documentText.slice(startIndex).search(/(\sproof|;)/g) +
      '\n'.length;
  } else if (labelPattern.test(preHoveredText)) {
    // ラベルを参照する場合
    labelPattern.lastIndex = 0;
    const match = [...preHoveredText.matchAll(labelPattern)].pop();
    if (match && match.index) {
      startIndex = match.index;
    }
    endIndex =
      startIndex + documentText.slice(startIndex).search(/;/) + ';'.length;
  } else {
    // ホバー対象でない場合
    return;
  }

  const markdownString = new vscode.MarkdownString();
  markdownString.appendCodeblock(
      documentText.slice(startIndex, endIndex),
      'mizar',
  );
  return new vscode.Hover(markdownString, wordRange);
}

/**
 * 外部のファイルの定義・定理・スキームのホバー情報を抽出して返す関数
 * @param {vscode.TextDocument} document ホバーしているドキュメント
 * @param {vscode.Range} wordRange ホバー対象のワードの範囲
 * @return {Promise<vscode.Hover>} 抽出したホバー情報
 */
function returnMMLHover(
    document: vscode.TextDocument,
    wordRange: vscode.Range,
): Promise<vscode.Hover> {
  if (vscode.window.activeTextEditor === undefined) {
    vscode.window.showErrorMessage('error!');
    return new Promise((resolve, reject) => {
      reject(new Error('Not currently in .miz file!!'));
    });
  }
  const uri = vscode.window.activeTextEditor.document.uri;
  const hoverInformation: Promise<vscode.Hover> = new Promise((resolve) => {
    const hoveredWord = document.getText(wordRange).replace(/\s*:\s*/g, ':');
    const [fileName, referenceWord] = hoveredWord.split(':');
    // .absのファイルを参照する
    const absFileName = vscode.Uri.joinPath(
        uri,
        `../../${ABSTR}/${fileName.toLowerCase()}.abs`,
    );
    vscode.workspace.openTextDocument(absFileName).then(
        (document) => {
          const documentText = document.getText();
          // ホバーによって示されるテキストの開始・終了インデックスを格納する変数
          let startIndex = 0;
          let endIndex = 0;
          // hoveredWordは.absファイルで一意のキーになる
          const wordIndex = documentText.indexOf(hoveredWord);
          if (/def\s+\d+/.test(referenceWord)) {
            // definitionを参照する場合
            startIndex = documentText.lastIndexOf('definition', wordIndex);
            endIndex =
            wordIndex +
            documentText.slice(wordIndex).search(/end\s*;/) +
            'end;'.length;
          } else if (/sch\s+\d+/.test(referenceWord)) {
            // schemeを参照する場合
            startIndex = documentText.lastIndexOf('scheme', wordIndex);
            endIndex = wordIndex + documentText.slice(wordIndex).search(/;/);
          } else {
            // theoremを参照する場合
            startIndex = documentText.lastIndexOf('theorem', wordIndex);
            endIndex =
            wordIndex + documentText.slice(wordIndex).search(/;/) + ';'.length;
          }
          const markdownString = new vscode.MarkdownString();
          markdownString.appendCodeblock(
              documentText.slice(startIndex, endIndex),
              'mizar',
          );
          resolve(new vscode.Hover(markdownString, wordRange));
        },
        (e) => {
          vscode.window.showErrorMessage(`Not found ${fileName}`);
        },
    );
  });
  return hoverInformation;
}

/**
 * ホバーを提供するクラス
 */
export class HoverProvider implements vscode.HoverProvider {
  /**
   * ユーザがホバーするたびに呼び出されるメソッド
   * @param {vscode.TextDocument} document マウスでホバーしているドキュメント
   * @param {vscode.Position} position ホバーしているマウスのポジション
   * @return {vscode.ProviderResult<vscode.Hover>} ホバークラスのインスタンスを返す
   */
  public provideHover(
      document: vscode.TextDocument,
      position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    let wordRange: vscode.Range | undefined;
    // 外部ファイル（MML）の定義、定理、スキームを参照する場合
    // 「FUNCT_2:def 1」「FINSUB_1:13」「XBOOLE_0:sch 1」等を正規表現で取得する
    if (
      (wordRange = document.getWordRangeAtPosition(
          position,
          /(\w+\s*:\s*def\s+\d+|\w+\s*:\s*sch\s+\d+|\w+\s*:\s*\d+)/,
      ))
    ) {
      return returnMMLHover(document, wordRange);
    } else if (
      // 自身のファイル内の定義、定理、ラベルを参照する場合
      // 例：「by A1,A2;」「from IndXSeq(A12,A1);」「from NAT_1:sch 2(A5,A6)」
      // by A1,A2;
      (wordRange = document.getWordRangeAtPosition(
          position,
          // 正規表現は１行で書く必要があるため
          // eslint-disable-next-line max-len
          /(by\s+(\w+(,|\s|:)*)+|from\s+\w+(\s*:\s*sch\s+\d+)*\s*\((\s*\w+\s*,*)+\))/,
      ))
    ) {
      wordRange = document.getWordRangeAtPosition(position, /\w+/);
      if (!wordRange || document.getText(wordRange) === 'by') {
        return;
      }
      return returnHover(document, wordRange);
    }
  }
}
