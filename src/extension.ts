import * as vscode from "vscode";
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import axios from "axios";

// workGeneration is a simple way to keep track of downstream workers
// if a worker notices that the workGeneration has increased, they need to stop themselves
let workGeneration = 0;

export function activate(context: vscode.ExtensionContext) {
  let setTokenCmd = vscode.commands.registerCommand("sturdy.auth", onSetToken);
  let onWorkspaceChange = vscode.commands.registerCommand("onDidChangeWorkspaceFolders", work);

  // Create output channel
  let publicLogs = vscode.window.createOutputChannel("Sturdy");

  work(publicLogs)

  context.subscriptions.push(setTokenCmd, onWorkspaceChange);

  // Restart work if the configuration changes
  vscode.workspace.onDidChangeConfiguration(event => {
    console.log("onDidChangeConfiguration")
    let affected = event.affectsConfiguration("conf.sturdy");
    if (affected) {
      vscode.window.showInformationMessage("Updated configuration for Sturdy, restarting...");
      work(publicLogs)
    }
  })
}

interface Configuration {
  token: string;
  api: string;
  remote: string;
}

async function onSetToken() {
  const value = await vscode.window.showInputBox();
  vscode.workspace
    .getConfiguration()
    .update("conf.sturdy.token", value, vscode.ConfigurationTarget.Global);
  // No new work loop needs to be started here. The configuration-change event will take care of that! :-)
}

async function work(publicLogs: vscode.OutputChannel) {
  workGeneration++
  console.log("work: generation:", workGeneration);

  const conf: Configuration | undefined = vscode.workspace.getConfiguration().get("conf.sturdy");
  if (!conf) {
    console.log("failed to load configuration, aborting")
    return;
  }

  if (!conf.token) {
    displayLoginMessage()
    return
  }

  // TODO: Support multiple repositories in the same VSCode Workspace?
  let gitRepoPath: string = "";
  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    gitRepoPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  if (!gitRepoPath) {
    console.log("no repo path found, skipping work");
    return
  }

  let git = initGit(gitRepoPath);

  let user = await getUser(conf)
  if (!user) {
    console.log("could not load user, aborting")
    displayLoginMessage()
    return;
  }

  publicLogs.appendLine("Welcome to Sturdy, " + user.name + "!");

  let repos = await lookUp(git, conf);
  if (!repos) {
    console.log("could not lookup repos, aborting")
    return;
  }

  repos.repos.forEach((r) => {
    publicLogs.appendLine("Starting Sturdy for " + r.full_name);
  })

  pushLoop(git, user, conf, repos);
  conflictsLoop(repos, conf, git);
}

function displayLoginMessage() {
  vscode.window
    .showInformationMessage("To complete the setup of Sturdy, go to getsturdy.com and connect Sturdy with GitHub", ...["Setup"])
    .then((selection) => {
      if (selection === "Setup") {
        let uri = "https://getsturdy.com/";
        vscode.env.openExternal(vscode.Uri.parse(uri));
      }
    });
}

async function getPatch(git: SimpleGit) {
  return await git.diff();
}

