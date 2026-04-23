# Parser Notes

이 디렉토리는 카드사별 엑셀 파서를 둔다.

현재 단계에서는 실제 엑셀 바이너리 파싱이 아니라, 헤더 기준으로 정규화된 `Record<string, string>` 행 배열을 입력받는 파서 골격만 구현했다.

다음 단계:

1. 파일 선택 후 카드사 식별
2. 엑셀 파일을 행 데이터로 변환
3. 각 카드사 파서에 전달
4. `saveImportedTransactions()`로 SQLite 저장
