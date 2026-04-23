import { getParser } from "../parsers";
import type { CardCompany, ImportExecutionResult, ImportRecord } from "../types";
import { readExcelRows } from "./excel-adapter";
import { saveImportedTransactions } from "./transaction-repository";

function createImportRecord(fileName: string, cardCompany: CardCompany): ImportRecord {
  return {
    sourceFileName: fileName,
    cardCompany,
    importedAt: new Date().toISOString(),
    rowCount: 0,
    memo: null
  };
}

export async function executeImport(cardCompany: CardCompany, filePath?: string | null): Promise<ImportExecutionResult> {
  const sourceFileName = filePath ? filePath.split(/[/\\]/).pop() ?? filePath : `${cardCompany}-mock.xls`;

  try {
    const rows = await readExcelRows(cardCompany, filePath);
    const parser = getParser(cardCompany);
    const parsed = parser.parse(rows, { fileName: sourceFileName });

    try {
      const saveResult = await saveImportedTransactions(createImportRecord(sourceFileName, cardCompany), parsed.transactions);
      const savedCount = saveResult.insertedCount;
      const skippedCount = saveResult.skippedCount;
      const message = savedCount === 0
        ? `\uCD1D ${parsed.transactions.length}\uAC74\uC744 \uD30C\uC2F1\uD588\uACE0, \uC2B9\uC778\uC2DC\uAC01 \uAE30\uC900 \uC911\uBCF5 ${skippedCount}\uAC74\uC740 \uAC74\uB108\uB6F0\uC5B4 \uC0C8\uB85C \uC800\uC7A5\uB41C \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`
        : skippedCount > 0
          ? `\uCD1D ${parsed.transactions.length}\uAC74\uC744 \uD30C\uC2F1\uD588\uACE0, ${savedCount}\uAC74\uC744 \uC0C8\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4. \uC911\uBCF5 ${skippedCount}\uAC74\uC740 \uAC74\uB108\uB6F0\uC5C8\uC2B5\uB2C8\uB2E4.`
          : `${savedCount}\uAC74\uC744 SQLite\uC5D0 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.`;

      return {
        state: "completed",
        message,
        importId: saveResult.importId ?? undefined,
        parsedCount: parsed.transactions.length,
        savedCount,
        skippedCount,
        sourceFileName,
        transactions: saveResult.insertedTransactions
      };
    } catch (storageError) {
      return {
        state: "error",
        message:
          storageError instanceof Error
            ? `\uD30C\uC2F1\uC740 \uC644\uB8CC\uB410\uC9C0\uB9CC SQLite \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: ${storageError.message}`
            : "\uD30C\uC2F1\uC740 \uC644\uB8CC\uB410\uC9C0\uB9CC SQLite \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
        parsedCount: parsed.transactions.length,
        sourceFileName,
        transactions: parsed.transactions
      };
    }
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "\uAC00\uC838\uC624\uAE30 \uC911 \uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      sourceFileName
    };
  }
}
