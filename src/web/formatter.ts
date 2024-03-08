import * as vscode from 'vscode';
import * as path from 'path';
import {commitActiveFile} from './autoCommit';
import {fetchData} from './apiService';

/**
 * Mizarフォーマッタを実行する関数
 */
export async function formatMizar() {
  if (vscode.window.activeTextEditor === undefined) {
    vscode.window.showErrorMessage('Not currently in .miz file!!');
    return;
  }
  const activeEditor = vscode.window.activeTextEditor;
  const documentText = vscode.window.activeTextEditor.document.getText();
  const uri = activeEditor.document.uri;

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
  await vscode.window.activeTextEditor.document.save();

  const firstLine = activeEditor.document.lineAt(0);
  const lastLine = activeEditor.document.lineAt(
      activeEditor.document.lineCount - 1,
  );
  const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

  const config = vscode.workspace.getConfiguration('Mizar').format;
  const userSettingsObj = {
    MAX_LINE_LENGTH: config.MAX_LINE_LENGTH,
    STANDARD_INDENTATION_WIDTH: config.STANDARD_INDENTATION_WIDTH,
    ENVIRON_DIRECTIVE_INDENTATION_WIDTH:
      config.ENVIRON_DIRECTIVE_INDENTATION_WIDTH,
    ENVIRON_LINE_INDENTATION_WIDTH: config.ENVIRON_LINE_INDENTATION_WIDTH,
    CUT_CENTER_SPACE: config.CUT_CENTER_SPACE,
    CUT_LEFT_SPACE: config.CUT_LEFT_SPACE,
    CUT_RIGHT_SPACE: config.CUT_RIGHT_SPACE,
  };
  const userSettings = JSON.stringify(userSettingsObj);

  const fileName = path.basename(String(uri));
  const body = {fileName, repositoryUrl, userSettings};
  const options = {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  };
  try {
    await commitActiveFile(uri, documentText, OAuthToken, repositoryPath[0]);

    fetchData('formatter', options)
        .then((json) => {
          activeEditor.edit((editBuilder) => {
            editBuilder.replace(textRange, json.fileContent);
          });
        });
  } catch (e) {
    console.log(e);
  }
}
