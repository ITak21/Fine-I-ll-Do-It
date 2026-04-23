import { useEffect, useRef, useState } from "react";
import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { cardMappings } from "./lib/app-data";
import { pickExcelFile } from "./lib/excel-adapter";
import { initializeDatabase, resetDatabase } from "./lib/database";
import fidiLogo from "./assets/logo.png";
import { executeImport } from "./lib/import-service";
import {
  listTransactionsByImportId,
  listTransactionsForLatestImport,
  listTransactionsByMonth,
  listTransactionsByCompany,
  countTransactionsByCompany,
  getMonthlyCategorySummary,
  getMonthlyComparison,
  getMonthlyBillingData,
  updateMerchantCategory
} from "./lib/transaction-repository";
import { listSupportedParsers } from "./parsers";
import type {
  CardCompany,
  DatabaseBootState,
  ImportFlowState,
  ParsedTransaction,
  TransactionRecord
} from "./types";

type ActivePage = "upload" | "mapping" | "analysis" | "ledger" | "settings";
type VisibleTransaction = ParsedTransaction | TransactionRecord;
type LedgerFilter = CardCompany | "all";
type Locale = "ko" | "en";

/* ─── 카드사 설정 ─── */
const cardCompanyConfig: {
  key: CardCompany;
  label: string;
  englishName: string;
  color: string;
  accentColor: string;
  gradient: string;
  initial: string;
}[] = [
  { key: "hyundai", label: "현대카드", englishName: "Hyundai Card", color: "#1a1a2e", accentColor: "#4a6cf7", gradient: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)", initial: "H" },
  { key: "lotte",   label: "롯데카드", englishName: "Lotte Card",   color: "#c20025", accentColor: "#ff4d6d", gradient: "linear-gradient(135deg, #c20025 0%, #6d0017 100%)", initial: "L" },
  { key: "shinhan", label: "신한카드", englishName: "Shinhan Card", color: "#0046b8", accentColor: "#4d8eff", gradient: "linear-gradient(135deg, #0046b8 0%, #002a7a 100%)", initial: "S" },
  { key: "hana",    label: "하나카드", englishName: "Hana Card",    color: "#00875a", accentColor: "#34d399", gradient: "linear-gradient(135deg, #00875a 0%, #005538 100%)", initial: "HN" }
];

const mappingCategories = [
  { name: "식비",   tone: "teal"   as const },
  { name: "교통",   tone: "indigo" as const },
  { name: "생활",   tone: "gold"   as const },
  { name: "보험",   tone: "coral"  as const },
  { name: "기타",   tone: "indigo" as const }
];

function formatCategoryName(name: string, locale: Locale = "ko") {
  if (locale === "ko") return name;

  return ({
    "식비": "Food",
    "교통": "Transport",
    "생활": "Living",
    "보험": "Insurance",
    "기타": "Other",
    "분류 안 됨": "Uncategorized"
  } as Record<string, string>)[name] ?? name;
}

const navItems: { key: ActivePage; label: string; subLabel: string; icon: string }[] = [
  { key: "upload",   label: "가져오기", subLabel: "파일 가져오기", icon: "↑" },
  { key: "mapping",  label: "매핑",     subLabel: "가맹점 매핑",   icon: "⇄" },
  { key: "analysis", label: "분석",     subLabel: "월별 통계",     icon: "◎" },
  { key: "ledger",   label: "내역",     subLabel: "거래 목록",     icon: "≡" },
  { key: "settings", label: "설정",     subLabel: "앱 설정",       icon: "⚙" }
];

const LEDGER_PAGE_SIZE = 20;
const STORAGE_KEYS = {
  locale: "fidi.locale",
  theme: "fidi.theme"
} as const;

const importStateLabel: Record<ImportFlowState, string> = {
  idle: "대기", selecting: "파일 선택 중", parsing: "파싱 중",
  saving: "저장 중", completed: "완료", error: "오류"
};

/* ─── 유틸 ─── */
function formatAmount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
function formatCardCompany(key: CardCompany, locale: Locale = "ko") {
  const company = cardCompanyConfig.find((c) => c.key === key);
  if (!company) return key;
  return locale === "en" ? company.englishName : company.label;
}
function formatUnknownError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return "알 수 없는 오류"; }
}

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getPrevYearMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}
function getNextYearMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function formatYearMonth(ym: string, locale: Locale = "ko") {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem(STORAGE_KEYS.locale) === "en" ? "en" : "ko";
}

function getStoredDarkMode() {
  if (typeof window === "undefined") return false;
  const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme === "dark") return true;
  if (savedTheme === "light") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/* ─── 가맹점 그룹화 ─── */
type MerchantGroup = {
  merchantName: string;
  count: number;
  total: number;
  category: string | null;
  transactions: VisibleTransaction[];
};

