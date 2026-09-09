import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

const BOOKS_DIR = join(process.cwd(), 'public/books')
const VIRTUAL_ID = 'virtual:books'

/** 把 public/books 下的 EPUB 檔名做成虛擬模組，讓前端不需後端就能列出內建書籍。 */
function booksManifest(): Plugin {
  return {
    name: 'books-manifest',
    resolveId: (id) => (id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : null),
    load(id) {
      if (id !== `\0${VIRTUAL_ID}`) return null
      let names: string[] = []
      try {
        names = readdirSync(BOOKS_DIR).filter((name) => name.toLowerCase().endsWith('.epub'))
      } catch {
        names = []
      }
      return `export const bundledBooks = ${JSON.stringify(names)}`
    },
  }
}

export default defineConfig({
  plugins: [react(), booksManifest()],
  server: {
    // 專案放在 /mnt/c 時，WSL2 跨檔案系統收不到 inotify 事件，必須輪詢才會熱更新
    watch: { usePolling: true, interval: 300 },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
