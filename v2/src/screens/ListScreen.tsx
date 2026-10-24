import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeftRight, BookOpen, ChevronDown, Heart, Search, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import {
  allSelectableWordbooks,
  allSets,
  getSetName,
  getStudyItemPartLabel,
  getStudyItemsForSet,
  getWordbookKind,
  getWordsForSet,
  normalizeSelectableSetId,
} from '@/features/vocab/model/selectors'
import type { StudyItem } from '@/features/vocab/model/types'
import { IconButton, Sheet } from '@v2/ui/primitives'
import '@v2/styles/list.css'

const SCALE = [
  { jp: 1.0, meaning: 0.84 },
  { jp: 1.1, meaning: 0.88 },
  { jp: 1.2, meaning: 0.92 },
  { jp: 1.3, meaning: 0.98 },
  { jp: 1.42, meaning: 1.04 },
  { jp: 1.56, meaning: 1.12 },
  { jp: 1.7, meaning: 1.2 },
]

const NO_IDS: string[] = []

function setItemFavorite(ids: string[], next: boolean) {
  const { favoriteIds, toggleFavorite } = useFavoritesStore.getState()
  for (const id of ids) if (favoriteIds.includes(id) !== next) toggleFavorite(id)
}

function resolveListSetId(setId: string) {
  const normalized = normalizeSelectableSetId(setId)
  return normalized === 'all' ? (allSets[0]?.id ?? 'favorites') : normalized
}

function MaskGlyph({ glyph, lang }: { glyph: string; lang: string }) {
  return (
    <span className="glyph" lang={lang} aria-hidden="true">
      {glyph}
    </span>
  )
}

