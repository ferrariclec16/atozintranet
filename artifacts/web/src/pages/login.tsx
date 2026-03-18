import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "아이디를 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const loginMutation = useLogin();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    setAuthError(null);
    loginMutation.mutate(data, {
      onSuccess: () => {
        setLocation("/");
      },
      onError: (error) => {
        setAuthError(error.message);
      },
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f5f6f8]">
      {/* Logo area */}
      <div className="flex flex-col items-center mb-8">
        {/* 로고 이미지 자리 - 나중에 교체 */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-xl">AZ</span>
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight text-gray-900 leading-tight">
              AtoZ ELECTRON
            </div>
            <div className="text-xs tracking-widest text-gray-400 uppercase font-medium mt-0.5">
              에이투지 일렉트론
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          사번과 비밀번호를 입력하여 로그인하세요
        </p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg px-10 py-10">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Error message */}
          {authError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {authError}
            </div>
          )}

          {/* Username */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              사번
            </label>
            <input
              {...register("username")}
              type="text"
              placeholder="사번을 입력하세요"
              autoComplete="username"
              className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all
                ${errors.username
                  ? "border-red-400 focus:ring-2 focus:ring-red-200"
                  : "border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                }`}
            />
            {errors.username && (
              <p className="text-xs text-red-500">{errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">
              비밀번호
            </label>
            <input
              {...register("password")}
              type="password"
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all
                ${errors.password
                  ? "border-red-400 focus:ring-2 focus:ring-red-200"
                  : "border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                }`}
            />
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              "로그인"
            )}
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-gray-400">
        © 2025 AtoZ ELECTRON. All rights reserved.
      </p>
    </div>
  );
}
