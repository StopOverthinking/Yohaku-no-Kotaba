// Generates a small VOICEVOX listening sample from reviewed example sentences.
// Runs against a VOICEVOX engine (e.g. the Docker CPU image in CI); no npm dependencies.
//
//   node scripts/voicevox/generate-samples.mjs --count 20 --out voicevox-samples
//
// Output: <out>/wav/<exampleId>.wav, <out>/query/<exampleId>.json (accent data for later fixes),
// <out>/samples.json and <out>/index.html for listening and accent review.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]])
    return pairs
  }, []),
)
const engine = (args.engine ?? 'http://127.0.0.1:50021').replace(/\/$/, '')
const count = Number(args.count ?? 20)
const outDir = path.resolve(args.out ?? 'voicevox-samples')
const speakerName = args.speaker ?? 'ずんだもん'
const styleName = args.style ?? 'ノーマル'

async function request(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${response.status} ${await response.text()}`)
  return response
}

async function findStyleId() {
  const speakers = await (await request(`${engine}/speakers`)).json()
  const speaker = speakers.find((entry) => entry.name === speakerName)
  const style = speaker?.styles.find((entry) => entry.name === styleName)
  if (!style) throw new Error(`Style not found: ${speakerName} / ${styleName}. Available: ${speakers.map((s) => s.name).join(', ')}`)
  return { id: style.id, version: (await (await request(`${engine}/version`)).text()).replace(/"/g, '') }
}

// Spread the sample across the difficulty range so easy and hard sentences are both heard.
function pickExamples(senses) {
  const examples = senses.flatMap((sense) =>
    sense.examples.filter((example) => example.status === 'reviewed').map((example) => ({ sense, example })),
  )
  examples.sort((a, b) => a.example.difficulty - b.example.difficulty || a.example.id.localeCompare(b.example.id))
  const picked = []
  for (let i = 0; i < count; i += 1) picked.push(examples[Math.floor(((i + 0.5) * examples.length) / count)])
  return picked
}

// Kana with a ＼ where pitch falls inside an accent phrase; | separates phrases.
// VOICEVOX uses accent === mora count for phrases without an internal fall (flat or final-mora accent).
function accentNotation(query) {
  return query.accent_phrases
    .map((phrase) => {
      const moras = phrase.moras.map((mora, index) => mora.text + (index + 1 === phrase.accent && index + 1 < phrase.moras.length ? '＼' : ''))
      return moras.join('') + (phrase.is_interrogative ? '？' : '') + (phrase.pause_mora ? ' ' : '')
    })
    .join('|')
}

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// --render-only true: rebuild accents and index.html from an existing output (e.g. a downloaded artifact).
if (args['render-only']) {
  const { summary, samples } = JSON.parse(await readFile(path.join(outDir, 'samples.json'), 'utf8'))
  for (const sample of samples) {
    sample.accent = accentNotation(JSON.parse(await readFile(path.join(outDir, 'query', `${sample.exampleId}.json`), 'utf8')))
  }
  await writeOutput(summary, samples)
  process.exit(0)
}

const senses = JSON.parse(await readFile(path.resolve('src/features/vocab/editor-data/learnContent.json'), 'utf8'))
const style = await findStyleId()
await mkdir(path.join(outDir, 'wav'), { recursive: true })
await mkdir(path.join(outDir, 'query'), { recursive: true })

const samples = []
const started = performance.now()
for (const { sense, example } of pickExamples(senses)) {
  const text = `${example.before}${example.answer}${example.after}`
  const t0 = performance.now()
  const query = await (await request(`${engine}/audio_query?speaker=${style.id}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json()
  const wav = Buffer.from(
    await (
      await request(`${engine}/synthesis?speaker=${style.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      })
    ).arrayBuffer(),
  )
  const seconds = (performance.now() - t0) / 1000
  await writeFile(path.join(outDir, 'wav', `${example.id}.wav`), wav)
  await writeFile(path.join(outDir, 'query', `${example.id}.json`), `${JSON.stringify(query, null, 2)}\n`)
  const audioSeconds = (wav.length - 44) / (query.outputSamplingRate * 2)
  samples.push({
    exampleId: example.id,
    exampleVersion: example.version,
    senseId: sense.id,
    difficulty: example.difficulty,
    text,
    translation: example.translation,
    accent: accentNotation(query),
    kana: query.kana,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    synthSeconds: Number(seconds.toFixed(2)),
  })
  console.log(`${example.id}\t${seconds.toFixed(2)}s\t${text}`)
}

const totalSynth = (performance.now() - started) / 1000
const totalAudio = samples.reduce((sum, s) => sum + s.audioSeconds, 0)
const summary = {
  engineVersion: style.version,
  speaker: `${speakerName} / ${styleName}`,
  styleId: style.id,
  count: samples.length,
  totalAudioSeconds: Number(totalAudio.toFixed(1)),
  totalSynthSeconds: Number(totalSynth.toFixed(1)),
  realTimeFactor: Number((totalSynth / totalAudio).toFixed(3)),
}
await writeOutput(summary, samples)
console.log(JSON.stringify(summary))

async function writeOutput(summary, samples) {
await writeFile(path.join(outDir, 'samples.json'), `${JSON.stringify({ summary, samples }, null, 2)}\n`)

const rows = samples
  .map(
    (s, i) => `<tr><td>${i + 1}</td><td><div lang="ja" class="ja">${escapeHtml(s.text)}</div><div class="ko">${escapeHtml(s.translation)}</div>
<div lang="ja" class="accent">${escapeHtml(s.accent)}</div></td><td><audio controls preload="none" src="audio/${s.exampleId}.m4a"></audio></td></tr>`,
  )
  .join('\n')
await writeFile(
  path.join(outDir, 'index.html'),
  `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOICEVOX 시험 생성</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;max-width:960px}table{border-collapse:collapse;width:100%}td{border-top:1px solid #ddd;padding:10px 6px;vertical-align:top}
.ja{font-size:1.2rem}.ko{color:#666;font-size:.9rem}.accent{color:#2a5bd7;font-size:.95rem;margin-top:4px}audio{width:240px}</style>
<h1>VOICEVOX:${escapeHtml(speakerName)} 시험 생성</h1>
<p>${escapeHtml(summary.speaker)} · 엔진 ${escapeHtml(summary.engineVersion)} · ${summary.count}문장 · 음성 ${summary.totalAudioSeconds}초 · 생성 ${summary.totalSynthSeconds}초 (RTF ${summary.realTimeFactor})<br>
파란 줄: 엔진이 추정한 악센트(＼ = 음이 내려가는 곳, | = 악센트 구 경계)</p>
<table>${rows}</table></html>
`,
)
}
