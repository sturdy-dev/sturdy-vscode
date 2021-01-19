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

  if (gitRepoPath.length > 0) {
    work(gitRepoPath);
  } else {
    console.log("no repo path found, skipping work");
  }

  let setTokenCmd = vscode.commands.registerCommand("sturdy.auth", onSetToken);
  let onStart = vscode.commands.registerCommand("onStartupFinished", () => {
    if (gitRepoPath.length > 0) {
      work(gitRepoPath);
    } else {
      console.log("no repo path found, skipping work");
    }
  });

  context.subscriptions.push(setTokenCmd, onStart);
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
  let user = await getUser(conf);
  let reposRsp = await lookUp(git, conf);
  let knownConflicts: any[] = [];

  pushLoop(gitRepoPath, user, knownConflicts, conf, reposRsp);
  conflictsLoop(reposRsp, knownConflicts, conf);
}

async function pushLoop(
  gitRepoPath: string,
  user: any,
  knownConflicts: any[],
  conf: any,
  reposRsp: any
) {
  let remotes = remoteAddrs(conf, reposRsp);
  let git = init(gitRepoPath);
  let head = "";
  for (;;) {
    let currHead = await git.revparse("HEAD");
    if (head !== currHead) {
      remotes.forEach((r: any) => {
        push(git, r, user.data.id);
      });
      head = currHead;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      handleConflicts(conf, reposRsp, knownConflicts);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function conflictsLoop(reposRsp: any, knownConflicts: any[], conf: any) {
  for (;;) {
    handleConflicts(conf, reposRsp, knownConflicts);
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}

function isSetsEqual(a: Set<any>, b: Set<any>) {
  return (
    a.size === b.size &&
    [...a].every((value) => b.has(value)) &&
    [...b].every((value) => a.has(value))
  );
}

function equalConflicts(knownConflicts: any[], newConflicts: any[]) {
  let knownSet = new Set();
  let newSet = new Set();
  knownConflicts.forEach((i) => {
    knownSet.add(i.commit);
  });
  newConflicts.forEach((i) => {
    newSet.add(i.commit);
  });
  return isSetsEqual(newSet, knownSet);
}

function handleConflicts(conf: any, reposRsp: any, knownConflicts: any[]) {
  fetchConflicts(conf, reposRsp).then((conflicts: []) => {
    if (!equalConflicts(conflicts, knownConflicts)) {
      let msg =
        "You have conflicts: " +
        conflicts
          .map((c: any) => c.commit + " conflicts with " + c.counterpart)
          .join(" and\n");
      vscode.window
        .showInformationMessage(msg, ...["View"])
        .then((selection) => {
          if (selection === "View") {
            console.log(selection);
            let uri = "https://getsturdy.com/repo/";
            console.log(uri);
            vscode.env.openExternal(vscode.Uri.parse(uri));
          }
        });
    }
    knownConflicts = conflicts;
  });
}

function fetchConflicts(conf: any, repos: any): Promise<[]> {
  let enabledRepos = repos.data.filter((r: any) => r.enabled);
  return Promise.all(
    enabledRepos.map((r: any) => {
      return axios.get(
        conf.api + "/v3/conflicts/check/" + r.owner + "/" + r.name,
        {
          headers: {
            Cookie: "auth=" + conf.token,
            "Content-Type": "application/json",
          },
        }
      );
    })
  ).then((responses: any) => {
    return responses
      .map((r: any) => r.data.conflicts)
      .filter((r: any) => r)
      .flat();
  });
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

function remoteAddrs(conf: any, repos: any): string[] {
  let uri = vscode.Uri.parse(conf.remote);
  let base =
    uri.scheme + "://git:" + conf.token + "@" + uri.authority + uri.path;
  let out: string[] = [];
  repos.data
    .filter((r: any) => r.enabled)
    .forEach((r: any) => out.push(base + r.id + ".git"));
  return out;
}

function push(git: SimpleGit, remote: string, userID: string) {
  git.branch().then((br: any) => {
    let currentBranch = br.current;
    git.push(["--force", remote, currentBranch + ":" + userID]);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}

function getUser(conf: any) {
  return axios.get(conf.api + "/v3/user", {
    headers: {
      Cookie: "auth=" + conf.token,
      "Content-Type": "application/json",
    },
  });
}
async function lookUp(git: SimpleGit, conf: any) {
  let rsp = await git.remote(["-v"]);
  if (typeof rsp === "string") {
    let remotes = new Map();
    let lines = rsp
      .split("\n")
      .filter((l: string) => l.length > 0)
      .forEach((l: string) => {
        let tokens = l.split("\t");
        remotes.set(tokens[0], tokens[1].split(" ")[0]);
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
