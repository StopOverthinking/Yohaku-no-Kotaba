import fs from 'node:fs'
import { hashContent } from './lib/jlpt-pilot.mjs'

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const baseline = read('content/jlpt/benchmarks/2026-09-30-baseline.json')
const qualityPath = 'content/jlpt/benchmarks/2026-09-30-quality.json'
const quality = fs.existsSync(qualityPath) ? read(qualityPath) : null
const milliseconds = (a, b) => Date.parse(b) - Date.parse(a)
const seconds = (a, b) => Math.round(milliseconds(a, b) / 100) / 10
const parts = [], checks = [], files = [], workers = []
const batchIds = ['n2-002', 'n1-002']
for (const batch of batchIds) {
  const dir = `content/jlpt/batches/${batch}`
  const timing = read(`${dir}/timing.json`)
  const segments = timing.segments ?? timing.batches
  const finalGeneratedAt = segments.map(s => s.validationCompletedAt ?? s.checksCompletedAt).filter(Boolean).sort().at(-1)
  const workerCompletedAt = timing.completedAt ?? timing.endedAt
  workers.push({ batch, startedAt: timing.startedAt, finalGeneratedAt, completedAt: workerCompletedAt ?? null,
    elapsedSeconds: workerCompletedAt || finalGeneratedAt ? seconds(timing.startedAt, workerCompletedAt ?? finalGeneratedAt) : null,
    generationRevisionAttempts: segments.reduce((n, s) => n + (s.revisionAttempts ?? 0), 0),
    generationObservedErrors: segments.reduce((n, s) => n + (s.observedErrors ?? s.errorCount ?? 0), 0),
    preparationObservations: segments.filter(s => s.preparationErrorNote).map(s => ({ part: s.fileNumber ?? s.index, reportedErrors: s.preparationErrors, note: s.preparationErrorNote })) })
  const reviewTiming = fs.existsSync(`${dir}/review-timing.json`) ? read(`${dir}/review-timing.json`) : []
  const logs = fs.readFileSync(`${dir}/preflight.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s))
  checks.push(...logs)
  for (const file of fs.readdirSync(dir).filter(f => /^(words|examples|review|corrections)-\d+\.(json|txt)$/.test(f))) files.push({ batch, file, bytes: fs.statSync(`${dir}/${file}`).size })
  for (const segment of segments) {
    const index = segment.fileNumber ?? segment.index
    const generatedAt = segment.validationCompletedAt ?? segment.checksCompletedAt
    if (!generatedAt) continue
    const review = reviewTiming.find(r => r.index === index)
    const words = read(`${dir}/words-${index}.json`)
    const exampleCount = fs.readFileSync(`${dir}/examples-${index}.txt`, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('@')).length
    const receiptPath = `${dir}/review-${index}.json`
    const receipt = fs.existsSync(receiptPath) ? read(receiptPath) : null
    parts.push({ batch, index, words: words.length, examples: exampleCount, startedAt: segment.startedAt,
      metadataCompletedAt: segment.metadataCompletedAt, generatedAt,
      generationSeconds: seconds(segment.startedAt, generatedAt),
      reviewStartedAt: review?.startedAt ?? null, reviewedAt: review?.completedAt ?? null,
      reviewSeconds: review?.completedAt ? seconds(review.startedAt, review.completedAt) : null,
      queueSeconds: review?.startedAt && Date.parse(review.startedAt) >= Date.parse(generatedAt) ? seconds(generatedAt, review.startedAt) : null,
      queueNote: review?.startedAt && Date.parse(review.startedAt) < Date.parse(generatedAt) ? 'Reviewer began before author final completion bookkeeping; exact ready-to-review time unavailable.' : null,
      approvedWords: receipt?.entries?.length ?? 0,
      correctedWordIds: [...new Set((receipt?.corrections ?? []).map(c => c.wordId))],
      substantiveCorrections: review?.completedAt ? (review.correctionBreakdown?.substantiveItems ?? review.correctedItems) : 0,
      clarityCorrections: review?.correctionBreakdown?.clarityItems ?? 0,
      formattingOnlyCorrections: review?.correctionBreakdown?.formattingOnlyItems ?? 0,
      generationRevisionAttempts: segment.revisionAttempts, generationObservedErrors: segment.observedErrors ?? segment.errorCount })
  }
}
const words = read('src/features/vocab/editor-data/vocabularyWords.json')
const senses = read('src/features/vocab/editor-data/learnContent.json')
const wordMap = new Map(words.map(w => [w.id, w])), senseMap = new Map(senses.map(s => [s.id, s]))
const preservedWords = Object.entries(baseline.preservedWordHashes).every(([id, hash]) => wordMap.has(id) && hashContent(wordMap.get(id)) === hash)
const preservedSenses = Object.entries(baseline.preservedSenseHashes).every(([id, hash]) => senseMap.has(id) && hashContent(senseMap.get(id)) === hash)
const benchmarkWords = batchIds.flatMap(batch => fs.readdirSync(`content/jlpt/batches/${batch}`).filter(f => /^words-\d+\.json$/.test(f)).flatMap(f => read(`content/jlpt/batches/${batch}/${f}`)))
const publishedWords = benchmarkWords.filter(w => wordMap.has(`lex-${w.dictionaryId}`)).length
const start = parts.map(p => p.startedAt).sort()[0]
const generatedEnd = parts.map(p => p.generatedAt).sort().at(-1)
const reviewedEnd = parts.map(p => p.reviewedAt).filter(Boolean).sort().at(-1)
const productionEnd = quality?.completedAt ?? reviewedEnd
const approved = parts.reduce((n, p) => n + p.approvedWords, 0)
const corrected = new Set(parts.flatMap(p => p.correctedWordIds)).size
const substantiveCorrections = parts.reduce((n, p) => n + p.substantiveCorrections, 0)
const generated = parts.reduce((n, p) => n + p.words, 0)
const examples = parts.reduce((n, p) => n + p.examples, 0)
const measuredAt = new Date().toISOString()
const eventsPath = 'content/jlpt/benchmarks/2026-09-30-events.jsonl'
const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(s => JSON.parse(s))
const finishedAt = events.find(e => e.event === 'benchmark-completed')?.at ?? null
const integratedStart = events.find(e => e.event === 'integration-started')?.at
const integratedEnd = events.find(e => e.event === 'integration-completed')?.at
const testResult = events.find(e => e.event === 'tests-passed')
const report = { measuredAt, requestedWords: 200, generatedWords: generated, approvedWords: approved, publishedWords,
  finishedAt,
  examples, correctedWords: corrected, correctionRate: approved ? corrected / approved : null,
  substantiveCorrections, substantiveCorrectionRate: approved ? substantiveCorrections / approved : null,
  clarityCorrections: parts.reduce((n, p) => n + p.clarityCorrections, 0),
  formattingOnlyCorrections: parts.reduce((n, p) => n + p.formattingOnlyCorrections, 0),
  measurementWallSeconds: seconds(baseline.startedAt, finishedAt ?? measuredAt),
  integrationSeconds: integratedStart && integratedEnd ? seconds(integratedStart, integratedEnd) : null,
  tests: testResult ?? null, buildPassed: events.some(e => e.event === 'build-passed'),
  productionWallSeconds: approved === 200 && start && productionEnd ? seconds(start, productionEnd) : null,
  generationWallSeconds: start && generatedEnd ? seconds(start, generatedEnd) : null,
  generationWorkerSeconds: Math.round(parts.reduce((n, p) => n + p.generationSeconds, 0) * 10) / 10,
  generationWorkerSpansSeconds: Math.round(workers.reduce((n, w) => n + (w.elapsedSeconds ?? 0), 0) * 10) / 10,
  reviewWorkerSeconds: Math.round(parts.reduce((n, p) => n + (p.reviewSeconds ?? 0), 0) * 10) / 10,
  approvedWordsPerMinute: approved === 200 && start && productionEnd ? Math.round(approved / (milliseconds(start, productionEnd) / 60000) * 100) / 100 : null,
  automatedChecks: { runs: checks.length, milliseconds: Math.round(checks.reduce((n, c) => n + c.milliseconds, 0)), errorOccurrences: checks.reduce((n, c) => n + c.issues.length, 0) },
  bytes: Object.fromEntries(['words', 'examples', 'review', 'corrections'].map(type => [type, files.filter(f => f.file.startsWith(type + '-')).reduce((n, f) => n + f.bytes, 0)])),
  priorThreeExamplePlan: { examplesFor200Words: 600, examplesForGeneratedWords: generated * 3, actualExamples: examples, difference: generated * 3 - examples, note: 'Work quantity comparison only, not measured speed or token savings.' },
  preservation: { words: Object.keys(baseline.preservedWordHashes).length, senses: Object.keys(baseline.preservedSenseHashes).length, preservedWords, preservedSenses },
  carryoverOutsideBenchmark: { batch: 'n3-005/01', words: 30, examples: 90, note: 'Previously authored and reviewed; excluded from benchmark counts/timing.' },
  complete: generated === 200 && approved === 200 && publishedWords === 200 && preservedWords && preservedSenses,
  tokenUsage: null, cost: null,
  limitations: ['No comparable prior stage timing; no speedup ratio claimed.', 'Elapsed worker time includes tool calls and coordination, not pure model compute.', 'Parallel worker intervals overlap; do not add them to wall time.', 'Artifact bytes are not token usage or monetary cost.', 'N2/N1 sample and 1-example policy differ from earlier 3-example batches.'],
  workers, parts, events }
fs.writeFileSync('content/jlpt/benchmarks/2026-09-30-result.json', JSON.stringify(report, null, 2) + '\n')
const duration = value => value == null ? '—' : `${Math.floor(value / 60)}분 ${Math.round(value % 60)}초`
const markdown = `# 생산 효율 개선 측정 결과 — 2026-09-30

측정 대상: N2 100개 + N1 100개. 생성 GPT-6.1 Sol medium 2명, 전량 검토 GPT-6 Astra high 1명.
상태: ${report.complete ? '측정 대상 200개 로컬 반영 완료. 전체 12,000개 확충 목표는 미완료.' : '측정 진행 중.'}

## 적용한 다섯 가지 변경

1. 두 생성 담당이 각자 단어 정보와 예문까지 완성하여 중간 전달을 줄였다.
2. 전량 독립 검토는 유지하고, 정상 항목은 간결한 승인 목록으로 저장했다. 해시·모델·시각은 프로그램이 기록한다.
3. 예문 작성 전 중복·사전 연결·품사·필수 정보 검사를 한다. 첫 묶음들은 같은 작성 패스였고, N2/02 및 N1/03부터 실제로 단계를 분리했다.
4. 기존 어휘 정리와 추가 기반 개발은 생산 담당의 업무에서 제외했다. 필요한 정책·도구 정비는 root가 병행했다.
5. 대표 예문 1개를 기본으로 하고 필요한 별도 쓰임만 추가한다. 기존 예문은 삭제하지 않는다.

## 시간과 작업량

| 지표 | 결과 |
| --- | ---: |
| 계측 구간 전체 경과 | ${duration(report.measurementWallSeconds)} |
| 생성 시작 → 전량 검토·최종 콘텐츠 감사 경과 | ${duration(report.productionWallSeconds)} |
| N2 생성 경과 | ${duration(workers.find(w => w.batch === 'n2-002').elapsedSeconds)} |
| N1 생성 경과 | ${duration(workers.find(w => w.batch === 'n1-002').elapsedSeconds)} |
| 검토 구간 합계 | ${duration(report.reviewWorkerSeconds)} |
| 반영·전량 구조 감사 | ${duration(report.integrationSeconds)} |
| 승인 처리량 | ${report.approvedWordsPerMinute ?? '—'}단어/분 |
| 생성 / 승인 / 로컬 반영 | ${generated} / ${approved} / ${publishedWords}단어 |
| 예문 | ${examples}개 |
| 내용·자연스러움 수정 | ${substantiveCorrections}개 (${approved ? (substantiveCorrections / approved * 100).toFixed(1) : '—'}%) |
| 표현 명료화 | ${report.clarityCorrections}개 |
| 형식만 정리 | ${report.formattingOnlyCorrections}개 |
| 사전/원고 자동 검사 | ${checks.length}회, 합계 ${(report.automatedChecks.milliseconds / 1000).toFixed(2)}초 |

생성과 검토, 도구 준비는 동시에 진행됐다. 담당별 시간을 더하면 사용자가 기다린 시간이 되지 않는다. 생성 경과에는 후보 탐색·작성·검사·조율이 포함되며 순수 모델 연산 시간은 측정하지 못했다.

종전의 일괄 3예문 기준이면 200단어에 600예문이 필요하다. 이번 실제 작성은 ${examples}개다. 이는 **작성 대상 수의 비교**이며 작업 속도·토큰·비용이 같은 비율로 줄었다는 뜻은 아니다.

## 묶음별 기록

| 수준/묶음 | 단어 | 생성 구간 | 검토 시작까지 대기 | 검토 구간 | 내용 수정 |
| --- | ---: | ---: | ---: | ---: | ---: |
${parts.map(p => `| ${p.batch}/${p.index} | ${p.words} | ${duration(p.generationSeconds)} | ${duration(p.queueSeconds)} | ${duration(p.reviewSeconds)} | ${p.substantiveCorrections} |`).join('\n')}

N2/03에서는 후보 조회·실행 오류와 기존 표제어 중복 후보 3개 교체가 있었다. 예문 작성 전에 걸러냈으며 해당 시간도 측정에 포함했다. N1/01의 형식만 정리한 22개는 내용 오류에 포함하지 않았고 이후 불필요한 형식 강제를 중단했다.

## 보존과 측정 범위

기존 ${report.preservation.words}단어·${report.preservation.senses}용법의 전체 내용 해시 보존: ${preservedWords && preservedSenses ? '확인' : '미확인/불일치'}. 이미 있던 예문과 ID·버전을 보존했다.
이전에 작성·검토한 N3/005/01의 30단어·90예문은 별도 이월분이며 이번 200개 생성 실적에서 제외했다.

전체 자동 테스트: ${testResult ? `${testResult.files}파일·${testResult.tests}개 통과 (${testResult.durationSeconds}초)` : '대기'}. 빌드: ${report.buildPassed ? '통과(기존 대형 번들 경고는 남아 있음)' : '대기'}. 전체 12,000개 실제 기기 성능 검증 및 게시 완료를 의미하지 않는다.

이전 작업에는 같은 조건의 단계별 계측이 없고, 이번 표본은 N2/N1·기본 1예문이다. 따라서 이전 대비 속도 향상 배수는 산출하지 않는다. 토큰 사용량·금액은 별도 확인 가능한 계측값이 없어 보고하지 않는다. 파일 바이트를 토큰이나 비용으로 환산하지 않는다.

원시 자료: [측정 결과](2026-09-30-result.json), [시작 기준본](2026-09-30-baseline.json), [단계 기록](2026-09-30-events.jsonl). 개별 작성·검토 시각은 각 배치의 timing.json 및 review-timing.json에 보존한다.
`
fs.writeFileSync('content/jlpt/benchmarks/2026-09-30-report.md', markdown)
console.log(JSON.stringify({ ...report, parts: parts.length, events: events.length }, null, 2))
