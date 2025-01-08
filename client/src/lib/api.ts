import { useAuth } from "@clerk/clerk-react";

export const createApiClient = (token?: string) => {
  return {
    fetch: (url: string, options: RequestInit = {}) => {
      return fetch(`/api${url}`, {
        ...options,
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });
    }
  };
}; 