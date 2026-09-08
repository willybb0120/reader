import { createStore, del, get, keys, set } from 'idb-keyval'

export interface CoverImage {
  data: ArrayBuffer
  type: string
}

export interface BookRecord {
  id: string
  title: string
  creator: string
  /** 封面圖，供書櫃顯示 */
  cover?: CoverImage
  addedAt: number
  lastOpenedAt: number
}

export type BookInfo = Pick<BookRecord, 'id' | 'title' | 'creator' | 'cover'>

// 存 ArrayBuffer 而非 Blob：所有 IndexedDB 實作都支援，parseEpub 也直接吃這個型別
// 書目與檔案分開存：列出書櫃時不必把整份 EPUB 讀進記憶體
const metaStore = createStore('reader', 'books')
const fileStore = createStore('reader-files', 'files')

export async function listBooks(): Promise<BookRecord[]> {
  const ids = await keys(metaStore)
  const records = await Promise.all(ids.map((id) => get<BookRecord>(id as string, metaStore)))
  return records
    .filter((record): record is BookRecord => Boolean(record))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

export async function saveBook(info: BookInfo, file: ArrayBuffer): Promise<BookRecord> {
  const existing = await get<BookRecord>(info.id, metaStore)
  const now = Date.now()
  const record: BookRecord = {
    ...info,
    addedAt: existing?.addedAt ?? now,
    lastOpenedAt: existing?.lastOpenedAt ?? now,
  }
  await set(info.id, record, metaStore)
  await set(info.id, file, fileStore)
  return record
}

export async function touchBook(id: string): Promise<void> {
  const record = await get<BookRecord>(id, metaStore)
  if (record) await set(id, { ...record, lastOpenedAt: Date.now() }, metaStore)
}

export async function loadBookFile(id: string): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(id, fileStore)
}

export async function deleteBook(id: string): Promise<void> {
  await del(id, metaStore)
  await del(id, fileStore)
}
