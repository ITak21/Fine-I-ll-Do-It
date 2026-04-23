import type { CardParser } from "../types";
import {
  combineDateTime,
  createBaseTransaction,
  isValidTransactionDate,
  normalizeCancellationFlag,
  normalizeDate,
  normalizeTime,
  parseInstallmentMonths,
  sanitizeAmount
} from "./utils";

export const hanaParser: CardParser = {
  cardCompany: "hana",
  parse(rows) {
    const transactions = rows
      .filter((row) => isValidTransactionDate(row["이용일"]) && Boolean(row["가맹점명"]?.trim()))
      .map((row) => {
        const transactionDate = normalizeDate(row["이용일"]);
        const transactionTime = normalizeTime(row["이용시간"]);
        const approvedAmount = Math.abs(sanitizeAmount(row["승인금액"]));
        const status = row["상태"]?.trim() ?? null;
        const isCanceled = normalizeCancellationFlag(status ?? undefined);
        const canceledAmount = isCanceled ? -approvedAmount : 0;
        const netAmount = isCanceled ? canceledAmount : approvedAmount;

        return createBaseTransaction({
          cardCompany: "hana",
          transactionDate,
          transactionTime,
          transactionDatetime: combineDateTime(transactionDate, transactionTime),
          merchantName: row["가맹점명"]?.trim() ?? "",
          usageType: row["이용구분"]?.trim() ?? null,
          installmentMonths: parseInstallmentMonths(row["할부기간"]),
          approvedAmount,
          canceledAmount,
          netAmount,
          isCanceled,
          status,
          rawJson: JSON.stringify(row)
        });
      });

    return {
      cardCompany: "hana",
      transactions
    };
  }
};
