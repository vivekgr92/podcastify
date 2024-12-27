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
      const result = await handleRequest("/api/login", "POST", userData);
      console.log("[Debug] Login request result:", result);
      return result;
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
