# Storage And Share

## 저장 철학

기능별로 필요한 최소한만 저장한다. 학습 세션과 결과는 각 기능의 수명주기를 벗어나 오래 끌고 가지 않는다.

## 저장소 요약

| 영역 | 저장 위치 | 비고 |
| --- | --- | --- |
| 테마, 목록 표시, 학습 기본값 | `localStorage` | `preferencesStore` |
| 즐겨찾기 | `localStorage` | `favoritesStore` |
| 일반 학습 진행 중 세션 | `localStorage` | 결과는 메모리만 |
| 시험 세션/결과/오답 ID | `localStorage` | 결과와 오답 노트는 별도 수명주기 |
| 활용형 세션/결과 | `localStorage` | 오답 재시작 지원 |
| 게임 진행 중 세션/최근 결과/기록/MMR | `localStorage` | 백그라운드 복귀 중 페이지 재생성에 대비 |

## 시험 저장 규칙

- 세션: `jsp-react:exam-session`
- 최근 결과: `jsp-react:exam-result`
- 오답 노트 ID: `jsp-react:exam-wrong-answer-ids`
- 새 시험에 오답이 있으면 오답 노트 ID를 해당 오답으로 갱신한다.
- 새 시험이 0오답이면 기존 오답 노트 ID를 유지한다.
- 최근 결과 삭제는 `jsp-react:exam-result`만 삭제하고 오답 노트 ID는 삭제하지 않는다.
- 최근 결과 로드 시 예전 오답 항목 형태를 현재 `itemId` 형태로 정규화한다.
- 오답 노트 ID 저장값이 비어 있고 최근 결과에 복구 가능한 오답이 있으면 `jsp-react:exam-wrong-answer-ids`를 다시 채운다.
- 현재 단어 데이터와 즉시 연결되지 않는 오답 ID도 복구 후보로 보존한다.
- 자동 채점 입력 중 답안은 현재 세션의 `userAnswers`에 즉시 저장해 복귀 후 입력값을 보존한다.

## 활용형 저장 규칙

- 세션: `jsp-react:conjugation-session`
- 결과: `jsp-react:conjugation-result`
- 입력 중 답안은 세션의 `draftAnswer`에 저장한다.

## 게임 저장 규칙

- 진행 중 세션: `jsp-react:game-session`
- 최근 결과: `jsp-react:game-result`
- 최근 설정: `jsp-react:game-last-setup`
- 게임 시작, 답안 처리, 봇 턴, 기권, 탭 매치 선택 때 진행 중 세션을 갱신한다.
- 게임 완료 시 진행 중 세션을 삭제하고 최근 결과를 저장한다.

## 공유 규칙

앱 백업은 `jsp-react:` 기반 일반 앱 데이터만 다룬다.

- 방식: 클립보드, 파일, QR
- 복원: 확인 모달 후 기존 `jsp-react:` 데이터를 교체하고 새로고침
- 제거된 기능의 레거시 키는 내보내기와 가져오기에서 제외한다.

## QR 규칙

- 앱 백업 QR은 일반 백업 텍스트를 분할해 전송한다.
- 큰 payload는 gzip 압축을 시도하고, 필요하면 여러 프레임으로 나눈다.

## 구현 위치

- 앱 백업: `src/features/share/share.ts`
- UI: `src/features/share/SharePanel.tsx`
- 제거된 기능 저장소 정리: `src/lib/cleanupRemovedFeatureStorage.ts`
