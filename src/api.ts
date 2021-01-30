import axios from "axios";
import * as vscode from "vscode";
import { Configuration } from "./configuration";

interface Headers {
    Cookie: string,
    "Content-Type": string,
    "x-client-name": string,
    "x-client-version": string,
}

export function headersWithAuth(token: string): Headers {
    let version = vscode.extensions.getExtension("Sturdy.sturdy")?.packageJSON.version;
    return  {
        Cookie: "auth=" + token,
        "Content-Type": "application/json",
        "x-client-name": "vscode",
        "x-client-version": version,
    };
}

export const postWorkDirForRepo = async (conf: Configuration | undefined, owner: string, name: string, workingTreeDiff: string) => {
    if (!conf) return
    try {
        await axios.post(conf.api + "/v3/conflicts/workdir/" + owner + "/" + name,
            { working_tree_diff: workingTreeDiff },
            { headers: headersWithAuth(conf.token) })
    } catch (err) {
        console.log("failed to postWorkDirForRepo", err)
    }
}