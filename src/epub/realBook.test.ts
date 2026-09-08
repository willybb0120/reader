import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEpub } from './parseEpub'

const BOOKS_DIR = join(process.cwd(), 'public/books')

function realEpubs(): string[] {
  try {
    return readdirSync(BOOKS_DIR).filter((name) => name.endsWith('.epub'))
  } catch {
    return []
  }
}

const files = realEpubs()

describe.skipIf(files.length === 0)('真實 EPUB', () => {
  test.each(files)('%s 可解析出標題、章節與目錄', async (name) => {
    const book = await parseEpub(readFileSync(join(BOOKS_DIR, name)))

    expect(book.metadata.title).not.toBe('')
    expect(book.spine.length).toBeGreaterThan(0)
    expect(book.nav.length).toBeGreaterThan(0)

    const chapter = await book.getChapter(Math.floor(book.spine.length / 2))
    expect(chapter.html.length).toBeGreaterThan(0)
    expect(chapter.html).not.toContain('<script')
  })
})
