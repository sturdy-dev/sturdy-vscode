import { SimpleGit } from "simple-git";
import axios from "axios";
import { Configuration } from './configuration';
import { headersWithAuth } from "./api";

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

export const LookupConnectedSturdyRepositories = async (git: SimpleGit, conf: Configuration): Promise<FindReposResponse | undefined> => {
    let rawGitRemotes: string | void;

    try {
        rawGitRemotes = await git.remote(["-v"]);
    } catch (e) {
        console.log("could not get remotes, this might not be a git repo", e);
        return undefined;
    }

    if (!rawGitRemotes) {
        console.log("could not get remotes");
        return undefined;
    }

    let remotes = new Map();

    rawGitRemotes.split("\n")
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
            { headers: headersWithAuth(conf.token) })
        const res = response.data;
        return res;
    } catch (err) {
        console.log("failed to match repositories", err);
        return undefined;
    }
};