export function ListScreen() {
  const hideJapanese = usePreferencesStore((s) => s.hideJapaneseInList)
  const hideMeaning = usePreferencesStore((s) => s.hideMeaningInList)
  const setHideJapanese = usePreferencesStore((s) => s.setHideJapaneseInList)
  const setHideMeaning = usePreferencesStore((s) => s.setHideMeaningInList)
  const fontScale = usePreferencesStore((s) => s.listFontScale)
  const setFontScale = usePreferencesStore((s) => s.setListFontScale)
  const lastSelectedSetId = usePreferencesStore((s) => s.lastSelectedSetId)
  const setLastSelectedSetId = usePreferencesStore((s) => s.setLastSelectedSetId)
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())
  const deferredQuery = useDeferredValue(query)
  const setId = resolveListSetId(lastSelectedSetId)
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const masked = hideJapanese || hideMeaning

  const setFavoriteIds = setId === 'favorites' ? favoriteIds : NO_IDS
  const baseItems = useMemo(() => getStudyItemsForSet(setId, setFavoriteIds), [setId, setFavoriteIds])
  const items = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return baseItems.filter(
      (item) => (!favoritesOnly || item.favoriteWordIds.some((id) => favoriteSet.has(id))) && (!q || item.searchText.includes(q)),
    )
  }, [baseItems, deferredQuery, favoritesOnly, favoriteSet])

  // Open the picker on the current book, already focused, instead of at the top.
  useEffect(() => {
    if (!pickerOpen) return
    const current = document.querySelector<HTMLButtonElement>('.book[aria-current="true"]')
    current?.scrollIntoView({ block: 'nearest' })
    current?.focus({ preventScroll: true })
  }, [pickerOpen])

  const onReveal = useCallback((id: string) => {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setHide = (target: 'ja' | 'ko', next: boolean) => {
    setRevealed(new Set())
    if (target === 'ja') setHideJapanese(next)
    else setHideMeaning(next)
  }

  const scale = SCALE[Math.max(0, Math.min(6, fontScale))] ?? SCALE[3]
  const style = { '--jp': `${scale.jp}rem`, '--meaning': `${scale.meaning}rem` } as CSSProperties

  let lastTopic: string | undefined
  let number = 0

  return (
    <div className="page page--wide list" data-hide-ja={hideJapanese} data-hide-ko={hideMeaning} style={style}>
      <header className="topbar">
        <button type="button" className="list__picker" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
          <span>{getSetName(setId)}</span>
          <ChevronDown size={18} />
        </button>
        <span className="list__count">{items.length.toLocaleString()}</span>
      </header>

      <div className="list__toolbar">
        <label className="list__search">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색" aria-label="단어 검색" />
          {query && <IconButton icon={X} size="sm" label="검색어 지우기" onClick={() => setQuery('')} />}
        </label>
        <div className="list__tools" role="toolbar" aria-label="목록 도구">
          <button type="button" className="icon-btn" aria-label="일본어 가리기" title="일본어 가리기" aria-pressed={hideJapanese} data-active={hideJapanese || undefined} onClick={() => setHide('ja', !hideJapanese)}>
            <MaskGlyph glyph="あ" lang="ja" />
          </button>
          <button type="button" className="icon-btn" aria-label="뜻 가리기" title="뜻 가리기" aria-pressed={hideMeaning} data-active={hideMeaning || undefined} onClick={() => setHide('ko', !hideMeaning)}>
            <MaskGlyph glyph="가" lang="ko" />
          </button>
          <IconButton icon={Heart} label="즐겨찾기만" active={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)} />
          <span className="list__divider" aria-hidden="true" />
          <IconButton icon={ZoomOut} label="글자 작게" disabled={fontScale <= 0} onClick={() => setFontScale(fontScale - 1)} />
          <IconButton icon={ZoomIn} label="글자 크게" disabled={fontScale >= 6} onClick={() => setFontScale(fontScale + 1)} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          {favoritesOnly || setId === 'favorites' ? <Heart size={32} strokeWidth={1.5} /> : <Search size={32} strokeWidth={1.5} />}
          <p>{query ? '결과 없음' : '단어 없음'}</p>
        </div>
      ) : (
        <ol className="list__rows">
          {items.map((item) => {
            number += 1
            const topic = item.kind === 'word' ? item.topicName : undefined
            const showTopic = topic && topic !== lastTopic
            lastTopic = topic
            return (
              <Row
                key={item.id}
                item={item}
                number={number}
                topic={showTopic ? topic : undefined}
                favorite={item.favoriteWordIds.some((id) => favoriteSet.has(id))}
                revealed={masked && revealed.has(item.id)}
                onReveal={masked ? onReveal : undefined}
                onFavorite={setItemFavorite}
              />
            )
          })}
        </ol>
      )}

      {pickerOpen && (
        <Sheet title="단어장" onClose={() => setPickerOpen(false)}>
          <div className="book-list">
            {[{ id: 'favorites', name: '즐겨찾기', itemCount: getWordsForSet('favorites', favoriteIds).length }, ...allSelectableWordbooks].map((book) => {
              const kind = book.id === 'favorites' ? 'fav' : getWordbookKind(book.id)
              const Icon = kind === 'fav' ? Heart : kind === 'compare' ? ArrowLeftRight : BookOpen
              return (
                <button
                  key={book.id}
                  type="button"
                  className="book"
                  aria-current={book.id === setId || undefined}
                  onClick={() => {
                    setLastSelectedSetId(book.id)
                    setRevealed(new Set())
                    setPickerOpen(false)
                    window.scrollTo(0, 0)
                  }}
                >
                  <span className="row__icon">
                    <Icon size={16} />
                  </span>
                  <span className="book__name">{book.name}</span>
                  <span className="book__count">{book.itemCount.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </div>
  )
}

type RowProps = {
  item: StudyItem
  number: number
  topic?: string
  favorite: boolean
  revealed: boolean
  onReveal?: (id: string) => void
  onFavorite: (wordIds: string[], next: boolean) => void
}

const Row = memo(function Row({ item, number, topic, favorite, revealed, onReveal, onFavorite }: RowProps) {
  const favoriteId = item.favoriteWordIds[0]
  return (
    <>
      {topic && <li className="list__topic">{topic}</li>}
      <li className="entry" data-revealed={revealed || undefined}>
        <button
          type="button"
          className="entry__surface"
          tabIndex={onReveal ? 0 : -1}
          aria-label={onReveal ? `${number}번 ${revealed ? '가리기' : '보기'}` : undefined}
          aria-hidden={onReveal ? undefined : true}
          onClick={onReveal ? () => onReveal(item.id) : undefined}
        />
        <span className="entry__no">{number}</span>
        {item.kind === 'word' ? (
          <>
            <span className="entry__jp" lang="ja">
              <span className="entry__word mask-ja">{item.word.japanese}</span>
              <span className="entry__reading mask-ja">{item.word.reading}</span>
            </span>
            <span className="entry__meaning">
              <span className="mask-ko">{item.word.meaning}</span>
              <span className="entry__part">{getStudyItemPartLabel(item)}</span>
            </span>
          </>
        ) : (
          <span className="entry__pair">
            {[
              [item.leftWord, item.pair.leftDescription],
              [item.rightWord, item.pair.rightDescription],
            ].map(([word, description]) => (
              <span key={typeof word === 'string' ? word : word.id} className="entry__pair-side">
                <span className="entry__word mask-ja" lang="ja">
                  {typeof word === 'string' ? word : word.japanese}
                </span>
                <span className="entry__reading mask-ja" lang="ja">
                  {typeof word === 'string' ? '' : word.reading}
                </span>
                <span className="mask-ko">{typeof word === 'string' ? '' : word.meaning}</span>
                {typeof description === 'string' && description && <small className="mask-ko">{description}</small>}
              </span>
            ))}
          </span>
        )}
        {favoriteId && (
          <button
            type="button"
            className="entry__fav"
            aria-label="즐겨찾기"
            aria-pressed={favorite}
            onClick={() => onFavorite(item.favoriteWordIds, !favorite)}
          >
            <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </li>
    </>
  )
})
