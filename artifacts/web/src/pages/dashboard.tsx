import { Sidebar } from "@/components/layout/sidebar";
import { useAuth } from "@/hooks/use-auth";
import {
  Search, FileText, DatabaseZap, ClipboardList,
  Database, History, Upload,
} from "lucide-react";

const commonItems = [
  {
    href: "/feature1",
    label: "부품 검색기",
    desc: "Nexar API 기반 부품 검색 및 견적",
    icon: <Search className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50 group-hover:bg-blue-100",
  },
  {
    href: "/feature2",
    label: "발주서 정리",
    desc: "업체별 발주 엑셀 업로드 및 마스터 DB 연동 정리",
    icon: <FileText className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50 group-hover:bg-blue-100",
  },
  {
    href: "/order-processing-log",
    label: "발주서 기록",
    desc: "저장된 발주 정리 결과 조회 및 Excel 다운로드",
    icon: <History className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50 group-hover:bg-blue-100",
  },
  {
    href: "/db-update",
    label: "DB 업데이트",
    desc: "업체별 DB 엑셀 업로드 및 마스터 데이터 관리",
    icon: <DatabaseZap className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50 group-hover:bg-blue-100",
  },
  {
    href: "/db-view",
    label: "DB",
    desc: "업체별 마스터 DB 조회 및 Excel 출력",
    icon: <Database className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50 group-hover:bg-blue-100",
  },
];

const adminItems = [
  {
    href: "/admin/access-log",
    label: "접속 기록",
    desc: "직원별 로그인 이력 조회",
    icon: <ClipboardList className="w-5 h-5 text-orange-500" />,
  },
  {
    href: "/admin/db-upload-log",
    label: "DB 업로드 기록",
    desc: "DB 업데이트 이력 및 업로드 로그 조회",
    icon: <Upload className="w-5 h-5 text-orange-500" />,
  },
];

export default function Dashboard() {
  const { data: auth } = useAuth();
  const user = auth?.user;
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm font-semibold text-gray-700">대시보드</span>
        </header>

        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          {/* 환영 메시지 */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-800">
              안녕하세요, {user?.displayName}님 👋
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              에이투지 일렉트론 인트라넷에 오신 것을 환영합니다.
            </p>
          </div>

          {/* 공통 기능 카드 */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">메뉴</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {commonItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${item.bg}`}>
                    {item.icon}
                  </div>
                  <div className="font-semibold text-gray-700 text-sm">{item.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</div>
                </a>
              ))}
            </div>
          </div>

          {/* 관리자 전용 카드 */}
          {isAdmin && (
            <div>
              <h2 className="text-xs font-semibold text-orange-400 uppercase tracking-widest mb-3">관리자 전용</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {adminItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="bg-white rounded-xl border border-orange-100 p-5 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center mb-3 group-hover:bg-orange-100 transition-colors">
                      {item.icon}
                    </div>
                    <div className="font-semibold text-gray-700 text-sm">{item.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
