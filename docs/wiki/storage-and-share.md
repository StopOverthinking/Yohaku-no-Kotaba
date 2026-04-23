# Storage And Share

## 저장 철학

기능별로 필요한 최소한만 저장한다. 특히 스마트 복습은 "다음에 언제 다시 볼지"만 영속 저장한다.

## 저장소 요약

| 영역 | 저장 위치 | 비고 |
| --- | --- | --- |
| 테마, 목록 표시, 학습 기본값 | `localStorage` | `preferencesStore` |
| 즐겨찾기 | `localStorage` | `favoritesStore` |
| 디버그 날짜 | `localStorage` | `debugDateStore` |
| 일반 학습 진행 중 세션 | `localStorage` | 결과는 메모리만 |
| 시험 세션/결과/오답 ID | `localStorage` | 오답 노트의 원천 |
| 활용형 세션/결과 | `localStorage` | 오답 재시작 지원 |
| 게임 기록과 MMR | `localStorage` | 안정 범위는 스피드 퀴즈 기준 |
| 스마트 복습 일정 | `IndexedDB` | `japanese-study` / `smartReviewSchedule` |

## 스마트 복습 IndexedDB

### DB 구조

- DB 이름: `japanese-study`
- 버전: `1`
- 스토어: `smartReviewSchedule`
- keyPath: `wordId`
- index: `dueAt`
- index: `updatedAt`

### 저장 레코드

```ts
type SmartReviewScheduleRecord = {
  wordId: string
  dueAt: string | null
  intervalDays: number | null
  updatedAt: string
}
```

### 저장하지 않는 것

- 세션 큐
- 현재 인덱스
- 직전 결과
- 오답 상세 로그
- 누적 통계 전반

## 스마트 복습 마이그레이션

### 레거시 키

- `jsp-react:smart-review-profiles`
- `jsp-react:smart-review-session`
- `jsp-react:smart-review-result`

### 마커

- `jsp-react:smart-review-storage = indexeddb-v1`

### 규칙

1. 앱 시작 시 마커 확인
2. 레거시 profiles를 최소 스케줄 정보로 축소
3. IndexedDB에 일괄 저장
4. 마커 기록
5. 이후 레거시 키 제거

## 공유 분리 원칙

공유는 반드시 둘로 나눈다.

### 1. 앱 백업

- 대상: `jsp-react:` 기반 일반 앱 데이터
- 제외: 스마트 복습 관련 레거시 키와 마커
- 방식: 클립보드, 파일, QR

### 2. 스마트 복습 백업

- 대상: IndexedDB `smartReviewSchedule`
- 방식: 파일, QR, 파일 병합, 파일 덮어쓰기, QR 병합

## 스마트 복습 백업 포맷

```ts
type SmartReviewScheduleBackup = {
  schemaVersion: 'jsp-smart-review-schedule-v1'
  exportedAt: string
  recordCount: number
  data: SmartReviewScheduleRecord[]
}
```

## 스마트 복습 가져오기 규칙

### 병합

- 기본 정책
- 같은 `wordId`가 충돌하면 `updatedAt`이 더 최신인 레코드 사용

### 덮어쓰기

- 사용자가 명시적으로 선택할 때만 사용
- 현재 스케줄 전체 삭제 후 파일 내용으로 교체

## QR 규칙

- 앱 백업 QR은 일반 백업 텍스트를 분할해 전송
- 스마트 복습 QR은 작은 데이터만 허용
- 스마트 복습 QR 기준: `recordCount <= 200`

## 구현 위치

- 앱 백업: `src/features/share/share.ts`
- 스마트 복습 DB: `src/features/smart-review/smartReviewDb.ts`
- 스마트 복습 공유: `src/features/smart-review/smartReviewScheduleShare.ts`
- UI: `src/features/share/SharePanel.tsx`
