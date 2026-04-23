# LLM Workflow

이 문서는 Codex가 이 저장소에서 따라야 하는 기본 절차다.

## 필수 순서

1. 코드를 검색하거나 열기 전에 `docs/wiki/INDEX.md`를 읽는다.
2. 작업 대상과 맞는 기능 문서를 읽는다.
3. 그래도 답이 없을 때만 코드를 확인한다.
4. 구현이 끝나면 바뀐 설계를 위키에 반영한다.

## 코드 보기 전 체크

- 이 작업이 어느 기능에 속하는가
- 저장 구조가 바뀌는가
- UI 원칙을 건드리는가
- 테스트 기준이 달라지는가
- 미완 기능인 `탭 매치 러시`와 섞이지 않는가

## 기능 문서 선택 가이드

- 홈, 라우팅, 전역 레이아웃: `features/app-shell.md`
- 단어장과 데이터 모델: `features/vocab-data.md`
- 목록: `features/list-mode.md`
- 일반 학습: `features/learn-mode.md`
- 스마트 복습: `features/smart-review.md`
- 활용형: `features/conjugation.md`
- 시험: `features/exam-mode.md`
- 게임: `features/game-mode.md`
- 공유: `features/share-panel.md`
- 에디터: `features/editor.md`
- 설정, 디버그: `features/preferences-and-debug.md`

## 위키를 먼저 보는 이유

- 이 프로젝트는 UI 설명 문구가 적고 아이콘 중심이라 의도 파악이 어렵다.
- 저장 방식이 기능마다 다르다.
- 최근 세션에서 바뀐 판단 기준이 코드 여러 곳에 흩어져 있다.
- 미완 기능과 완료 기능을 분리해서 봐야 한다.

## 위키와 코드가 다를 때

1. 실제 동작과 테스트를 기준으로 현재 사실을 확인한다.
2. 구현을 수정할지 문서를 수정할지 결정한다.
3. 최종 상태에 맞게 둘 다 정리한다.
4. 변경 이유가 크면 `docs/wiki/current-state.md`에도 남긴다.

## 구현 후 반드시 갱신할 문서

- 라우트 추가/삭제: `architecture.md`, `features/app-shell.md`
- 저장 키/DB 변경: `storage-and-share.md`, 대상 기능 문서
- UI 원칙 변경: `design-rules.md`
- 세션 흐름 변경: 대상 기능 문서
- 우선순위 변경: `current-state.md`

## 금지

- 위키를 읽지 않고 바로 전역 검색부터 시작하기
- `탭 매치 러시` 코드를 기준으로 공통 설계를 추론하기
- 스마트 복습을 다시 `localStorage` 중심으로 되돌리는 설계
- 에디터를 모바일 기준으로 재구성하는 설계
