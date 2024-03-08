import * as vscode from 'vscode';
import {ABSTR} from './mizarFunctions';

/**
 * カーソル箇所の単語の定義を返す関数
 * 同ファイル内で定義されているtheorem,definition,ラベル等の定義を返す
 * @param {vscode.TextDocument} document ユーザが開いているドキュメント
 * @param {vscode.Range} wordRange カーソルのある箇所の単語範囲
 * @return {vscode.Definition} カーソル箇所の単語の定義
 */
function returnDefinition(
    document: vscode.TextDocument,
    wordRange: vscode.Range,
): vscode.Definition {
  const documentText = document.getText();
  const selectedWord = document.getText(wordRange);
  // 定義箇所のインデックスを格納する変数
  let startIndex = 0;
  let endIndex = 0;
  // 定義・定理・ラベルの参照する箇所のパターンをそれぞれ格納
  const definitionPattern = ':\\s*' + selectedWord + '\\s*:';
  const theoremPattern = 'theorem\\s*' + selectedWord + '\\s*:';
  const labelPattern = new RegExp(selectedWord + '\\s*:', 'g');
  //
  const preHoveredText = documentText.substring(
      0,
      document.offsetAt(wordRange.start) - 1,
  );
  // 定義を参照する場合
  if ((startIndex = documentText.search(definitionPattern)) > -1) {
    endIndex = startIndex + definitionPattern.length;
  } else if ((startIndex = documentText.search(theoremPattern)) > -1) {
    endIndex = startIndex + theoremPattern.length;
  } else if (labelPattern.test(preHoveredText)) {
    labelPattern.lastIndex = 0;
    const match = [...preHoveredText.matchAll(labelPattern)].pop();
    if (match && match.index) {
      startIndex = match.index;
    }
    endIndex = startIndex + selectedWord.length;
  }
  const definitionRange: vscode.Range = new vscode.Range(
      document.positionAt(startIndex),
      document.positionAt(endIndex),
  );
  const definition = new vscode.Location(document.uri, definitionRange);
  return definition;
}

/**
 * カーソル箇所の単語の定義を返す関数
 * 外部のtheorem,definition等の定義を返す
 * @param {vscode.TextDocument} document ユーザが開いているドキュメント
 * @param {vscode.Range} wordRange カーソルのある箇所の単語範囲
 * @return {Promise<vscode.Definition>} カーソル箇所の単語の定義
 */
function returnABSDefinition(
    document: vscode.TextDocument,
    wordRange: vscode.Range,
): Promise<vscode.Definition> {
  if (vscode.window.activeTextEditor === undefined) {
    vscode.window.showErrorMessage('error!');
    return new Promise((resolve, reject) => {
      reject(new Error('Not currently in .miz file!!'));
    });
  }
  const uri = vscode.window.activeTextEditor.document.uri;
  const definition: Promise<vscode.Definition> = new Promise(
      (resolve, reject) => {
        const selectedWord =
          document.getText(wordRange).replace(/\s*:\s*/g, ':');
        const [fileName] = selectedWord.split(':');
        // .absのファイルを絶対パスで格納
        const absFileName = vscode.Uri.joinPath(
            uri,
            `../../${ABSTR}/${fileName.toLowerCase()}.abs`,
        );
        // 定義を参照するドキュメントから，定義箇所を指定して返す
        vscode.workspace.openTextDocument(absFileName).then(
            (document) => {
              const documentText = document.getText();
              const index = documentText.indexOf(selectedWord);
              const startPosition = document.positionAt(index);
              const endPosition =
                document.positionAt(index + selectedWord.length);
              const definitionRange =
                new vscode.Range(startPosition, endPosition);
              const definition =
                new vscode.Location(absFileName, definitionRange);
              resolve(definition);
            },
            // ドキュメントが開けなかった場合，その旨を表示
            (e) => {
              vscode.window.showErrorMessage(`Not found ${fileName}`);
              Error(`Not found ${fileName}`);
            },
        );
      },
  );
  return definition;
}

/**
 * 定義元を提供するクラス
 */
export class DefinitionProvider implements vscode.DefinitionProvider {
  /**
   * ユーザが定義元を参照する際に呼び出されるメソッド
   * @param {vscode.TextDocument} document 定義元の参照が発生したドキュメント
   * @param {vscode.Position} position 定義元の参照が発生した際のカーソルのポジション
   * @return {vscode.ProviderResult<vscode.Definition>}
   * 定義元の情報（パスと範囲）を持ったインスタンスを返す
   */
  public provideDefinition(
      document: vscode.TextDocument,
      position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    let wordRange: vscode.Range | undefined;
    if (
      // 外部の定義や定理，スキームを参照する場合
      // 例：「RELSET_1:8」「ZFMISC_1:def 10」「XBOOLE_0:sch 1」
      (wordRange = document.getWordRangeAtPosition(
          position,
          /(\w+\s*:\s*def\s+\d+|\w+\s*:\s*sch\s+\d+|\w+\s*:\s*\d+)/,
      ))
    ) {
      return returnABSDefinition(document, wordRange);
    } else if (
      // 自身のファイル内の定義、定理、ラベルを参照する場合
      // 例：「by A1,A2;」「from IndXSeq(A12,A1);」「from NAT_1:sch 2(A5,A6)」
      // by A1,A2;
      document.getWordRangeAtPosition(
          position,
          // 正規表現は１行で書く必要があるため
          // eslint-disable-next-line max-len
          /(by\s+(\w+(,|\s|:)*)+|from\s+\w+(\s*:\s*sch\s+\d+)*\s*\((\s*\w+\s*,*)+\))/,
      )
    ) {
      wordRange = document.getWordRangeAtPosition(position, /\w+/);
      if (!wordRange || document.getText(wordRange) === 'by') {
        return;
      }
      return returnDefinition(document, wordRange);
    }
  }
}
