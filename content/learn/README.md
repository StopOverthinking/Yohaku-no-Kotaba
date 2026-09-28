# 문맥 회상 콘텐츠

기본·주제형 단어의 고정 학습 예문 원고와 검수 기록이다. 런타임에서 AI를 호출하지 않는다.

현재 수록·검수 결과는 [최종 검수 기록](final-review.md)과 [자동 검사 결과](final-audit.json)를 본다.

## 원고

`pilot.tsv`는 대표 40단어·80문장이다. `author-a.tsv`, `author-b.tsv`, `author-c.tsv`는 나머지 단어를 나누어 개별 작성한 원고다. 각 행은 다음 9개 열을 탭으로 구분한다.

`단어ID / 대표뜻 / 한국어 힌트 / 혼동 표현 / 구별 근거 / 일본어1 / 한국어1 / 일본어2 / 한국어2`

일본어의 `[활용형/읽기]`는 한 곳의 빈칸 경계이며, 한국어의 `[대응 표현]`은 번역 강조 구간이다. 목표 활용형은 어미까지 묶는다. 보조 표현을 문맥에 남길 때도 목표 단어의 어간만 가려서는 안 된다.

## 검수와 반영

1. 단어의 뜻·읽기·용법과 실제 혼동점을 먼저 확인한다. 둘 사이의 차이를 과장하지 않는다.
2. 두 장면의 목적·상황·전개가 다른지 읽는다. 인물·목적어만 바꾼 문장은 다시 쓴다.
3. 전체 원고를 가져오면 초안 상태로 들어간다.
4. 단어별, 혼동 표현별, 전체 다양성 검수를 각각 기록하고 수정한다.
5. 검수한 항목만 `learnContent.json`에서 검수 완료로 표시한다. 문법이나 자동 검사 통과만으로 완료 처리하지 않는다.
6. 런타임 데이터 생성 후 전체 무결성 검사와 실제 학습 화면을 확인한다.

```sh
node scripts/import-authored-content.mjs content/learn/pilot.tsv content/learn/author-a.tsv content/learn/author-b.tsv content/learn/author-c.tsv
node scripts/audit-learn-content.mjs --out=content/learn/final-audit.json --require-complete
node scripts/generate-vocab-data.mjs
npm test
npm run build
```

가져오기 도구는 최초 원고 통합용이다. 출시 후 수정은 에디터의 용법·예문 버전 관리를 사용한다. 원고 TSV만 고치면 런타임은 바뀌지 않는다.

자동 검사는 빈칸 문장의 완전 중복, 높은 문자 이웃쌍 유사도, 반복되는 도입·결말을 검토 대상으로 표시한다. 경고의 최종 처리는 검수 기록에 남긴다. 검수는 작성자 자체 검수와 다른 작성자의 교차 검수이며, 외부 일본어 원어민 감수 인증을 의미하지 않는다.
