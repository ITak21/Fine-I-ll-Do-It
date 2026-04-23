import Database from "@tauri-apps/plugin-sql";
import type { DatabaseBootState } from "../types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file_name TEXT NOT NULL,
    card_company TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    memo TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS category_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    priority INTEGER NOT NULL DEFAULT 0,
    match_field TEXT NOT NULL,
    match_type TEXT NOT NULL,
    match_value TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    card_company TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    transaction_time TEXT,
    transaction_datetime TEXT,
    merchant_name TEXT NOT NULL,
    usage_type TEXT,
    installment_months INTEGER NOT NULL DEFAULT 0,
    approved_amount INTEGER NOT NULL DEFAULT 0,
    canceled_amount INTEGER NOT NULL DEFAULT 0,
    net_amount INTEGER NOT NULL DEFAULT 0,
    is_canceled INTEGER NOT NULL DEFAULT 0,
    cancel_date TEXT,
    status TEXT,
    approval_status TEXT,
    category_id INTEGER,
    category_name_snapshot TEXT,
    memo TEXT,
    raw_json TEXT,
    FOREIGN KEY (import_id) REFERENCES imports(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );`,
  `CREATE TABLE IF NOT EXISTS monthly_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_month TEXT NOT NULL,
    card_company TEXT,
    category_name TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );`,
  "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);",
  "CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON transactions(card_company, transaction_date);",
  "CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, transaction_date);",
  "CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_name);",
  "CREATE INDEX IF NOT EXISTS idx_category_rules_priority ON category_rules(priority, is_active);"
];

const seedStatements = [
  `INSERT OR IGNORE INTO categories (name, color, sort_order, is_active)
   VALUES
   ('식비', '#b9502f', 1, 1),
   ('교통', '#2c6e62', 2, 1),
   ('생활', '#d29b2d', 3, 1),
   ('통신', '#5b6ee1', 4, 1),
   ('보험', '#7d4fa3', 5, 1);`
];

export type DatabaseBootResult = {
  state: DatabaseBootState;
  message: string;
};

let dbInstance: Database | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatDatabaseError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "SQLite 초기화 중 알 수 없는 오류가 발생했습니다.";
  }
}

export async function initializeDatabase(): Promise<DatabaseBootResult> {
  if (!isTauriRuntime()) {
    return {
      state: "browser-preview",
      message: "현재는 브라우저 미리보기 상태입니다. Rust 설치 후 Tauri로 실행하면 SQLite가 초기화됩니다."
    };
  }

  try {
    const db = await Database.load("sqlite:cardpattern.db");

    for (const statement of schemaStatements) {
      await db.execute(statement);
    }

    for (const statement of seedStatements) {
      await db.execute(statement);
    }

    dbInstance = db;

    return {
      state: "ready",
      message: "SQLite 초기화가 완료되었습니다. 이제 가져오기와 분석 로직을 연결할 수 있습니다."
    };
  } catch (error) {
    return {
      state: "error",
      message: formatDatabaseError(error)
    };
  }
}

export function getDatabase() {
  return dbInstance;
}

export function requireDatabase() {
  if (!dbInstance) {
    throw new Error("SQLite가 아직 초기화되지 않았습니다.");
  }

  return dbInstance;
}

export async function resetDatabase() {
  const db = requireDatabase();
  await db.execute("DELETE FROM transactions;");
  await db.execute("DELETE FROM category_rules;");
  await db.execute("DELETE FROM imports;");
  await db.execute("DELETE FROM monthly_summaries;");
  await db.execute("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'category_rules', 'imports', 'monthly_summaries');");
}

