import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@db/schema";

type LoginCredentials = {
  username: string;
  password: string;
};

type AuthResponse = {
  ok: boolean;
  user?: Omit<User, 'password'>;
  message?: string;
};

async function fetchUser(): Promise<Omit<User, 'password'> | null> {
  try {
    const response = await fetch("/api/user", {
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      throw new Error(await response.text());
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

export function useUser() {
  const queryClient = useQueryClient();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<Omit<User, 'password'> | null, Error>({
    queryKey: ["user"],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation<AuthResponse, Error, LoginCredentials>({
    mutationFn: async (credentials) => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.ok && data.user) {
        queryClient.setQueryData(["user"], data.user);
      }
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const logoutMutation = useMutation<AuthResponse, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Logout failed");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.setQueryData(["user"], null);
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}