# 기존 어휘 처리 계약

`assignments-NNN.json` / `review-NNN.json`은 기존 분류 제안 및 독립 분류 검토다. 승인 범위는 분류이며 내용 수정이나 별칭·학습 프로필 합치기를 승인하지 않는다. 예문 3개 필요라는 이전 이슈는 2026-09-30 최소 1개 정책 이후 의무가 아니다. 그 밖의 의미·읽기·수준·중복 문제는 그대로 해결해야 한다.

## 고유한 기존 ID의 수준별 참조 게시

`membership-reviews.json`에는 Astra high가 기존 단어의 현재 내용 및 권장 수준을 실제로 검토하여 **기존 ID를 내용 수정 없이 수준별 목록에 연결해도 된다**고 승인한 항목만 다음 형태로 저장한다. 최종734개 참조를 승인·반영했으며 미해결 내용은 `membership-held.json`에 보존한다.

검토 입력은 `node scripts/prepare-jlpt-reference-review.mjs`로 준비한다. 현재 해시와 독립 분류 승인을 대조한 뒤 이미 참조 승인·보류한 ID 및 정규형 중복/별칭 후보를 제외하고 현재 원본 전체를 `output/jlpt/legacy-reference-candidates.json`에 모은다. 보류 항목을 다시 볼 때만 `--include-held`를 사용한다. 분류 제안의 나머지 이슈도 남기며 이 명령은 승인이나 게시를 수행하지 않는다.

```json
[
  {
    "wordId": "기존 원본 ID",
    "level": "N3",
    "sourceHash": "hashContent({ word: 현재 원본 단어, senses: 현재 연결 용법 배열 })",
    "scope": "legacy-reference-publication",
    "outcome": "accepted",
    "model": "gpt-6-astra",
    "reasoningEffort": "high",
    "reviewedAt": "검토를 완료한 ISO 시각",
    "notes": ["수준 근거와 현재 내용의 검토 결과"]
  }
]
```

이 목록을 기계적으로 분류 승인에서 변환하면 안 된다. 중복 정규형/별칭 그룹, 확인된 의미·읽기·예문 오류는 이 경로에 포함하지 않는다. 중요한 의미가 따로 있다면 기존 내용 정정·독립 용법 정책을 먼저 결정한다. 원본 변경 후 이전 해시 승인은 사용할 수 없다.

참조 검토 입력은 다른 분류 파일이 역방향으로 지목한 별칭도 함께 제외한다. 예를 들어 交替가 交代를 후보로 지목하면 두 항목 모두 별도 검토 대상이며, 앞선 交代 행의 후보 목록이 비어 있어도 고유 참조로 처리하지 않는다. 이는 보수적 보류이며 두 뜻이 같다는 승인은 아니다.

`build-jlpt-pilot.mjs --publish`는 명시적 참조 승인을 검사하고 기존 단어·용법·예문을 그대로 둔 채 ID를 수준별 목록 끝에 추가한다. 승인 목록은 추가만 허용한다. 수준 이동/순서 변경/삭제는 별도 이전 절차가 필요하다. `pilot/published-membership.json`의 마지막 게시 순서와 다른 편집기 목록을 덮어쓰지 않는다. 다음 신규 단어 묶음도 기존 참조 뒤에 추가되어 저장된 숫자 범위를 유지한다.

별칭 그룹은 기존 ID·내용·프로필을 보존하는 별도 단계이며 이 참조 게시 구현만으로 완료했다고 판단하지 않는다.

### 동일 용법 기록 연결 시범

후속 입력은 `node scripts/prepare-jlpt-alias-work.mjs`로 생성한다. `output/jlpt/alias-work/alias-NNN.json`의 관계 그룹은 후보이며 같은 뜻이라는 승인이 아니다. 모든 구성원의 실제 뜻·힌트·대비·예문을 대조해 단일 핵심 용법 동등성 또는 보류를 제안한다. 원본과 프로필은 제안 단계에서 바꾸지 않는다.

활성 검토된 그룹의 기존 대표를 수준 목록에 추가할 때는 membership-reviews 행에 `aliasGroupId: "alias-<대표ID>"`를 넣고 기존 참조와 같은 수준/원본해시 승인을 별도로 받아야 한다. `validateLegacyMembership`의 마지막 인수는 같은 원본으로 `buildReviewedAliases`가 검증한 그룹 목록이다. 같은 정규형의 원본 전부가 승인 그룹에 속해야 하고 비대표는 등록을 거부한다. 활성 목록·별칭 승인 변동은 원본 쓰기 전에도 재확인한다.

