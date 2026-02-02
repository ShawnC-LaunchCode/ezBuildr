import { apiRequest } from "./queryClient";

export const api = {
    get: async (url: string) => {
        const res = await apiRequest("GET", url);
        return res.json();
    },
    post: async (url: string, data?: unknown) => {
        const res = await apiRequest("POST", url, data);
        return res.json();
    },
    put: async (url: string, data?: unknown) => {
        const res = await apiRequest("PUT", url, data);
        return res.json();
    },
    delete: async (url: string) => {
        const res = await apiRequest("DELETE", url);
        return res.json();
    }
};
