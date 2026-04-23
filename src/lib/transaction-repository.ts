import type {
  CardCompany,
  ImportRecord,
  MonthlyCategorySummary,
  MonthlyComparison,
  ParsedTransaction,
  TransactionRecord
} from "../types";
import { requireDatabase } from "./database";

type IdRow = {
  id: number;
};

type SummaryRow = {
  year_month: string;
  category_name: string | null;
  total_amount: number;
  transaction_count: number;
};

type ComparisonRow = {
  current_total: number | null;
  previous_total: number | null;
};

type DuplicateCheckRow = {
  transactionDate: string;
  transactionTime: string | null;
  merchantName: string;
  netAmount: number;
};

export type SaveImportedTransactionsResult = {
  importId: number | null;
  insertedCount: number;
  skippedCount: number;
  insertedTransactions: ParsedTransaction[];
};

export async function createImportRecord(record: ImportRecord) {
  const db = requireDatabase();
  const result = await db.select<IdRow[]>(
    `INSERT INTO imports (source_file_name, card_company, imported_at, row_count, memo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id;`,
    [record.sourceFileName, record.cardCompany, record.importedAt, record.rowCount, record.memo ?? null]
  );

  return result[0]?.id ?? 0;
}

function normalizeIdentityText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function buildTransactionIdentityKey(cardCompany: CardCompany, transaction: Pick<ParsedTransaction, "transactionDate" | "transactionTime" | "merchantName" | "netAmount">) {
  return [
    cardCompany,
    normalizeIdentityText(transaction.transactionDate),
    normalizeIdentityText(transaction.transactionTime),
    normalizeIdentityText(transaction.merchantName),
    String(transaction.netAmount)
  ].join("|");
}

async function listExistingTransactionKeys(cardCompany: CardCompany, transactions: ParsedTransaction[]) {
  if (transactions.length === 0) {
    return new Set<string>();
  }

  const db = requireDatabase();
  const dates = transactions
    .map((transaction) => transaction.transactionDate)
    .filter((value) => value.length > 0)
    .sort();

  const minDate = dates[0] ?? null;
  const maxDate = dates[dates.length - 1] ?? null;

  const rows = minDate && maxDate
    ? await db.select<DuplicateCheckRow[]>(
        `SELECT
          transaction_date AS transactionDate,
          transaction_time AS transactionTime,
          merchant_name AS merchantName,
          net_amount AS netAmount
         FROM transactions
         WHERE card_company = $1
           AND transaction_date >= $2
           AND transaction_date <= $3;`,
        [cardCompany, minDate, maxDate]
      )
    : await db.select<DuplicateCheckRow[]>(
        `SELECT
          transaction_date AS transactionDate,
          transaction_time AS transactionTime,
          merchant_name AS merchantName,
          net_amount AS netAmount
         FROM transactions
         WHERE card_company = $1;`,
        [cardCompany]
      );

  return new Set(rows.map((row) => buildTransactionIdentityKey(cardCompany, {
    transactionDate: row.transactionDate,
    transactionTime: row.transactionTime,
    merchantName: row.merchantName,
    netAmount: row.netAmount
  })));
}

async function filterNewTransactions(cardCompany: CardCompany, transactions: ParsedTransaction[]) {
  const existingKeys = await listExistingTransactionKeys(cardCompany, transactions);
  const batchKeys = new Set<string>();
  const insertedTransactions: ParsedTransaction[] = [];
  let skippedCount = 0;

  for (const transaction of transactions) {
    const key = buildTransactionIdentityKey(cardCompany, transaction);

    if (existingKeys.has(key) || batchKeys.has(key)) {
      skippedCount += 1;
      continue;
    }

    batchKeys.add(key);
    insertedTransactions.push(transaction);
  }

  return {
    insertedTransactions,
    skippedCount
  };
}

export async function insertTransactions(importId: number, transactions: ParsedTransaction[]) {
  const db = requireDatabase();

  for (const transaction of transactions) {
    await db.execute(
      `INSERT INTO transactions (
        import_id,
        card_company,
        transaction_date,
        transaction_time,
        transaction_datetime,
        merchant_name,
        usage_type,
        installment_months,
        approved_amount,
        canceled_amount,
        net_amount,
        is_canceled,
        cancel_date,
        status,
        approval_status,
        category_id,
        category_name_snapshot,
        memo,
        raw_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19);`,
      [
        importId,
        transaction.cardCompany,
        transaction.transactionDate,
        transaction.transactionTime ?? null,
        transaction.transactionDatetime ?? null,
        transaction.merchantName,
        transaction.usageType ?? null,
        transaction.installmentMonths,
        transaction.approvedAmount,
        transaction.canceledAmount,
        transaction.netAmount,
        transaction.isCanceled ? 1 : 0,
        transaction.cancelDate ?? null,
        transaction.status ?? null,
        transaction.approvalStatus ?? null,
        transaction.categoryId ?? null,
        transaction.categoryNameSnapshot ?? null,
        transaction.memo ?? null,
        transaction.rawJson ?? null
      ]
    );
  }
}

