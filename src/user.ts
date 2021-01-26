import axios from "axios";
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
        const response = await axios.get<User>(conf.api + "/v3/user", {
            headers: {
                Cookie: "auth=" + token,
                "Content-Type": "application/json",
            }
        });
        const user = response.data;
        return user;
    } catch (err) {
        console.log("failed to get user:", err);
        return undefined;
    }
};
