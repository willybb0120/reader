import { describe, expect, test } from 'vitest'
import { parseEpub, EpubError } from './parseEpub'
import { makeEpub } from './fixture'

describe('parseEpub', () => {
  test('讀出書籍後設資料', async () => {
    const book = await parseEpub(makeEpub())

    expect(book.metadata.title).toBe('測試書名')
    expect(book.metadata.creator).toBe('測試作者')
    expect(book.metadata.language).toBe('zh-TW')
    expect(book.metadata.identifier).toBe('urn:uuid:test-book-1')
  })

  test('spine 依 itemref 順序解析出章節路徑', async () => {
    const book = await parseEpub(makeEpub())

    expect(book.spine.map((s) => s.href)).toEqual([
      'OEBPS/c1.xhtml',
      'OEBPS/text/c2.xhtml',
      'OEBPS/c3.xhtml',
      'OEBPS/c4.xhtml',
    ])
  })

  test('目錄保留巢狀結構並對應到 spine 索引', async () => {
    const book = await parseEpub(makeEpub())

    expect(book.nav).toEqual([
      {
        label: '第一章',
        chapterIndex: 0,
        fragment: undefined,
        children: [{ label: '第一節', chapterIndex: 0, fragment: 's1', children: [] }],
      },
      { label: '第二章', chapterIndex: 1, fragment: undefined, children: [] },
    ])
  })

  test('章節 HTML 只含 body 內容並剝除 script', async () => {
    const book = await parseEpub(makeEpub())

    const chapter = await book.getChapter(0)

    expect(chapter.html).toContain('<h1>第一章</h1>')
    expect(chapter.html).not.toContain('<body')
    expect(chapter.html).not.toContain('alert(1)')
  })

  test('圖片 src 改寫為 blob URL', async () => {
    const book = await parseEpub(makeEpub())

    const chapter = await book.getChapter(0)

    expect(chapter.html).toMatch(/<img[^>]+src="blob:/)
  })

  test('缺少圖片時保留章節其他內容', async () => {
    const book = await parseEpub(makeEpub({ missingImage: true }))

    const chapter = await book.getChapter(0)

    expect(chapter.html).toContain('內文一。')
  })

  test('章內連結改寫為章節索引', async () => {
    const book = await parseEpub(makeEpub())

    const chapter = await book.getChapter(0)

    expect(chapter.html).toContain('data-chapter="1"')
  })

  test('章節標題取自 h1', async () => {
    const book = await parseEpub(makeEpub())

    expect((await book.getChapter(2)).title).toBe('第三章')
  })

  test('SVG 包裹的封面圖改寫成 img 標籤', async () => {
    const book = await parseEpub(makeEpub())

    const chapter = await book.getChapter(3)

    expect(chapter.html).toMatch(/<img[^>]+src="blob:/)
    expect(chapter.html).not.toContain('<svg')
  })

  test('章節純文字與章節 HTML 的文字內容一致', async () => {
    const book = await parseEpub(makeEpub())

    const chapter = await book.getChapter(0)
    const container = document.createElement('div')
    container.innerHTML = chapter.html

    expect(await book.getChapterText(0)).toBe(container.textContent)
  })

  test('封面轉為 blob URL', async () => {
    const book = await parseEpub(makeEpub())

    expect(book.coverUrl).toMatch(/^blob:/)
  })

  test('封面同時提供原始位元組與 MIME 類型', async () => {
    const book = await parseEpub(makeEpub())

    expect(book.coverImage?.type).toBe('image/png')
    expect(book.coverImage!.data.byteLength).toBeGreaterThan(0)
  })

  test('缺少 container.xml 時丟出可辨識的錯誤', async () => {
    await expect(parseEpub(makeEpub({ omitContainer: true }))).rejects.toThrow(EpubError)
    await expect(parseEpub(makeEpub({ omitContainer: true }))).rejects.toThrow(/container\.xml/)
  })

  test('container.xml 指向不存在的 OPF 時丟出錯誤', async () => {
    await expect(parseEpub(makeEpub({ brokenOpfPath: true }))).rejects.toThrow(/OPF/)
  })

  test('spine 為空時丟出錯誤', async () => {
    await expect(parseEpub(makeEpub({ emptySpine: true }))).rejects.toThrow(/spine/i)
  })
})