function buildMerchantGroups(transactions: VisibleTransaction[]): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>();
  for (const t of transactions) {
    const name = t.merchantName || "미확인 가맹점";
    const existing = map.get(name);
    if (existing) {
      existing.count += 1;
      existing.total += t.netAmount;
      existing.transactions.push(t);
    } else {
      map.set(name, {
        merchantName: name, count: 1, total: t.netAmount,
        category: "categoryNameSnapshot" in t ? (t.categoryNameSnapshot ?? null) : null,
        transactions: [t]
      });
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/* ─── 사용 구조 계산 ─── */
type UsageSummary = { label: string; count: number; total: number; share: number; tone: typeof mappingCategories[number]["tone"] };

const toneColors: Record<string, string> = { teal: "#0c9488", indigo: "#4c5fe2", coral: "#c84b31", gold: "#c08a1b" };

function buildDonutStyle(summaries: UsageSummary[]) {
  if (!summaries.length) return { background: "conic-gradient(#d9dee6 0% 100%)" };
  let start = 0;
  const segs = summaries.map((s, i) => {
    const isLast = i === summaries.length - 1;
    const next = isLast ? 100 : Math.min(100, start + s.share);
    const seg = `${toneColors[s.tone] ?? "#aaa"} ${start}% ${next}%`;
    start = next;
    return seg;
  });
  if (start < 100) segs.push(`#e6e8ea ${start}% 100%`);
  return { background: `conic-gradient(${segs.join(", ")})` };
}

/* ─── App ─── */
export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>("upload");
  const [activeCompany, setActiveCompany] = useState<CardCompany>("hyundai");
  const [dbState, setDbState] = useState<DatabaseBootState>("idle");
  const [importState, setImportState] = useState<ImportFlowState>("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [lastImportedFile, setLastImportedFile] = useState<string | null>(null);
  const [lastParsedCount, setLastParsedCount] = useState(0);
  const [currentImportId, setCurrentImportId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pageKey, setPageKey] = useState(0);
  const [locale, setLocale] = useState<Locale>(getStoredLocale);
  const [isDarkMode, setIsDarkMode] = useState(getStoredDarkMode);

  const isEnglish = locale === "en";
  const ui = isEnglish ? {
    workspace: "Workspace",
    baseMonth: "Base Month",
    db: "DB",
    collapseSidebar: "Collapse",
    expandSidebar: "Expand",
    cardIssuer: "Card Issuer",
    uploadStep: "Select a card issuer",
    importIdle: "Import Excel File",
    importComplete: "Import Complete",
    retry: "Try Again",
    importProcessing: "Processing the file…",
    importRecordPrefix: "Import",
    mappingKicker: "Merchant Mapping",
    mappingSuffix: "Transaction Classification",
    mappingEmpty: "Merchant names will appear after you import a file.",
    currentMonth: "Current Month",
    futureBilling: "Upcoming Billing",
    totalUsage: "Total Spend (Billed)",
    billedCount: "Billed Transactions",
    billedCountDescription: "Includes installments",
    approvedThisMonth: "Approved This Month",
    approvedDescription: "Gross amount before installment split",
    previousBilling: "Previous Billing",
    claimDistribution: "Billing Distribution by Card",
    noData: "No data",
    total: "TOTAL",
    noClaimData: "There are no items scheduled to be billed. Import a file first.",
    categoryDistribution: "Category Distribution",
    clickForDetails: "Click to inspect grouped details",
    all: "All",
    totalCount: "Total",
    transactionDateTime: "Date / Time",
    merchant: "Merchant",
    usageType: "Usage Type",
    amount: "Amount",
    status: "Status",
    canceled: "Canceled",
    normal: "Normal",
    noTransactions: "There are no saved transactions.",
    uploadFirstHint: "Import a file from Upload first.",
    information: "Information",
    preferences: "Preferences",
    dataManagement: "Data Management",
    appInfo: "App Info",
    appInfoDescription: "Creator: Inchan · FIDI Workspace",
    darkMode: "Dark Mode",
    darkModeDescription: "Use a darker theme that is easier on the eyes.",
    language: "Language",
    languageDescription: "Change the interface language.",
    korean: "Korean",
    english: "English",
    resetDatabase: "Reset Local DB",
    resetDatabaseDescription: "Permanently delete all saved transactions and mapping data.",
    reset: "Reset",
    confirmResetTitle: "Reset Data",
    confirmResetMessage: "Reset all stored data?\nThis cannot be undone and will delete every imported card transaction.",
    resetSuccess: "Data was reset successfully.",
    resetFailed: "Reset failed",
    dbState: {
      idle: "Idle",
      "browser-preview": "Browser preview",
      ready: "Ready",
      error: "Error"
    },
    importState: {
      idle: "Idle",
      selecting: "Selecting file",
      parsing: "Parsing",
      saving: "Saving",
      completed: "Done",
      error: "Error"
    },
    pageTitle: {
      upload: "Upload",
      mapping: "Merchant Mapping",
      analysis: "Monthly Analysis",
      ledger: "Ledger",
      settings: "Settings"
    },
    navItems: [
      { key: "upload" as const, label: "Upload", subLabel: "Import files", icon: "↑" },
      { key: "mapping" as const, label: "Mapping", subLabel: "Merchant mapping", icon: "⇄" },
      { key: "analysis" as const, label: "Analysis", subLabel: "Monthly insights", icon: "◎" },
      { key: "ledger" as const, label: "Ledger", subLabel: "Transactions", icon: "≡" },
      { key: "settings" as const, label: "Settings", subLabel: "App settings", icon: "⚙" }
    ]
  } : {
    workspace: "작업 공간",
    baseMonth: "기준 월",
    db: "DB",
    collapseSidebar: "접기",
    expandSidebar: "펼치기",
    cardIssuer: "카드사",
    uploadStep: "카드사 선택",
    importIdle: "엑셀 파일 가져오기",
    importComplete: "가져오기 완료",
    retry: "다시 시도",
    importProcessing: "파일을 처리하는 중입니다…",
    importRecordPrefix: "가져오기",
    mappingKicker: "가맹점별 매핑",
    mappingSuffix: "거래 분류",
    mappingEmpty: "파일을 가져오면 가맹점 목록이 표시됩니다.",
    currentMonth: "이번 달",
    futureBilling: "미래 청구 예정",
    totalUsage: "총 사용 금액 (청구액)",
    billedCount: "청구 건수",
    billedCountDescription: "할부 건 포함",
    approvedThisMonth: "당월 승인 금액",
    approvedDescription: "할부 적용 전 순수 총액",
    previousBilling: "전월 청구 금액",
    claimDistribution: "카드사별 청구 분포",
    noData: "데이터 없음",
    total: "합계",
    noClaimData: "청구될 내역이 없습니다. 파일을 먼저 가져와주세요.",
    categoryDistribution: "카테고리별 분포",
    clickForDetails: "클릭하여 다건 상세 내역 확인",
    all: "전체",
    totalCount: "총",
    transactionDateTime: "거래일시",
    merchant: "가맹점",
    usageType: "이용구분",
    amount: "금액",
    status: "상태",
    canceled: "취소",
    normal: "정상",
    noTransactions: "저장된 거래가 없습니다.",
    uploadFirstHint: "가져오기에서 파일을 먼저 가져오세요.",
    information: "정보",
    preferences: "환경 설정",
    dataManagement: "데이터 관리",
    appInfo: "앱 정보",
    appInfoDescription: "제작자: 인찬 · FIDI Workspace",
    darkMode: "다크 모드",
    darkModeDescription: "시스템 및 눈을 편안하게 하는 어두운 테마를 사용합니다.",
    language: "언어 설정",
    languageDescription: "인터페이스 언어를 변경합니다.",
    korean: "한국어",
    english: "영어",
    resetDatabase: "로컬 DB 초기화",
    resetDatabaseDescription: "저장된 모든 거래 내역과 매핑 데이터를 영구적으로 삭제합니다.",
    reset: "초기화",
    confirmResetTitle: "데이터 초기화",
    confirmResetMessage: "정말 모든 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 가져온 카드 내역이 삭제됩니다.",
    resetSuccess: "데이터가 성공적으로 초기화되었습니다.",
    resetFailed: "초기화 실패",
    dbState: {
      idle: "대기",
      "browser-preview": "브라우저 미리보기",
      ready: "준비 완료",
      error: "오류"
    },
    importState: importStateLabel,
    pageTitle: {
      upload: "파일 가져오기",
      mapping: "가맹점 매핑",
      analysis: "월별 분석",
      ledger: "거래 내역",
      settings: "앱 설정"
    },
    navItems
  };

  const getCompanyName = (company: typeof cardCompanyConfig[number]) => (isEnglish ? company.englishName : company.label);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      window.localStorage.setItem(STORAGE_KEYS.theme, "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.setItem(STORAGE_KEYS.theme, "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.locale, locale);
  }, [locale]);

  /* Mapping */
  const [mappingTransactions, setMappingTransactions] = useState<VisibleTransaction[]>([]);
  const [merchantGroups, setMerchantGroups] = useState<MerchantGroup[]>([]);
  const [merchantCategories, setMerchantCategories] = useState<Record<string, string>>({});

  /* Analysis */
  const [analysisMonth, setAnalysisMonth] = useState(getCurrentYearMonth());
  const [analysisData, setAnalysisData] = useState<{
    totalBilledAmount: number;
    totalApprovedRaw: number;
    previousTotal: number;
    difference: number;
    billedItems: (TransactionRecord & { billedAmount: number })[];
  } | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  /* Ledger */
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTransactions, setLedgerTransactions] = useState<TransactionRecord[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  const refreshRef = useRef(0);

  const selectedConfig = cardCompanyConfig.find((c) => c.key === activeCompany) ?? cardCompanyConfig[0];
  const selectedMapping = cardMappings.find((m) => m.key === activeCompany) ?? cardMappings[0];
  const parserCount = listSupportedParsers().length;
  const isImporting = importState === "selecting" || importState === "parsing" || importState === "saving";

  /* DB init */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await initializeDatabase();
      if (!cancelled) setDbState(result.state);
    })();
    return () => { cancelled = true; };
  }, []);

  /* 매핑 로드 */
  async function loadMappingData(company: CardCompany) {
    const result = await listTransactionsForLatestImport(company);
    setCurrentImportId(result.importId);
    setMappingTransactions(result.transactions);
    setMerchantGroups(buildMerchantGroups(result.transactions));
  }

  /* 분석 로드 */
  async function loadAnalysis(ym: string) {
    setIsAnalysisLoading(true);
    setOpenCategory(null);
    try {
      const data = await getMonthlyBillingData(ym);
      setAnalysisData(data);
    } finally {
      setIsAnalysisLoading(false);
    }
  }

  /* 원장 로드 */
  async function loadLedger(filter: LedgerFilter, page: number) {
    setIsLedgerLoading(true);
    try {
      const offset = (page - 1) * LEDGER_PAGE_SIZE;
      const [rows, total] = await Promise.all([
        listTransactionsByCompany(filter, LEDGER_PAGE_SIZE, offset),
        countTransactionsByCompany(filter)
      ]);
      setLedgerTransactions(rows);
      setLedgerTotalCount(total);
    } finally {
      setIsLedgerLoading(false);
    }
  }

  useEffect(() => {
    if (dbState !== "ready") return;
    if (activePage === "mapping") void loadMappingData(activeCompany);
    if (activePage === "analysis") void loadAnalysis(analysisMonth);
    if (activePage === "ledger") void loadLedger(ledgerFilter, ledgerPage);
  }, [activePage, dbState]);

  useEffect(() => {
    if (dbState !== "ready" || activePage !== "analysis") return;
    void loadAnalysis(analysisMonth);
  }, [analysisMonth]);

  useEffect(() => {
    if (dbState !== "ready" || activePage !== "ledger") return;
    setLedgerPage(1);
    void loadLedger(ledgerFilter, 1);
  }, [ledgerFilter]);

  useEffect(() => {
    if (dbState !== "ready" || activePage !== "ledger") return;
    void loadLedger(ledgerFilter, ledgerPage);
  }, [ledgerPage]);

  function navigateTo(page: ActivePage) {
    setActivePage(page);
    setPageKey((k) => k + 1);
    if (dbState !== "ready") return;
    if (page === "mapping") void loadMappingData(activeCompany);
    if (page === "analysis") void loadAnalysis(analysisMonth);
    if (page === "ledger") void loadLedger(ledgerFilter, ledgerPage);
  }

  function handleCompanySelect(company: CardCompany) {
    if (activeCompany !== company) {
      setActiveCompany(company);
      // 가져오기 완료 상태 등 초기화
      setImportState("idle");
      setImportMessage(null);
      setLastImportedFile(null);
      setLastParsedCount(0);
      setCurrentImportId(null);
    }
  }

  async function handleImport() {
    setImportState("selecting");
    setImportMessage(null);
    const filePath = await pickExcelFile();
    setImportState("parsing");
    refreshRef.current += 1;
    const result = await executeImport(activeCompany, filePath);
    setImportState(result.state);
    setImportMessage(result.state === "error" ? result.message : null);
    setLastImportedFile(result.sourceFileName ?? null);
    setLastParsedCount(result.parsedCount ?? 0);
    if (result.importId) setCurrentImportId(result.importId);
    if (result.state === "completed") {
      const refreshed = await listTransactionsByImportId(result.importId!);
      setMappingTransactions(refreshed);
      setMerchantGroups(buildMerchantGroups(refreshed));
    }
  }

  async function handleDbReset() {
    const confirmed = isTauriRuntime()
      ? await confirmDialog(ui.confirmResetMessage, { title: ui.confirmResetTitle, kind: "warning" })
      : window.confirm(ui.confirmResetMessage);

    if (!confirmed) return;

    try {
      await resetDatabase();
      alert(ui.resetSuccess);
      setDbState("ready");
      setMappingTransactions([]);
      setMerchantGroups([]);
      setAnalysisData(null);
      setLedgerTransactions([]);
      setLedgerTotalCount(0);
      navigateTo("upload");
    } catch (e) {
      alert(`${ui.resetFailed}: ${formatUnknownError(e)}`);
    }
  }

  async function handleCategoryUpdate(merchantName: string, categoryName: string) {
    try {
      await updateMerchantCategory(merchantName, categoryName);
      setMerchantCategories((prev) => ({ ...prev, [merchantName]: categoryName }));
      // 매핑 후 다른 페이지 데이터를 미리 갱신할 필요가 있다면 여기서 수행
    } catch (e) {
      alert("카테고리 저장 실패: " + formatUnknownError(e));
    }
  }

  /* ════════════════════ Upload Page ════════════════════ */
  function renderUploadPage() {
    const isCompleted = importState === "completed";
    const isError = importState === "error";
    return (
      <div className="page-content" key={pageKey}>
        {/* 카드사 선택 */}
        <section className="card-selector-section">
          <p className="upload-step-label">{ui.uploadStep}</p>
          <div className="card-selector-grid">
            {cardCompanyConfig.map((config) => {
              const isActive = activeCompany === config.key;
              return (
                <button
                  className={`card-selector-item${isActive ? " card-selector-item-active" : ""}`}
                  key={config.key}
                  onClick={() => handleCompanySelect(config.key)}
                  style={isActive ? { background: config.gradient, boxShadow: `0 20px 48px ${config.color}50, 0 0 0 2px ${config.accentColor}`, color: "#fff" } : {}}
                  type="button"
                >
                  <div className="card-selector-icon" style={isActive ? { background: `${config.accentColor}30`, color: config.accentColor } : { background: `${config.color}12`, color: config.color }}>
                    {config.initial}
                  </div>
                  <div className="card-selector-info">
                    <strong className="card-selector-name">{getCompanyName(config)}</strong>
                    <span className="card-selector-en">{ui.cardIssuer}</span>
                  </div>
                  {isActive && (
                    <div className="card-selector-check">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="9" fill="rgba(255,255,255,0.2)" />
                        <path d="M5.5 9l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  <div className="card-selector-accent-bar" style={{ background: isActive ? "rgba(255,255,255,0.25)" : config.color }} />
                </button>
              );
            })}
          </div>
        </section>

        {/* 가져오기 패널 */}
        <section className="import-panel">
          <div className="import-company-badge" style={{ background: selectedConfig.gradient }}>
            <div className="import-badge-icon">{selectedConfig.initial}</div>
            <div className="import-badge-info">
              <span>{ui.cardIssuer}</span>
              <strong>{getCompanyName(selectedConfig)}</strong>
            </div>
            <div className="import-badge-db">
              <span>{ui.db}</span>
              <strong>{ui.dbState[dbState]}</strong>
            </div>
          </div>

          <div className="import-action-area">
            <button
              className={`import-main-btn${isImporting ? " import-main-btn-loading" : ""}${isCompleted ? " import-main-btn-done" : ""}${isError ? " import-main-btn-error" : ""}`}
              disabled={isImporting}
              onClick={() => void handleImport()}
              type="button"
            >
              <div className="import-btn-icon">
                {isImporting ? <div className="import-spinner" /> :
                 isCompleted ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"/><path d="M8 14l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> :
                 isError ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"/><path d="M14 9v6M14 18v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> :
                 <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 20V10M9 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 22h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5"/></svg>}
              </div>
              <div className="import-btn-text">
                <strong>{isImporting ? ui.importState[importState] : isCompleted ? ui.importComplete : isError ? ui.retry : ui.importIdle}</strong>
                <span>{isImporting ? ui.importProcessing : isCompleted ? (isEnglish ? `${lastParsedCount} parsed` : `${lastParsedCount}건 파싱 완료`) : isError ? (importMessage ?? (isEnglish ? "An error occurred." : "오류가 발생했습니다")) : `${getCompanyName(selectedConfig)} · .xlsx / .xls`}</span>
              </div>
            </button>

            {(lastImportedFile || lastParsedCount > 0) && (
              <div className="import-result-row">
                {lastImportedFile && <div className="import-result-chip"><span>📄</span><span>{lastImportedFile}</span></div>}
                {lastParsedCount > 0 && <div className="import-result-chip import-result-chip-accent"><span>{lastParsedCount}건</span></div>}
                {currentImportId && <div className="import-result-chip"><span>{ui.importRecordPrefix} #{currentImportId}</span></div>}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ════════════════════ Mapping Page ════════════════════ */
  function renderMappingPage() {
    const groups = merchantGroups;

    return (
      <div className="page-content" key={pageKey}>
        {/* 카드사 스위처 */}
        <div className="page-toolbar">
          <div className="company-switcher">
            {cardCompanyConfig.map((c) => (
              <button
                className={`switcher-btn${activeCompany === c.key ? " switcher-btn-active" : ""}`}
                key={c.key}
                onClick={() => { handleCompanySelect(c.key); void loadMappingData(c.key); }}
                style={activeCompany === c.key ? { background: c.gradient, color: "#fff" } : {}}
                type="button"
              >
                <span className="switcher-dot" style={{ background: activeCompany === c.key ? "rgba(255,255,255,0.5)" : c.color }} />
                {getCompanyName(c)}
              </button>
            ))}
          </div>
        </div>

        <section className="module-card mapping-card">
          <div className="module-header">
            <div>
              <p className="section-kicker">{ui.mappingKicker}</p>
              <h2>{getCompanyName(selectedConfig)} {ui.mappingSuffix}</h2>
            </div>
            <span className="module-tag">{isEnglish ? `${groups.length} merchants` : `${groups.length}개 가맹점`}</span>
          </div>

          {groups.length === 0 ? (
            <div className="mapping-empty" style={{ marginTop: 16 }}>{ui.mappingEmpty}</div>
          ) : (
            <div className="merchant-mapping-list">
              {groups.map((group) => {
                const assigned = merchantCategories[group.merchantName] ?? group.category ?? null;
                return (
                  <div className="merchant-mapping-row" key={group.merchantName}>
                    <div className="mmr-info">
                      <strong className="mmr-name">{group.merchantName}</strong>
                      <span className="mmr-meta">{isEnglish ? `${group.count} tx · ${formatAmount(group.total)} KRW` : `${group.count}건 · ${formatAmount(group.total)}원`}</span>
                    </div>
                    <div className="mmr-categories">
                      {mappingCategories.map((cat) => (
                        <button
                          className={`mmr-cat-btn mmr-cat-${cat.tone}${assigned === cat.name ? " mmr-cat-active" : ""}`}
                          key={formatCategoryName(cat.name, locale)}
                          onClick={() => void handleCategoryUpdate(group.merchantName, cat.name)}
                          type="button"
                        >
                          {formatCategoryName(cat.name, locale)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  /* ════════════════════ Analysis Page ════════════════════ */
  function renderAnalysisPage() {
    if (!analysisData) {
      return (
        <div className="page-content" key={pageKey}>
          <div className="ledger-loading"><div className="import-spinner" /></div>
        </div>
      );
    }

    const { totalBilledAmount, totalApprovedRaw, previousTotal, difference, billedItems } = analysisData;

    /* 카드사별 집계 */
    const cardTotals = cardCompanyConfig.map((c) => ({
      config: c,
      total: billedItems.filter((t) => t.cardCompany === c.key).reduce((s, t) => s + t.netAmount, 0),
      count: billedItems.filter((t) => t.cardCompany === c.key).length
    })).filter((c) => c.count > 0);

    /* 도넛 차트 요약 */
    const tones: UsageSummary["tone"][] = ["teal", "indigo", "coral", "gold"];
    const grandTotal = cardTotals.reduce((s, c) => s + Math.abs(c.total), 0) || 1;
    const donutSummaries: UsageSummary[] = cardTotals.map((c, i) => ({
      label: formatCardCompany(c.config.key, locale), count: c.count, total: c.total,
      share: Math.max(5, Math.round((Math.abs(c.total) / grandTotal) * 100)),
      tone: tones[i % tones.length]
    }));

    /* 카테고리별 집계 (아코디언용) */
    const mergedCategoryGroups: Record<string, { total: number; transactions: (TransactionRecord & { billedAmount: number })[] }> = {};
    for (const t of billedItems) {
      const cat = t.categoryNameSnapshot || (isEnglish ? "Uncategorized" : "분류 안 됨");
      if (!mergedCategoryGroups[cat]) mergedCategoryGroups[cat] = { total: 0, transactions: [] };
      mergedCategoryGroups[cat].total += t.billedAmount;
      mergedCategoryGroups[cat].transactions.push(t);
    }
    const sortedCategories = Object.entries(mergedCategoryGroups).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total));

    /* 미래 달 이동 제한: 현재로부터 12개월까지만 허용 */
    const isMaxFuture = () => {
      const current = getCurrentYearMonth();
      const [cy, cm] = current.split("-").map(Number);
      const [ay, am] = analysisMonth.split("-").map(Number);
      const diff = (ay - cy) * 12 + (am - cm);
      return diff >= 12;
    };

    const isCurrentMonth = analysisMonth === getCurrentYearMonth();
    const isFuture = () => {
      const current = getCurrentYearMonth();
      return analysisMonth > current;
    };

    return (
      <div className="page-content" key={pageKey}>
        {/* 월 선택 바 */}
        <div className="month-selector-bar">
          <button className="month-nav-btn" onClick={() => setAnalysisMonth(getPrevYearMonth(analysisMonth))} type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="month-label">
            <strong>{formatYearMonth(analysisMonth, locale)}</strong>
            {isCurrentMonth && <span className="month-badge">{ui.currentMonth}</span>}
            {isFuture() && <span className="month-badge" style={{ background: "rgba(200,75,49,0.1)", color: "var(--coral)" }}>{ui.futureBilling}</span>}
          </div>
          <button
            className="month-nav-btn"
            disabled={isMaxFuture()}
            onClick={() => setAnalysisMonth(getNextYearMonth(analysisMonth))}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {isAnalysisLoading && <span className="loading-dot" />}
        </div>

        {/* 통계 카드 */}
        <div className="analysis-summary-grid">
          <div className="analysis-stat-card analysis-stat-primary">
            <p className="section-kicker">{ui.totalUsage}</p>
            <strong className="analysis-stat-amount">{formatAmount(totalBilledAmount)}원</strong>
            <div className="analysis-stat-sub">
              <span className={difference >= 0 ? "diff-up" : "diff-down"}>
                {isEnglish ? `vs previous month ${difference >= 0 ? "+" : ""}${formatAmount(difference)} KRW` : `전월 대비 ${difference >= 0 ? "+" : ""}${formatAmount(difference)}원`}
              </span>
            </div>
          </div>
          <div className="analysis-stat-card">
            <p className="section-kicker">{ui.billedCount}</p>
            <strong className="analysis-stat-num">{billedItems.length}건</strong>
            <p className="analysis-stat-desc">{ui.billedCountDescription}</p>
          </div>
          <div className="analysis-stat-card">
            <p className="section-kicker">{ui.approvedThisMonth}</p>
            <strong className="analysis-stat-num">{formatAmount(totalApprovedRaw)}원</strong>
            <p className="analysis-stat-desc">{ui.approvedDescription}</p>
          </div>
          <div className="analysis-stat-card">
            <p className="section-kicker">{ui.previousBilling}</p>
            <strong className="analysis-stat-num">{formatAmount(previousTotal)}원</strong>
            <p className="analysis-stat-desc">{formatYearMonth(getPrevYearMonth(analysisMonth), locale)}</p>
          </div>
        </div>

        {/* 카드사별 도넛 + 리스트 */}
        <section className="module-card donut-card">
          <div className="module-subheader">
            <h2>{ui.claimDistribution}</h2>
            <span>{billedItems.length > 0 ? (isEnglish ? `${formatYearMonth(analysisMonth, locale)} billing basis` : `${formatYearMonth(analysisMonth, locale)} 청구액 기준`) : ui.noData}</span>
          </div>
          {billedItems.length > 0 ? (
            <div className="donut-layout">
              <div className="donut-ring" style={buildDonutStyle(donutSummaries)}>
                <div className="donut-core">
                  <span>{ui.total}</span>
                  <strong>{formatAmount(Math.abs(totalBilledAmount))}원</strong>
                </div>
              </div>
              <div className="donut-legend">
                {donutSummaries.map((s) => (
                  <div className="legend-item" key={s.label}>
                    <span className={`legend-dot legend-dot-${s.tone}`} />
                    <div>
                      <strong>{s.label}</strong>
                      <p>{isEnglish ? `${s.count} items · ${formatAmount(s.total)} KRW · ${s.share}%` : `${s.count}건 · ${formatAmount(s.total)}원 · ${s.share}%`}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="analysis-empty">{`${formatYearMonth(analysisMonth, locale)} ${ui.noClaimData}`}</div>
          )}
        </section>

        {/* 카테고리별 분포 (아코디언 형태) */}
        {billedItems.length > 0 && (
          <section className="module-card accordion-card">
            <div className="module-subheader" style={{ marginBottom: "16px" }}>
              <h2>{ui.categoryDistribution}</h2>
              <span>{ui.clickForDetails}</span>
            </div>

            {/* 카테고리 분포 바 */}
            <div className="category-distribution-wrapper">
              <div className="category-distribution-bar">
                {sortedCategories.map(([catName, data]) => {
                  const share = (data.total / totalBilledAmount) * 100;
                  const catConfig = mappingCategories.find(c => c.name === catName) || { tone: "default" };
                  if (share < 1) return null; // 너무 작으면 생략
                  return (
                    <div
                      className={`cat-dist-segment cat-dist-${catConfig.tone}`}
                      key={catName}
                      style={{ width: `${share}%` }}
                      title={`${formatCategoryName(catName, locale)}: ${Math.round(share)}%`}
                    />
                  );
                })}
              </div>
              <div className="category-distribution-legend">
                {sortedCategories.slice(0, 5).map(([catName, data]) => {
                  const share = (data.total / totalBilledAmount) * 100;
                  const catConfig = mappingCategories.find(c => c.name === catName) || { tone: "default" };
                  return (
                    <div className="cat-legend-item" key={catName}>
                      <span className={`cat-legend-dot cat-legend-${catConfig.tone}`} />
                      <span className="cat-legend-name">{formatCategoryName(catName, locale)}</span>
                      <span className="cat-legend-share">{Math.round(share)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="category-accordion-list">
              {sortedCategories.map(([catName, data]) => {
                const isOpen = openCategory === catName;
                return (
                  <div className={`accordion-item${isOpen ? " accordion-open" : ""}`} key={catName}>
                    <button className="accordion-header" onClick={() => setOpenCategory(isOpen ? null : catName)} type="button">
                      <div className="acc-header-left">
                        <span className="acc-arrow"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                        <strong>{formatCategoryName(catName, locale)}</strong>
                      </div>
                      <div className="acc-header-right">
                        <span className="acc-count">{isEnglish ? `${data.transactions.length} items` : `${data.transactions.length}건`}</span>
                        <strong className="acc-total">{formatAmount(data.total)}원</strong>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="accordion-body">
                        <div className="acc-tx-list">
                          {data.transactions.map((tx, idx) => {
                            const isInstallment = tx.installmentMonths > 1;
                            return (
                              <div className="acc-tx-row" key={idx}>
                                <div className="acc-tx-left">
                                  <span className="acc-tx-date">{tx.transactionDate?.slice(5) || ""}</span>
                                  <div className="acc-tx-name-group">
                                    <span className="acc-tx-name">{tx.merchantName}</span>
                                    {isInstallment && <span className="acc-tx-tag">{isEnglish ? "Installment" : "할부"}</span>}
                                  </div>
                                </div>
                                <div className="acc-tx-right">
                                  <div className="acc-tx-amounts">
                                    <span className="acc-tx-approved">{isEnglish ? `Approved ${formatAmount(tx.netAmount)} KRW` : `승인 ${formatAmount(tx.netAmount)}원`}</span>
                                    <strong className="acc-tx-billed">{formatAmount(tx.billedAmount)}원</strong>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  /* ════════════════════ Ledger Page ════════════════════ */
  function renderLedgerPage() {
    const totalPages = Math.max(1, Math.ceil(ledgerTotalCount / LEDGER_PAGE_SIZE));

    return (
      <div className="page-content" key={pageKey}>
        {/* 필터 바 */}
        <div className="page-toolbar" style={{ justifyContent: "space-between" }}>
          <div className="company-switcher">
            <button
              className={`switcher-btn${ledgerFilter === "all" ? " switcher-btn-active" : ""}`}
              onClick={() => setLedgerFilter("all")}
              type="button"
              style={ledgerFilter === "all" ? { background: "linear-gradient(135deg, #3755c3 0%, #7589ff 100%)", color: "#fff" } : {}}
            >
              {ui.all}
            </button>
            {cardCompanyConfig.map((c) => (
              <button
                className={`switcher-btn${ledgerFilter === c.key ? " switcher-btn-active" : ""}`}
                key={c.key}
                onClick={() => setLedgerFilter(c.key)}
                style={ledgerFilter === c.key ? { background: c.gradient, color: "#fff" } : {}}
                type="button"
              >
                <span className="switcher-dot" style={{ background: ledgerFilter === c.key ? "rgba(255,255,255,0.5)" : c.color }} />
                {getCompanyName(c)}
              </button>
            ))}
          </div>
          <div className="meta-pill" style={{ margin: 0 }}>
            <span>{ui.totalCount}</span>
            <strong>{isEnglish ? `${ledgerTotalCount} items` : `${ledgerTotalCount}건`}</strong>
          </div>
        </div>

        <section className="module-card ledger-card">
          {isLedgerLoading ? (
            <div className="ledger-loading">
              <div className="import-spinner" style={{ borderColor: "rgba(55,85,195,0.2)", borderTopColor: "#3755c3" }} />
            </div>
          ) : ledgerTransactions.length > 0 ? (
            <>
              <div className="transaction-table">
                <div className="transaction-head">
                  <span>{ui.transactionDateTime}</span>
                  <span>{ui.merchant}</span>
                  <span>{ui.usageType}</span>
                  <span>{ui.amount}</span>
                  <span>{ui.status}</span>
                </div>
                {ledgerTransactions.map((t, i) => (
                  <div className="transaction-row" key={`${t.importId}-${t.transactionDate}-${t.merchantName}-${i}`}>
                    <span>
                      <strong>{t.transactionDate}</strong>
                      <small>{t.transactionTime ?? "-"}</small>
                    </span>
                    <span>
                      <strong>{t.merchantName || "-"}</strong>
                      <small>{formatCardCompany(t.cardCompany, locale)}</small>
                    </span>
                    <span>
                      <strong>{t.usageType ?? "-"}</strong>
                      <small>{isEnglish ? `Installment ${t.installmentMonths} months` : `할부 ${t.installmentMonths}개월`}</small>
                    </span>
                    <span className="amount-cell">
                      <strong>{formatAmount(t.netAmount)}원</strong>
                      <small>{isEnglish ? `Approved ${formatAmount(t.approvedAmount)} KRW` : `승인 ${formatAmount(t.approvedAmount)}`}</small>
                    </span>
                    <span>
                      <strong className={t.isCanceled ? "status-canceled" : "status-normal"}>
                        {t.isCanceled ? ui.canceled : t.status ?? ui.normal}
                      </strong>
                      <small>{t.approvalStatus ?? t.cancelDate ?? "-"}</small>
                    </span>
                  </div>
                ))}
              </div>

              {/* 페이지네이션 */}
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={ledgerPage === 1}
                  onClick={() => setLedgerPage(1)}
                  type="button"
                >«</button>
                <button
                  className="page-btn"
                  disabled={ledgerPage === 1}
                  onClick={() => setLedgerPage((p) => p - 1)}
                  type="button"
                >‹</button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 7) {
                    page = i + 1;
                  } else if (ledgerPage <= 4) {
                    page = i + 1;
                  } else if (ledgerPage >= totalPages - 3) {
                    page = totalPages - 6 + i;
                  } else {
                    page = ledgerPage - 3 + i;
                  }
                  return (
                    <button
                      className={`page-btn${page === ledgerPage ? " page-btn-active" : ""}`}
                      key={page}
                      onClick={() => setLedgerPage(page)}
                      type="button"
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  className="page-btn"
                  disabled={ledgerPage === totalPages}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  type="button"
                >›</button>
                <button
                  className="page-btn"
                  disabled={ledgerPage === totalPages}
                  onClick={() => setLedgerPage(totalPages)}
                  type="button"
                >»</button>

                <span className="page-info">{isEnglish ? `${ledgerPage} / ${totalPages} pages` : `${ledgerPage} / ${totalPages}페이지`}</span>
              </div>
            </>
          ) : (
            <div className="ledger-empty">
              {ledgerFilter === "all" ? ui.noTransactions : (isEnglish ? `No transactions for ${formatCardCompany(ledgerFilter as CardCompany, locale)}.` : `${formatCardCompany(ledgerFilter as CardCompany)} 거래가 없습니다.`)}<br />
              {ui.uploadFirstHint}
            </div>
          )}
        </section>
      </div>
    );
  }

/* ════════════════════ Settings Page ════════════════════ */
  function renderSettingsPage() {
    return (
      <div className="page-content" key={pageKey}>
        
        <div className="settings-section">
          <p className="settings-section-title">{ui.information}</p>
          <div className="settings-list">
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>{ui.appInfo}</strong>
                <span>{ui.appInfoDescription}</span>
              </div>
              <div className="settings-btn" style={{ pointerEvents: "none", background: "transparent", border: "none", color: "var(--text-muted)" }}>v1.0.0</div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <p className="settings-section-title">{ui.preferences}</p>
          <div className="settings-list">
            <label className="settings-item">
              <div className="settings-item-info">
                <strong>{ui.darkMode}</strong>
                <span>{ui.darkModeDescription}</span>
              </div>
              <input
                type="checkbox"
                className="toggle-switch"
                checked={isDarkMode}
                onChange={(e) => setIsDarkMode(e.target.checked)}
              />
            </label>
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>{ui.language}</strong>
                <span>{ui.languageDescription}</span>
              </div>
              <select className="settings-select" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                <option value="ko">{ui.korean}</option>
                <option value="en">{ui.english}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <p className="settings-section-title">{ui.dataManagement}</p>
          <div className="settings-list">
            <div className="settings-item">
              <div className="settings-item-info">
                <strong>{ui.resetDatabase}</strong>
                <span>{ui.resetDatabaseDescription}</span>
              </div>
              <button className="settings-btn settings-btn-danger" onClick={() => void handleDbReset()} type="button">
                {ui.reset}
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }

  /* ════════════════════ Shell ════════════════════ */
  return (
    <div className={`studio-shell${isSidebarOpen ? "" : " sidebar-collapsed"}`}>
      {/* 사이드바 */}
      <aside className="studio-rail">
        <button className="rail-toggle" onClick={() => setIsSidebarOpen((o) => !o)} title={isSidebarOpen ? ui.collapseSidebar : ui.expandSidebar} type="button">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {isSidebarOpen
              ? <path d="M12 3L6 9l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              : <path d="M6 3l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
          </svg>
        </button>

        <div className="rail-brand">
          <div className="rail-brand-text">
            <strong>FIDI</strong>
            <span>Fine, I'll Do It</span>
          </div>
        </div>

        <nav className="rail-nav">
          {ui.navItems.map((item) => (
            <button
              className={`rail-link${activePage === item.key ? " rail-link-active" : ""}`}
              key={item.key}
              onClick={() => navigateTo(item.key)}
              title={item.label}
              type="button"
            >
              <span className="rail-link-icon">{item.icon}</span>
              <div className="rail-link-text">
                <span className="rail-link-label">{item.label}</span>
                <span className="rail-link-sub">{item.subLabel}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="rail-footnote">
          <div className={`rail-db-dot${dbState === "ready" ? " rail-db-dot-ready" : dbState === "error" ? " rail-db-dot-error" : ""}`} />
          <span className="rail-footnote-text">{ui.db} · {ui.dbState[dbState]}</span>
        </div>
      </aside>

      {/* 본문 */}
      <main className="studio-main">
        {/* 단일 헤더 */}
        <header className="workspace-header">
          <div>
            <h1>{ui.pageTitle[activePage]}</h1>
          </div>
          <div className="workspace-meta">
            {activePage === "analysis" && (
              <div className="meta-pill">
                <span>{ui.baseMonth}</span>
                <strong>{formatYearMonth(analysisMonth, locale)}</strong>
              </div>
            )}
          </div>
        </header>

        {activePage === "upload"   && renderUploadPage()}
        {activePage === "mapping"  && renderMappingPage()}
        {activePage === "analysis" && renderAnalysisPage()}
        {activePage === "ledger"   && renderLedgerPage()}
        {activePage === "settings" && renderSettingsPage()}
      </main>
    </div>
  );
}

