import * as vscode from "vscode";
import { GetUserWithToken } from "./user";
import { Work } from './work'
import { Configuration } from './configuration';
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import { LookupConnectedSturdyRepositories } from "./lookup_repos";
import * as api from "./api";

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

  // Push work dir
  vscode.workspace.onDidSaveTextDocument(async () => {
      let git = initGit();
      if (!git) return
      let conf: Configuration | undefined = vscode.workspace.getConfiguration().get("conf.sturdy");
      if (!conf) return
      let repos = await LookupConnectedSturdyRepositories(git, conf);
      if (!repos) return
      let workingTreeDiff = await git.diff()
      let head = await git.revparse("HEAD");
      repos.repos.forEach((r) => api.postWorkDirForRepo(conf, r.owner, r.name, workingTreeDiff, head))
  })
}

function initGit(): SimpleGit | undefined {
    let gitRepoPath: string = "";
    if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
    ) {
        gitRepoPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    if (!gitRepoPath) {
        return undefined
    }
    const options: SimpleGitOptions = {
        baseDir: gitRepoPath,
        binary: "git",
        maxConcurrentProcesses: 6,
    }
    return simpleGit(options);
}

async function onSetToken() {
  // Test token against the API
  const conf: Configuration | undefined = vscode.workspace.getConfiguration().get("conf.sturdy");
  if (!conf) {
    console.log("failed to load configuration, aborting")
    return;
  }

  let value = await vscode.window.showInputBox({
    placeHolder: "Paste your Sturdy Token here, and press enter...",
    ignoreFocusOut: true,
    validateInput: function (value): Thenable<string | undefined> {
      value = value.trim();
      return GetUserWithToken(conf, value).then(user => {
        if (!user) {
          return "The token seems to be invalid"
        }
        return undefined;
      })
    },
  });

  if (!value) {
    return;
  }

  value = value.trim();

  let user = await GetUserWithToken(conf, value)
  if (!user) {
    vscode.window
      .showInformationMessage("The provided Sturdy Token was invalid", ...["Abort", "Try Again"])
      .then((selection) => {
        if (selection === "Try Again") {
          onSetToken()
          return;
        }
      });
    return;
  }

  vscode.window.showInformationMessage("Logged in as " + user.name + "!", ...["OK"]);

  vscode.workspace
    .getConfiguration()
    .update("conf.sturdy.token", value, vscode.ConfigurationTarget.Global);

  // No new work loop needs to be started here. The configuration-change event will take care of that! :-)
}

// this method is called when your extension is deactivated
export function deactivate() { }

