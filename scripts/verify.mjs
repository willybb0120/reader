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
  await page.waitForSelector('.chapter', { timeout: 15000 })

  await page.screenshot({ path: `${outDir}/01-open.png` })

  await page.click('[aria-label="開啟目錄"]')
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/02-toc.png` })

  const items = await page.$$('.toc__item')
  if (items.length < 2) fail(`目錄項目過少：${items.length}`)
  await items[3].click()
  await page.waitForTimeout(400)

  const text = await page.textContent('.chapter')
  if (!text || text.trim().length < 100) fail(`章節內容過短：${text?.length ?? 0} 字`)
  await page.screenshot({ path: `${outDir}/03-chapter.png` })

  // 閱讀設定：切到夜間主題與較大字級
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/04-settings.png` })

  await page.click('[data-theme-swatch="dark"]')
  await page.waitForTimeout(200)
  const theme = await page.getAttribute('html', 'data-theme')
  if (theme !== 'dark') fail(`主題未切換：${theme}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${outDir}/05-dark.png` })

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
  await page.screenshot({ path: `${outDir}/06-restored.png` })

  const errorsToReport = errors.filter((e) => !/favicon|fonts\.g/i.test(e))
  if (errorsToReport.length > 0) fail(`console 錯誤：\n${errorsToReport.join('\n')}`)

  console.log(`✓ 閱讀器渲染正常，目錄 ${items.length} 項，截圖已存至 ${outDir}/`)
} finally {
  await browser.close()
  server.kill()
}
