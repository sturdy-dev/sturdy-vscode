import * as vscode from "vscode";
import { Work } from './work'

export function activate(context: vscode.ExtensionContext) {
  let setTokenCmd = vscode.commands.registerCommand("sturdy.auth", onSetToken);
  let onWorkspaceChange = vscode.commands.registerCommand("onDidChangeWorkspaceFolders", Work);

  // Create output channel
  let publicLogs = vscode.window.createOutputChannel("Sturdy");

  Work(publicLogs)

  context.subscriptions.push(setTokenCmd, onWorkspaceChange);

  // Restart work if the configuration changes
  vscode.workspace.onDidChangeConfiguration(event => {
    console.log("onDidChangeConfiguration")
    let affected = event.affectsConfiguration("conf.sturdy");
    if (affected) {
      Work(publicLogs)
    }
  })
}

async function onSetToken() {
  const value = await vscode.window.showInputBox();
  vscode.workspace
    .getConfiguration()
    .update("conf.sturdy.token", value, vscode.ConfigurationTarget.Global);
  // No new work loop needs to be started here. The configuration-change event will take care of that! :-)
}

// this method is called when your extension is deactivated
export function deactivate() { }