async function pushLoop(
  git: SimpleGit,
  user: User,
  conf: Configuration,
  repos: FindReposResponse
) {
  console.log("staring pushLoop")

  let remotes = remoteAddrs(conf, repos);
  let head = "";

  let startedInWorkGeneration = workGeneration;

  for (; ;) {
    if (workGeneration > startedInWorkGeneration) {
      console.log("Stopping pushLoop in generation", workGeneration);
      return;
    }

    let currHead = await git.revparse("HEAD");
    console.log("pushLoop", head, currHead)
    if (head !== currHead) {
      remotes.forEach((r: any) => {
        push(git, r, user.id);
      });
      head = currHead;
      await new Promise((resolve) => setTimeout(resolve, 2000));

      let workingTreeDiff = await getPatch(git);
      handleConflicts(conf, repos, workingTreeDiff);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function conflictsLoop(repos: FindReposResponse, conf: Configuration, git: SimpleGit) {
  let startedInWorkGeneration = workGeneration;

  for (; ;) {
    if (workGeneration > startedInWorkGeneration) {
      console.log("Stopping conflictsLoop in generation", workGeneration);
      return;
    }

    console.log("conflictsLoop")
    let workingTreeDiff = await getPatch(git);
    handleConflicts(conf, repos, workingTreeDiff);
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

function equalConflicts(knownConflicts: ConflictsForRepo[], newConflicts: ConflictsForRepo[]) {
  let knownSet = new Set();
  let newSet = new Set();

  knownConflicts.forEach((i) => {
    if (i.conflicts.conflicts) {
      i.conflicts.conflicts.forEach(c => {
        knownSet.add(c.commit)
      })
    }
  });
  newConflicts.forEach((i) => {
    if (i.conflicts.conflicts) {
      i.conflicts.conflicts.forEach(c => {
        newSet.add(c.commit)
      })
    }
  });
  return isSetsEqual(newSet, knownSet);
}

let globalStateKnownConflicts: ConflictsForRepo[] = [];

function handleConflicts(conf: Configuration, repos: FindReposResponse, workingTreeDiff: string) {
  fetchConflicts(conf, repos, workingTreeDiff).then((conflicts: ConflictsForRepo[]) => {
    console.log("fetched conflicts", conflicts)

    if (!equalConflicts(globalStateKnownConflicts, conflicts) && conflicts.length > 0) {
      let first = conflicts[0]
      let repoOwner = first.repoOwner
      let repoName = first.repoName

      let msg = "You have conflicts:\n";

      conflicts.forEach(c => {
        c.conflicts.conflicts.forEach(cc => {
          msg += cc.commit + " conflicts with " + cc.counterpart + "\n"
        })
      })

      vscode.window
        .showInformationMessage(msg, ...["View"])
        .then((selection) => {
          if (selection === "View") {
            let uri = "https://getsturdy.com/repo/" + repoOwner + "/" + repoName;
            vscode.env.openExternal(vscode.Uri.parse(uri));
          }
        });
    }

    globalStateKnownConflicts = conflicts;
  })
}

function fetchConflicts(conf: Configuration, repos: FindReposResponse, workingTreeDiff: string): Promise<ConflictsForRepo[]> {
  console.log("fetch conflicts")

  const requests: Promise<ConflictsForRepo>[] = repos.repos
    .filter((r) => r.enabled)
    .map((r) => {
      return getConflictsForRepo(conf, r.owner, r.name, workingTreeDiff);
    })

  return Promise.all<ConflictsForRepo>(requests).then(responses => {
    return responses.filter(r => r.conflicts)
  })
}

function initGit(gitRepoPath: string): SimpleGit {
  console.log("init sturdy", gitRepoPath);
  const options: SimpleGitOptions = {
    baseDir: gitRepoPath,
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  return simpleGit(options);
}

function remoteAddrs(conf: Configuration, repos: FindReposResponse): string[] {
  let uri = vscode.Uri.parse(conf.remote);
  let base =
    uri.scheme + "://git:" + conf.token + "@" + uri.authority + uri.path;
  let out: string[] = [];
  repos.repos
    .filter((r: any) => r.enabled)
    .forEach((r: any) => out.push(base + r.id + ".git"));
  return out;
}

function push(git: SimpleGit, remote: string, userID: string) {
  git.branch().then((br: any) => {
    let currentBranch = br.current;
    console.log("pushing", currentBranch, userID)
    git.push(["--force", remote, currentBranch + ":" + userID]);
  });
}

// this method is called when your extension is deactivated
export function deactivate() { }

interface User {
  id: string;
  name: string;
}

const getUser = async (conf: Configuration): Promise<User> => {
  try {
    const response = await axios.get<User>(conf.api + "/v3/user", {
      headers: {
        Cookie: "auth=" + conf.token,
        "Content-Type": "application/json",
      }
    });
    const user = response.data;
    return user;
  } catch (err) {
    if (err && err.response) {
      // const axiosError = err as AxiosError<ServerError>
      // return axiosError.response.data;
      return err;
    }
    throw err;
  }
};

interface SturdyRepository {
  id: string;
  full_name: string;
  owner: string;
  name: string;
  enabled: Boolean;
}

interface FindReposResponse {
  repos: Array<SturdyRepository>;
}

const lookUp = async (git: SimpleGit, conf: Configuration): Promise<FindReposResponse> => {
  console.log("lookup")

  let rsp = await git.remote(["-v"]);
  if (typeof rsp === "string") {
    let remotes = new Map();

    rsp.split("\n")
      .filter((l: string) => l.length > 0)
      .forEach((l: string) => {
        let tokens = l.split("\t");
        remotes.set(tokens[0], tokens[1].split(" ")[0]);
      });

    let out: { remote_name: string; remote_url: string }[] = [];
    remotes.forEach((k: any, v: any) => {
      out.push({ remote_name: v, remote_url: k });
    });

    let payload = { repos: out };

    console.log("lookup", JSON.stringify(payload))

    try {
      const response = await axios.post<FindReposResponse>(conf.api + "/v3/conflicts/lookup",
        payload,
        {
          headers: {
            Cookie: "auth=" + conf.token,
            "Content-Type": "application/json",
          }
        });
      const res = response.data;
      return res;
    } catch (err) {
      if (err && err.response) {
        // const axiosError = err as AxiosError<ServerError>
        // return axiosError.response.data;
        return err;
      }
      throw err;
    }
  }

  return Promise.reject(new Error('could not get remotes'));
};

interface Conflict {
  commit: string;
  counterpart: string;
}

interface Conflicts {
  conflicts: Array<Conflict>;
}

interface ConflictsForRepo {
  conflicts: Conflicts
  repoOwner: string
  repoName: string
}

const getConflictsForRepo = async (conf: Configuration, owner: string, name: string, workingTreeDiff: string): Promise<ConflictsForRepo> => {
  try {
    console.log("getConflictsForRepo", owner, name, workingTreeDiff);

    const response = await axios.post<Conflicts>(conf.api + "/v3/conflicts/check/" + owner + "/" + name,
      { working_tree_diff: workingTreeDiff },
      {
        headers: {
          Cookie: "auth=" + conf.token,
          "Content-Type": "application/json",
        }
      });
    const d = response.data;
    return {
      conflicts: d,
      repoOwner: owner,
      repoName: name,
    };
  } catch (err) {
    if (err && err.response) {
      // const axiosError = err as AxiosError<ServerError>
      // return axiosError.response.data;
      return err;
    }
    throw err;
  }
};
