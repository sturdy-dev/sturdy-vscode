export interface Conflict {
    commit: string;
    commit_message: string;
    conflicting_files: Array<string>;

    is_conflicting_working_directory: boolean;

    counterpart: string;
}

export interface ConflictsForRepo {
    conflicts: Conflicts
    repoOwner: string
    repoName: string
}

export interface Conflicts {
    conflicts: Array<Conflict>;
}

export interface AlertMessageResult {
    message: string;
    repoOwner: string;
    repoName: string;
}

export const AlertMessageForConflicts = (conflicts: ConflictsForRepo[]): AlertMessageResult => {
    let first = conflicts[0]
    let repoOwner = first.repoOwner
    let repoName = first.repoName

    let msg = "You have conflicts:\n";

    conflicts.forEach(c => {
        c.conflicts.conflicts.forEach(cc => {
            msg += composeMessageForConflict(cc)
        })
    })

    return {
        message: msg,
        repoName: repoName,
        repoOwner: repoOwner,
    }
}

function composeMessageForConflict(cc: Conflict): string {
    if (cc.is_conflicting_working_directory) {
        return "your uncommited changes to " + cc.conflicting_files.join(", ") + " are conflicting with " + cc.counterpart + ".\n";
    }
    
    return "the changes to " + cc.conflicting_files.join(", ") +
        " in " + cc.commit.substr(0, 8) +
        " [\"" + commitMessageShort(cc) + "\"] are conflicting with " +
        cc.counterpart + ".\n"
}

function commitMessageShort(cc: Conflict): string {
    return cc.commit_message.split("\n")[0].substr(0, 72)
}
