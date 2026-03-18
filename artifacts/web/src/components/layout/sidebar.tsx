import { Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { LayoutDashboard, LogOut, UserCircle } from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();
  const { data: auth } = useAuth();
  const logout = useLogout();

  const user = auth?.user;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login";
      },
    });
  };

  return (
    <aside className="w-64 border-r border-gray-200 bg-white flex flex-col h-screen sticky top-0 shadow-sm">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-gray-200">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-xs">AZ</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-black text-sm leading-tight text-gray-900 tracking-tight truncate">
            AtoZ ELECTRON
          </span>
          <span className="text-[10px] text-blue-500 font-semibold tracking-widest uppercase">
            인트라넷
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-5 px-3 flex flex-col gap-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pb-2">
          메뉴
        </p>

        <Link
          href="/"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location === "/"
              ? "bg-blue-50 text-blue-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
          <span>대시보드</span>
        </Link>
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <UserCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-800 truncate">
              {user?.displayName || "사용자"}
            </span>
            <span className="text-xs text-gray-400 truncate">
              {user?.role === "admin" ? "관리자" : "직원"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
