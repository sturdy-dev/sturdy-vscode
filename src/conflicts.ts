import { StatusBarMessage } from "./status_bar";
import { ThemeColor } from "vscode";

export interface Conflict {
    id: string;
    repository_id: string;
    base: string;

    onto: string;
    onto_name: string;
    onto_reference_type: string;
    onto_reference_id: string;

    conflicting: boolean;
    is_conflict_in_working_directory: boolean;
    checked_at: string;
    user_id: string;
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
    let anyConflicts = false;
    let groupedConflicts = conflictsByConflictingCommit(conflicts);
    let msg = "";

    for (let k in groupedConflicts) {
        msg += composeMessageForConflicts(groupedConflicts[k]) + ". "
        anyConflicts = true;
    }

    return {
        anyConflicts: anyConflicts,
        message: msg,
        repoName: repoName,
        repoOwner: repoOwner,
    }
}

function composeMessageForConflicts(conflicts: Conflict[]): string {
    let msg = "";

    if (conflicts[0].is_conflict_in_working_directory) {
        msg += "Your uncommitted changes"
    } else {
        msg += "Your commited changes"
    }

    msg += " are conflicting with ";

    for (let i = 0; i < conflicts.length; i++) {
        let c = conflicts[i];

        if (c.onto_reference_type == "github-pr") {
            msg += "#" + c.onto_reference_id
        } else {
            msg += c.onto_name
        }

        if (i < conflicts.length - 1) {
            msg += ", "
        }
    }

    return msg;
}

function conflictsByConflictingCommit(conflictsForRepo: ConflictsForRepo[]): Record<string, Conflict[]> {
    let by: Record<string, Conflict[]> = {};
    for (let i = 0; i < conflictsForRepo.length; i++) {
        let conflicts = conflictsForRepo[i].conflicts;

        if (!conflicts || !conflicts.conflicts) {
            continue;
        }

        for (let j = 0; j < conflicts.conflicts.length; j++) {
            let c = conflicts.conflicts[j];
            if (!c.conflicting) {
                continue;
            }
            let key = c.is_conflict_in_working_directory ? "wd" : "commited";
            if (!by[key]) {
                by[key] = []
            }
            by[key].push(c)
        }
    }
    return by;
}

export const StatusBarMessageForConflicts = (conflicts: ConflictsForRepo[]): StatusBarMessage => {
    if (conflicts.length == 0) {
        return {
            msg: ``,
            backgroundColor: undefined,
            repoOwner: "", repoName: "",
        }
    }

    let first = conflicts[0]
    let repoOwner = first.repoOwner
    let repoName = first.repoName

    let defaultBranchName = "";
    let conflicsWithDefaultBranch = false;
    let conflictsWithPRsCount = 0;

    conflicts.forEach((c) => {
        if (!c.conflicts || ! c.conflicts.conflicts) {
            return;
        }
        c.conflicts.conflicts.forEach(cc => {
            if (!cc.conflicting) {
                return
            }
            if (cc.onto_reference_type == "github-pr") {
                conflictsWithPRsCount++
            } else {
                defaultBranchName = cc.onto_name;
                conflicsWithDefaultBranch = true;
            }
        })
    })

    let prPlural = (conflictsWithPRsCount > 1) ? 's': '';

    if (conflicsWithDefaultBranch && conflictsWithPRsCount > 0) {
       return {
           msg: `\$(error) ${defaultBranchName} and \$(warning) ${conflictsWithPRsCount} PR${prPlural}`,
           backgroundColor: new ThemeColor('statusBarItem.errorBackground'),
           repoOwner: repoOwner, repoName: repoName,
       }
    } else if (conflicsWithDefaultBranch) {
        return {
            msg: `\$(error) ${defaultBranchName}`,
            backgroundColor: new ThemeColor('statusBarItem.errorBackground'),
            repoOwner: repoOwner, repoName: repoName,
        }
    } else if (conflictsWithPRsCount > 0) {
        return {
            msg: `\$(warning) ${conflictsWithPRsCount} PR${prPlural}`,
            backgroundColor: undefined,
            repoOwner: repoOwner, repoName: repoName,
        }
    } else {
        return {
            msg: `\$(check) No conflicts`,
            backgroundColor: undefined,
            repoOwner: repoOwner, repoName: repoName,
        }
    }
}