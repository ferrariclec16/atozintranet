import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  ChevronDown, Download, Loader2, DatabaseZap,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const DB_VIEW_COLUMNS = [
  "품목코드", "품명", "발주일자", "발주번호",
  "수량", "납품가", "합계", "원가", "합계(원가)", "구매처",
];

type OutputRow = Record<string, string | number>;

interface MasterData {
  item_name: string;
  purchase_price: number;
  supplier: string;
  contact: string;
  location: string;
  stock: number;
}

interface PurchaseHistoryRow {
  id: number;
  company_name: string;
  order_date: string;
  item_code: string;
  order_no: string;
  item_name: string;
  order_qty: number;
  order_price: number;
  delivery_amount: number;
}

export default function DbView() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [dbViewRows, setDbViewRows] = useState<OutputRow[] | null>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoadingCompanies(true);
      const { data } = await supabase.from("excel_mappings").select("company_name");
      const names = (data || []).map((d: { company_name: string }) => d.company_name);
      setCompanies(names);
      setIsLoadingCompanies(false);
    })();
  }, []);

  const loadDbView = async (company: string) => {
    setIsLoadingDb(true);
    setDbViewRows(null);
    try {
      const res = await fetch(
        `/api/purchase-history/list?company=${encodeURIComponent(company)}`,
        { credentials: "include" }
      );
      if (!res.ok) { setIsLoadingDb(false); return; }
      const json = await res.json();
      const rows: PurchaseHistoryRow[] = json.rows || [];

      const itemNames = [...new Set(rows.map((r) => r.item_name).filter(Boolean))];
      const { data: masterList } = itemNames.length > 0
        ? await supabase.from("master_data").select("*").in("item_name", itemNames)
        : { data: [] };

      const masterMap: Record<string, MasterData> = {};
      (masterList || []).forEach((item: MasterData) => {
        masterMap[item.item_name] = item;
      });

      const viewRows: OutputRow[] = rows.map((row) => {
        const db = masterMap[row.item_name] ?? ({} as MasterData);
        const cost = parseFloat(String(db.purchase_price ?? "")) || 0;
        const qty = Number(row.order_qty) || 0;
        const price = Number(row.order_price) || 0;
        return {
          "품목코드": row.item_code ?? "",
          "품명": row.item_name ?? "",
          "발주일자": row.order_date ?? "",
          "발주번호": row.order_no ?? "",
          "수량": qty,
          "납품가": price,
          "합계": qty * price,
          "원가": cost || "",
          "합계(원가)": cost > 0 ? cost * qty : "",
          "구매처": db.supplier ?? "",
        };
      });

      setDbViewRows(viewRows);
    } catch {
      setDbViewRows([]);
    }
    setIsLoadingDb(false);
  };

  const handleDownloadDbFormat = () => {
    if (!dbViewRows || !dbViewRows.length) return;
    const header = ["품목코드", "품명", "수량", "납품가", "합계", "", "원가", "합계(원가)", "구매처"];
    const aoa: (string | number)[][] = [header];
    dbViewRows.forEach((r) => {
      aoa.push([
        String(r["품목코드"] ?? ""),
        String(r["품명"] ?? ""),
        Number(r["수량"]) || 0,
        Number(r["납품가"]) || 0,
        Number(r["합계"]) || 0,
        "",
        Number(r["원가"]) || 0,
        Number(r["합계(원가)"]) || 0,
        String(r["구매처"] ?? ""),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "내수");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `AtoZELECTRON_DB_${today}.xlsx`);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">DB 조회</span>
        </header>

        <div className="flex-1 p-8 max-w-6xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">DB 조회</h1>
            <p className="text-sm text-gray-500 mt-1">
              업체별 발주 이력을 조회하고 DB형식 Excel로 출력합니다.
            </p>
          </div>

          {/* 업체 선택 + Excel 출력 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-gray-800">업체 선택</span>
                {isLoadingCompanies ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
                  </div>
                ) : (
                  <div className="relative inline-block">
                    <select
                      value={selectedCompany}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCompany(val);
                        if (val) loadDbView(val);
                      }}
                      className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                    >
                      <option value="" disabled>— 선택 —</option>
                      {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
                {isLoadingDb && (
                  <div className="flex items-center gap-1.5 text-sm text-blue-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> 조회 중...
                  </div>
                )}
              </div>

              {dbViewRows && dbViewRows.length > 0 && (
                <button
                  onClick={handleDownloadDbFormat}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  DB형식 Excel 출력
                </button>
              )}
            </div>
          </div>

          {/* 조회 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <DatabaseZap className="w-5 h-5 text-blue-500" />
              <span className="font-semibold text-gray-800">{selectedCompany || "—"} 발주 이력</span>
              {dbViewRows !== null && (
                <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${dbViewRows.length > 0 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                  {dbViewRows.length}건
                </span>
              )}
            </div>

            {isLoadingDb ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : dbViewRows === null ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DatabaseZap className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">업체를 선택하면 이력을 조회합니다.</p>
              </div>
            ) : dbViewRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DatabaseZap className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">저장된 발주 이력이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">발주서 정리 페이지에서 발주완결 항목을 DB에 저장해 주세요.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800">
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 border-r border-gray-700 w-10">#</th>
                      {DB_VIEW_COLUMNS.map((col) => {
                        const isCostCol = ["원가", "합계(원가)", "구매처"].includes(col);
                        return (
                          <th key={col} className={`px-3 py-3 text-center text-xs font-medium whitespace-nowrap border-r border-gray-700 last:border-r-0 ${isCostCol ? "text-yellow-300" : "text-white"}`}>
                            {col}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dbViewRows.map((row, i) => (
                      <tr key={i} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                        <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100">{i + 1}</td>
                        {DB_VIEW_COLUMNS.map((col) => {
                          const isCostCol = ["원가", "합계(원가)", "구매처"].includes(col);
                          const val = row[col];
                          let displayVal = "";
                          if (typeof val === "number" && val !== 0) {
                            displayVal = val.toLocaleString();
                          } else {
                            displayVal = String(val ?? "");
                          }
                          return (
                            <td key={col} className={`px-3 py-2.5 text-center whitespace-nowrap border-r border-gray-100 last:border-r-0 text-xs ${isCostCol ? "text-amber-700 bg-amber-50/40 font-medium" : "text-gray-700"} ${col === "구매처" && !displayVal ? "text-red-400 italic" : ""}`}>
                              {col === "구매처" && !displayVal ? "미등록" : displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={7} className="px-3 py-3 text-right text-xs font-semibold text-gray-600">합계</td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-gray-800 border-r border-gray-100">
                        {dbViewRows.reduce((s, r) => s + (Number(r["합계"]) || 0), 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-amber-700 border-r border-gray-100">
                        {dbViewRows.reduce((s, r) => s + (Number(r["합계(원가)"]) || 0), 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 border-r border-gray-100" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
