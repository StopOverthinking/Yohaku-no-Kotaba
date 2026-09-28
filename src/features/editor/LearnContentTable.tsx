import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import type { LearnExample, LearnSense } from '@/features/learn/contextTypes'
import type { VocabularyWord } from '@/features/vocab/model/types'
import styles from './editor.module.css'

type Props = { words: VocabularyWord[]; content: LearnSense[]; onChange: (content: LearnSense[]) => void }
const exampleFields = [
  ['before', '앞문장'],
  ['answer', '정답'],
  ['after', '뒷문장'],
  ['reading', '읽기'],
  ['translation', '번역'],
  ['translationTarget', '강조'],
] as const

export function LearnContentTable({ words, content, onChange }: Props) {
  const [page, setPage] = useState(0)
  const ids = new Set(words.map((w) => w.id))
  const senses = content.filter((s) => ids.has(s.wordId))
  const lastPage = Math.max(0, Math.ceil(senses.length / 20) - 1)
  const currentPage = Math.min(page, lastPage)
  const visibleSenses = senses.slice(currentPage * 20, currentPage * 20 + 20)
  const wordMap = new Map(words.map((w) => [w.id, w]))
  const update = (id: string, edit: (sense: LearnSense) => LearnSense) =>
    onChange(content.map((s) => (s.id === id ? edit(s) : s)))
  function addExample(sense: LearnSense) {
    const word = wordMap.get(sense.wordId)!
    const example: LearnExample = {
      id: `example-${crypto.randomUUID()}`,
      version: 1,
      before: '',
      answer: word.japanese,
      after: '',
      reading: word.reading,
      translation: '',
      translationTarget: '',
      difficulty: word.difficulty ?? 30,
      status: 'draft',
    }
    update(sense.id, (s) => ({
      ...s,
      examples: [...s.examples, example],
      review: { ...s.review, diversity: false },
    }))
  }
  function addSense(word: VocabularyWord) {
    const sense: LearnSense = {
      id: `sense-${crypto.randomUUID()}`,
      wordId: word.id,
      version: 1,
      meaning: word.meaning,
      hint: '',
      confusions: [{ japanese: '', distinction: '' }],
      review: { word: false, contrast: false, diversity: false },
      examples: [],
    }
    onChange([...content, sense])
    setPage(Math.floor(senses.length / 20))
  }
  return (
    <div className={styles.learnEditor}>
      <div className={styles.learnToolbar}>
        <IconButton
          icon={ChevronLeft}
          label="이전 예문 페이지"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        />
        <span>
          {currentPage + 1}/{lastPage + 1}
        </span>
        <IconButton
          icon={ChevronRight}
          label="다음 예문 페이지"
          disabled={currentPage >= lastPage}
          onClick={() => setPage(currentPage + 1)}
        />
        <select
          className={styles.cellSelect}
          aria-label="용법 추가 단어"
          defaultValue=""
          onChange={(e) => {
            const word = wordMap.get(e.target.value)
            if (word) addSense(word)
            e.target.value = ''
          }}
        >
          <option value="">용법 추가…</option>
          {words.map((w) => (
            <option key={w.id} value={w.id}>
              {w.japanese} · {w.reading}
            </option>
          ))}
        </select>
      </div>
      {visibleSenses.map((sense) => (
        <section key={sense.id} style={{ paddingBlock: 16 }}>
          <div className={styles.learnToolbar}>
            <strong>{wordMap.get(sense.wordId)?.japanese}</strong>
            <label>
              용법{' '}
              <input
                className={styles.cellInput}
                aria-label="용법 뜻"
                value={sense.meaning}
                onChange={(e) =>
                  update(sense.id, (s) => ({
                    ...s,
                    meaning: e.target.value,
                    review: { word: false, contrast: false, diversity: false },
                  }))
                }
              />
            </label>
            <label>
              버전{' '}
              <input
                className={styles.cellInput}
                aria-label="용법 버전"
                type="number"
                min="1"
                style={{ width: 60 }}
                value={sense.version}
                onChange={(e) => update(sense.id, (s) => ({ ...s, version: Number(e.target.value) }))}
              />
            </label>
            {(['word', 'contrast', 'diversity'] as const).map((kind, index) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={sense.review[kind]}
                  onChange={(e) =>
                    update(sense.id, (s) => ({ ...s, review: { ...s.review, [kind]: e.target.checked } }))
                  }
                />
                {['단어', '유의어', '다양성'][index]} 검수
              </label>
            ))}
            <IconButton icon={Plus} label="예문 추가" onClick={() => addExample(sense)} />
            <IconButton
              icon={Trash2}
              label="용법 삭제"
              onClick={() => onChange(content.filter((s) => s.id !== sense.id))}
            />
          </div>
          <label>
            힌트{' '}
            <textarea
              className={styles.tableTextarea}
              aria-label="뉘앙스 힌트"
              style={{ width: '70%' }}
              value={sense.hint}
              onChange={(e) =>
                update(sense.id, (s) => ({
                  ...s,
                  hint: e.target.value,
                  review: { ...s.review, contrast: false },
                }))
              }
            />
          </label>
          <table className={styles.table}>
            <colgroup>
              {[200, 130, 200, 130, 240, 130, 70, 70, 70, 70].map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {exampleFields.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
                <th>난도</th>
                <th>버전</th>
                <th>검수</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sense.examples.map((example) => (
                <tr key={example.id} data-active={example.status === 'reviewed'}>
                  {exampleFields.map(([key, label]) => (
                    <td key={key}>
                      <textarea
                        className={styles.tableTextarea}
                        aria-label={`${label} ${example.id}`}
                        style={{ minWidth: key === 'translation' ? 220 : 115 }}
                        value={example[key]}
                        onChange={(e) =>
                          update(sense.id, (s) => ({
                            ...s,
                            review: { word: false, contrast: false, diversity: false },
                            examples: s.examples.map((item) =>
                              item.id === example.id
                                ? { ...item, [key]: e.target.value, status: 'draft' }
                                : item,
                            ),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      className={styles.cellInput}
                      aria-label={`난도 ${example.id}`}
                      type="number"
                      style={{ width: 55 }}
                      value={example.difficulty}
                      onChange={(e) =>
                        update(sense.id, (s) => ({
                          ...s,
                          examples: s.examples.map((item) =>
                            item.id === example.id ? { ...item, difficulty: Number(e.target.value) } : item,
                          ),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      aria-label={`버전 ${example.id}`}
                      type="number"
                      min="1"
                      style={{ width: 50 }}
                      value={example.version}
                      onChange={(e) =>
                        update(sense.id, (s) => ({
                          ...s,
                          examples: s.examples.map((item) =>
                            item.id === example.id ? { ...item, version: Number(e.target.value) } : item,
                          ),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`검수 ${example.id}`}
                      type="checkbox"
                      checked={example.status === 'reviewed'}
                      onChange={(e) =>
                        update(sense.id, (s) => ({
                          ...s,
                          examples: s.examples.map((item) =>
                            item.id === example.id
                              ? { ...item, status: e.target.checked ? 'reviewed' : 'draft' }
                              : item,
                          ),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <IconButton
                      icon={Trash2}
                      label={`예문 삭제 ${example.id}`}
                      onClick={() =>
                        update(sense.id, (s) => ({
                          ...s,
                          examples: s.examples.filter((e) => e.id !== example.id),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: 220 }} />
              <col />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>혼동 표현</th>
                <th>차이</th>
                <th>
                  <IconButton
                    icon={Plus}
                    label="혼동 표현 추가"
                    onClick={() =>
                      update(sense.id, (s) => ({
                        ...s,
                        confusions: [...s.confusions, { japanese: '', distinction: '' }],
                        review: { ...s.review, contrast: false },
                      }))
                    }
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {sense.confusions.map((confusion, i) => (
                <tr key={i}>
                  {(['japanese', 'distinction'] as const).map((field) => (
                    <td key={field}>
                      <textarea
                        className={styles.tableTextarea}
                        aria-label={`${field === 'japanese' ? '혼동 표현' : '차이'} ${i + 1}`}
                        value={confusion[field]}
                        onChange={(e) =>
                          update(sense.id, (s) => ({
                            ...s,
                            confusions: s.confusions.map((c, index) =>
                              index === i ? { ...c, [field]: e.target.value } : c,
                            ),
                            review: { ...s.review, contrast: false },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <IconButton
                      icon={Trash2}
                      label="혼동 표현 삭제"
                      onClick={() =>
                        update(sense.id, (s) => ({
                          ...s,
                          confusions: s.confusions.filter((_, index) => index !== i),
                          review: { ...s.review, contrast: false },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
