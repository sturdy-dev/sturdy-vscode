import * as vscode from "vscode";
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export function activate(context: vscode.ExtensionContext) {
  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");
  work();
  let disposable = vscode.commands.registerCommand("sturdy.setup", () => {
    let gh =
      "https://github.com/login/oauth/authorize?client_id=f5fade2c5f3011c13536&redirect_uri=" +
      conf.api +
      "/v3/oauth/github&scope=repo%20read:user%20user:email";
    console.log(gh);
    vscode.env.openExternal(vscode.Uri.parse(gh));
  });
  let setToken = vscode.commands.registerCommand("sturdy.auth", async () => {
    const value = await vscode.window.showInputBox();
    vscode.workspace
      .getConfiguration()
      .update("conf.sturdy.token", value, vscode.ConfigurationTarget.Global);
  });
  let onStart = vscode.commands.registerCommand("onStartupFinished", () =>
    work()
  );

  context.subscriptions.push(disposable, onStart);
}

async function work() {
  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");
  let git = init();
  var head = "";
  var knownConflicts = [];
  for (;;) {
    let currHead = await git.revparse("HEAD");
    if (head !== currHead) {
      push(git, conf.remote, conf.userId);
      notifyPush(conf);
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

function notifyPush(conf: any) {
  return axios.post(
    conf.api + "/v3/plugins/notifypush",
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

const handleResponse = (response: AxiosResponse) => {
  console.log(response.data);
};

const handleError = (error: AxiosError) => {
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
  } else {
    console.log(error.message);
  }
};

function init(): SimpleGit {
  const options: SimpleGitOptions = {
    baseDir: process.cwd(),
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
