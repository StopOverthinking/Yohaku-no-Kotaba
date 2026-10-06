# Yohaku no Kotaba Wiki

이 위키는 LLM과 사람이 코드를 직접 열기 전에 먼저 읽는 설계 계약서다.

## 먼저 읽기

1. `docs/wiki/llm-workflow.md`
2. `docs/wiki/current-state.md`
3. 작업 대상 기능 문서

앱 전체 구조가 필요하면 `product-overview.md`, `architecture.md`를 이어서 읽는다. 저장 변경은 `storage-and-share.md`, 검증 변경은 `testing-rules.md`도 함께 확인한다.

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
- `docs/wiki/current-state.md`: 현재 제공 기능·콘텐츠·저장·게시 계약과 우선순위
- [2026-10-06 이전 상태 원문](current-state-history-2026-10-06.md): 분리 전 구현·검증·승인 이력. 현재 계약은 `current-state.md`를 따른다.

## 기능 문서

- `docs/wiki/features/app-shell.md`
- `docs/wiki/features/vocab-data.md`
- `docs/wiki/features/list-mode.md`
- `docs/wiki/features/learn-mode.md`
- `docs/wiki/features/share-panel.md`
- `docs/wiki/features/preferences-and-debug.md`

## 템플릿

- `docs/wiki/templates/feature-template.md`

## 개발 계획

- [유지보수·개발 효율 최적화 계획](../plans/maintenance-efficiency.md): 에디터 제거·정책 분리 이력, 2026-10-06 검증 명령·실행 환경·위키 탐색 정리와 남은 제안. 구현과 검증 상태를 구분하며 현재 기능 계약을 대체하지 않는다.

## 읽기 규칙

- 문서가 있으면 문서를 먼저 믿고, 코드로 확인이 필요할 때만 내려간다.
- 문서와 코드가 다르면 작업 후 둘을 다시 일치시킨다.
- 설계가 불분명하면 새 문서를 덧붙이기보다 기존 문서의 빈칸을 메운다.
