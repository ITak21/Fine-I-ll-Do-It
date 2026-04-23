import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";
import type { CardCompany } from "../types";

type RawRow = Record<string, string>;

type SheetCandidate = {
  sheetName: string;
  headerRowIndex: number;
  score: number;
};

const expectedHeaders: Record<CardCompany, string[]> = {
  hyundai: ["승인일", "승인시각", "가맹점명", "승인금액", "이용구분"],
  lotte: ["이용일자", "이용시간", "이용가맹점", "이용금액", "취소여부"],
  shinhan: ["거래일", "가맹점명", "금액", "이용구분"],
  hana: ["이용일", "이용시간", "가맹점명", "승인금액", "상태"]
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export async function pickExcelFile() {
  if (!isTauriRuntime()) {
    return null;
  }

  const selected = await open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Excel",
        extensions: ["xls", "xlsx"]
      }
    ]
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  return selected;
}

export async function readExcelRows(cardCompany: CardCompany, filePath?: string | null) {
  if (!filePath) {
    return getMockRows(cardCompany);
  }

  const bytes = await readFile(filePath);
  const workbook = XLSX.read(bytes, { type: "array" });
  const candidate = findBestSheetCandidate(workbook, cardCompany);

  if (!candidate) {
    throw new Error("엑셀 파일에서 거래 헤더를 찾지 못했습니다.");
  }

  const worksheet = workbook.Sheets[candidate.sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: candidate.headerRowIndex,
    defval: "",
    raw: false
  });

  const normalizedRows = rows
    .map((row) => normalizeRow(row))
    .filter((row) => Object.values(row).some((value) => value.length > 0));

  if (normalizedRows.length === 0) {
    throw new Error("엑셀 파일에서 읽을 거래 행을 찾지 못했습니다.");
  }

  return normalizedRows;
}

function findBestSheetCandidate(workbook: XLSX.WorkBook, cardCompany: CardCompany) {
  const headers = expectedHeaders[cardCompany].map(normalizeHeader);
  let bestCandidate: SheetCandidate | null = null;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false
    });

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const values = new Set(
        rows[rowIndex]
          .map((value) => normalizeHeader(value))
          .filter((value) => value.length > 0)
      );

      if (values.size === 0) {
        continue;
      }

      const score = headers.filter((header) => values.has(header)).length;

      if (score === 0) {
        continue;
      }

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          sheetName,
          headerRowIndex: rowIndex,
          score
        };
      }
    }
  }

  if (!bestCandidate) {
    return null;
  }

  const minimumScore = Math.min(3, headers.length);
  return bestCandidate.score >= minimumScore ? bestCandidate : null;
}

function normalizeRow(row: Record<string, unknown>): RawRow {
  const normalized: RawRow = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.replace(/\uFEFF/g, "").replace(/\s+/g, " ").trim();
    const compactKey = normalizeHeader(key);
    const normalizedValue = value == null ? "" : String(value).trim();

    normalized[normalizedKey] = normalizedValue;

    if (compactKey && compactKey !== normalizedKey) {
      normalized[compactKey] = normalizedValue;
    }
  }

  return normalized;
}

function getMockRows(cardCompany: CardCompany): RawRow[] {
  switch (cardCompany) {
    case "hyundai":
      return [
        {
          승인일: "2026년 03월 10일",
          승인시각: "08:58",
          가맹점명: "메리츠화재",
          승인금액: "69,420",
          이용구분: "일시불",
          할부개월: "0",
          승인구분: "승인"
        }
      ];
    case "lotte":
      return [
        {
          이용일자: "2026.03.10",
          이용시간: "00:45",
          이용가맹점: "CJ 올리브영_국내",
          이용금액: "59,760",
          이용구분: "할부",
          할부개월: "2 개월",
          취소여부: "N"
        }
      ];
    case "shinhan":
      return [
        {
          거래일: "2026.03.07 08:27",
          가맹점명: "주식회사 컬리페이",
          금액: "1,900",
          이용구분: "일시불",
          취소상태: ""
        }
      ];
    case "hana":
      return [
        {
          이용일: "2026.03.10",
          이용시간: "13:46:38",
          가맹점명: "인천중구청",
          승인금액: "8,000",
          이용구분: "일시불",
          할부기간: "-",
          상태: "정상"
        }
      ];
  }
}
