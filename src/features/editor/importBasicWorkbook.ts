import type { EditorSnapshot } from './editorData'
import type { ParsedEditorWorkbook } from './editorSpreadsheet'
import { normalizeEditorSnapshot } from './editorSerializer'
import { normalizeSetMembership } from '@/features/vocab/model/setMembership'

/** Replace one workbook without taking ownership of another book's shared words. */
export function importBasicWorkbook(
  snapshot: EditorSnapshot,
  targetId: string,
  imported: Extract<ParsedEditorWorkbook, { mode: 'basic' }>,
): EditorSnapshot {
  const target = snapshot.sets.find((set) => set.id === targetId)
  if (!target) throw new Error('기본 단어장 없음')
  if (snapshot.sets.some((set) => set.id === imported.set.id && set.id !== targetId)) throw new Error('이미 존재하는 단어장 ID')
  const existing = new Map(snapshot.words.map((word) => [word.id, word]))
  const members = new Set(normalizeSetMembership(target, snapshot.words))
  const elsewhere = new Set(snapshot.sets.filter((set) => set.id !== targetId)
    .flatMap((set) => normalizeSetMembership(set, snapshot.words)))
  const incoming = new Map(imported.words.map((word) => [word.id, word]))
  if (incoming.size !== imported.words.length) throw new Error('중복 단어 ID')
  if ((target.membershipMode === 'explicit' || [...members].some((id) => elsewhere.has(id)))
    && imported.set.id !== targetId) throw new Error('공유 단어장의 ID는 유지해야 합니다')

  const removed = new Set(snapshot.words.filter((word) => word.setId === targetId && !incoming.has(word.id)).map((word) => word.id))
  if ([...removed].some((id) => elsewhere.has(id))) throw new Error('다른 단어장이 참조하는 단어는 삭제할 수 없습니다')
  for (const word of imported.words) {
    const old = existing.get(word.id)
    if (old && !members.has(word.id)) throw new Error('다른 단어장의 단어 ID와 충돌합니다')
    if (old && word.setId !== old.setId && !(old.setId === targetId && word.setId === imported.set.id)) {
      throw new Error('기존 단어의 소속은 유지해야 합니다')
    }
    if (!old && word.setId !== imported.set.id) throw new Error('참조할 원본 단어가 없습니다')
  }
  const words = snapshot.words.filter((word) => !removed.has(word.id)).map((word) => {
    const replacement = incoming.get(word.id)
    // Shared words keep their original owner's ordering as well as their ID.
    return replacement ? { ...replacement, sourceOrder: word.setId !== targetId ? word.sourceOrder : replacement.sourceOrder } : word
  })
  words.push(...imported.words.filter((word) => !existing.has(word.id)))
  const nextSet = { ...imported.set, order: target.order }
  return normalizeEditorSnapshot({
    ...snapshot,
    sets: snapshot.sets.map((set) => set.id === targetId ? nextSet : set),
    words,
    learnContent: imported.learnContent === undefined
      ? snapshot.learnContent?.filter((sense) => !removed.has(sense.wordId))
      : [...(snapshot.learnContent ?? []).filter((sense) => !removed.has(sense.wordId) && !incoming.has(sense.wordId)), ...imported.learnContent],
  })
}
