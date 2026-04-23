# Game Mode

## 범위

이 문서는 현재 안정 범위인 `speed_quiz`만 다룬다.

- `tap_match_rush`는 미완이므로 설계 문서에서 제외
- 코드에 관련 분기가 있어도 공통 설계의 기준으로 삼지 않는다

## 목적

시간 압박이 있는 퀴즈형 플레이를 제공하고, 기록과 경쟁 지표를 남긴다.

## 진입점

- 설정: `/game`
- 세션: `/game/session`
- 결과: `/game/result`
- 스토어: `src/features/game/gameStore.ts`

## 핵심 모드

### single

- 혼자 푸는 기록 모드
- 최고 기록과 평균 시간 기록 누적

### bot

- 봇과 점수 경쟁
- 봇 기록 히스토리를 기반으로 시작
- 플레이 후 MMR 갱신

## 핵심 상태

- `session`
- `lastResult`
- `lastSetup`

## 스피드 퀴즈 흐름

1. 기본 세트 + 주제형 단어만으로 설정 payload를 만든다
2. 플레이어 답 입력
3. 봇 모드면 봇 턴도 별도 진척
4. 완료 시 결과 집계
5. single이면 기록 저장
6. bot이면 봇 히스토리와 MMR 저장

## 저장 규칙

- single records: `localStorage`
- bot history: `localStorage`
- player MMR: `localStorage`

## 수정 시 주의점

- `gameStore`에는 미완 기능 분기가 함께 존재한다
- 안정 범위 수정인지, 미완 기능과 엮인 수정인지 먼저 분리해서 판단해야 한다
- 비교형 단어는 안정 범위 게임 후보에 다시 포함하지 않는다
- 위키 갱신 시에도 `tap_match_rush`는 계속 제외한다
