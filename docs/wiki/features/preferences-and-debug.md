# Preferences And Debug

## 목적

앱 전역 표시 설정, 학습 기본값, 시간 오프셋을 관리한다.

## 설정 저장

### preferences

키: `jsp-react:preferences`

포함 항목:

- `themeMode`
- `hideJapaneseInList`
- `hideMeaningInList`
- `listFontScale`
- `learnCardFontScale`
- `lastSelectedSetId`
- `learnDefaults`
- `smartReviewWordCount`

### favorites

키: `jsp-react:favorites`

### debug

키: `jsp-react:debug-date`

## theme 규칙

- 앱 시작 전 저장된 테마를 먼저 읽어 DOM에 적용
- 실행 중 토글은 `applyThemeMode()`로 즉시 반영

## learnDefaults 역할

일반 학습 설정 화면의 마지막 선택 상태를 유지한다.

- 앞면 기준
- 즐겨찾기만
- 학습 수
- 범위 사용 여부
- 범위 시작/끝

## smartReviewWordCount 역할

- 스마트 복습 설정 화면의 최근 분량 저장
- 가능한 최대 분량 안에서 보정됨

## debug 날짜

- `getDebugNow()`가 오프셋이 적용된 현재 시각을 제공
- 스마트 복습 같은 날짜 의존 기능은 이 값을 통해 테스트 가능

## 수정 시 주의점

- 새 전역 설정을 추가하면 저장 키, 초기값, UI 노출 위치를 함께 정리
- 실제 시간 기반 기능은 debug day offset 영향 범위를 함께 봐야 함
