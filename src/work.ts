import * as vscode from "vscode";
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import axios from "axios";
import { Configuration } from './configuration';
import { LookupConnectedSturdyRepositories, FindReposResponse } from './lookup_repos'
import { User, GetUser } from './user'
import {AlertMessageForConflicts, Conflict, Conflicts, ConflictsForRepo,} from './conflicts'
import { headersWithAuth } from "./api";

// workGeneration is a simple way to keep track of downstream workers
// if a worker notices that the workGeneration has increased, they need to stop themselves
let workGeneration = 0;

export async function Work(publicLogs: vscode .OutputChannel) {
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

    let user = await GetUser(conf)
    if (!user) {
        console.log("could not load user, aborting")
        displayLoginMessage()
        return;
    }

    publicLogs.appendLine("Welcome to Sturdy, " + user.name + "!");

    let repos : FindReposResponse | undefined;
    let didLogAboutNotInstalled = false;

    for (;;) {
        repos = await LookupConnectedSturdyRepositories(git, conf);
        if (!repos || !repos.repos) {
            console.log("could not find any repos, waiting 30s before trying again")
            
            if (!didLogAboutNotInstalled) {
                publicLogs.appendLine("Sturdy is not installed for any of the repositories in this Workspace. Go to https://getsturdy.com to set it up.")
                didLogAboutNotInstalled = true;
            }

            await new Promise((resolve) => setTimeout(resolve, 30000));
            continue;
        }
        break;
    }

    repos.repos.forEach((r) => {
        publicLogs.appendLine("Starting Sturdy for " + r.full_name);
    })

    pushLoop(git, user, conf, repos, publicLogs);
    conflictsLoop(repos, conf, git, publicLogs);
    vscode.workspace.onDidSaveTextDocument(async () => {
        if (!repos) return
        pushWorkDirState(git, conf, repos)
    })
}

async function pushWorkDirState(git: SimpleGit, conf: Configuration, repos: FindReposResponse) {
    let workingTreeDiff = await git.diff()
    let head = await git.revparse("HEAD");
    repos.repos.forEach((r) => {
        postWorkDirForRepo(conf, r.owner, r.name, workingTreeDiff, head)
    })
}

function displayLoginMessage() {
    vscode.window
        .showInformationMessage("To complete the setup of Sturdy, go to getsturdy.com and connect Sturdy with GitHub", ...["Setup"])
        .then((selection) => {
            if (selection === "Setup") {
                let uri = "https://getsturdy.com/vscode";
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
    repos: FindReposResponse,
    publicLogs: vscode.OutputChannel
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
            await handleConflicts(conf, repos, workingTreeDiff, publicLogs);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

async function conflictsLoop(repos: FindReposResponse, conf: Configuration, git: SimpleGit, publicLogs: vscode.OutputChannel) {
    let startedInWorkGeneration = workGeneration;

    for (; ;) {
        if (workGeneration > startedInWorkGeneration) {
            console.log("Stopping conflictsLoop in generation", workGeneration);
            return;
        }

        console.log("conflictsLoop")
        let workingTreeDiff = await getPatch(git);
        await handleConflicts(conf, repos, workingTreeDiff, publicLogs);
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

async function handleConflicts(conf: Configuration, repos: FindReposResponse, workingTreeDiff: string, publicLogs: vscode.OutputChannel) {
    await fetchConflicts(conf, repos, workingTreeDiff).then((conflicts: ConflictsForRepo[]) => {
        if (!equalConflicts(globalStateKnownConflicts, conflicts) && conflicts.length > 0) {
            let res = AlertMessageForConflicts(conflicts)

            if (res.anyConflicts) {
                publicLogs.appendLine(res.message)
                publicLogs.appendLine("See more at " + "https://getsturdy.com/repo/" + res.repoOwner + "/" + res.repoName)

                vscode.window
                    .showInformationMessage(res.message, ...["View"])
                    .then((selection) => {
                        if (selection === "View") {
                            let uri = "https://getsturdy.com/repo/" + res.repoOwner + "/" + res.repoName;
                            vscode.env.openExternal(vscode.Uri.parse(uri));
                        }
                    });
            }
        }

        globalStateKnownConflicts = conflicts;
    })
}

function fetchConflicts(conf: Configuration, repos: FindReposResponse, workingTreeDiff: string): Promise<ConflictsForRepo[]> {
    const requests: Promise<ConflictsForRepo | undefined>[] = repos.repos
        .filter((r) => r.enabled)
        .map((r) => {
            return getConflictsForRepo(conf, r.owner, r.name, workingTreeDiff);
        })

    return Promise.all<ConflictsForRepo | undefined>(requests).then(responses => {
        return responses.filter((r): r is ConflictsForRepo => r !== null).filter(r => r.conflicts);
    })
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
        git.push(["--force", remote, currentBranch + ":" + userID]);
    });
}

const postWorkDirForRepo = (conf: Configuration, owner: string, name: string, workingTreeDiff: string, head: string) => {
    try {
        axios.post(conf.api + "/v3/conflicts/workdir/" + owner + "/" + name,
        { 
            working_tree_diff: workingTreeDiff,
            head: head,
        },
        { headers: headersWithAuth(conf.token) })
    } catch (err) {
        console.log("failed to postWorkDirForRepo", err)
    }
}

const getConflictsForRepo = async (conf: Configuration, owner: string, name: string, workingTreeDiff: string): Promise<ConflictsForRepo | undefined> => {
    try {
        const response = await axios.post<Conflicts>(conf.api + "/v3/conflicts/check/" + owner + "/" + name,
            { working_tree_diff: workingTreeDiff },
            { headers: headersWithAuth(conf.token) })
        const d = response.data;
        return {
            conflicts: d,
            repoOwner: owner,
            repoName: name,
        };
    } catch (err) {
        console.log("failed to getConflictsForRepo", err)
        return undefined;
    }
};

function initGit(gitRepoPath: string): SimpleGit {
    console.log("init sturdy", gitRepoPath);
    const options: SimpleGitOptions = {
        baseDir: gitRepoPath,
        binary: "git",
        maxConcurrentProcesses: 6,
    };
    return simpleGit(options);
}
