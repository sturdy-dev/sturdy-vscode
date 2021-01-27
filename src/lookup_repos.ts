import { SimpleGit } from "simple-git";
import axios from "axios";
import * as vscode from "vscode";
import { Configuration } from './configuration';

export interface SturdyRepository {
    id: string;
    full_name: string;
    owner: string;
    name: string;
    enabled: Boolean;
}

export interface FindReposResponse {
    repos: Array<SturdyRepository>;
}

export const LookupConnectedSturdyRepositories = async (git: SimpleGit): Promise<FindReposResponse | undefined> => {
    console.log("lookup")
    let conf: Configuration = vscode.workspace.getConfiguration().get("conf.sturdy");

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

        let versionInfo = "vscode:" + vscode.extensions.getExtension("Sturdy.sturdy")?.packageJSON.version;

        try {
            const response = await axios.post<FindReposResponse>(conf.api + "/v3/conflicts/lookup",
                payload,
                {
                    headers: {
                        Cookie: "auth=" + conf.token,
                        "Content-Type": "application/json",
                        "Version-Info": versionInfo,
                    }
                });
            const res = response.data;
            if (!res.repos) {
              let repos = out.map(x => x.remote_url.split(":")[1].replace(/\.[^/.]+$/, ""))
				.filter(x => !conf.ignoredrepos.includes(x));
			  // TODO: extra timer
			  if (repos) {
			  	promptSetupRepo(repos, conf);
			  }
            }
            return res;
        } catch (err) {
            console.log("failed to match repositories", err);
            return undefined;
        }
    }

    return Promise.reject(new Error('could not get remotes'));
};

function promptSetupRepo(repos: string[], conf: Configuration) {
	// TODO: Allow the user to choose
	let repo = repos[0]
	if (!repo) return
	vscode.window
        .showInformationMessage("Wanna config " + repo + "?", ...["Yes", "Not now", "Never"])
        .then((selection) => {
            if (selection === "Yes") {
                let uri = "https://getsturdy.com/setup?name="+encodeURIComponent(repo);
                vscode.env.openExternal(vscode.Uri.parse(uri));
			} else if (selection === "Never") {
				 vscode.workspace
				 	.getConfiguration()
					.update("conf.sturdy.ignoredrepos", 
						conf.ignoredrepos.concat(repos), 
						vscode.ConfigurationTarget.Global);
			}
        });
}
