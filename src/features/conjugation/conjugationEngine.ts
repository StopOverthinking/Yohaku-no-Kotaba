import type { VocabularyWord } from '@/features/vocab/model/types'
import {
  conjugateWord,
  getConjugationFormLabel,
  getVerbGroup,
  isConjugationEligible,
} from '@/features/conjugation/conjugationRules'
import type {
  ConjugationAttempt,
  ConjugationForm,
  ConjugationFormStat,
  ConjugationQuestion,
  ConjugationResult,
  ConjugationSessionRecord,
  StartConjugationSessionPayload,
} from '@/features/conjugation/conjugationTypes'
import { shuffleArray } from '@/lib/random'

export function getEligibleConjugationWords(words: VocabularyWord[]) {
  return words.filter((word) => isConjugationEligible(word))
}

export function buildConjugationQuestion(word: VocabularyWord, form: ConjugationForm, promptMode: 'japanese' | 'meaning'): ConjugationQuestion | null {
  const group = getVerbGroup(word)
  const outcome = conjugateWord(word, form)
  if (!group || !outcome) return null

  return {
    id: `${word.id}:${form}:${promptMode}`,
    wordId: word.id,
    dictionaryForm: word.japanese,
    reading: word.reading,
    meaning: word.meaning,
    verbGroup: group,
    form,
    formLabel: getConjugationFormLabel(form),
    promptMode,
    promptText: word.japanese,
    supportText: word.meaning,
    correctAnswer: outcome.japanese,
    readingAnswer: outcome.reading !== outcome.japanese ? outcome.reading : null,
    acceptedAnswers: outcome.acceptedAnswers,
    explanation: outcome.explanation,
  }
}

export function buildConjugationQuestionPool(
  words: VocabularyWord[],
  forms: ConjugationForm[],
  promptMode: 'japanese' | 'meaning',
) {
  const pool: ConjugationQuestion[] = []

  for (const word of getEligibleConjugationWords(words)) {
    for (const form of forms) {
      const question = buildConjugationQuestion(word, form, promptMode)
      if (question) {
        pool.push(question)
      }
    }
  }

  return pool
}

function buildQuestionGroups(
  words: VocabularyWord[],
  forms: ConjugationForm[],
  promptMode: 'japanese' | 'meaning',
) {
  return forms.map((form, index) => ({
    form,
    questions: shuffleArray(
      getEligibleConjugationWords(words)
        .map((word) => buildConjugationQuestion(word, form, promptMode))
        .filter((question): question is ConjugationQuestion => question !== null),
      Date.now() + index,
    ),
  }))
}

function normalizeRequestedCount(requestedCount: number) {
  return Math.max(1, Math.floor(requestedCount) || 1)
}

function getAllocatedQuestionCounts(
  words: VocabularyWord[],
  forms: ConjugationForm[],
  promptMode: 'japanese' | 'meaning',
  requestedCount: number,
) {
  const selectedForms = [...new Set(forms)]
  if (selectedForms.length === 0) {
    return {
      groups: [] as Array<{ form: ConjugationForm; questions: ConjugationQuestion[] }>,
      targetCount: 0,
      allocatedCounts: [] as number[],
    }
  }

  const groups = buildQuestionGroups(words, selectedForms, promptMode)
  const totalAvailableCount = groups.reduce((count, group) => count + group.questions.length, 0)
  if (totalAvailableCount === 0) {
    return {
      groups,
      targetCount: 0,
      allocatedCounts: groups.map(() => 0),
    }
  }

  const targetCount = Math.min(normalizeRequestedCount(requestedCount), totalAvailableCount)
  const minimumAvailableCount = Math.min(...groups.map((group) => group.questions.length))
  const baseCount = Math.min(minimumAvailableCount, Math.floor(targetCount / selectedForms.length))
  const allocatedCounts = groups.map(() => baseCount)

  let remainingCount = targetCount - baseCount * selectedForms.length
  let roundSeed = Date.now() + targetCount

  while (remainingCount > 0) {
    const availableIndexes = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group, index }) => allocatedCounts[index] < group.questions.length)
      .map(({ index }) => index)

    if (availableIndexes.length === 0) break

    for (const index of shuffleArray(availableIndexes, roundSeed)) {
      if (remainingCount === 0) break
      if (allocatedCounts[index] >= groups[index].questions.length) continue

      allocatedCounts[index] += 1
      remainingCount -= 1
    }

    roundSeed += 1
  }

  return { groups, targetCount, allocatedCounts }
}

export function getDistributedQuestionCount(
  words: VocabularyWord[],
  forms: ConjugationForm[],
  promptMode: 'japanese' | 'meaning',
  requestedCount: number,
) {
  return getAllocatedQuestionCounts(words, forms, promptMode, requestedCount).targetCount
}

function selectDistributedQuestions(
  words: VocabularyWord[],
  forms: ConjugationForm[],
  promptMode: 'japanese' | 'meaning',
  requestedCount: number,
) {
  const { groups, allocatedCounts } = getAllocatedQuestionCounts(words, forms, promptMode, requestedCount)
  return shuffleArray(groups.flatMap((group, index) => group.questions.slice(0, allocatedCounts[index] ?? 0)))
}

export function createConjugationSessionRecord(payload: StartConjugationSessionPayload): ConjugationSessionRecord {
  const selectedForms = [...new Set(payload.selectedForms)]
  const questions = selectDistributedQuestions(payload.words, selectedForms, payload.promptMode, payload.questionCount)
  const now = new Date().toISOString()

  return {
    status: 'active',
    setId: payload.setId,
    setName: payload.setName,
    promptMode: payload.promptMode,
    selectedForms,
    questions,
    attempts: new Array(questions.length).fill(null),
    currentIndex: 0,
    isAnswerRevealed: false,
    draftAnswer: '',
    startedAt: now,
    updatedAt: now,
  }
}

export function buildConjugationFormStats(
  questions: ConjugationQuestion[],
  attempts: Array<ConjugationAttempt | null>,
): ConjugationFormStat[] {
  const statsMap = new Map<ConjugationForm, ConjugationFormStat>()

  questions.forEach((question, index) => {
    const existing = statsMap.get(question.form) ?? {
      form: question.form,
      label: question.formLabel,
      correctCount: 0,
      totalCount: 0,
    }

    existing.totalCount += 1
    if (attempts[index]?.isCorrect) {
      existing.correctCount += 1
    }

    statsMap.set(question.form, existing)
  })

  return [...statsMap.values()]
}

export function buildConjugationResult(record: ConjugationSessionRecord): ConjugationResult {
  const wrongItems = record.questions.flatMap((question, index) => {
    const attempt = record.attempts[index]
    if (!attempt || attempt.isCorrect) return []
    return [{ question, attempt }]
  })

  const correctCount = record.attempts.reduce((count, attempt) => count + (attempt?.isCorrect ? 1 : 0), 0)

  return {
    setId: record.setId,
    setName: record.setName,
    promptMode: record.promptMode,
    selectedForms: record.selectedForms,
    totalQuestions: record.questions.length,
    correctCount,
    wrongItems,
    formStats: buildConjugationFormStats(record.questions, record.attempts),
    completedAt: new Date().toISOString(),
  }
}
