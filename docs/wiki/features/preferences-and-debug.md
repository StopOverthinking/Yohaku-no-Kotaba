# Preferences

## 목적

앱 전역 표시 설정과 학습 기본값을 관리한다.

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

### favorites

키: `jsp-react:favorites`

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

## 수정 시 주의점

- 새 전역 설정을 추가하면 저장 키, 초기값, UI 노출 위치를 함께 정리
