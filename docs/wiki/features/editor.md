# Editor

## 목적

단어장 원본 데이터를 데스크톱 표 편집 방식으로 관리하는 별도 앱이다.

## 진입점

- 라우트: `/editor`
- 셸: `src/features/editor/EditorScreen.tsx`
- 본문: `src/features/editor/WordbookEditorPage.tsx`

## 전제

- 모바일 비대응
- 넓은 고정형 레이아웃 우선
- 선택 상태와 주요 조작은 표에서 바로 보여야 함

## 편집 모드

- `basic`
- `theme`
- `compare`

각 모드는 좌측 세트 목록과 중앙 표 편집 화면을 공유하되, 행 구조가 다르다.

## 편집 대상

- 기본 세트와 단어
- 주제형 세트, 토픽, 단어
- 비교형 세트, 쌍, 설명

## 핵심 상호작용

- 세트 추가/삭제/정렬
- 단어 추가/복제/삭제/정렬
- 주제 토픽 추가/삭제
- 비교형 쌍 추가/삭제
- 셀 직접 편집
- 검색
- xlsx 양식 다운로드/업로드
- 워크스페이스 디렉터리 저장

## 내부 구조

- 초기 snapshot은 `editorData.ts`에서 로드
- 수정은 `snapshot` state에 누적
- validation issue가 하단 패널에 표시
- 저장 상태는 `idle | saving | saved | error`

## 파일 관련 역할

- `editorSerializer.ts`: 정규화, 검증, 빈 엔트리 생성, 출력 파일 생성
- `editorSpreadsheet.ts`: xlsx import/export
- `editorPersistence.ts`: 디렉터리 핸들, 권한, 파일 쓰기

## UI 규칙

- 상세 패널보다 표 직접 편집 우선
- 표 열은 짧은 라벨 사용
- 선택된 세트/행은 즉시 드러나야 함
- 설명 문구보다 구조와 위치로 의미 전달

## 수정 시 주의점

- 에디터 데이터 구조를 바꾸면 런타임 데이터 생성 경로도 확인
- 워크스페이스 저장은 브라우저 권한 API와 연결돼 있어 수동 확인 필요
