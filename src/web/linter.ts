import * as vscode from 'vscode';
import * as path from 'path';
import {commitActiveFile} from './autoCommit';
import {fetchData} from './apiService';

interface ErrorDictionary {
  errorLine: number;
  errorColumn: number;
  errorMessage: string;
}

/**
 * Mizarリンターを実行する関数を返す関数
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * diagnosticsをセットするための引数
 * @return {Promise<void>}
 */
export function lintMizar(diagnosticCollection: vscode.DiagnosticCollection) {
  return async () => {
    const diagnostics: vscode.Diagnostic[] = [];
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

    const config = vscode.workspace.getConfiguration('Mizar').lint;
    const userSettingsObj = {
      MAX_PROOF_LINE_NUMBER: config.MAX_PROOF_LINE_NUMBER,
      MAX_NESTING_DEPTH: config.MAX_NESTING_DEPTH,
    };
    const userSettings = JSON.stringify(userSettingsObj);
    const fileName = path.basename(String(uri));
    const body = {fileName, repositoryUrl, userSettings};
    const options = {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {'Content-Type': 'application/json; charset=utf-8'},
    };
    if (!OAuthToken) {
      vscode.window.showErrorMessage(
          'You have to set "Mizar.OAuthToken" in settings.json.',
      );
      return;
    }
    diagnosticCollection.clear();
    await vscode.window.activeTextEditor.document.save();

    try {
      await commitActiveFile(uri, documentText, OAuthToken, repositoryPath[0]);

      fetchData('linter', options)
          .then((json) => {
            if (json.errorList.length > 0) {
              json.errorList.forEach((errorInfo: ErrorDictionary) => {
                const errorPosition = new vscode.Position(
                    errorInfo['errorLine'] - 1,
                    errorInfo['errorColumn'] - 1,
                );
                const errorRange =
                  new vscode.Range(errorPosition, errorPosition);
                const diagnostic = new vscode.Diagnostic(
                    errorRange,
                    errorInfo['errorMessage'],
                    2,
                );
                diagnostics.push(diagnostic);
              });
              diagnosticCollection.set(uri, diagnostics);
              vscode.commands.executeCommand('workbench.action.problems.focus');
            } else {
              vscode.window.showInformationMessage('No errors detected.');
            }
          });
    } catch (e) {
      console.log(e);
    }
  };
}
