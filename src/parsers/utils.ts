import type { ParsedTransaction } from "../types";

export function sanitizeAmount(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[^\d-]/g, "");
  if (!normalized) {
    return 0;
  }

  return Number.parseInt(normalized, 10) || 0;
}

export function parseInstallmentMonths(value: string | undefined) {
  if (!value) {
    return 0;
  }

  if (value.includes("-") || value.trim() === "일시불") {
    return 0;
  }

  const match = value.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function normalizeDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  let match = trimmed.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  match = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    return `20${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  match = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}:\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  return trimmed;
}

export function normalizeTime(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return trimmed || null;
  }

  const hh = match[1].padStart(2, "0");
  const mm = match[2];
  const ss = match[3];
  return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function splitDateTime(value: string | undefined) {
  if (!value) {
    return { transactionDate: "", transactionTime: null };
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}:\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return {
      transactionDate: normalizeDate(trimmed),
      transactionTime: null
    };
  }

  return {
    transactionDate: `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`,
    transactionTime: match[5] ? `${match[4]}:${match[5]}` : match[4]
  };
}

export function combineDateTime(transactionDate: string, transactionTime?: string | null) {
  if (!transactionDate || !transactionTime) {
    return null;
  }

  return `${transactionDate} ${transactionTime}`;
}

export function normalizeCancellationFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ["y", "yes", "취소", "승인취소", "부분취소", "취소완료", "cancel", "true", "1"].includes(normalized);
}

export function isValidTransactionDate(value: string | undefined) {
  const normalized = normalizeDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized);
}

export function createBaseTransaction(input: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    cardCompany: input.cardCompany ?? "hyundai",
    transactionDate: input.transactionDate ?? "",
    transactionTime: input.transactionTime ?? null,
    transactionDatetime: input.transactionDatetime ?? null,
    merchantName: input.merchantName ?? "",
    usageType: input.usageType ?? null,
    installmentMonths: input.installmentMonths ?? 0,
    approvedAmount: input.approvedAmount ?? 0,
    canceledAmount: input.canceledAmount ?? 0,
    netAmount: input.netAmount ?? 0,
    isCanceled: input.isCanceled ?? false,
    cancelDate: input.cancelDate ?? null,
    status: input.status ?? null,
    approvalStatus: input.approvalStatus ?? null,
    categoryId: input.categoryId ?? null,
    categoryNameSnapshot: input.categoryNameSnapshot ?? null,
    memo: input.memo ?? null,
    rawJson: input.rawJson ?? null
  };
}
