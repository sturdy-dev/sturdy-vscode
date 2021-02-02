export interface Conflict {
    id: string;
    repository_id: string;
    base: string;
    onto: string;
    onto_name: string;
    conflicting: boolean;
    is_conflict_in_working_directory: boolean;
    conflicting_commit: string;
    checked_at: string;
    user_id: string;
    commit_message: string;
    conflicting_files: Array<string>;
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
    anyConflicts: boolean;
    message: string;
    repoOwner: string;
    repoName: string;
}

export const AlertMessageForConflicts = (conflicts: ConflictsForRepo[]): AlertMessageResult => {
    let first = conflicts[0]
    let repoOwner = first.repoOwner
    let repoName = first.repoName

    let msg = "You have conflicts:\n";
    let anyConflicts = false;


    conflicts.forEach(c => {
        if (c.conflicts && c.conflicts.conflicts) {
            c.conflicts.conflicts
                .filter(c => c.conflicting)
                .forEach(cc => {
                    msg += composeMessageForConflict(cc)
                    anyConflicts = true;
                })
        }
    })

    return {
        anyConflicts: anyConflicts,
        message: msg,
        repoName: repoName,
        repoOwner: repoOwner,
    }
}

function composeMessageForConflict(cc: Conflict): string {
    if (cc.is_conflict_in_working_directory) {
        return "your uncommited changes to " + cc.conflicting_files.join(", ") + " are conflicting with " + cc.onto_name + ".\n";
    }

    return "the changes to " + cc.conflicting_files.join(", ") +
        " in " + cc.conflicting_commit.substr(0, 8) +
        " [\"" + commitMessageShort(cc) + "\"] are conflicting with " +
        cc.onto_name + ".\n"
}

function commitMessageShort(cc: Conflict): string {
    return cc.commit_message.split("\n")[0].substr(0, 72)
}
