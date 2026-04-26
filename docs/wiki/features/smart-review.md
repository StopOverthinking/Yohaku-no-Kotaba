# Smart Review

## 목적

단어별 다음 복습 일정을 기준으로 오늘 분량을 뽑아 진행하는 최소 스케줄 기반 복습 모드다.

## 진입점

- 설정: `/smart-review`
- 세션: `/smart-review/session`
- 결과: `/smart-review/result`
- DB: `src/features/smart-review/smartReviewDb.ts`
- 스토어: `src/features/smart-review/smartReviewStore.ts`

## 설계 핵심

스마트 복습은 통계 보관 시스템이 아니라 일정 시스템이다.

- 저장 대상: 다음 복습 시각과 간격
- 저장 위치: `IndexedDB`
- 세션과 결과: 메모리만
- 예문: 단어 원본 데이터의 `smartReviewPrompt`에서만 읽음

## 핵심 상태

- `profiles`: `wordId -> SmartReviewScheduleRecord`
- `session`: 현재 복습 중 세션
- `lastResult`: 직전 결과
- `isHydrated`: IndexedDB 초기화 여부

## 초기화 규칙

1. 앱 시작 시 `hydrate()`
2. 내부에서 `initializeSmartReviewDb()`
3. 레거시 `localStorage`에서 1회 마이그레이션
4. IndexedDB 전체 레코드를 `profiles`로 로드

## 단어 상태 해석

- 레코드 없음: 새 단어
- `dueAt <= now`: 복습 대상
- `dueAt > now`: 아직 차례 아님
- `dueAt = null`: 예약 없음

## 세션 흐름

1. 설정 화면이 기본 세트 + 주제형 단어와 현재 스케줄 요약을 읽음
2. `buildSmartReviewSummary()`로 복습/신규/학습 중/완료 수 계산
3. 가능한 분량 안에서 `wordCount`를 정함
4. 세션 시작
5. 답 제출 후 현재 세션 메모리만 갱신
6. 세션 완료 시 `applySmartReviewOutcome()` 결과를 `bulkPut`으로 한 번에 저장

## 예문 규칙

- 단어의 `smartReviewPrompt`가 완성된 경우에만 스마트 복습 후보가 된다.
- 완성 기준: `japaneseSentence`에 `____`가 있고 `translationSentence`가 비어 있지 않음
- 예문이 없는 단어는 요약 수치와 세션 선택에서 제외한다.
- 자동 예문 생성, override 라이브러리, 품사별 fallback 문장은 사용하지 않는다.

예문은 에디터와 xlsx에서 관리하며, 스마트 복습 IndexedDB에는 저장하지 않는다.

## 저장 시점

- 답 맞춤 직후 저장하지 않음
- 세션 완료 시 일괄 저장
- 저장 대상은 `nextProfiles` 전체

## 공유 규칙

- 앱 백업과 분리
- 전용 JSON 포맷 사용
- 기본 가져오기는 병합
- 덮어쓰기는 명시적 선택일 때만
- QR은 `recordCount <= 200`만 허용

## UI 규칙

- 설정 화면은 오늘 분량과 요약 수치 위주
- 설명보다 숫자와 액션 아이콘 우선
- 진행 중 세션은 홈과 설정에서 이어하기 배너로 노출
- 비교형 단어는 스마트 복습 일정 대상에 포함하지 않는다

## 절대 되돌리지 않을 것

- 스마트 복습 세션 영속 저장 재도입
- 결과 로그 장기 저장
- 상세 통계 중심 설계 회귀
- 앱 일반 백업에 스마트 복습 스케줄 재포함
