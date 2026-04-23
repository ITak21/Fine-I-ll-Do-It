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

export const lotteParser: CardParser = {
  cardCompany: "lotte",
  parse(rows) {
    const transactions = rows
      .filter((row) => isValidTransactionDate(row["이용일자"]))
      .map((row) => {
        const transactionDate = normalizeDate(row["이용일자"]);
        const transactionTime = normalizeTime(row["이용시간"]);
        const approvedAmount = Math.abs(sanitizeAmount(row["이용금액"]));
        const canceledAmountRaw = sanitizeAmount(row["취소금액"]);
        const isCanceled = normalizeCancellationFlag(row["취소여부"]);
        const canceledAmount = isCanceled ? (canceledAmountRaw !== 0 ? canceledAmountRaw : -approvedAmount) : 0;
        const netAmount = isCanceled ? canceledAmount : approvedAmount;

        return createBaseTransaction({
          cardCompany: "lotte",
          transactionDate,
          transactionTime,
          transactionDatetime: combineDateTime(transactionDate, transactionTime),
          merchantName: row["이용가맹점"]?.trim() ?? "",
          usageType: row["이용구분"]?.trim() ?? null,
          installmentMonths: parseInstallmentMonths(row["할부개월"]),
          approvedAmount,
          canceledAmount,
          netAmount,
          isCanceled,
          cancelDate: normalizeDate(row["취소일자"]) || null,
          status: row["매입여부"]?.trim() ?? null,
          rawJson: JSON.stringify(row)
        });
      });

    return {
      cardCompany: "lotte",
      transactions
    };
  }
};
