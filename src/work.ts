import * as vscode from "vscode";
import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import axios from "axios";
import { Configuration } from './configuration';
import { LookupConnectedSturdyRepositories, FindReposResponse } from './lookup_repos'
import { User, GetUser, RenewToken } from './user'
import { AlertMessageForConflicts, Conflict, Conflicts, ConflictsForRepo, StatusBarMessageForConflicts } from './conflicts'
import { headersWithAuth } from "./api";
import { setStatusBarText } from "./status_bar";

// workGeneration is a simple way to keep track of downstream workers
// if a worker notices that the workGeneration has increased, they need to stop themselves
let workGeneration = 0;
let disposables: vscode.Disposable[]  = []

export async function Work(publicLogs: vscode .OutputChannel) {
    for (;;) {
        let d = disposables.pop()
        if (!d) {
           break
        }
        d.dispose()
    }
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

    let maybeUser = await GetUser(conf)
    if (!maybeUser) {
        console.log("could not load user, aborting")
        displayLoginMessage()
        return;
    }
    let user = maybeUser;

    publicLogs.appendLine("Welcome to Sturdy, " + user.name + "!");

    // Renew auth!
    let newToken = await RenewToken(conf)
    if (newToken) {
        let mustToken = newToken;
        console.log("has_new", mustToken.has_new)
        if (mustToken.has_new && mustToken.token && mustToken.token.length > 10) {
            // Update the settings (this will trigger a restart of the extension)
            vscode.workspace
                .getConfiguration()
                .update("conf.sturdy.token", mustToken.token, vscode.ConfigurationTarget.Global)
        }
    }

    let maybeRepos : FindReposResponse | undefined;
    let didLogAboutNotInstalled = false;

    for (;;) {
        maybeRepos = await LookupConnectedSturdyRepositories(git, conf);
        if (!maybeRepos || !maybeRepos.repos) {
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

    let repos : FindReposResponse  = maybeRepos;

    repos.repos.forEach((r) => {
        publicLogs.appendLine("Starting Sturdy for " + r.full_name);
    })

    // Changes is a message bus
    // Downstream workers will send events to this bus, to let us know that we should push state to Sturdy
    let changes = new vscode.EventEmitter<Change>();

    let timeout: NodeJS.Timeout | undefined

    changes.event(async (e) => {
        console.log("change from", e.from)

        if (timeout) {
            return
        }

        pushToSturdy(git, user, remotes);
        await pushWorkDirState(git, conf, repos)

        timeout = setTimeout(async () => {
            pushToSturdy(git, user, remotes)
            await pushWorkDirState(git, conf, repos)
            timeout = undefined
        }, 200)
    })

    let remotes = remoteAddrs(conf, repos);

    gitHeadChangeLoop(git, changes);
    conflictsLoop(repos, conf, git, publicLogs);

    let onSave =  vscode.workspace.onDidSaveTextDocument(() => {
        changes.fire({from: "save"})
    });

    // Mark disposable resources
    // These will be disposed if Work is restarted
    disposables.push(
       changes,
       onSave,
    )
}

interface Change {
    from: string;
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

async function gitHeadChangeLoop(
    git: SimpleGit,
    changes: vscode.EventEmitter<Change>,
) {
    let head = "";
    let startedInWorkGeneration = workGeneration;

    for (; ;) {
        if (workGeneration > startedInWorkGeneration) {
            console.log("Stopping pushLoop in generation", workGeneration);
            return;
        }

        let currHead = await git.revparse("HEAD");
        if (head !== currHead) {
            head = currHead;
            changes.fire({"from": "git"})
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

function pushToSturdy(
    git: SimpleGit,
    user: User,
    remotes: string[],
) {
    remotes.forEach((r: any) => {
        push(git, r, user.id);
    });
}

async function conflictsLoop(repos: FindReposResponse, conf: Configuration, git: SimpleGit, publicLogs: vscode.OutputChannel) {
    let startedInWorkGeneration = workGeneration;

    for (; ;) {
        if (workGeneration > startedInWorkGeneration) {
            console.log("Stopping conflictsLoop in generation", workGeneration);
            return;
        }

        console.log("conflictsLoop")
        await handleConflicts(conf, repos, publicLogs);
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

function isSetsEqual(a: Set<any>, b: Set<any>) {
    return (
        a.size === b.size &&
        [...a].every((value) => b.has(value)) &&
        [...b].every((value) => a.has(value))
    );
}

// conflictHashKey is a poor mans HashKey
function conflictHashKey(c: Conflict): string {
    var parts : string[] = [
        c.id,
        c.conflicting ? "t" : "f",
        c.is_conflict_in_working_directory ? "t" : "f",
    ];
    if (c.conflicting_files) {
        parts.push(...c.conflicting_files)
    }
    return parts.join(",")
}

function equalConflicts(knownConflicts: ConflictsForRepo[], newConflicts: ConflictsForRepo[]) {
    let knownSet = buildSet(knownConflicts);
    let newSet = buildSet(newConflicts);
    return isSetsEqual(newSet, knownSet);
}

function buildSet(conflicts: ConflictsForRepo[]): Set<string> {
    let res = new Set<string>();
    conflicts.forEach((i) => {
        if (i.conflicts.conflicts) {
            i.conflicts.conflicts.forEach(c => {
                // Don't track PRs (it's too volatile).
                // PRs are tracekd in real-time in the Status Bar, but not in the notifications
                if (c.onto_reference_type === "github-pr") {
                    return;
                }
     
                res.add(conflictHashKey(c))
            })
        }
    });
    return res;
}

let globalStateKnownConflicts: ConflictsForRepo[] = [];

async function handleConflicts(conf: Configuration, repos: FindReposResponse, publicLogs: vscode.OutputChannel) {
    await fetchConflicts(conf, repos).then((conflicts: ConflictsForRepo[]) => {

        // Update status bar
        setStatusBarText(StatusBarMessageForConflicts(conflicts));

        if (!equalConflicts(globalStateKnownConflicts, conflicts) && conflicts.length > 0) {
            let res = AlertMessageForConflicts(conflicts)

            if (res.showMessage) {
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

function fetchConflicts(conf: Configuration, repos: FindReposResponse): Promise<ConflictsForRepo[]> {
    const requests: Promise<ConflictsForRepo | undefined>[] = repos.repos
        .filter((r) => r.enabled)
        .map((r) => {
            return getConflictsForRepo(conf, r.owner, r.name);
        })

    return Promise.all<ConflictsForRepo | undefined>(requests).then(responses => {
        return responses.filter((r : ConflictsForRepo | undefined): r is ConflictsForRepo => !!r).filter(r => r.conflicts)
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

const getConflictsForRepo = async (conf: Configuration, owner: string, name: string): Promise<ConflictsForRepo | undefined> => {
    try {
        const response = await axios.get<Conflicts>(conf.api + "/v3/conflicts/get/" + owner + "/" + name + "?include_prs=1",
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
