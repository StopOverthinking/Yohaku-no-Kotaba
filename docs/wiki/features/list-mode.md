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
- 모바일/펜 입력은 `click`까지 기다리지 않고 `pointerdown`에서 루트 dataset과 버튼 active dataset을 먼저 바꾼다
- 숨김 설정 저장과 카드 surface 접근성 동기화는 첫 마스킹 페인트 뒤로 미뤄 터치 응답을 막지 않고, 페이지 이탈 시 pending 저장은 즉시 flush한다
- 숨겨진 카드 공개는 모바일에서 작은 이동 범위의 `pointerup` 탭을 먼저 처리하고 `click`은 폴백으로 유지한다
- 카드 `data-revealable`, `tabIndex`, `role`은 숨김/공개 dataset 기준으로 동기화하고, 숨김 토글만으로 카드 전체를 다시 렌더하지 않는다

## 렌더링 규칙

- 주제형 단어장은 topic header를 삽입
- 카드 key는 `word.id` 유지
- 넓은 화면에서도 카드 그리드는 최대 2열로 유지한다
- 재마운트를 줄여 숨김/검색/글자 크기 조정 반응성을 지킨다
- 카드 즐겨찾기 버튼은 목록 전체가 아니라 개별 버튼이 자기 단어의 즐겨찾기 여부만 구독한다
- 즐겨찾기 ID 조회는 반복 `includes` 대신 `Set` 기반 조회를 사용한다
- 글자 크기 조정은 모바일 터치에서 `pointerdown` 시 루트 CSS 변수와 `data-list-font-scale`을 먼저 바꾸고, 저장소 반영은 첫 페인트 뒤로 미룬다
- 글자 크기 저장이 지연 중이면 새 입력은 기존 pending 저장을 취소하고 마지막 크기만 저장하며, 페이지 이탈 시 pending 저장을 즉시 flush한다

## 툴바 규칙

- 스크롤 방향에 따라 숨김/표시
- 직전 상호작용 직후에는 잠깐 고정 표시
- 검색, 숨김, 즐겨찾기, 글자 크기 조절이 핵심 액션

## 저장 규칙

- 전역 숨김 상태와 글자 크기만 `preferencesStore`에 저장
- 스크롤 위치는 `jsp-react:list-scroll-positions`에 단어장 ID별로 저장하고, 같은 단어장에 다시 들어오면 페인트 전에 복원
- 스크롤 중 저장은 짧게 지연하고 단어장 전환, 화면 이탈, 페이지 숨김 시 현재 위치를 즉시 확정
- 검색어, 카드 공개 상태, 즐겨찾기만 보기 상태는 화면 메모리만 사용

## 수정 시 주의점

- `wrong_answers` 흐름은 시험과 연결돼 있다
- 비교형 카드 표시 규칙을 깨면 시험/일반 학습 이해에도 영향이 간다
- 텍스트를 늘리기보다 아이콘 의미를 강화하는 편이 우선
