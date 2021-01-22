import axios from "axios";
import { Configuration } from './configuration';

export interface User {
    id: string;
    name: string;
}

export const GetUser = async (conf: Configuration): Promise<User> => {
    try {
        const response = await axios.get<User>(conf.api + "/v3/user", {
            headers: {
                Cookie: "auth=" + conf.token,
                "Content-Type": "application/json",
            }
        });
        const user = response.data;
        return user;
    } catch (err) {
        if (err && err.response) {
            // const axiosError = err as AxiosError<ServerError>
            // return axiosError.response.data;
            return err;
        }
        throw err;
    }
};
