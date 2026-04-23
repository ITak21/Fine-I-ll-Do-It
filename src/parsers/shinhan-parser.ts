import type { CardParser } from "../types";
import {
  combineDateTime,
  createBaseTransaction,
  isValidTransactionDate,
  normalizeCancellationFlag,
  parseInstallmentMonths,
  sanitizeAmount,
  splitDateTime
} from "./utils";

export const shinhanParser: CardParser = {
  cardCompany: "shinhan",
  parse(rows) {
    const transactions = rows.flatMap((row) => {
      const merchantName = row["\uac00\ub9f9\uc810\uba85"]?.trim() ?? "";
      const rawDate = row["\uac70\ub798\uc77c"]?.trim() ?? "";

      if (!isValidTransactionDate(rawDate) || /^\ucd1d\s*\d+\s*\uac74$/.test(merchantName.replace(/\s+/g, " "))) {
        return [];
      }

      const usageType = row["\uc774\uc6a9\uad6c\ubd84"]?.trim() ?? "";
      const amount = sanitizeAmount(row["\uae08\uc561"]);
      const status = row["\ucde8\uc18c\uc0c1\ud0dc"]?.trim() ?? null;
      const isCanceled = normalizeCancellationFlag(status ?? undefined) || amount < 0;
      const { transactionDate, transactionTime } = splitDateTime(rawDate);
      const approvedAmount = Math.abs(amount);
      const canceledAmount = isCanceled ? amount : 0;
      const netAmount = isCanceled ? amount : approvedAmount;

      return [
        createBaseTransaction({
          cardCompany: "shinhan",
          transactionDate,
          transactionTime,
          transactionDatetime: combineDateTime(transactionDate, transactionTime),
          merchantName,
          usageType,
          installmentMonths: parseInstallmentMonths(usageType),
          approvedAmount,
          canceledAmount,
          netAmount,
          isCanceled,
          status,
          rawJson: JSON.stringify(row)
        })
      ];
    });

    return {
      cardCompany: "shinhan",
      transactions
    };
  }
};
