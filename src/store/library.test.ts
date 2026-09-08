import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { deleteBook, listBooks, loadBookFile, saveBook, touchBook } from './library'

const file = (text: string) => new TextEncoder().encode(text).buffer

describe('書庫', () => {
  beforeEach(async () => {
    for (const book of await listBooks()) await deleteBook(book.id)
  })

  test('一開始是空的', async () => {
    expect(await listBooks()).toEqual([])
  })

  test('存入後可列出書目與取回檔案', async () => {
    await saveBook(
      { id: 'b1', title: '創造力的修行', creator: '里克‧魯賓' },
      file('epub-bytes'),
    )

    const books = await listBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('創造力的修行')
    expect(new TextDecoder().decode(await loadBookFile('b1'))).toBe('epub-bytes')
  })

  test('重複存入同一本不會產生兩筆', async () => {
    await saveBook({ id: 'b1', title: '書', creator: '' }, file('a'))
    await saveBook({ id: 'b1', title: '書（新版）', creator: '' }, file('b'))

    const books = await listBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('書（新版）')
  })

  test('依最後開啟時間由新到舊排序', async () => {
    await saveBook({ id: 'b1', title: '先', creator: '' }, file('a'))
    await saveBook({ id: 'b2', title: '後', creator: '' }, file('b'))

    await touchBook('b1')

    expect((await listBooks()).map((book) => book.id)).toEqual(['b1', 'b2'])
  })

  test('刪除後書目與檔案都不見', async () => {
    await saveBook({ id: 'b1', title: '書', creator: '' }, file('a'))

    await deleteBook('b1')

    expect(await listBooks()).toEqual([])
    expect(await loadBookFile('b1')).toBeUndefined()
  })
})
