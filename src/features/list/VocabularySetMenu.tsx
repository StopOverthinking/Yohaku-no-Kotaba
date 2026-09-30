import { useMemo } from 'react'
import { ArrowLeftRight, BookOpen, ChevronRight, Heart, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { usePreferencesStore } from '@/features/preferences/preferencesStore'
import { allSelectableWordbooks, allSets, getWordsForSet, getWordbookKind } from '@/features/vocab/model/selectors'
import styles from '@/features/list/list.module.css'

type VocabularySetMenuProps = {
  onSelect?: () => void
}

function formatUpdatedDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}.${month}.${day}`
}

function resolveMenuUpdatedDate(value: string | undefined, fallback: string) {
  return formatUpdatedDate(value) ?? fallback
}

export function VocabularySetMenu({ onSelect }: VocabularySetMenuProps) {
  const navigate = useNavigate()
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds)
  const lastSelectedSetId = usePreferencesStore((state) => state.lastSelectedSetId)
  const setLastSelectedSetId = usePreferencesStore((state) => state.setLastSelectedSetId)
  const activeSetId = lastSelectedSetId === 'all' ? (allSets[0]?.id ?? 'favorites') : lastSelectedSetId
  const todayLabel = useMemo(() => formatUpdatedDate(new Date().toISOString()) ?? '', [])

  const handleSelectSet = (setId: string | 'favorites') => {
    setLastSelectedSetId(setId)
    onSelect?.()
    navigate('/list')
  }

  return (
    <div className={styles.menuList}>
      <button
        className={styles.menuItem}
        data-active={activeSetId === 'favorites'}
        onClick={() => handleSelectSet('favorites')}
      >
        <span className={styles.menuItemIcon}>
          <Heart size={22} />
        </span>
        <span className={styles.menuItemBody}>
          <strong>즐겨찾기 단어장</strong>
        </span>
        <span className={styles.menuItemMeta}>
          <span className="miniChip">{getWordsForSet('favorites', favoriteIds).length}개</span>
          <ChevronRight size={18} />
        </span>
      </button>

      {allSelectableWordbooks.map((set) => {
        const formattedUpdatedDate = resolveMenuUpdatedDate(set.updatedAt, todayLabel)

        return (
          <button
            key={set.id}
            className={styles.menuItem}
            data-active={activeSetId === set.id}
            onClick={() => handleSelectSet(set.id)}
          >
            <span className={styles.menuItemIcon}>
              {getWordbookKind(set.id) === 'theme' ? <Sparkles size={22} /> : getWordbookKind(set.id) === 'compare' ? <ArrowLeftRight size={22} /> : <BookOpen size={22} />}
            </span>
            <span className={styles.menuItemBody}>
              <strong>{set.name}</strong>
              <span className={styles.menuItemDate}>{formattedUpdatedDate}</span>
            </span>
            <span className={styles.menuItemMeta}>
              <span className="miniChip">{set.itemCount}개</span>
              <ChevronRight size={18} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
