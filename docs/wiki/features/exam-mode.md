# Exam Mode

## 목적

선택한 세트로 시험을 진행하고, 자동 채점 또는 직접 채점 결과를 남긴다.

## 진입점

- 설정: `/exam`
- 세션: `/exam/session`
- 결과: `/exam/result`

## 핵심 상태

- `examStore.session`
- `examStore.lastResult`
- `examStore.wrongAnswerIds`

## 채점 모드

### 자동 채점

- 입력값을 바로 기록
- 문제를 자동으로 다음으로 넘김

### 직접 채점

- 먼저 정답 공개
- 이후 사용자가 맞음/틀림 판정

## 세션 흐름

1. 설정에서 기본 세트, 주제형, 오답 세트 중 하나와 채점 방식을 고름
2. 세션 시작 시 질문 목록 생성
3. 자동 또는 수동 방식으로 각 문제 처리
4. 마지막 문제 후 결과 생성
5. 오답 `wordId` 목록을 별도 저장

## 수동 채점 undo

- 직접 채점 모드만 사용
- 최근 스냅샷 스택 사용
- 제한 개수는 `EXAM_MANUAL_UNDO_LIMIT`

## 오답 노트

- 결과 생성 시 `wrongItems`에서 잘못 맞힌 학습 단위의 word IDs를 추출
- 이를 `jsp-react:exam-wrong-answer-ids`에 저장
- 목록/일반 학습/시험 설정이 이 값을 읽어 특수 세트 `wrong_answers`를 만든다

## 저장 규칙

- 세션: `jsp-react:exam-session`
- 결과: `jsp-react:exam-result`
- 오답 ID: `jsp-react:exam-wrong-answer-ids`

## UI 규칙

- 진행 중 시험과 최근 결과는 홈과 설정 화면에서 다시 접근 가능
- 시험 파기 확인은 현재 브라우저 confirm 기반

## 수정 시 주의점

- 오답 ID 저장 규칙을 바꾸면 목록/일반 학습/시험 설정 전부 영향을 받음
- 비교형 단어장과 비교형 오답 기록은 이 모드에 다시 노출하지 않는다
