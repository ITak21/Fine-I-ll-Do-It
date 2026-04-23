export type CardCompany = "hyundai" | "lotte" | "shinhan" | "hana";

export type DatabaseBootState = "idle" | "browser-preview" | "ready" | "error";

export type ImportField = {
  source: string;
  target: string;
  note?: string;
};

export type CardCompanyMapping = {
  key: CardCompany;
  label: string;
  fields: ImportField[];
};

export type DashboardStat = {
  label: string;
  value: string;
  tone?: "default" | "accent";
};

export type ImportStage = {
  title: string;
  description: string;
};

export type ImportRecord = {
  id?: number;
  sourceFileName: string;
  cardCompany: CardCompany;
  importedAt: string;
  rowCount: number;
  memo?: string | null;
};

export type TransactionRecord = {
  id?: number;
  importId: number;
  cardCompany: CardCompany;
  transactionDate: string;
  transactionTime?: string | null;
  transactionDatetime?: string | null;
  merchantName: string;
  usageType?: string | null;
  installmentMonths: number;
  approvedAmount: number;
  canceledAmount: number;
  netAmount: number;
  isCanceled: boolean;
  cancelDate?: string | null;
  status?: string | null;
  approvalStatus?: string | null;
  categoryId?: number | null;
  categoryNameSnapshot?: string | null;
  memo?: string | null;
  rawJson?: string | null;
};

export type MonthlyCategorySummary = {
  yearMonth: string;
  categoryName: string;
  totalAmount: number;
  transactionCount: number;
};

export type MonthlyComparison = {
  currentMonth: string;
  previousMonth: string;
  currentTotal: number;
  previousTotal: number;
  difference: number;
};

export type ParserParseOptions = {
  fileName: string;
};

export type ParsedTransaction = Omit<TransactionRecord, "id" | "importId">;

export type ParseResult = {
  cardCompany: CardCompany;
  transactions: ParsedTransaction[];
};

export type CardParser = {
  cardCompany: CardCompany;
  parse: (rows: Record<string, string>[], options: ParserParseOptions) => ParseResult;
};

export type ImportFlowState = "idle" | "selecting" | "parsing" | "saving" | "completed" | "error";

export type ImportExecutionResult = {
  state: ImportFlowState;
  message: string;
  importId?: number;
  parsedCount?: number;
  savedCount?: number;
  skippedCount?: number;
  sourceFileName?: string;
  transactions?: ParsedTransaction[];
};
