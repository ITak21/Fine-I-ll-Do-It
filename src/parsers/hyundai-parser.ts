import type { CardParser } from "../types";
import {
  combineDateTime,
  createBaseTransaction,
  isValidTransactionDate,
  normalizeDate,
  normalizeTime,
  parseInstallmentMonths,
  sanitizeAmount
} from "./utils";

export const hyundaiParser: CardParser = {
  cardCompany: "hyundai",
  parse(rows) {
    const transactions = rows
      .filter((row) => isValidTransactionDate(row["승인일"]))
      .map((row) => {
        const transactionDate = normalizeDate(row["승인일"]);
        const transactionTime = normalizeTime(row["승인시각"]);
        const approvedAmount = sanitizeAmount(row["승인금액"]);

        return createBaseTransaction({
          cardCompany: "hyundai",
          transactionDate,
          transactionTime,
          transactionDatetime: combineDateTime(transactionDate, transactionTime),
          merchantName: row["가맹점명"]?.trim() ?? "",
          usageType: row["이용구분"]?.trim() ?? null,
          installmentMonths: parseInstallmentMonths(row["할부개월"]),
          approvedAmount,
          canceledAmount: 0,
          netAmount: approvedAmount,
          approvalStatus: row["승인구분"]?.trim() ?? null,
          rawJson: JSON.stringify(row)
        });
      });

    return {
      cardCompany: "hyundai",
      transactions
    };
  }
};
