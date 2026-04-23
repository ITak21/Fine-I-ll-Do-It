import type { CardCompany, CardParser } from "../types";
import { hanaParser } from "./hana-parser";
import { hyundaiParser } from "./hyundai-parser";
import { lotteParser } from "./lotte-parser";
import { shinhanParser } from "./shinhan-parser";

const parserMap: Record<CardCompany, CardParser> = {
  hyundai: hyundaiParser,
  lotte: lotteParser,
  shinhan: shinhanParser,
  hana: hanaParser
};

export function getParser(cardCompany: CardCompany) {
  return parserMap[cardCompany];
}

export function listSupportedParsers() {
  return Object.values(parserMap);
}
