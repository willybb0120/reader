import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addAnnotation,
  listAnnotations,
  removeAnnotation,
  updateAnnotation,
  type Annotation,
  type AnnotationDraft,
  type Color,
} from '../store/annotations'

/** 管理單一本書的劃線與筆記。bookId 為空字串時代表尚未載入書籍。 */
export function useAnnotations(bookId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  useEffect(() => {
    setAnnotations(bookId ? listAnnotations(bookId) : [])
  }, [bookId])

  const refresh = useCallback(() => setAnnotations(listAnnotations(bookId)), [bookId])

  const add = useCallback(
    (draft: AnnotationDraft) => {
      if (!bookId) return null
      const created = addAnnotation(bookId, draft)
      refresh()
      return created
    },
    [bookId, refresh],
  )

  const update = useCallback(
    (id: string, patch: { note?: string; color?: Color }) => {
      updateAnnotation(bookId, id, patch)
      refresh()
    },
    [bookId, refresh],
  )

  const remove = useCallback(
    (id: string) => {
      removeAnnotation(bookId, id)
      refresh()
    },
    [bookId, refresh],
  )

  const byChapter = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const annotation of annotations) {
      const list = map.get(annotation.chapterIndex) ?? []
      list.push(annotation)
      map.set(annotation.chapterIndex, list)
    }
    return map
  }, [annotations])

  return { annotations, byChapter, add, update, remove }
}
