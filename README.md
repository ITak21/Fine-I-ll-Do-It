# Fine-I-ll-Do-It

FIDI는 카드사에서 내려받은 엑셀 이용내역을 로컬에서 읽어와 정리하고, 가맹점별 카테고리를 매핑한 뒤 월별 소비 흐름을 확인할 수 있게 만든 개인 재무 보조 데스크톱 앱입니다.  
GitHub 레포지토리 이름은 `Fine-I-ll-Do-It`이고, 실제 앱 이름은 `FIDI (Fine, I'll Do It)`입니다.

## 프로젝트 의도

이 프로젝트는 가족들이 카드 사용 내역을 정리하고 관리하는 일을 계속 귀찮아했고, 그걸 옆에서 보면서 답답해서 직접 만들기 시작한 도구입니다.

카드 사용 내역을 다시 보려 할 때 가장 불편했던 점은 다음이었습니다.

- 카드사마다 엑셀 형식이 다릅니다.
- 월별 청구 흐름을 한 번에 보기 어렵습니다.
- 같은 가맹점인데도 직접 분류하지 않으면 소비 패턴을 읽기 어렵습니다.
- 민감한 소비 데이터를 외부 서비스에 올리고 싶지 않았습니다.

그래서 이 프로젝트는 다음 기준으로 만들었습니다.

- 카드사 엑셀을 바로 읽을 것
- 데이터는 로컬 SQLite에만 저장할 것
- 가맹점 분류를 사용자가 직접 다듬을 수 있을 것
- 월별 분석과 거래 원장을 한 앱 안에서 확인할 수 있을 것

## 현재 지원 기능

- 현대카드, 롯데카드, 신한카드, 하나카드 엑셀 가져오기
- 카드사별 헤더 탐지 후 거래 내역 파싱
- 로컬 SQLite 저장
- 가맹점별 카테고리 매핑
- 월별 청구 금액 분석
- 카드사별 원장 조회
- 다크 모드 / 한글, 영어 UI 전환

## 기술 스택

- Frontend: React + TypeScript + Vite
- Desktop: Tauri v2
- Local DB: SQLite (`@tauri-apps/plugin-sql`)
- Excel Parsing: `xlsx`

## 이런 분께 맞습니다

- 카드 사용 내역을 엑셀로 직접 관리하시는 분
- 클라우드 업로드 없이 로컬에서만 분석하고 싶은 분
- 카드사별 다른 파일 형식을 하나의 흐름으로 정리하고 싶은 분

## 빠른 사용 방법

가장 편한 사용 방식은 GitHub Releases에 업로드된 설치 파일을 내려받아 실행하는 것입니다.

- 일반 사용자: `FIDI_x64-setup.exe` 형태의 설치 파일 권장
- 관리자/배포 환경: `.msi` 설치 파일 사용 가능

아직 Releases를 만들기 전이라면 아래 방법으로 직접 실행할 수 있습니다.

## 로컬 실행 방법

### 1. 저장소 다운로드

```bash
git clone <YOUR_REPOSITORY_URL>
cd Fine-I-ll-Do-It
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 개발 모드 실행

```bash
npm run tauri dev
```

브라우저 프리뷰가 아니라 Tauri로 실행해야 파일 선택, 로컬 파일 읽기, SQLite 저장 기능이 정상 동작합니다.

## 배포 빌드 만들기

```bash
npm run tauri build
```

빌드가 끝나면 Windows 설치 파일은 보통 아래 경로에 생성됩니다.

- `.cardpattern-cargo-target/release/bundle/nsis/`
- `.cardpattern-cargo-target/release/bundle/msi/`

이 파일들을 GitHub Releases에 첨부하면 다른 사람이 바로 다운로드해서 사용할 수 있습니다.

## 사용 흐름

1. 앱 실행
2. 카드사 선택
3. 해당 카드사 엑셀 파일 선택
4. 거래 내역 가져오기
5. 가맹점 카테고리 매핑 정리
6. 월별 분석 / 거래 원장 확인

## 카드사 파서 추가 안내

현재 프로젝트는 `src/parsers` 디렉터리에서 카드사별 엑셀 파서를 관리합니다.

지원되지 않는 카드사를 사용하시는 분은 본인의 카드사 엑셀 형식에 맞는 모듈을 `src/parsers`에 추가해 주세요.

추가 작업 순서는 아래와 같습니다.

1. `src/parsers/<card-company>-parser.ts` 파일 생성
2. 엑셀 헤더를 공통 거래 구조(`ParsedTransaction`)로 변환
3. `src/parsers/index.ts`에 등록
4. `src/lib/excel-adapter.ts`의 `expectedHeaders`에 헤더 정보 추가
5. 필요하면 `src/types.ts`의 `CardCompany` 타입 확장

예를 들어 파서는 대략 아래 형태를 따릅니다.

```ts
import type { CardParser } from "../types";
import { createBaseTransaction } from "./utils";

export const sampleParser: CardParser = {
  cardCompany: "sample",
  parse(rows) {
    return {
      cardCompany: "sample",
      transactions: rows.map((row) =>
        createBaseTransaction({
          cardCompany: "sample",
          transactionDate: row["거래일"],
          merchantName: row["가맹점명"],
          approvedAmount: 0,
          canceledAmount: 0,
          netAmount: 0,
          installmentMonths: 0,
          isCanceled: false,
          rawJson: JSON.stringify(row)
        })
      )
    };
  }
};
```

카드사마다 시트 이름, 헤더 행 위치, 날짜 포맷, 취소 표기 방식이 달라서 파서 기여가 프로젝트 완성도를 크게 올려 줍니다.

## 저장 방식과 개인정보

- 거래 데이터는 로컬 SQLite에 저장됩니다.
- 외부 서버로 업로드하는 기능은 없습니다.
- 공개 저장소에 실제 카드 엑셀 파일이나 DB 파일은 올리지 않는 것을 권장합니다.

## 앞으로 보완하고 싶은 점

- 카드사 파서 추가를 더 쉽게 만드는 템플릿화
- 샘플 엑셀 기반 파서 테스트 자동화
- 카테고리 규칙 내보내기/가져오기
- 분석 화면의 필터링과 리포트 강화

## 회고

이 프로젝트를 만들면서 가장 크게 느낀 점은 “재무 데이터 정리는 계산보다 입력 정규화가 더 어렵다”는 것이었습니다.  
같은 엑셀 파일처럼 보여도 카드사마다 헤더, 날짜, 취소 표기, 할부 표현이 전부 달라서, 결국 핵심은 UI보다 파서 설계와 공통 거래 모델을 안정적으로 잡는 일이었습니다.

또 하나는 개인 재무 도구일수록 로컬 우선 설계가 중요하다는 점이었습니다.  
사용자 입장에서는 예쁜 대시보드보다도 “내 파일이 밖으로 나가지 않는다”는 신뢰가 더 중요하다고 생각했고, 그래서 Tauri + SQLite 조합이 이 프로젝트의 방향과 잘 맞았습니다.

아직 완성형이라기보다는 계속 확장해 나갈 수 있는 기반에 가깝습니다.  
특히 카드사별 파서 기여가 쌓일수록 더 많은 사람이 바로 쓸 수 있는 도구가 될 것 같습니다.

## 라이선스

라이선스는 아직 지정하지 않았습니다. 공개 저장소로 운영할 예정이라면 `MIT` 같은 명시적인 라이선스를 추가하는 것을 권장합니다.
