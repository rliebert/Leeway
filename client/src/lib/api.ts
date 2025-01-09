import { useAuth } from "@clerk/clerk-react";

export const createApiClient = (token?: string) => {
  const API_URL = import.meta.env.DEV 
    ? 'http://localhost:8080/api' 
    : '/api';

  return {
    fetch: (url: string, options: RequestInit = {}) => {
      return fetch(`${API_URL}${url}`, {
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