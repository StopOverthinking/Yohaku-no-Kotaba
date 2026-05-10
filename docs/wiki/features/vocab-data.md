# Vocab Data

## 목적

단어 데이터가 어떤 종류로 나뉘고, 런타임에서 어떻게 `StudyItem`으로 통합되는지 설명한다.

## 데이터 계층

### 기본 단어장

- `vocabularySets`
- `vocabularyWords`

### 주제형 단어장

- `themeWordbooks`
- `themeWords`
- 주제 토픽 단위 정렬 보유

### 비교형 단어장

- `comparisonWordbooks`
- `comparisonWords`
- `comparisonPairs`

## 런타임 집계

`src/features/vocab/model/selectors.ts`가 모든 읽기 전용 조합의 중심이다.

- 세트 조회
- 단어 조회
- 선택 가능한 단어장 목록
- `StudyItem` 변환
- 검색 텍스트 생성
- 즐겨찾기 판정

## 중요한 타입 개념

### `VocabularyWord`

일반 단어 엔트리. 기본, 주제형, 비교형 모두 이 타입을 바탕으로 움직인다.

### `StudyItem`

런타임 학습 단위.

- `word`
- `comparison`

목록, 일반 학습, 시험 일부는 `StudyItem` 기준으로 통합 처리한다.

## 세트 선택 규칙

- `all`: 모든 단어
- `favorites`: 즐겨찾기 단어
- 기본 세트 ID
- 주제형 wordbook ID
- 비교형 wordbook ID

`wrong_answers`는 정식 단어 데이터라기보다 시험 결과에서 파생되는 특수 세트다.

## 비교형 주의점

- 비교형은 한 쌍이 하나의 학습 단위
- 답안 텍스트, 검색 텍스트, 즐겨찾기 판정이 두 단어를 함께 묶는다
- 목록과 에디터에서만 직접 선택한다
- 일반 학습, 시험, 게임 후보에서는 제외한다

## 데이터 생성 경로

- 편집 원본: `src/features/vocab/editor-data/*`
- 런타임 데이터: `src/features/vocab/data/*`
- 생성 스크립트: `scripts/generate-vocab-data.mjs`

## 수정 시 주의점

- 에디터 구조를 바꾸면 런타임 selectors와 생성 스크립트도 함께 봐야 함
- 검색, 학습, 시험은 대부분 `StudyItem`을 읽으므로 단순 JSON 수정으로 끝나지 않을 수 있음
