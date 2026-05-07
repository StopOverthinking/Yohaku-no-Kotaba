# List Mode

## 목적

학습 전후에 단어를 빠르게 훑고, 검색하고, 가리고, 즐겨찾기 관리하는 화면이다.

## 진입점

- 라우트: `/list`
- 관련 파일: `src/features/list/ListPage.tsx`

## 핵심 상태

- 선택 세트: `preferencesStore.lastSelectedSetId`
- 숨김 설정: `hideJapaneseInList`, `hideMeaningInList`
- 글자 크기: `listFontScale`
- 즐겨찾기: `favoritesStore`
- 시험 오답: `examStore.wrongAnswerIds`
- 화면 내부 상태:
  - `favoritesOnly`
  - `searchOpen`
  - `query`
  - `revealedCards`
  - `toolbarVisible`

## 세트 해석 규칙

- `all`은 현재 목록 화면에서 실제 세트 ID로 치환될 수 있다
- `wrong_answers`는 시험 결과에서 파생된 특수 목록
- 일반 세트는 `getStudyItemsForSet()`로 읽는다

## 검색과 필터

- 검색은 `useDeferredValue` 사용
- 입력 변경은 `startTransition` 사용
- 검색 대상은 `StudyItem.searchText`
- 즐겨찾기만 보기와 검색은 함께 걸린다

## 숨김과 공개

- 일본어/뜻 숨김은 전역 설정
- 카드별 일시 공개 상태는 `revealedCards`에만 저장
- 숨김이 꺼지면 공개 상태도 정리된다
- 실제 텍스트 opacity가 아니라 마스킹 렌더링을 유지하는 방향이 기준
- 숨김 토글은 루트 `data-hide-*`를 먼저 동기 갱신하는 DOM/CSS fast path를 유지한다
- 카드 `data-revealable`, `tabIndex`, `role`은 숨김/공개 dataset 기준으로 동기화하고, 숨김 토글만으로 카드 전체를 다시 렌더하지 않는다

## 렌더링 규칙

- 주제형 단어장은 topic header를 삽입
- 카드 key는 `word.id` 유지
- 재마운트를 줄여 숨김/검색/글자 크기 조정 반응성을 지킨다

## 툴바 규칙

- 스크롤 방향에 따라 숨김/표시
- 직전 상호작용 직후에는 잠깐 고정 표시
- 검색, 숨김, 즐겨찾기, 글자 크기 조절이 핵심 액션

## 저장 규칙

- 전역 숨김 상태와 글자 크기만 `preferencesStore`에 저장
- 검색어, 카드 공개 상태, 즐겨찾기만 보기 상태는 화면 메모리만 사용

## 수정 시 주의점

- `wrong_answers` 흐름은 시험과 연결돼 있다
- 비교형 카드 표시 규칙을 깨면 시험/일반 학습 이해에도 영향이 간다
- 텍스트를 늘리기보다 아이콘 의미를 강화하는 편이 우선
