# Storage And Share

## 저장 철학

기능별로 필요한 최소한만 저장한다. 학습 세션과 결과는 각 기능의 수명주기를 벗어나 오래 끌고 가지 않는다.

## 저장소 요약

| 영역 | 저장 위치 | 비고 |
| --- | --- | --- |
| 테마, 목록 표시, 학습 기본값 | `localStorage` | `preferencesStore` |
| 목록 스크롤 위치 | `localStorage` | `jsp-react:list-scroll-positions`, 단어장 ID별 위치 |
| 즐겨찾기 | `localStorage` | `favoritesStore` |
| 문장 학습 숙련도·진행 세션 | `localStorage`, `jsp-react:context-learn-v2` | 결과는 메모리만, 완료 시 세션/undo 제거 |
| 레거시 일반 학습 진행 중 세션 | `localStorage`, `jsp-react:learn-session` | 기존 세션 완료용 |
| 시험 세션/결과/오답 ID | `localStorage` | 결과와 오답 노트는 별도 수명주기 |
| 활용형 세션/결과 | `localStorage` | 오답 재시작 지원 |
| 게임 진행 중 세션/최근 결과/기록/MMR | `localStorage` | 백그라운드 복귀 중 페이지 재생성에 대비 |

## 일반 학습 설정 저장 규칙

- `preferencesStore.learnDefaults`에 일반 범위와 필수 포함 범위 토글·구간 목록을 함께 저장한다.
- 예전 저장값에 필수 범위 필드가 없으면 토글 꺼짐과 빈 목록을 기본값으로 보완한다.

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
- 한 프레임에는 Base64 URL 텍스트를 최대 400자만 담아 QR 모듈 밀도를 낮추고 원거리 인식성을 확보한다.

## 구현 위치

- 앱 백업: `src/features/share/share.ts`
- UI: `src/features/share/SharePanel.tsx`
- 제거된 기능 저장소 정리: `src/lib/cleanupRemovedFeatureStorage.ts`

## 문장 학습 상태 v2

용법 ID와 버전을 키로 다음 복습일, 간격 단계, 실패 횟수/날짜 수, 마지막 학습일과 당일 시도 횟수(첫 시도를 제외한 재학습 횟수 계산용), 예문별 노출·실패·힌트 횟수를 저장한다. 내부 추천 수준과 초기 측정 단어 ID 최대 20개를 함께 저장한다. 전체 학습 행동 로그는 보관하지 않는다.

진행 중 세션은 카드의 용법/예문 버전, 공개·힌트 상태, 출제 범위와 순서, 재학습 큐를 보존한다. 연속 undo는 변경된 프로필과 직전 세션의 변경분만 저장한다. 출제 범위와 카드 배열의 공통 구간을 반복 직렬화하지 않아 큰 범위에서도 저장 용량을 줄인다. 판정과 세션 이동은 같은 저장값에 반영하므로 쓰기 실패 시 진행하지 않는다. 저장값 비교로 오래된 탭의 덮어쓰기를 막는다.

공유 백업에 v2 키를 포함하며 복원 전 형식을 검증한다. 복원 쓰기가 실패하면 기존 값으로 되돌리며, 모든 쓰기가 성공한 뒤에만 이전의 불필요한 키를 제거한다. 파싱 실패 원본은 지우지 않는다. 옛 스마트 복습 키/IndexedDB는 재사용하지 않는다. 초기 부팅에서는 hydrate가 완료된 뒤 라우트 화면을 표시해 복원 전 리다이렉트를 막는다.
