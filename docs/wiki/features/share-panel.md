# Share Panel

## 목적

앱 전체 백업과 스마트 복습 일정 백업을 한 화면에서 분리 제공한다.

## 진입점

- 홈 서브메뉴
- 컴포넌트: `src/features/share/SharePanel.tsx`

## 구성 원칙

공유 UI는 두 섹션으로 나뉜다.

- 앱
- 스마트 복습

둘을 같은 파일 포맷이나 같은 복원 규칙으로 취급하지 않는다.

## 앱 섹션 액션

- 클립보드 복사
- 파일 저장
- QR 내보내기
- 클립보드 복원
- 파일 복원
- QR 복원

## 스마트 복습 섹션 액션

- 파일 저장
- QR 내보내기
- 파일 병합
- 파일 덮어쓰기
- QR 병합

## QR 동작

- 큰 payload는 프레임 분할
- SVG QR 생성
- 여러 장이면 자동 재생
- 카메라 스캔은 브라우저 `BarcodeDetector`와 `getUserMedia` 사용

## 스마트 복습 메타 갱신

패널 진입 시 현재 record count를 읽는다.

- `scheduleRecordCount`
- `isScheduleQrEnabled`

이 값으로 QR 버튼 노출 가능 여부를 결정한다.

## 복원 흐름

### 앱 복원

- JSON 파싱
- 확인 모달
- 기존 `jsp-react:` 데이터 교체
- 페이지 새로고침

### 스마트 복습 복원

- 전용 JSON 파싱
- 병합 또는 덮어쓰기 확인
- DB 반영
- `smartReviewStore.hydrate()` 재실행
- 메타 다시 읽기

## UI 규칙

- 앱/스마트 복습 레이블은 짧게
- 버튼 수는 많아도 액션 의미는 아이콘 중심으로 바로 보이게
- 긴 설명은 확인 모달에서만 사용

## 수정 시 주의점

- 앱 백업 포맷과 스마트 복습 포맷을 섞지 말 것
- QR 버튼은 record count 제한을 통과한 경우만 활성화
