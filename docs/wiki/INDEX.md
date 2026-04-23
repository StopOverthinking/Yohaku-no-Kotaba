# Yohaku no Kotaba Wiki

이 위키는 LLM과 사람이 코드를 직접 열기 전에 먼저 읽는 설계 계약서다.

## 먼저 읽기

1. `docs/wiki/llm-workflow.md`
2. `docs/wiki/product-overview.md`
3. `docs/wiki/architecture.md`
4. 작업 대상 기능 문서

## 범위

- 이 위키는 현재 안정된 기능만 다룬다.
- `탭 매치 러시`는 미완이므로 의도적으로 제외한다.
- 코드에 관련 파일이 있더라도 설계 기준으로 사용하지 않는다.

## 빠른 진입

### 앱 전체를 이해할 때

- `docs/wiki/product-overview.md`
- `docs/wiki/architecture.md`
- `docs/wiki/design-rules.md`
- `docs/wiki/storage-and-share.md`

### UI를 바꿀 때

- `docs/wiki/design-rules.md`
- `docs/wiki/features/app-shell.md`
- 대상 기능 문서
- `docs/wiki/current-state.md`

### 저장 구조를 바꿀 때

- `docs/wiki/storage-and-share.md`
- 대상 기능 문서
- `docs/wiki/change-checklist.md`

### 테스트를 추가하거나 고칠 때

- `docs/wiki/testing-rules.md`
- 대상 기능 문서

## 문서 목록

- `docs/wiki/llm-workflow.md`: Codex 작업 순서와 위키 우선 규칙
- `docs/wiki/product-overview.md`: 제품 목적, 진입점, 사용자 흐름
- `docs/wiki/architecture.md`: 앱 셸, 라우터, 상태, 데이터 흐름
- `docs/wiki/design-rules.md`: 미니멀 UI, 모션, 금지 패턴
- `docs/wiki/storage-and-share.md`: `localStorage`, `IndexedDB`, 공유 정책
- `docs/wiki/testing-rules.md`: 테스트 우선순위와 검증 규칙
- `docs/wiki/change-checklist.md`: 변경 유형별 위키 갱신 체크리스트
- `docs/wiki/current-state.md`: 최근 반영 사항과 현재 우선순위

## 기능 문서

- `docs/wiki/features/app-shell.md`
- `docs/wiki/features/vocab-data.md`
- `docs/wiki/features/list-mode.md`
- `docs/wiki/features/learn-mode.md`
- `docs/wiki/features/smart-review.md`
- `docs/wiki/features/conjugation.md`
- `docs/wiki/features/exam-mode.md`
- `docs/wiki/features/game-mode.md`
- `docs/wiki/features/share-panel.md`
- `docs/wiki/features/editor.md`
- `docs/wiki/features/preferences-and-debug.md`

## 템플릿

- `docs/wiki/templates/feature-template.md`

## 읽기 규칙

- 문서가 있으면 문서를 먼저 믿고, 코드로 확인이 필요할 때만 내려간다.
- 문서와 코드가 다르면 작업 후 둘을 다시 일치시킨다.
- 설계가 불분명하면 새 문서를 덧붙이기보다 기존 문서의 빈칸을 메운다.
