import * as vscode from "vscode";

interface Headers {
    Cookie: string,
    "Content-Type": string,
    "x-client-name": string,
    "x-client-version": string,
    "x-vscode-version": string,
}

export function headersWithAuth(token: string): Headers {
    let version = vscode.extensions.getExtension("Sturdy.sturdy")?.packageJSON.version;
    return  {
        Cookie: "auth=" + token,
        "Content-Type": "application/json",
        "x-client-name": "vscode",
        "x-client-version": version,
        "x-vscode-version": vscode.version,
    };
}
