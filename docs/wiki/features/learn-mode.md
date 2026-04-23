# Learn Mode

## 목적

선택한 단어들을 반복 라운드로 학습하는 기본 카드 학습 모드다.

## 진입점

- 설정: `/learn`
- 세션: `/learn/session`
- 결과: `/learn/result`

## 핵심 상태

- 설정 기본값: `preferencesStore.learnDefaults`
- 세션: `learnSessionStore.record`
- 결과: `learnSessionStore.lastResult`
- 즐겨찾기: `favoritesStore.favoriteIds`
- 시험 오답 세트 가능: `examStore.wrongAnswerIds`

## 설정 규칙

### 세트 선택

- `all`
- `favorites`
- `wrong_answers`
- 기본 세트와 주제형 단어장만 선택 가능

### 필터

- 즐겨찾기만
- 범위 지정
- 앞면 기준 `japanese | meaning`
- 학습 항목 수

실제 후보 추출은 `src/features/study/wordSelection.ts`가 담당한다.

## 세션 흐름

1. 후보를 셔플한다.
2. `wordCount`만큼 잘라 세션을 만든다.
3. 맞음/모름으로 현재 카드를 처리한다.
4. 모르는 카드는 `retryQueue`에 들어간다.
5. 현재 라운드가 끝나면 `retryQueue`만으로 다음 라운드를 만든다.
6. 더 이상 재시도 카드가 없으면 완료한다.

## Undo 규칙

- 단일 이전 상태가 아니라 `snapshotHistory` 스택 사용
- 여러 번 연속 undo 가능
- undo 후에도 세션은 다시 `localStorage`에 저장

## 저장 규칙

- 진행 중 세션만 `localStorage`
- 완료 결과는 메모리 상태만 사용
- 세션 시작, 진행, undo 시 저장
- 완료 시 세션 키 삭제

## UI 규칙

- 설정 화면은 빠른 선택 중심
- 완료 화면은 홈 이동 아이콘 버튼 1개만 유지
- 세션 파기는 아직 브라우저 confirm을 쓰지만 향후 앱 내부 모달로 교체 예정

## 수정 시 주의점

- 선택 로직은 시험 오답 세트와 연결된다
- 비교형 단어장과 비교형 오답 기록은 이 모드에 다시 섞지 않는다
- 세션 엔진과 페이지 전환 애니메이션이 함께 움직인다
- 완료 결과를 영속 저장 대상으로 확대하지 않는다
