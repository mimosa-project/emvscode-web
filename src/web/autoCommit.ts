/* eslint-disable camelcase */
import * as vscode from 'vscode';
import * as path from 'path';
import {Octokit} from '@octokit/rest';

const commitMessage = 'Commit with GitHub API';

interface Tree {
  path?: string | undefined;
  mode?: '100644' | '100755' | '040000' | '160000' | '120000' | undefined;
  type?: 'commit' | 'blob' | 'tree' | undefined;
  sha?: string | null | undefined;
  content?: string | undefined;
}

/**
 * GitHubリポジトリのデフォルトブランチを取得する関数
 * @param {Octokit} octokit Octokit インスタンス
 * @param {string} owner リポジトリの所有者
 * @param {string} repo リポジトリ名
 * @return {Promise<string>} デフォルトブランチの名前
 * @throws {Error} 取得中にエラーが発生した場合
 */
async function getDefaultBranch(octokit: Octokit, owner: string, repo: string) {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: owner,
      repo: repo,
    });
    return response.data.default_branch;
  } catch (error) {
    throw error;
  }
}

/**
 * GitHubリポジトリにverifierブランチが存在しない場合に、ブランチを作成する関数
 * @param {Octokit} octokit Octokit インスタンス
 * @param {string} owner リポジトリの所有者
 * @param {string} repo リポジトリ名
 * @return {Promise<void>} ブランチの作成を行う非同期関数
 * @throws {Error} 実行中にエラーが発生した場合
 */
async function ensureBranchExists(
    octokit: Octokit,
    owner: string,
    repo: string,
): Promise<void> {
  const branch = 'verifier';
  try {
    const existingBranches = (
      await octokit.repos.listBranches({
        owner,
        repo,
      })
    ).data;
    const branchExists = existingBranches.some(
        (branches) => branches.name === branch,
    );
    if (!branchExists) {
      const baseBranch = getDefaultBranch(octokit, owner, repo);
      const baseBranchRef = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: baseBranchRef.data.object.sha,
      });
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Base64形式の文字列をArrayBufferに変換する関数
 * @param {string} base64 変換するBase64形式の文字列
 * @return {ArrayBuffer} 変換されたArrayBuffer
 */
function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * アクティブなファイルの変更をコミットする関数
 * @param {vscode.Uri} uri アクティブなファイルのURI
 * @param {string} documentText ファイルの内容
 * @param {string} OAuthToken GitHub APIの認証トークン
 * @param {string} repositoryPath コミットするリポジトリのパス
 */
export async function commitActiveFile(
    uri: vscode.Uri,
    documentText: string,
    OAuthToken: string,
    repositoryPath: string,
) {
  const octokit = new Octokit({
    auth: OAuthToken,
    request: {
      cache: 'no-store',
    },
  });
  const repositoryInfo = repositoryPath.split('/', 3);
  const owner = repositoryInfo[1];
  const repo = repositoryInfo[2];
  const branch = 'verifier';

  const activeFilePath = uri.path;
  const repositoryNameIndex = activeFilePath.indexOf(`${repo}/`);
  const repoFilePath = activeFilePath
      .substring(repositoryNameIndex)
      .replace(`${repo}/`, '');

  try {
    await ensureBranchExists(octokit, owner, repo);
    const latestCommit = (
      await octokit.rest.repos.getBranch({owner, repo, branch})
    ).data.commit;

    let createdBlob;
    try {
      const existingFile = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: repoFilePath,
        ref: branch,
      });
      let content = '';
      if (Array.isArray(existingFile.data)) {
        const file = existingFile.data.find((f) => f.type === 'file');
        if (file) {
          content = new TextDecoder('utf-8').decode(
              base64ToArrayBuffer(file.content || ''),
          );
        }
      } else {
        if (existingFile.data.type === 'file') {
          content = new TextDecoder('utf-8').decode(
              base64ToArrayBuffer(existingFile.data.content || ''),
          );
        }
      }
      if (content === documentText) {
        return;
      }
      createdBlob = (
        await octokit.rest.git.createBlob({
          owner,
          repo,
          content: documentText,
        })
      ).data;
    } catch (error: any) {
      if (error.status === 404) {
        createdBlob = (
          await octokit.rest.git.createBlob({
            owner,
            repo,
            content: documentText,
          })
        ).data;
      } else {
        vscode.window.showErrorMessage(
            'Failed to commit changes. Error: ' + error,
        );
        throw error;
      }
    }

    const createdTree = (
      await octokit.rest.git.createTree({
        owner,
        repo,
        tree: [
          {
            type: 'blob',
            path: repoFilePath,
            mode: '100644',
            sha: createdBlob.sha,
          },
        ],
        base_tree: latestCommit.sha,
      })
    ).data;
    const createdCommit = (
      await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: createdTree.sha,
        parents: [latestCommit.sha],
      })
    ).data;
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: createdCommit.sha,
    });
  } catch (error) {
    vscode.window.showErrorMessage('Failed to commit changes. Error: ' + error);
    throw error;
  }
  return;
}

/**
 * ファイル削除のコミットを行う関数
 * @param {Octokit} octokit Octokit インスタンス
 * @param {string} owner リポジトリの所有者
 * @param {string} repo リポジトリ名
 * @param {string[]} deletedFilePaths 削除するファイルのパスの配列
 * @return {Promise<void>} 削除を行う非同期関数
 * @throws {Error} 実行中にエラーが発生した場合
 */
