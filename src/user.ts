import axios from "axios";
import { headersWithAuth } from "./api";
import { Configuration } from './configuration';

export interface User {
    id: string;
    name: string;
}

export const GetUser = async (conf: Configuration): Promise<User | undefined> => {
    return GetUserWithToken(conf, conf.token)
};

export const GetUserWithToken = async (conf: Configuration, token: string): Promise<User | undefined> => {
    try {
        const response = await axios.get<User>(conf.api + "/v3/user",
            { headers: headersWithAuth(token) })
        const user = response.data;
        return user;
    } catch (err) {
        console.log("failed to get user:", err);
        return undefined;
    }
};

export interface RenewToken {
    token: string;
    has_new: boolean;
}

export const RenewToken = async (conf: Configuration): Promise<RenewToken | undefined> => {
    try {
        const response = await axios.post<RenewToken>(conf.api + "/v3/auth/renew-token",
            {},
            { headers: headersWithAuth(conf.token) })        
        const res = response.data;
        return res;
    } catch (err) {
        console.log("failed to get new token:", err);
        return undefined;
    }
};
