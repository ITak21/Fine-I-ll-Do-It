import type { CardCompanyMapping, DashboardStat, ImportStage } from "../types";

export const dashboardStats: DashboardStat[] = [
  { label: "기본 저장소", value: "SQLite", tone: "accent" },
  { label: "지원 카드사", value: "4개" },
  { label: "월별 비교", value: "준비됨" },
  { label: "엑셀 내보내기", value: "설계 필요" }
];

export const importStages: ImportStage[] = [
  {
    title: "파일 선택",
    description: "카드사 엑셀 파일을 선택하고 파일 형식을 확인합니다."
  },
  {
    title: "헤더 탐지",
    description: "카드사별 실제 거래 시트와 헤더 행을 찾아 공통 거래 구조로 읽습니다."
  },
  {
    title: "SQLite 저장",
    description: "가져온 거래 내역과 가져오기 이력을 로컬 SQLite에 저장합니다."
  },
  {
    title: "검증 화면 반영",
    description: "최근 거래 목록과 건수, 금액, 취소 건수를 바로 확인합니다."
  }
];

export const developmentTasks = [
  {
    title: "거래 조회 화면",
    description: "최근 가져온 거래 목록과 검증용 합계를 UI에서 직접 확인할 수 있게 연결합니다."
  },
  {
    title: "카테고리 규칙 적용",
    description: "가맹점명과 이용구분 기준으로 카테고리를 자동 분류하는 규칙 저장 기능을 구현합니다."
  },
  {
    title: "월별 분석 연결",
    description: "월별 합계, 전월 비교, 카테고리 집계를 조회 화면과 연결합니다."
  }
];

export const importActionHints = [
  "Tauri 실행 상태에서는 실제 파일 선택 창으로 엑셀 파일을 가져옵니다.",
  "가져오기 직후 최근 거래 목록과 파싱 건수, 순사용 금액을 함께 확인하세요.",
  "건수나 금액이 엑셀과 다르면 카드사 이름과 틀린 값만 알려주면 됩니다."
];

export const cardMappings: CardCompanyMapping[] = [
  {
    key: "hyundai",
    label: "현대카드",
    fields: [
      { source: "승인일", target: "transaction_date" },
      { source: "승인시각", target: "transaction_time" },
      { source: "가맹점명", target: "merchant_name" },
      { source: "승인금액", target: "approved_amount" },
      { source: "이용구분", target: "usage_type" },
      { source: "할부개월", target: "installment_months" },
      { source: "승인구분", target: "approval_status" }
    ]
  },
  {
    key: "lotte",
    label: "롯데카드",
    fields: [
      { source: "이용일자", target: "transaction_date" },
      { source: "이용시간", target: "transaction_time" },
      { source: "이용가맹점", target: "merchant_name" },
      { source: "이용금액", target: "approved_amount" },
      { source: "이용구분", target: "usage_type" },
      { source: "할부개월", target: "installment_months" },
      { source: "취소여부", target: "is_canceled" }
    ]
  },
  {
    key: "shinhan",
    label: "신한카드",
    fields: [
      { source: "거래일", target: "transaction_date" },
      { source: "가맹점명", target: "merchant_name" },
      { source: "금액", target: "approved_amount" },
      { source: "이용구분", target: "usage_type", note: "예: 할부(2개월)에서 개월 수 파싱" },
      { source: "취소상태", target: "is_canceled/status" }
    ]
  },
  {
    key: "hana",
    label: "하나카드",
    fields: [
      { source: "이용일", target: "transaction_date" },
      { source: "이용시간", target: "transaction_time" },
      { source: "가맹점명", target: "merchant_name" },
      { source: "승인금액", target: "approved_amount" },
      { source: "이용구분", target: "usage_type" },
      { source: "할부기간", target: "installment_months", note: "이용구분의 할부 여부와 함께 사용" },
      { source: "상태", target: "status" }
    ]
  }
];
