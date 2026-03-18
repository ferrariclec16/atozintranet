import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const UserSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  role: z.string(),
});

export type User = z.infer<typeof UserSchema>;

const MeResponseSchema = z.object({
  user: UserSchema.nullable(),
});

const LoginResponseSchema = z.object({
  success: z.boolean(),
  user: UserSchema,
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

export function useAuth() {
  return useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Critical for session cookies
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      
      const parsed = MeResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error("[Zod] Me response validation failed", parsed.error);
        return { user: null };
      }
      return parsed.data;
    },
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (credentials: Record<string, string>) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        const parsedError = ErrorResponseSchema.safeParse(data);
        throw new Error(parsedError.success ? parsedError.data.error : "로그인에 실패했습니다.");
      }
      
      const parsed = LoginResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error("[Zod] Login response validation failed", parsed.error);
        throw new Error("서버 응답 형식이 올바르지 않습니다.");
      }
      
      return parsed.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to logout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], { user: null });
      queryClient.clear(); // Clear all other data
    },
  });
}
