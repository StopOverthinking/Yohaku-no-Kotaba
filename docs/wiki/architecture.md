# Architecture

## 기술 스택

- Vite
- React 19
- React Router
- Zustand
- Vitest + Testing Library

## 앱 부팅 흐름

1. `src/main.tsx`에서 테마를 먼저 적용한다.
2. `RouterProvider`로 라우터를 마운트한다.
3. `src/app/App.tsx`가 전역 프레임과 라우트 전환 애니메이션을 담당한다.
4. `src/app/providers.tsx`가 주요 스토어의 `hydrate()`를 실행한다.

## 라우트 구조

### 메인 앱

- `/`: 홈
- `/list`: 목록
- `/learn`, `/learn/session`, `/learn/result`
- `/conjugation`, `/conjugation/session`, `/conjugation/result`
- `/exam`, `/exam/session`, `/exam/result`
- `/game`, `/game/session`, `/game/result`

### 별도 앱

- `/editor`: 단어장 편집기

## 상태 구조

### 전역 영속 Zustand

- `preferencesStore`: 테마, 목록 표시, 학습 기본값
- `favoritesStore`: 즐겨찾기

### 세션 중심 스토어

- `learnSessionStore`
- `conjugationStore`
- `examStore`
- `gameStore`

## 저장 경계

- 일반 학습: `localStorage`
- 시험: `localStorage`
- 활용형: `localStorage`
- 게임 기록: `localStorage`

## 데이터 원천

### 런타임 읽기 데이터

- `src/features/vocab/data/*`

### 에디터 원천 데이터

- `src/features/vocab/editor-data/*`

### 생성 스크립트

- `scripts/generate-vocab-data.mjs`

에디터가 직접 편집하는 데이터와 런타임에서 참조하는 데이터는 역할이 다르다. 데이터 형식을 바꾸면 두 쪽 모두 영향 범위를 확인해야 한다.

## 전역 UI 셸

- `ScreenFrame`이 앱 외곽 레이아웃을 감싼다.
- `App`은 페이지 전환 시 무거운 blur/scale 대신 가벼운 `opacity + y`만 쓴다.
- `useShouldReduceEffects`가 효과 축소 조건을 결정한다.

## 공통 설계 원칙

- 모션은 짧고 가볍게
- backdrop-filter, 큰 blur, height 애니메이션 지양
- 서브패널보다 현재 화면의 직접 조작 우선