async function commitDeletions(
    octokit: Octokit,
    owner: string,
    repo: string,
    deletedFilePaths: string[],
) {
  const branch = 'verifier';
  for (const deletedFilePath of deletedFilePaths) {
    try {
      const existingFile = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: deletedFilePath,
        ref: branch,
      });
      let file_sha = '';
      if (Array.isArray(existingFile.data)) {
        existingFile.data.forEach((file) => {
          file_sha = file.sha;
        });
      } else {
        if (existingFile.data.type === 'file') {
          file_sha = existingFile.data.sha;
        }
      }
      const blob = (await octokit.rest.git.getBlob({owner, repo, file_sha}))
          .data;
      octokit.rest.repos.deleteFile({
        owner,
        repo,
        path: deletedFilePath,
        message: commitMessage,
        sha: blob.sha,
        branch,
      });
    } catch (error) {
      throw error;
    }
  }
}

/**
 * 変更のあったファイル全ての変更をコミットする関数
 * @param {vscode.Memento} globalState
 * @param {vscode.Uri} documentUri アクティブなドキュメントのURI
 * @param {string} OAuthToken GitHub APIの認証トークン
 * @param {string} repositoryPath コミットを行うリポジトリのパス
 */
export async function commitChanges(
    globalState: vscode.Memento & {
    setKeysForSync(keys: readonly string[]): void;
  },
    documentUri: vscode.Uri,
    OAuthToken: string,
    repositoryPath: string,
) {
  const octokit = new Octokit({
    auth: OAuthToken,
    request: {
      cache: 'no-store',
    },
  });

  const repositoryInfo = repositoryPath.split('/', 3);
  const owner = repositoryInfo[1];
  const repo = repositoryInfo[2];
  const branch = 'verifier';

  const changedFilePaths = globalState.get<string[]>('changedFilePaths') || [];
  const deletedFilePaths: string[] = [];

  try {
    if (changedFilePaths.length > 0) {
      const treeList: Tree[] = [];
      const iniFilePath = repositoryPath + '/mml.ini';
      changedFilePaths.push(iniFilePath);
      await ensureBranchExists(octokit, owner, repo);

      for (const changedFilePath of changedFilePaths) {
        if (changedFilePath.includes(repositoryPath)) {
          const repositoryNameIndex = changedFilePath.indexOf(`${repo}/`);
          const repoFilePath = changedFilePath
              .substring(repositoryNameIndex)
              .replace(`${repo}/`, '');

          const currentDocumentPath = documentUri.path;
          const relativePath = path.relative(
              currentDocumentPath,
              changedFilePath,
          );
          const resourceUri = vscode.Uri.joinPath(documentUri, relativePath);
          await vscode.workspace.openTextDocument(resourceUri).then(
              async (document) => {
                const documentText = document.getText();
                try {
                  const existingFile = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: repoFilePath,
                    ref: branch,
                  });
                  let content = '';
                  if (Array.isArray(existingFile.data)) {
                    const file =
                      existingFile.data.find((f) => f.type === 'file');
                    if (file) {
                      content = new TextDecoder('utf-8').decode(
                          base64ToArrayBuffer(file.content || ''),
                      );
                    }
                  } else {
                    if (existingFile.data.type === 'file') {
                      content = new TextDecoder('utf-8').decode(
                          base64ToArrayBuffer(existingFile.data.content || ''),
                      );
                    }
                  }
                  if (content !== documentText) {
                    const createdBlob = (
                      await octokit.rest.git.createBlob({
                        owner,
                        repo,
                        content: documentText,
                      })
                    ).data;
                    treeList.push({
                      type: 'blob',
                      path: repoFilePath,
                      mode: '100644',
                      sha: createdBlob.sha,
                    });
                  }
                } catch (error: any) {
                  if (error.status === 404) {
                    const createdBlob = (
                      await octokit.rest.git.createBlob({
                        owner,
                        repo,
                        content: documentText,
                      })
                    ).data;
                    treeList.push({
                      type: 'blob',
                      path: repoFilePath,
                      mode: '100644',
                      sha: createdBlob.sha,
                    });
                  } else {
                    vscode.window.showErrorMessage(
                        'Failed to commit changes. Error: ' + error,
                    );
                  }
                }
              },
              (error) => {
                deletedFilePaths.push(repoFilePath);
              },
          );
        }
      }

      const latestCommit = (
        await octokit.rest.repos.getBranch({owner, repo, branch})
      ).data.commit;

      if (treeList.length > 0) {
        const createdTree = (
          await octokit.rest.git.createTree({
            owner,
            repo,
            tree: treeList,
            base_tree: latestCommit.sha,
          })
        ).data;
        const createdCommit = (
          await octokit.rest.git.createCommit({
            owner,
            repo,
            message: commitMessage,
            tree: createdTree.sha,
            parents: [latestCommit.sha],
          })
        ).data;
        await octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${branch}`,
          sha: createdCommit.sha,
        });

        vscode.window.showInformationMessage('Committed modified files.');
      } else if (deletedFilePaths.length > 0) {
        commitDeletions(octokit, owner, repo, deletedFilePaths);
      } else {
        vscode.window.showInformationMessage('No changes to commit.');
      }
      await globalState.update('changedFilePaths', []);
    }
  } catch (error) {
    vscode.window.showErrorMessage('Failed to commit changes. Error: ' + error);
    throw error;
  }
  return;
}
