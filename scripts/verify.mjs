/**
 * 用真實瀏覽器開啟建置後的閱讀器，走完整流程並產出截圖。
 * 分頁排版依賴真實版面計算，只有這裡驗得到。
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
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return
    } catch {
      /* 尚未啟動 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail('preview 伺服器未能啟動')
}

/** 目前頁碼、總頁數與章名，用來判斷有沒有真的翻頁 */
const readState = (page) =>
  page.evaluate(() => ({
    page: Number(document.querySelector('.pager')?.dataset.page ?? -1),
    pages: Number(document.querySelector('.pager')?.dataset.pages ?? -1),
    title: document.querySelector('.topbar__title')?.textContent ?? '',
    percent: document.querySelector('.pagebar')?.textContent ?? '',
  }))

/** 點閱讀區右側 = 下一頁，左側 = 上一頁 */
async function tap(page, side) {
  const box = await page.locator('.pager').boundingBox()
  const x = side === 'next' ? box.x + box.width * 0.75 : box.x + box.width * 0.12
  await page.mouse.click(x, box.y + box.height * 0.5)
  await page.waitForTimeout(450)
}

await waitForServer()

const browser = await chromium.launch()
const errors = []

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  // 書櫃：內建書應自動匯入
  await page.waitForSelector('.book-card', { timeout: 20000 })
  await page.screenshot({ path: `${outDir}/01-library.png` })
  const cards = await page.$$('.book-card')
  if (cards.length !== 1) fail(`書櫃書本數量錯誤：${cards.length}`)

  await page.click('.book-card__open')
  await page.waitForSelector('.pager', { timeout: 15000 })
  await page.waitForTimeout(600)

  // 頁面不該出現任何捲軸
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  if (scrollable > 0) fail(`閱讀畫面仍可捲動 ${scrollable}px`)

  // 目錄：跳到一個有內文的章節
  await page.click('[aria-label="開啟目錄"]')
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/02-toc.png` })
  const items = await page.$$('.toc__item')
  if (items.length < 2) fail(`目錄項目過少：${items.length}`)
  await items[3].click()
  await page.waitForTimeout(600)

  const text = await page.textContent('.chapter')
  if (!text || text.trim().length < 100) fail(`章節內容過短：${text?.length ?? 0} 字`)
  await page.screenshot({ path: `${outDir}/03-page-1.png` })

  // 分頁：長章節應該不只一頁
  const first = await readState(page)
  if (first.pages < 2) fail(`章節沒有分頁，總頁數 ${first.pages}`)
  if (first.page !== 0) fail(`進入章節不是第一頁：${first.page}`)

  // 點右側往下翻
  await tap(page, 'next')
  const second = await readState(page)
  if (second.page !== 1) fail(`點右側沒有翻到下一頁：${first.page} → ${second.page}`)
  await page.screenshot({ path: `${outDir}/04-page-2.png` })

  // 點左側翻回來
  await tap(page, 'prev')
  if ((await readState(page)).page !== 0) fail('點左側沒有翻回上一頁')

  // 記錄每次 transform 過場的實際移動方向：負數是往左（下一頁），正數是往右（上一頁）
  await page.evaluate(() => {
    const el = document.querySelector('.chapter')
    const x = () => new DOMMatrix(getComputedStyle(el).transform).m41
    window.__moves = []
    let from = null
    el.addEventListener('transitionstart', (event) => {
      if (event.propertyName === 'transform') from = x()
    })
    el.addEventListener('transitionend', (event) => {
      if (event.propertyName !== 'transform' || from === null) return
      window.__moves.push(x() - from)
      from = null
    })
  })

  const lastMove = () => page.evaluate(() => window.__moves.at(-1) ?? null)
  const resetMoves = () => page.evaluate(() => (window.__moves.length = 0))

  // 章內翻頁：往下要往左滑，往回要往右滑
  await resetMoves()
  await tap(page, 'next')
  const inNext = await lastMove()
  if (inNext === null) fail('章內往下翻沒有動畫')
  if (inNext >= 0) fail(`章內往下翻的動畫方向相反：${inNext}`)

  await resetMoves()
  await tap(page, 'prev')
  const inPrev = await lastMove()
  if (inPrev === null) fail('章內往回翻沒有動畫')
  if (inPrev <= 0) fail(`章內往回翻的動畫方向相反：${inPrev}`)

  // 翻到章尾
  while ((await readState(page)).page < first.pages - 1) await tap(page, 'next')

  // 跨章往下：一樣要有動畫，而且要往左滑
  await resetMoves()
  await tap(page, 'next')
  const crossed = await readState(page)
  if (crossed.title === first.title) fail('翻過章尾沒有接到下一章')
  if (crossed.page !== 0) fail(`進入下一章不是第一頁：${crossed.page}`)
  const crossNext = await lastMove()
  if (crossNext === null) fail('跨章往下翻沒有動畫')
  if (crossNext >= 0) fail(`跨章往下翻的動畫方向相反：${crossNext}`)
  await page.screenshot({ path: `${outDir}/05-next-chapter.png` })

  // 跨章往回：要有動畫，而且要往右滑
  await resetMoves()
  await tap(page, 'prev')
  const backed = await readState(page)
  if (backed.title !== first.title) fail('往回翻沒有接回上一章')
  if (backed.page !== backed.pages - 1) fail(`往回翻不是上一章最後一頁：${backed.page}`)
  const crossPrev = await lastMove()
  if (crossPrev === null) fail('跨章往回翻沒有動畫')
  if (crossPrev <= 0) fail(`跨章往回翻的動畫方向相反：${crossPrev}`)

  // 設定：切夜間主題
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/06-settings.png` })
  await page.click('[data-theme-swatch="dark"]')
  await page.waitForTimeout(200)
  if ((await page.getAttribute('html', 'data-theme')) !== 'dark') fail('主題未切換')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/07-dark.png` })

  // 進度：重新載入應回到同一章同一頁
  const before = await readState(page)
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.pager')
  await page.waitForTimeout(900)
  const after = await readState(page)
  if (after.title !== before.title) fail(`重新載入後章節不同：${before.title} → ${after.title}`)
  if (Math.abs(after.page - before.page) > 1)
    fail(`重新載入後頁碼差距過大：${before.page} → ${after.page}`)
  await page.screenshot({ path: `${outDir}/08-restored.png` })

  // 劃線：選一段文字 → 工具列 → 黃色
  await page.evaluate(() => {
    const paragraph = [...document.querySelectorAll('.chapter p')].find(
      (el) => (el.textContent ?? '').trim().length > 30,
    )
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.waitForSelector('.selection-toolbar')
  await page.screenshot({ path: `${outDir}/09-selection.png` })
  await page.click('[aria-label="黃色劃線"]')
  await page.waitForSelector('.chapter mark')

  await page.click('[aria-label="劃線與筆記"]')
  await page.waitForSelector('.annotations')
  await page.waitForTimeout(400)
  if ((await page.$$('.annotation')).length !== 1) fail('側欄標註數量錯誤')
  await page.screenshot({ path: `${outDir}/10-annotations.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 重新載入後劃線仍在
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.pager')
  await page.waitForTimeout(900)
  if ((await page.$$('.chapter mark')).length === 0) fail('重新載入後劃線消失')
  await page.screenshot({ path: `${outDir}/11-highlight-persisted.png` })

  // 搜尋：命中處要落在目前這一頁
  await page.click('[aria-label="搜尋全書"]')
  await page.waitForSelector('.search__field input:not([disabled])', { timeout: 25000 })
  await page.fill('.search__field input', '創造')
  await page.waitForSelector('.search__hit')
  await page.waitForTimeout(400)
  const hits = await page.$$('.search__hit')
  if (hits.length < 5) fail(`搜尋結果過少：${hits.length}`)
  await page.screenshot({ path: `${outDir}/12-search.png` })

  await hits[4].click()
  await page.waitForSelector('.chapter mark[data-search-hit]')
  await page.waitForTimeout(600)
  const onScreen = await page.evaluate(() => {
    const mark = document.querySelector('.chapter mark[data-search-hit]')
    const pager = document.querySelector('.pager')
    if (!mark || !pager) return false
    const a = mark.getBoundingClientRect()
    const b = pager.getBoundingClientRect()
    return a.left >= b.left - 2 && a.right <= b.right + 2
  })
  if (!onScreen) fail('搜尋命中處沒有落在目前這一頁')
  await page.screenshot({ path: `${outDir}/13-search-hit.png` })

  // 快捷鍵
  await page.keyboard.press('?')
  await page.waitForSelector('.help')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}/14-shortcuts.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const beforeKey = await readState(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(350)
  if ((await readState(page)).page === beforeKey.page) fail('方向鍵沒有翻頁')

  // 回到書櫃
  await page.click('[aria-label="回到書櫃"]')
  await page.waitForSelector('.library__grid')
  await page.waitForTimeout(300)
  if (!(await page.textContent('.book-card__progress'))) fail('書櫃沒有顯示閱讀進度')
  await page.screenshot({ path: `${outDir}/15-library-progress.png` })

  // 手機尺寸
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  phone.on('pageerror', (err) => errors.push(err.message))
  await phone.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await phone.waitForSelector('.book-card', { timeout: 20000 })
  await phone.screenshot({ path: `${outDir}/16-phone-library.png` })
  await phone.click('.book-card__open')
  await phone.waitForSelector('.pager')
  await phone.waitForTimeout(800)
  await phone.screenshot({ path: `${outDir}/17-phone-reading.png` })
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) fail(`手機版面有 ${overflow}px 水平溢出`)
  await phone.close()

  // 離線
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

  const reported = errors.filter((e) => !/favicon|fonts\.g/i.test(e))
  if (reported.length > 0) fail(`console 錯誤：\n${reported.join('\n')}`)

  console.log(`✓ 分頁閱讀正常，截圖已存至 ${outDir}/`)
} finally {
  await browser.close()
  server.kill()
}
