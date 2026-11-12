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
    (s, i) => `<tr data-id="${escapeHtml(s.exampleId)}"><td class="n">${i + 1}</td><td><div lang="ja" class="ja">${escapeHtml(s.text)}</div><div class="ko">${escapeHtml(s.translation)}</div>
<div lang="ja" class="accent">${s.accent
      .split('|')
      .map((phrase, index) => `<button type="button" class="ph" data-i="${index}" aria-pressed="false">${escapeHtml(phrase.trim())}</button>`)
      .join('<span class="sep">|</span>')}</div>
<div class="detail" hidden><button type="button" class="kind" data-k="pitch" aria-pressed="false">높낮이</button><button type="button" class="kind" data-k="length" aria-pressed="false">장단</button><input class="note" type="text" placeholder="메모 (선택)"></div></td>
<td class="play"><button type="button" class="vv" data-src="audio/${s.exampleId}.m4a">${escapeHtml(speakerName)}</button><button type="button" class="tts" data-text="${escapeHtml(s.text)}">브라우저</button><br><button type="button" class="flag" aria-pressed="false" title="어색함 표시">어색</button></td></tr>`,
  )
  .join('\n')
await writeFile(
  path.join(outDir, 'index.html'),
  `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VOICEVOX 비교</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px;max-width:960px;background:#fff;color:#1b1b1a}
table{border-collapse:collapse;width:100%}td{border-top:1px solid #ddd;padding:10px 6px;vertical-align:top}
.n{color:#999;width:1.5em}.ja{font-size:1.2rem}.ko{color:#666;font-size:.9rem}.accent{color:#2a5bd7;font-size:.95rem;margin-top:4px}
.play{white-space:nowrap}button{font:inherit;font-size:.9rem;padding:8px 12px;margin:0 4px 4px 0;border-radius:999px;border:1px solid #ccc;background:#f5f3ee;cursor:pointer}
button.vv{border-color:#7cbf6a}button.tts{border-color:#7a9be0}button[aria-pressed=true]{background:#1b1b1a;color:#fff}button:disabled{opacity:.4;cursor:default}
.bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:.9rem}
select{font:inherit;font-size:.9rem;max-width:100%}.muted{color:#666}
.accent{display:flex;flex-wrap:wrap;align-items:center;gap:2px}.sep{color:#bbb}
button.ph{padding:2px 6px;margin:0;border:1px solid transparent;border-radius:6px;background:none;color:#2a5bd7;font-size:.95rem}
button.ph:hover{border-color:#cfd9f3}button.ph[aria-pressed=true]{background:#fde8e3;border-color:#e2725b;color:#b3361b}
button.flag[aria-pressed=true]{background:#e2725b;border-color:#e2725b;color:#fff}tr.marked{background:#fff7f4}
.detail:not([hidden]){display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.detail button{margin:0;padding:4px 10px}
button.kind[aria-pressed=true]{background:#b3361b;border-color:#b3361b;color:#fff}
.note{flex:1 1 12em;min-width:0;font:inherit;font-size:.9rem;padding:6px 8px;border:1px solid #ddd;border-radius:8px}
.count{font-weight:700;color:#b3361b}
</style>
<h1>VOICEVOX:${escapeHtml(speakerName)} ↔ 브라우저 음성</h1>
<p class="muted">${escapeHtml(summary.speaker)} · 엔진 ${escapeHtml(summary.engineVersion)} · ${summary.count}문장 · 음성 ${summary.totalAudioSeconds}초 · 생성 ${summary.totalSynthSeconds}초 (RTF ${summary.realTimeFactor})<br>
파란 줄: VOICEVOX가 추정한 악센트(＼ = 음이 내려가는 곳, | = 악센트 구 경계). 브라우저 음성은 앱의 예문 듣기와 같은 음성·속도를 기본으로 고릅니다.</p>
<div class="bar">
<label>브라우저 음성 <select id="voice"></select></label>
<label>속도 <select id="rate"><option value="1">1.0</option><option value="0.9" selected>0.9 (앱)</option><option value="0.8">0.8</option></select></label>
<label><input type="checkbox" id="both"> 이어서 둘 다 듣기</label>
<span>어색 <span class="count" id="count">0</span></span>
<button type="button" id="copy">복사</button><button type="button" id="save">파일</button>
</div>
<p class="muted">어색한 문장은 <b>어색</b>을 누르고, 이상하게 들리는 구(파란 가나)와 유형(높낮이·장단)을 눌러 표시하세요. 표시는 이 브라우저에 저장되며, 복사한 내용을 대화창에 붙여 넣으면 됩니다.</p>
<table>${rows}</table>
<script>
// Same ranking as v2/src/lib/useSpeech.ts so the default matches the app.
const RANK = [/natural|neural/i, /enhanced|premium/i, /google/i, /online/i]
const norm = (lang) => lang.replace('_', '-').toLowerCase()
const score = (v) => { const r = RANK.findIndex((p) => p.test(v.name)); return (r < 0 ? 0 : RANK.length - r) * 2 + (norm(v.lang) === 'ja-jp' ? 1 : 0) }
const voiceSelect = document.getElementById('voice'), rateSelect = document.getElementById('rate'), both = document.getElementById('both')
const synth = window.speechSynthesis
let voices = []
function loadVoices() {
  if (!synth) return
  const kept = voiceSelect.value
  voices = synth.getVoices().filter((v) => norm(v.lang).startsWith('ja')).sort((a, b) => score(b) - score(a))
  voiceSelect.innerHTML = voices.length ? voices.map((v, i) => '<option value="' + i + '">' + v.name + '</option>').join('') : '<option>일본어 음성 없음</option>'
  const again = voices.findIndex((v) => v.name === kept)
  if (again >= 0) voiceSelect.value = String(again)
  document.querySelectorAll('button.tts').forEach((b) => (b.disabled = !voices.length))
}
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices) } else loadVoices()

const audio = new Audio()
let active = null
function stop() {
  audio.pause(); audio.onended = null
  // Chrome can drop an utterance queued right after cancel(), so only clear real leftovers.
  if (synth && (synth.speaking || synth.pending)) synth.cancel()
  if (active) active.setAttribute('aria-pressed', 'false')
  active = null
}
function mark(button) { active = button; button.setAttribute('aria-pressed', 'true') }
function playVoicevox(button, then) {
  mark(button)
  audio.src = button.dataset.src
  audio.playbackRate = Number(rateSelect.value)
  audio.preservesPitch = true
  audio.onended = () => { button.setAttribute('aria-pressed', 'false'); active = null; then?.() }
  audio.play().catch(() => stop())
}
function playBrowser(button, then) {
  const voice = voices[Number(voiceSelect.value)]
  if (!voice) return
  mark(button)
  const u = new SpeechSynthesisUtterance(button.dataset.text)
  u.voice = voice; u.lang = voice.lang; u.rate = Number(rateSelect.value)
  u.onend = u.onerror = () => { if (active !== button) return; button.setAttribute('aria-pressed', 'false'); active = null; then?.() }
  synth.speak(u)
}
document.querySelector('table').addEventListener('click', (event) => {
  const button = event.target.closest('button.vv, button.tts')
  if (!button) return
  const wasActive = active === button
  stop()
  if (wasActive) return
  const row = button.closest('tr')
  const other = row.querySelector(button.classList.contains('vv') ? 'button.tts' : 'button.vv')
  const next = both.checked && !other.disabled ? () => setTimeout(() => (other.classList.contains('vv') ? playVoicevox : playBrowser)(other), 400) : undefined
  ;(button.classList.contains('vv') ? playVoicevox : playBrowser)(button, next)
})

// Awkwardness marks: { [exampleId]: { phrases: number[], kinds: ('pitch'|'length')[], note: string } }, kept in this browser only.
const blank = () => ({ phrases: [], kinds: [], note: '' })
const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
const META = ${JSON.stringify({ speaker: summary.speaker, engineVersion: summary.engineVersion }).replace(/</g, '\\u003c')}
const STORE_KEY = 'voicevox-feedback:' + META.speaker + ':' + META.engineVersion
let marks = {}
try { marks = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {} } catch { marks = {} }
const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(marks)) } catch {} }
const rowsById = new Map([...document.querySelectorAll('tr[data-id]')].map((tr) => [tr.dataset.id, tr]))
function paint(tr) {
  const mark = marks[tr.dataset.id]
  tr.classList.toggle('marked', Boolean(mark))
  tr.querySelector('.flag').setAttribute('aria-pressed', String(Boolean(mark)))
  tr.querySelectorAll('button.ph').forEach((b) => b.setAttribute('aria-pressed', String(Boolean(mark?.phrases.includes(Number(b.dataset.i))))))
  tr.querySelectorAll('button.kind').forEach((b) => b.setAttribute('aria-pressed', String(Boolean(mark?.kinds.includes(b.dataset.k)))))
  tr.querySelector('.detail').hidden = !mark
  const note = tr.querySelector('.note')
  if (document.activeElement !== note) note.value = mark?.note ?? ''
  document.getElementById('count').textContent = String(Object.keys(marks).length)
}
for (const [id, tr] of rowsById) {
  if (marks[id]) marks[id] = { ...blank(), ...marks[id] }
  paint(tr)
}
document.querySelector('table').addEventListener('click', (event) => {
  const button = event.target.closest('button.flag, button.ph, button.kind')
  if (!button) return
  const tr = button.closest('tr'), id = tr.dataset.id
  if (button.classList.contains('flag')) {
    if (marks[id]) delete marks[id]
    else marks[id] = blank()
  } else if (button.classList.contains('kind')) {
    marks[id].kinds = toggleIn(marks[id].kinds, button.dataset.k)
  } else {
    const mark = (marks[id] ??= blank())
    mark.phrases = toggleIn(mark.phrases, Number(button.dataset.i)).sort((a, b) => a - b)
  }
  persist(); paint(tr)
  if (marks[id] && button.classList.contains('flag')) tr.querySelector('.note').focus()
})
document.querySelector('table').addEventListener('input', (event) => {
  if (!event.target.classList.contains('note')) return
  const id = event.target.closest('tr').dataset.id
  if (marks[id]) { marks[id].note = event.target.value; persist(); document.getElementById('count').textContent = String(Object.keys(marks).length) }
})
function exportText() {
  const marked = [...rowsById].filter(([id]) => marks[id]).map(([id, tr]) => {
    const phrases = [...tr.querySelectorAll('button.ph')]
    return {
      exampleId: id,
      text: tr.querySelector('.ja').textContent,
      accent: phrases.map((b) => b.textContent).join('|'),
      awkwardPhrases: marks[id].phrases.map((i) => phrases[i]?.textContent).filter(Boolean),
      kinds: marks[id].kinds,
      note: marks[id].note.trim(),
    }
  })
  return JSON.stringify({ ...META, marked }, null, 2)
}
function flash(button, label) { const old = button.textContent; button.textContent = label; setTimeout(() => (button.textContent = old), 1200) }
document.getElementById('copy').addEventListener('click', async (event) => {
  const text = exportText()
  try { await navigator.clipboard.writeText(text); flash(event.target, '복사됨') }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(area); area.select()
    const ok = document.execCommand('copy'); area.remove(); flash(event.target, ok ? '복사됨' : '실패')
  }
})
document.getElementById('save').addEventListener('click', () => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([exportText()], { type: 'application/json' })), download: 'voicevox-feedback.json' })
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
})
</script>
</html>
`,
)
}
