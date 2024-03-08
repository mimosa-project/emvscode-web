import * as vscode from 'vscode';

/**
 * Mizar Serverの指定されたエンドポイントからデータを取得する関数
 * @param {string} endpoint リクエストを送るエンドポイント
 * @param {RequestInit} options fetch リクエストのオプション
 * @return {Promise<any>} 取得したデータの解決された Promise
 * @throws {Error} ネットワークレスポンスが正常でない場合、またはエラーが発生した場合
 */
export async function fetchData(
    endpoint: string,
    options: RequestInit = {},
): Promise<any> {
  const mizarServerBaseUrl = 'http://localhost:3000/api/v0.1/';
  const url = mizarServerBaseUrl + endpoint;
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return await response.json();
  } catch (error) {
    vscode.window.showErrorMessage('Error fetching data:' + error);
    throw error;
  }
}