export async function saveImportedTransactions(record: ImportRecord, transactions: ParsedTransaction[]): Promise<SaveImportedTransactionsResult> {
  const { insertedTransactions, skippedCount } = await filterNewTransactions(record.cardCompany, transactions);

  if (insertedTransactions.length === 0) {
    return {
      importId: null,
      insertedCount: 0,
      skippedCount,
      insertedTransactions: []
    };
  }

  const importId = await createImportRecord({
    ...record,
    rowCount: insertedTransactions.length
  });

  await insertTransactions(importId, insertedTransactions);

  return {
    importId,
    insertedCount: insertedTransactions.length,
    skippedCount,
    insertedTransactions
  };
}

function transactionSelectSql(whereClause: string) {
  return `SELECT
    id AS id,
    import_id AS importId,
    card_company AS cardCompany,
    transaction_date AS transactionDate,
    transaction_time AS transactionTime,
    transaction_datetime AS transactionDatetime,
    merchant_name AS merchantName,
    usage_type AS usageType,
    installment_months AS installmentMonths,
    approved_amount AS approvedAmount,
    canceled_amount AS canceledAmount,
    net_amount AS netAmount,
    is_canceled AS isCanceled,
    cancel_date AS cancelDate,
    status AS status,
    approval_status AS approvalStatus,
    category_id AS categoryId,
    category_name_snapshot AS categoryNameSnapshot,
    memo AS memo,
    raw_json AS rawJson
  FROM transactions
  ${whereClause}
  ORDER BY transaction_date DESC, transaction_time DESC, id DESC`;
}

export async function listRecentTransactions(limit = 20) {
  const db = requireDatabase();
  return db.select<TransactionRecord[]>(`${transactionSelectSql("")} LIMIT $1;`, [limit]);
}

export async function listTransactionsByImportId(importId: number) {
  const db = requireDatabase();
  return db.select<TransactionRecord[]>(transactionSelectSql("WHERE import_id = $1"), [importId]);
}

export async function findLatestImportId(cardCompany: CardCompany) {
  const db = requireDatabase();
  const rows = await db.select<IdRow[]>(
    `SELECT id
     FROM imports
     WHERE card_company = $1
     ORDER BY imported_at DESC, id DESC
     LIMIT 1;`,
    [cardCompany]
  );

  return rows[0]?.id ?? null;
}

export async function listTransactionsForLatestImport(cardCompany: CardCompany) {
  const latestImportId = await findLatestImportId(cardCompany);

  if (!latestImportId) {
    return {
      importId: null,
      transactions: [] as TransactionRecord[]
    };
  }

  return {
    importId: latestImportId,
    transactions: await listTransactionsByImportId(latestImportId)
  };
}

export async function getMonthlyCategorySummary(yearMonth: string, cardCompany?: CardCompany) {
  const db = requireDatabase();
  const companyClause = cardCompany ? "AND card_company = $2" : "";
  const params = cardCompany ? [`${yearMonth}%`, cardCompany] : [`${yearMonth}%`];

  const rows = await db.select<SummaryRow[]>(
    `SELECT
      substr(transaction_date, 1, 7) AS year_month,
      COALESCE(category_name_snapshot, '???') AS category_name,
      SUM(net_amount) AS total_amount,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE transaction_date LIKE $1
    ${companyClause}
    GROUP BY substr(transaction_date, 1, 7), COALESCE(category_name_snapshot, '???')
    ORDER BY total_amount DESC;`,
    params
  );

  return rows.map((row) => ({
    yearMonth: row.year_month,
    categoryName: row.category_name ?? "???",
    totalAmount: row.total_amount,
    transactionCount: row.transaction_count
  })) satisfies MonthlyCategorySummary[];
}

export async function getMonthlyComparison(currentMonth: string, previousMonth: string, cardCompany?: CardCompany) {
  const db = requireDatabase();
  const companyClause = cardCompany ? "AND card_company = $3" : "";
  const params = cardCompany
    ? [`${currentMonth}%`, `${previousMonth}%`, cardCompany]
    : [`${currentMonth}%`, `${previousMonth}%`];

  const rows = await db.select<ComparisonRow[]>(
    `SELECT
      (SELECT COALESCE(SUM(net_amount), 0) FROM transactions WHERE transaction_date LIKE $1 ${companyClause}) AS current_total,
      (SELECT COALESCE(SUM(net_amount), 0) FROM transactions WHERE transaction_date LIKE $2 ${companyClause}) AS previous_total;`,
    params
  );

  const result = rows[0] ?? { current_total: 0, previous_total: 0 };
  const currentTotal = result.current_total ?? 0;
  const previousTotal = result.previous_total ?? 0;

  return {
    currentMonth,
    previousMonth,
    currentTotal,
    previousTotal,
    difference: currentTotal - previousTotal
  } satisfies MonthlyComparison;
}

