import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, InsertUser } from "@db/schema";

type RequestResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

async function handleRequest(
  url: string,
  method: string,
  body?: InsertUser,
): Promise<RequestResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { ok: false, message: response.statusText };
      }

      const message = await response.text();
      return { ok: false, message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/user", {
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }

    if (response.status >= 500) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function useUser() {
  const queryClient = useQueryClient();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["user"],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: async (userData) => {
      console.log("[Debug] Login mutation started");
      console.log("[Debug] User data:", userData);
      try {
        console.log("[Debug] Making login request to /api/login");
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
          credentials: "include",
        });
        console.log("[Debug] Login response status:", response.status);
        const text = await response.text();
        console.log("[Debug] Login response text:", text);
        
        let result;
        try {
          result = text ? JSON.parse(text) : {};
        } catch (e) {
          console.log("[Debug] Response is not JSON:", text);
          return { ok: false, message: text };
        }
        
        if (!response.ok) {
          console.log("[Debug] Login failed:", result);
          return { ok: false, message: result.message || "Login failed" };
        }
        
        console.log("[Debug] Login successful:", result);
        return { ok: true };
      } catch (error) {
        console.error("[Debug] Login request failed:", error);
        throw error;
      }
    },

    onMutate: (variables) => {
      console.log("Login mutation started with data:", variables);
    },

    onSuccess: (data) => {
      console.log("Mutation succeeded with response:", data);
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },

    onError: (error, variables, context) => {
      console.error("Mutation failed with error:", error);
      console.error("Failed mutation data:", variables);
    },

    onSettled: (data, error, variables, context) => {
      console.log("Mutation settled.");
      if (data) console.log("Final response:", data);
      if (error) console.error("Final error:", error);
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest("/api/logout", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const registerMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: (userData) => handleRequest("/api/register", "POST", userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
  };
}
