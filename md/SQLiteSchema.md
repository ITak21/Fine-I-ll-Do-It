# SQLite Schema Draft

## 목적

로컬 데스크톱 앱에서 카드 사용 내역을 저장하고, 월별 분석과 전월 비교, 엑셀 내보내기를 지원하기 위한 SQLite 구조다.

## 테이블 구성

### 1. imports

엑셀 파일 가져오기 이력을 저장한다.

- `id` INTEGER PRIMARY KEY
- `source_file_name` TEXT NOT NULL
- `card_company` TEXT NOT NULL
- `imported_at` TEXT NOT NULL
- `row_count` INTEGER NOT NULL DEFAULT 0
- `memo` TEXT

### 2. transactions

모든 카드사 거래 내역을 공통 모델로 저장하는 핵심 테이블이다.

- `id` INTEGER PRIMARY KEY
- `import_id` INTEGER NOT NULL
- `card_company` TEXT NOT NULL
- `transaction_date` TEXT NOT NULL
- `transaction_time` TEXT
- `transaction_datetime` TEXT
- `merchant_name` TEXT NOT NULL
- `usage_type` TEXT
- `installment_months` INTEGER NOT NULL DEFAULT 0
- `approved_amount` INTEGER NOT NULL DEFAULT 0
- `canceled_amount` INTEGER NOT NULL DEFAULT 0
- `net_amount` INTEGER NOT NULL DEFAULT 0
- `is_canceled` INTEGER NOT NULL DEFAULT 0
- `cancel_date` TEXT
- `status` TEXT
- `approval_status` TEXT
- `category_id` INTEGER
- `category_name_snapshot` TEXT
- `memo` TEXT
- `raw_json` TEXT

### 3. categories

사용자 분류 카테고리 목록이다.

- `id` INTEGER PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `color` TEXT
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `is_active` INTEGER NOT NULL DEFAULT 1

### 4. category_rules

가맹점명이나 이용구분을 기준으로 자동 분류할 규칙이다.

- `id` INTEGER PRIMARY KEY
- `priority` INTEGER NOT NULL DEFAULT 0
- `match_field` TEXT NOT NULL
- `match_type` TEXT NOT NULL
- `match_value` TEXT NOT NULL
- `category_id` INTEGER NOT NULL
- `is_active` INTEGER NOT NULL DEFAULT 1

### 5. monthly_summaries

필수는 아니지만 성능 최적화가 필요할 때 사용하는 캐시 테이블이다.

- `id` INTEGER PRIMARY KEY
- `year_month` TEXT NOT NULL
- `card_company` TEXT
- `category_name` TEXT
- `total_amount` INTEGER NOT NULL DEFAULT 0
- `transaction_count` INTEGER NOT NULL DEFAULT 0
- `updated_at` TEXT NOT NULL

## 카드사별 매핑 기준

### 현대카드

- 승인일 -> `transaction_date`
- 승인시각 -> `transaction_time`
- 가맹점명 -> `merchant_name`
- 승인금액 -> `approved_amount`
- 이용구분 -> `usage_type`
- 할부개월 -> `installment_months`
- 승인구분 -> `approval_status`

### 롯데카드

- 이용일자 -> `transaction_date`
- 이용시 -> `transaction_time`
- 이용가맹 -> `merchant_name`
- 이용금액 -> `approved_amount`
- 이용구분 -> `usage_type`
- 할부개월 -> `installment_months`
- 취소여부 -> `is_canceled`

### 신한카드

- 거래일 -> `transaction_date`
- 가맹점명 -> `merchant_name`
- 금액 -> `approved_amount`
- 이용구분 -> `usage_type`
- 이용구분이 `할부(2개월)` 형태면 괄호 안 숫자를 파싱해서 `installment_months`에 저장
- 취소 상태 -> `is_canceled` 또는 `status`

### 하나카드

- 이용일 -> `transaction_date`
- 이용시간 -> `transaction_time`
- 가맹점명 -> `merchant_name`
- 승인금액 -> `approved_amount`
- 이용구분 -> `usage_type`
- 할부기간 -> `installment_months`
- 상태 -> `status`

## 계산 규칙

1. `transaction_datetime`은 날짜와 시간이 둘 다 있을 때만 생성한다.
2. `net_amount`는 기본적으로 `approved_amount - canceled_amount`로 저장한다.
3. 취소 거래만 표시되는 카드사는 `is_canceled = 1`로 저장한다.
4. 취소금액이 없으면 `canceled_amount = 0`으로 저장한다.
5. 할부 정보가 없으면 `installment_months = 0`으로 저장한다.
6. 신한카드는 `usage_type`에서 `할부(n개월)` 패턴을 파싱해 `installment_months`를 채운다.
7. 하나카드는 `할부기간` 컬럼 숫자를 우선 사용해 `installment_months`를 채운다.

## 추천 인덱스

1. `CREATE INDEX idx_transactions_date ON transactions(transaction_date);`
2. `CREATE INDEX idx_transactions_company_date ON transactions(card_company, transaction_date);`
3. `CREATE INDEX idx_transactions_category_date ON transactions(category_id, transaction_date);`
4. `CREATE INDEX idx_transactions_merchant ON transactions(merchant_name);`
5. `CREATE INDEX idx_category_rules_priority ON category_rules(priority, is_active);`
