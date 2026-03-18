import { Sidebar } from "@/components/layout/sidebar";
import { FilePlus } from "lucide-react";

export default function LicenseIssue() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">관리자 전용</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">신규 라이선스 발급</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-5">
              <FilePlus className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">신규 라이선스 발급</h2>
            <p className="text-sm text-gray-400">준비 중입니다. 곧 업데이트될 예정입니다.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
