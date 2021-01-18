import * as vscode from "vscode";
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import axios from "axios";

export function activate(context: vscode.ExtensionContext) {
  console.log("activate", vscode.workspace.workspaceFolders);
  let gitRepoPath: string = "";
  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    gitRepoPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");

  if (gitRepoPath.length > 0) {
    work(gitRepoPath);
  } else {
    console.log("no repo path found, skipping work");
  }

  let setUpCmd = vscode.commands.registerCommand("sturdy.setup", onSetup);
  let setTokenCmd = vscode.commands.registerCommand("sturdy.auth", onSetToken);
  let onStart = vscode.commands.registerCommand("onStartupFinished", () => {
    if (gitRepoPath.length > 0) {
      work(gitRepoPath);
    } else {
      console.log("no repo path found, skipping work");
    }
  });

  context.subscriptions.push(setUpCmd, setTokenCmd, onStart);
}

function onSetup() {
  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");
  let gh =
    "https://github.com/login/oauth/authorize?client_id=f5fade2c5f3011c13536&redirect_uri=" +
    conf.api +
    "/v3/oauth/github&scope=repo%20read:user%20user:email";
  console.log(gh);
  vscode.env.openExternal(vscode.Uri.parse(gh));
}

async function onSetToken() {
  const value = await vscode.window.showInputBox();
  vscode.workspace
    .getConfiguration()
    .update("conf.sturdy.token", value, vscode.ConfigurationTarget.Global);
}

async function work(gitRepoPath: string) {
  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");
  let git = init(gitRepoPath);
  let repos = await lookUp(git, conf);
  // TODO
  var head = "";
  var knownConflicts = [];
  for (;;) {
    let currHead = await git.revparse("HEAD");
    if (head !== currHead) {
      push(git, conf.remote, conf.userId);
      head = currHead;
    }

    let rsp = await fetchConflicts(conf);
    if (rsp.data.conflicts.length > knownConflicts.length) {
      knownConflicts = rsp.data.conflicts;
      vscode.window.showInformationMessage(
        "You have conflicts: " +
          knownConflicts
            .map((c: any) => c.commit + " conflicts with " + c.counterpart)
            .join(" and\n")
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function fetchConflicts(conf: any) {
  return axios.post(
    conf.api + "/v3/plugins/conflicts",
    {
      repo_id: "magic",
      branch_name: conf.userId,
    },
    {
      headers: {
        Cookie: "auth=" + conf.token,
        "Content-Type": "application/json",
      },
    }
  );
}

function init(gitRepoPath: string): SimpleGit {
  console.log("init sturdy", gitRepoPath);
  const options: SimpleGitOptions = {
    baseDir: gitRepoPath,
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  return simpleGit(options);
}

function push(git: SimpleGit, remote: string, userID: string) {
  git.branch().then((br: any) => {
    let currentBranch = br.current;
    git.push(["--force", remote, currentBranch + ":" + userID]);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}

async function lookUp(git: SimpleGit, conf: any) {
  let rsp = await git.remote(["-v"]);
  if (typeof rsp === "string") {
    let remotes = new Map();
    let lines = rsp
      .split("\n")
      .filter((l: string) => l.length > 0)
      .forEach((l: string) => {
        let tokens = l.split("\t");
        remotes.set(tokens[0], tokens[1].split("s")[0]);
      });

    let out: { remote_name: string; remote_url: string }[] = [];
    remotes.forEach((k: any, v: any) => {
      out.push({ remote_name: v, remote_url: k });
    });

    return axios.post(
      conf.api + "/v3/conflicts/lookup",
      { repos: out },
      {
        headers: {
          Cookie: "auth=" + conf.token,
          "Content-Type": "application/json",
        },
      }
    );
  }
}
