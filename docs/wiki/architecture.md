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
4. `src/app/providers.tsx`가 학습 스토어의 비동기 `hydrate()` 완료를 기다린 뒤 화면을 표시한다.

## 라우트 구조

### 메인 앱

- `/`: 홈
- `/list`: 목록
- `/learn`, `/learn/session`, `/learn/result`, `/learn/review`

### 별도 앱

- `/editor`: 단어장 편집기

## 상태 구조

### 전역 영속 Zustand

- `preferencesStore`: 테마, 목록 표시, 학습 기본값
- `favoritesStore`: 즐겨찾기

### 세션 중심 스토어

- `contextStore`: 유일한 학습 상태


## 저장 경계

- 문장 학습: `contextStore` / `contextEngine`, IndexedDB에 숙련도·진행 상태 저장, v2 백업 호환

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
- `App`은 일반 페이지 전환 시 무거운 blur/scale 대신 가벼운 `opacity + y`만 쓰고, 큰 목록(`/list`)이 관여하면 즉시 교체한다.
- `useShouldReduceEffects`가 효과 축소 조건을 결정한다.
- 백그라운드 복귀 중 페이지가 재생성될 수 있으므로 세션 스토어는 필요한 진행 상태를 저장하고 hydrate로 복구한다.

## 공통 설계 원칙

- 모션은 짧고 가볍게
- backdrop-filter, 큰 blur, height 애니메이션 지양
- 서브패널보다 현재 화면의 직접 조작 우선

예문 원고가 늘어도 학습 첫 화면에서 에디터용 원고 사본을 함께 내려받지 않도록 `/editor` 화면은 필요할 때 불러온다. 예문 표의 입력은 단어장 전체를 재정규화하지 않고 콘텐츠 상태만 바꾼다.

## 게시 경로

`main` 푸시는 `.github/workflows/deploy-pages.yml`에서 GitHub Pages 게시를 시작한다. 빌드·전체 테스트·콘텐츠 감사가 성공한 경우에만 산출물을 업로드하고 게시한다. 공개 주소는 `https://stopoverthinking.github.io/Yohaku-no-Kotaba/`다.

CI는 `release.json`에 실제 커밋 SHA, HTML 해시, 수준별 단어 수와 전체 확충 완료 여부를 기록한다. 푸시 성공과 게시 성공은 별도로 확인한다. 게시된 manifest의 SHA와 HTML 해시가 일치하는지 확인한 뒤 실제 학습 화면을 검증한다. 로컬 변경분을 이전 커밋의 게시물로 오인하지 않도록 manifest 생성에는 CI의 전체 `GITHUB_SHA`가 필요하다.
