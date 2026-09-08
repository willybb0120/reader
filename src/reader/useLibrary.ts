import { useCallback, useEffect, useRef, useState } from 'react'
import { bundledBooks } from 'virtual:books'
import { importEpub } from '../store/importBook'
import { deleteBook, listBooks, type BookRecord } from '../store/library'

const BUNDLED_FLAG = 'reader:bundled-imported'

/** 書櫃：列出、匯入、刪除。books 為 null 代表尚在載入。 */
export function useLibrary() {
  const [books, setBooks] = useState<BookRecord[] | null>(null)
  const [error, setError] = useState('')
  const bootstrapped = useRef(false)

  const refresh = useCallback(async () => {
    setBooks(await listBooks())
  }, [])

  // 首次啟動時把 public/books 內建的書匯入書櫃
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      const done = localStorage.getItem(BUNDLED_FLAG) === 'true'
      if (!done && bundledBooks.length > 0) {
        for (const name of bundledBooks) {
          try {
            const response = await fetch(
              `${import.meta.env.BASE_URL}books/${encodeURIComponent(name)}`,
            )
            if (response.ok) await importEpub(await response.arrayBuffer())
          } catch {
            // 內建書載入失敗不影響書櫃其他內容
          }
        }
        localStorage.setItem(BUNDLED_FLAG, 'true')
      }
      await refresh()
    })()
  }, [refresh])

  const importFiles = useCallback(
    async (files: readonly File[]): Promise<string | null> => {
      setError('')
      let lastId: string | null = null
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.epub')) continue
        try {
          lastId = (await importEpub(await file.arrayBuffer())).id
        } catch (cause) {
          setError(`${file.name}：${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      await refresh()
      return lastId
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteBook(id)
      await refresh()
    },
    [refresh],
  )

  return { books, error, importFiles, remove, refresh }
}
