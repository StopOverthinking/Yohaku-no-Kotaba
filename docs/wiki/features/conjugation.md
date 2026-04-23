# Conjugation

## 목적

동사 활용형 문제를 세션 단위로 풀고, 오답만 다시 시작할 수 있는 모드다.

## 진입점

- 설정: `/conjugation`
- 세션: `/conjugation/session`
- 결과: `/conjugation/result`

## 핵심 상태

- `conjugationStore.session`
- `conjugationStore.lastResult`

## 세션 흐름

1. 설정에서 문제 세트를 만든다.
2. 세션을 시작하면 질문 배열과 빈 시도 배열을 만든다.
3. 답 제출 시 현재 문제에 대한 시도 결과를 기록하고 정답 공개 상태로 전환한다.
4. 공개 후 다음 문제로 이동한다.
5. 마지막 문제까지 끝나면 결과를 만들고 저장한다.

## 오답 재시작

- 마지막 결과의 `wrongItems`만 모아 새 세션 구성
- 세트 이름에 `오답 복습` 접미
- 질문 배열만 다시 만들고 나머지 진행 상태는 초기화

## 저장 규칙

- 세션: `localStorage`
- 결과: `localStorage`
- 완료 시 세션 삭제 후 결과 저장

## UI 규칙

- 정답 공개와 다음 이동이 분리된 흐름 유지
- 오답만 다시 하기 액션은 결과 화면의 핵심 기능

## 수정 시 주의점

- 채점 규칙은 `conjugationGrading`과 연결
- 질문 생성은 `conjugationEngine`과 함께 봐야 함
