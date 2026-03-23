import { Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  LogOut,
  UserCircle,
  Search,
  FileText,
  ClipboardList,
  DatabaseZap,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const commonNavItems: NavItem[] = [
  { href: "/", label: "대시보드", icon: <LayoutDashboard className="w-4 h-4 flex-shrink-0" /> },
  { href: "/feature1", label: "부품 검색기", icon: <Search className="w-4 h-4 flex-shrink-0" /> },
  { href: "/feature2", label: "발주서 정리", icon: <FileText className="w-4 h-4 flex-shrink-0" /> },
  { href: "/db-update", label: "DB 업데이트", icon: <DatabaseZap className="w-4 h-4 flex-shrink-0" /> },
];

const adminNavItems: NavItem[] = [
  { href: "/admin/access-log", label: "접속 기록", icon: <ClipboardList className="w-4 h-4 flex-shrink-0" /> },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { data: auth } = useAuth();
  const logout = useLogout();

  const user = auth?.user;
  const isAdmin = user?.role === "admin";

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
      <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200">
        <img
          src="/logo.png"
          alt="AtoZ ELECTRON"
          className="h-10 object-contain"
        />
        <span className="text-[10px] text-blue-500 font-semibold tracking-widest uppercase flex-shrink-0">
          인트라넷
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-5 px-3 flex flex-col gap-1 overflow-y-auto">
        {/* 공통 메뉴 */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 pb-2">
          메뉴
        </p>
        {commonNavItems.map((item) => (
          <NavLink key={item.href} item={item} active={location === item.href} />
        ))}

        {/* 관리자 전용 메뉴 */}
        {isAdmin && (
          <>
            <div className="my-3 border-t border-gray-100" />
            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-widest px-3 pb-2">
              관리자 전용
            </p>
            {adminNavItems.map((item) => (
              <NavLink key={item.href} item={item} active={location === item.href} />
            ))}
          </>
        )}
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
              {isAdmin ? "관리자" : "직원"}
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