`alias-pilot-review.json`의 複雑은 equivalent-core-usage로 승인되어 `active-aliases.json`에서 활성화했다. 大切·簡単은 더 넓은 대표 의미로의 숙련도 이전을 보류한다. 생성/감사는 현재 원본 해시를 재검증하며 이전 원본 프로필은 v3 학습 백업에 보존한다. 원본 단어·예문·ID는 삭제하지 않는다. 자동/브라우저 검증 상태는 작업 원장과 위키를 따른다.

### 기존 예문의 명시적 개정

`revise-legacy-examples.mjs --prepare <proposal.json>` 뒤 독립 최종 draftHash 승인을 받아 `--apply <draft.json> <review.json>`으로만 반영한다. 제안은 items의 wordId/senseId/oldExample/proposedExample을 담는다. 독립 검토 전 proposedExample의 unreviewed 상태는 준비 단계에서 거부한다. 최종 검토는 scope=legacy-example-revision/outcome=accepted/model=gpt-6-astra/reasoningEffort=high/reviewedAt/draftHash/notes를 요구한다.

원본 단어·용법·ID·예문 개수는 불변이며 바뀐 예문의 버전만1 올린다. 별도 참조 게시/활성 별칭 대상은 이 경로에서 거부한다. revisions의 원본·승인·수정안 기록이 있어도 현재 콘텐츠 해시와 일치해야 적용 완료다. 이력은 먼저 보존하며 실제 파일 교체 실패는 같은 승인으로 재시도한다. 분류 입력 갱신과 관련 재검토 및 런타임 생성·감사는 후속 필수 단계다.

기존 입력 생성기는 이제 대표 예문 최소1개·기존 예문 보존 정책을 출력한다. 과거 입력에 남은 세번째 예문 요구는 역사적 문자열이며 현재 필수 작업이 아니다.

`node scripts/prepare-jlpt-legacy-fixes.mjs`는 참조 보류 원장과 현재 원본·사전 근거를 합친 읽기 전용 수정 입력 `output/jlpt/legacy-fix-candidates.json`을 만든다. 보류 당시 해시 일치 여부와 이미 참조 승인된 항목을 명시한다. 예문 정정, 같은 핵심 뜻의 메타데이터 정정, 중요한 별도 용법 추가, 별칭 판단, 근거 부족을 구분해 제안하며 이 생성기로 원본이나 승인을 바꾸지 않는다.

설명 정정·별도 용법 추가는 `revise-legacy-content.mjs --prepare <proposals.json>` 뒤 전체 초안에 대한 별도 Astra high 승인을 받아 `--apply <draft.json> <review.json>`으로 적용한다. scope=legacy-content-revision, draftHash/시각/메모와 `preservedCoreUsages` 각 행의 wordId/senseIds/decision=preserve-existing-core-usage/note가 필요하다. 기존 용법 ID/버전은 보존하고, 별도 용법은 새 ID/버전1이다. 원문/승인/결과를 content-revisions에 먼저 저장해 두 원본 파일의 부분 적용을 같은 승인으로만 복구한다. 현재 참조/활성 별칭 승인이 있는 단어는 별도 재검토 없이는 이 경로에서 바꾸지 않는다. 의미가 달라지는 정정에 기존 숙련도를 자동 승계하지 않는다.

## 확정 선정과 명시적 복구 (2026-10-01)

동일 핵심27그룹만 활성화했다. 미공개 중복 수준 참조2개(AbsoluteVerb_162 いる, AbsoluteVerb_239 見付ける)만 별도 독립 승인·현재 원격 공개 기준 대조·전후 이력으로 철회했다. 원본 ID·콘텐츠·프로필 및 나머지 상대 순서는 보존했다. 일반 가져오기의 추가 전용 규칙은 바꾸지 않았고 기존 공개 JLPTN3_115 참조를 유지했다. 이 좁은 복구를 일반 삭제 권한으로 사용하지 않는다.

다른 핵심의 같은 정규형은 모든 원본 현재 해시를 포함한 `duplicateSelection: distinct-core-usages-no-profile-transfer` 승인으로 대표 하나만 수준 목록에 선택한다. 활성 별칭과 겹치거나 원본이 바뀌면 거부한다. 이 선택은 원본/프로필을 변경하지 않는다. 消す·出来る·違う가 해당하며 추가 용법은 새 ID를 사용한다.

미선정 후보의 보류는 삭제나 전체 선정 미완료를 뜻하지 않는다. 현재 해시의 `final-selection-review.json`이 선정 범위와 실제 남은 누락을 별도로 판단한다.