/** 특정 월의 전체 거래(모든 카드사) 조회 */
export async function listTransactionsByMonth(yearMonth: string) {
  const db = requireDatabase();
  return db.select<TransactionRecord[]>(
    transactionSelectSql(`WHERE transaction_date LIKE $1`),
    [`${yearMonth}%`]
  );
}

/** 카드사별 거래 조회 (전체 또는 특정 카드사, 페이지네이션) */
export async function listTransactionsByCompany(
  cardCompany: CardCompany | "all",
  limit: number,
  offset: number
) {
  const db = requireDatabase();
  if (cardCompany === "all") {
    return db.select<TransactionRecord[]>(
      `${transactionSelectSql("")} LIMIT $1 OFFSET $2;`,
      [limit, offset]
    );
  }
  return db.select<TransactionRecord[]>(
    `${transactionSelectSql("WHERE card_company = $1")} LIMIT $2 OFFSET $3;`,
    [cardCompany, limit, offset]
  );
}

/** 카드사별 또는 전체 거래 수 */
export async function countTransactionsByCompany(cardCompany: CardCompany | "all") {
  const db = requireDatabase();
  type CountRow = { total: number };
  const rows = cardCompany === "all"
    ? await db.select<CountRow[]>(`SELECT COUNT(*) AS total FROM transactions;`, [])
    : await db.select<CountRow[]>(`SELECT COUNT(*) AS total FROM transactions WHERE card_company = $1;`, [cardCompany]);
  return rows[0]?.total ?? 0;
}

/** 가맹점별 그룹 요약 (카드사별 최근 import 기준) */
export type MerchantGroup = {
  merchantName: string;
  count: number;
  totalAmount: number;
  categoryNameSnapshot: string | null;
  transactions: TransactionRecord[];
};

/** 특정 월의 청구/승인 정보(할부 분할 적용) 목록 계산 */
export async function getMonthlyBillingData(yearMonth: string) {
  const db = requireDatabase();
  const [targetYear, targetMonth] = yearMonth.split("-").map(Number);
  
  // 전체 거래 로드 후 JS 연산 (수만 건 이하는 Tauri/SQLite에서 즉시 로드)
  const rows = await db.select<TransactionRecord[]>(transactionSelectSql(""));

  let totalBilledAmount = 0;
  let totalApprovedRaw = 0;
  const billedItems: (TransactionRecord & { billedAmount: number })[] = [];

  for (const t of rows) {
    if (!t.transactionDate) continue;
    const [yStr, mStr] = t.transactionDate.split("-");
    const txYear = Number(yStr);
    const txMonth = Number(mStr);
    
    // 1) 당월 발생 거래의 전체(일시불+할부원금 포함) 승인 금액 계산
    if (txYear === targetYear && txMonth === targetMonth) {
      totalApprovedRaw += t.netAmount;
    }

    if (t.isCanceled) continue;

    // 2) 할부 적용 청구 금액 계산 (기존의 "총 사용금액")
    const diff = (targetYear - txYear) * 12 + (targetMonth - txMonth);
    const inst = Math.max(1, t.installmentMonths || 1);
    
    // 해당 월이 할부 청구 기간 안에 포함되는 경우
    if (diff >= 0 && diff < inst) {
      const billedValue = Math.round(t.netAmount / inst);
      totalBilledAmount += billedValue;
      if (billedValue !== 0) {
        billedItems.push({
          ...t,
          billedAmount: Math.abs(billedValue)
        });
      }
    }
  }

  // 3) 전월 청구액 계산 (전월 대비 표시용)
  let prevMonth = targetMonth - 1;
  let prevYear = targetYear;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
  let previousTotal = 0;
  for (const t of rows) {
    if (!t.transactionDate || t.isCanceled) continue;
    const [yStr, mStr] = t.transactionDate.split("-");
    const diff = (prevYear - Number(yStr)) * 12 + (prevMonth - Number(mStr));
    const inst = Math.max(1, t.installmentMonths || 1);
    if (diff >= 0 && diff < inst) {
      previousTotal += Math.round(t.netAmount / inst);
    }
  }

  return {
    totalBilledAmount,
    totalApprovedRaw,
    previousTotal,
    difference: totalBilledAmount - previousTotal,
    billedItems
  };
}

/** 가맹점명 기준 카테고리 일괄 업데이트 */
export async function updateMerchantCategory(merchantName: string, categoryName: string) {
  const db = requireDatabase();
  await db.execute(
    "UPDATE transactions SET category_name_snapshot = $1 WHERE merchant_name = $2;",
    [categoryName, merchantName]
  );
}
