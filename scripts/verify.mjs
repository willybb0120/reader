/**
 * 用真實瀏覽器開啟建置後的閱讀器，檢查沒有 console 錯誤且內容確實渲染，並產出截圖。
 * 用法：node scripts/verify.mjs [輸出目錄]
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const outDir = process.argv[2] ?? 'screenshots'
const PORT = 4317
mkdirSync(outDir, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})

const fail = (message) => {
  console.error(`✗ ${message}`)
  server.kill()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`)
      if (response.ok) return
    } catch {
      /* 尚未啟動 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail('preview 伺服器未能啟動')
}

await waitForServer()

const browser = await chromium.launch()
const errors = []

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // 書櫃：內建書應自動匯入
  await page.waitForSelector('.book-card', { timeout: 20000 })
  await page.screenshot({ path: `${outDir}/01-library.png` })
  const cards = await page.$$('.book-card')
  if (cards.length !== 1) fail(`書櫃書本數量錯誤：${cards.length}`)

  await page.click('.book-card__open')
  await page.waitForSelector('.chapter', { timeout: 15000 })
  await page.screenshot({ path: `${outDir}/02-open.png` })

  await page.click('[aria-label="開啟目錄"]')
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/03-toc.png` })

  const items = await page.$$('.toc__item')
  if (items.length < 2) fail(`目錄項目過少：${items.length}`)
  await items[3].click()
  await page.waitForTimeout(400)

  const text = await page.textContent('.chapter')
  if (!text || text.trim().length < 100) fail(`章節內容過短：${text?.length ?? 0} 字`)
  await page.screenshot({ path: `${outDir}/04-chapter.png` })

  // 閱讀設定：切到夜間主題與較大字級
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/05-settings.png` })

  await page.click('[data-theme-swatch="dark"]')
  await page.waitForTimeout(200)
  const theme = await page.getAttribute('html', 'data-theme')
  if (theme !== 'dark') fail(`主題未切換：${theme}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${outDir}/06-dark.png` })

  // 進度：捲動後重新載入應回到原處
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => ({
    y: window.scrollY,
    title: document.querySelector('.topbar__title')?.textContent,
  }))

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.chapter')
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => ({
    y: window.scrollY,
    title: document.querySelector('.topbar__title')?.textContent,
  }))

  if (after.title !== before.title) fail(`重新載入後章節不同：${before.title} → ${after.title}`)
  if (Math.abs(after.y - before.y) > 80) fail(`重新載入後捲動位置差距過大：${before.y} → ${after.y}`)
  await page.screenshot({ path: `${outDir}/07-restored.png` })

  // 劃線：選一段文字 → 工具列 → 黃色劃線 → 出現在側欄
  await page.evaluate(() => {
    const paragraph = document.querySelectorAll('.chapter p')[2]
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.waitForSelector('.selection-toolbar')
  await page.screenshot({ path: `${outDir}/08-selection.png` })
  await page.click('[aria-label="黃色劃線"]')
  await page.waitForSelector('.chapter mark')

  await page.click('[aria-label="劃線與筆記"]')
  await page.waitForSelector('.annotations')
  await page.waitForTimeout(400)
  const marks = await page.$$('.annotation')
  if (marks.length !== 1) fail(`側欄標註數量錯誤：${marks.length}`)
  await page.screenshot({ path: `${outDir}/09-annotations.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 重新載入後劃線仍在
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.chapter')
  await page.waitForTimeout(700)
  const persisted = await page.$$('.chapter mark')
  if (persisted.length === 0) fail('重新載入後劃線消失')
  await page.evaluate(() =>
    document.querySelector('.chapter mark')?.scrollIntoView({ block: 'center' }),
  )
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${outDir}/10-highlight-persisted.png` })

  // 搜尋：輸入關鍵字並跳到結果
  await page.click('[aria-label="搜尋全書"]')
  await page.waitForSelector('.search__field input:not([disabled])', { timeout: 20000 })
  await page.fill('.search__field input', '創造')
  await page.waitForSelector('.search__hit')
  await page.waitForTimeout(400)
  const hits = await page.$$('.search__hit')
  if (hits.length < 5) fail(`搜尋結果過少：${hits.length}`)
  await page.screenshot({ path: `${outDir}/11-search.png` })

  await hits[2].click()
  await page.waitForSelector('.chapter mark[data-search-hit]')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/12-search-hit.png` })

  // 快捷鍵：? 開說明、T 開目錄、D 換主題
  await page.keyboard.press('?')
  await page.waitForSelector('.help')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}/13-shortcuts.png` })
  await page.keyboard.press('Escape')

  await page.keyboard.press('t')
  await page.waitForSelector('.toc')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const themeBefore = await page.getAttribute('html', 'data-theme')
  await page.keyboard.press('d')
  await page.waitForTimeout(150)
  if ((await page.getAttribute('html', 'data-theme')) === themeBefore) fail('D 未切換主題')

  // 回到書櫃並確認進度顯示
  await page.click('[aria-label="回到書櫃"]')
  await page.waitForSelector('.library__grid')
  await page.waitForTimeout(300)
  const percent = await page.textContent('.book-card__progress')
  if (!percent) fail('書櫃沒有顯示閱讀進度')
  await page.screenshot({ path: `${outDir}/14-library-progress.png` })

  // 手機尺寸檢查：不得出現水平捲動
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  phone.on('pageerror', (err) => errors.push(err.message))
  await phone.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await phone.waitForSelector('.book-card', { timeout: 20000 })
  await phone.screenshot({ path: `${outDir}/15-phone-library.png` })
  await phone.click('.book-card__open')
  await phone.waitForSelector('.chapter')
  await phone.waitForTimeout(600)
  await phone.screenshot({ path: `${outDir}/16-phone-reading.png` })

  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) fail(`手機版面有 ${overflow}px 水平溢出`)

  await phone.click('[aria-label="開啟目錄"]')
  await phone.waitForSelector('.drawer')
  await phone.waitForTimeout(400)
  await phone.screenshot({ path: `${outDir}/17-phone-toc.png` })
  await phone.close()

  // 離線：Service Worker 註冊後斷網仍要能開啟
  const offlinePage = await browser.newPage()
  await offlinePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await offlinePage.evaluate(() => navigator.serviceWorker.ready)
  await offlinePage.reload({ waitUntil: 'networkidle' })
  await offlinePage.context().setOffline(true)
  await offlinePage.reload({ waitUntil: 'load' })
  await offlinePage.waitForSelector('.library__header', { timeout: 15000 })
  await offlinePage.screenshot({ path: `${outDir}/18-offline.png` })
  await offlinePage.context().setOffline(false)
  await offlinePage.close()

  const errorsToReport = errors.filter((e) => !/favicon|fonts\.g/i.test(e))
  if (errorsToReport.length > 0) fail(`console 錯誤：\n${errorsToReport.join('\n')}`)

  console.log(`✓ 閱讀器渲染正常，目錄 ${items.length} 項，截圖已存至 ${outDir}/`)
} finally {
  await browser.close()
  server.kill()
}
