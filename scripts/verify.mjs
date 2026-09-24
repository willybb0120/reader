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

/**
 * 模擬觸控拉曳：在 selector 元素上送出 touchstart，再分好幾段送 touchmove 從 startY 移到 endY。
 * 刻意不送 touchend，留給呼叫端決定何時放開（拉曳中截圖要用）。
 * Chromium 的 Touch／TouchEvent 建構子在 hasTouch:true 的 context 下就能用，
 * 不需要真的走 CDP 的原生輸入管線，足以驗證我們自己的 touchstart/move/end 監聽邏輯。
 */
async function touchPullStart(page, selector, startY, endY, steps = 8) {
  await page.evaluate(
    ({ selector, startY }) => {
      const target = document.querySelector(selector)
      const rect = target.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      window.__touchX = x
      const touch = new Touch({ identifier: 1, target, clientX: x, clientY: startY })
      target.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { selector, startY },
  )
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps
    await page.evaluate(
      ({ selector, y }) => {
        const target = document.querySelector(selector)
        const touch = new Touch({ identifier: 1, target, clientX: window.__touchX, clientY: y })
        target.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [touch],
            targetTouches: [touch],
            changedTouches: [touch],
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      { selector, y },
    )
    await page.waitForTimeout(16)
  }
}

/** 放開拉曳：送出 touchend，維持 clientY 在最後拉到的位置。 */
async function touchPullEnd(page, selector, endY) {
  await page.evaluate(
    ({ selector, endY }) => {
      const target = document.querySelector(selector)
      const touch = new Touch({ identifier: 1, target, clientX: window.__touchX, clientY: endY })
      target.dispatchEvent(
        new TouchEvent('touchend', {
          touches: [],
          targetTouches: [],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { selector, endY },
  )
}

await waitForServer()

const browser = await chromium.launch()
const errors = []

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })

  // headless Chromium 沒有任何語音，用假的語音引擎驗證朗讀邏輯（音質只能由人耳確認）
  await page.addInitScript(() => {
    window.__spoken = []
    const voices = [
      { voiceURI: 'fake-zh-TW', name: '測試語音（台灣）', lang: 'zh-TW' },
      { voiceURI: 'fake-en', name: 'Test Voice', lang: 'en-US' },
    ]
    let current = null
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak(utterance) {
          current = utterance
          window.__spoken.push(utterance.text)
          setTimeout(() => {
            if (current === utterance) utterance.onend?.()
          }, 60)
        },
        cancel() {
          current = null
        },
        pause() {},
        resume() {},
        addEventListener() {},
        removeEventListener() {},
      },
    })
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text
      }
    }
  })

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

  // 朗讀：逐句高亮、自動翻頁、跨章接續
  await page.click('[aria-label="開始朗讀"]')
  await page.waitForSelector('.chapter mark[data-speaking]', { timeout: 5000 })
  await page.screenshot({ path: `${outDir}/14-narration.png` })

  const spokenAtStart = await page.evaluate(() => window.__spoken.length)
  await page.waitForTimeout(1200)
  const spokenLater = await page.evaluate(() => window.__spoken.length)
  if (spokenLater <= spokenAtStart) fail('朗讀沒有推進到下一句')

  // 念到頁尾必須自動翻頁
  const advanced = await page
    .waitForFunction(() => Number(document.querySelector('.pager')?.dataset.page ?? 0) > 0, null, {
      timeout: 10000,
    })
    .then(() => true)
    .catch(() => false)
  if (!advanced) fail('朗讀念到頁尾沒有自動翻頁')

  // 正在念的句子必須看得到（句子可能跨欄，只看它的第一段矩形）
  const speakingOnScreen = await page
    .waitForFunction(
      () => {
        const mark = document.querySelector('.chapter mark[data-speaking]')
        const pager = document.querySelector('.pager')
        if (!mark || !pager) return false
        const rect = mark.getClientRects()[0]
        const bounds = pager.getBoundingClientRect()
        return !!rect && rect.left >= bounds.left - 4 && rect.right <= bounds.right + 4
      },
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false)
  if (!speakingOnScreen) fail('正在朗讀的句子沒有出現在目前這一頁')

  // 念過的內容要跟書裡的文字一致
  const spokenSample = await page.evaluate(() => window.__spoken[0] ?? '')
  const chapterText = (await page.textContent('.chapter')) ?? ''
  if (!spokenSample || !chapterText.includes(spokenSample))
    fail(`朗讀內容與章節文字不符：${spokenSample}`)

  await page.click('[aria-label="暫停朗讀"]')
  await page.waitForTimeout(300)
  if ((await page.$$('.chapter mark[data-speaking]')).length > 0) fail('暫停後仍有朗讀高亮')

  // 快捷鍵
  await page.keyboard.press('?')
  await page.waitForSelector('.help')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}/15-shortcuts.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const beforeKey = await readState(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(350)
  if ((await readState(page)).page === beforeKey.page) fail('方向鍵沒有翻頁')

  // 直式滾動：切換模式後內容改為垂直捲動
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.click('.setting--row:has-text("直式滾動") input')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.pager--scroll', { timeout: 5000 })
  await page.waitForTimeout(600)

  const scrollBox = await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return { scrollHeight: pager.scrollHeight, clientHeight: pager.clientHeight }
  })
  if (scrollBox.scrollHeight <= scrollBox.clientHeight)
    fail(`滾動模式的內容沒有超出視窗：${scrollBox.scrollHeight} / ${scrollBox.clientHeight}`)

  const pageStillFixed = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  if (pageStillFixed > 0) fail(`滾動模式下整頁也跟著捲動 ${pageStillFixed}px`)
  await page.screenshot({ path: `${outDir}/20-scroll.png` })

  // 捲到中段後重新載入，應回到大致相同的位置
  await page.evaluate(() => document.querySelector('.pager--scroll').scrollTo({ top: 1200 }))
  await page.waitForTimeout(1200)
  const scrollBefore = await page.evaluate(() => ({
    top: document.querySelector('.pager--scroll').scrollTop,
    title: document.querySelector('.topbar__title').textContent,
  }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.pager--scroll')
  await page.waitForTimeout(1200)
  const scrollAfter = await page.evaluate(() => ({
    top: document.querySelector('.pager--scroll').scrollTop,
    title: document.querySelector('.topbar__title').textContent,
  }))
  if (scrollAfter.title !== scrollBefore.title)
    fail(`滾動模式重新載入後章節不同：${scrollBefore.title} → ${scrollAfter.title}`)
  if (Math.abs(scrollAfter.top - scrollBefore.top) > 80)
    fail(`滾動模式重新載入後位置差太多：${scrollBefore.top} → ${scrollAfter.top}`)
  await page.screenshot({ path: `${outDir}/21-scroll-restored.png` })

  // 章尾銜接：捲到底之後再滑一次才換章
  const scrollTitle = () => page.textContent('.topbar__title')
  const beforeCross = await scrollTitle()
  await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    pager.scrollTop = pager.scrollHeight
  })
  await page.waitForTimeout(900)
  if ((await scrollTitle()) !== beforeCross) fail('滾動到底就直接換章了，應該要再滑一次')

  await page.mouse.move(400, 600)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(900)
  const afterCross = await scrollTitle()
  if (afterCross === beforeCross) fail('滾動到底再滑一次沒有換到下一章')
  const enteredTop = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (enteredTop > 4) fail(`換章後沒有回到章首：scrollTop ${enteredTop}`)
  await page.screenshot({ path: `${outDir}/22-scroll-next-chapter.png` })

  // 章首銜接：在頂端往上滑回到上一章的章尾
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(900)
  if ((await scrollTitle()) !== beforeCross) fail('在章首往上滑沒有回到上一章')
  const backTop = await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return pager.scrollHeight - pager.clientHeight - pager.scrollTop
  })
  if (backTop > 8) fail(`往回換章沒有停在上一章章尾：距底 ${backTop}px`)

  // 冷卻期間的連續事件不該連跳：剛換到下一章、還在冷卻窗內時連續收到邊界事件，
  // 冷卻要跟著順延，不能只看「距離第一次換章多久」，否則累計超過 600ms 就會又換一次
  await page.waitForTimeout(700)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(200)
  const afterCooldownCross = await scrollTitle()
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(220)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(220)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(250)
  if ((await scrollTitle()) !== afterCooldownCross)
    fail('冷卻期間的連續滾輪事件又換了一次章')

  // 方向鍵在滾動模式要捲一屏。前面的換章測試可能剛好停在一屏內就放得下的短章節，
  // 那樣的章節本來就沒有捲動空間、按方向鍵會直接換到下一章（符合到底換章的規格），
  // 所以先確保目前章節捲得動，再量測這次按鍵是否真的往下捲。
  for (let guard = 0; guard < 4; guard++) {
    const box = await page.evaluate(() => {
      const pager = document.querySelector('.pager--scroll')
      return { scrollHeight: pager.scrollHeight, clientHeight: pager.clientHeight }
    })
    if (box.scrollHeight > box.clientHeight + 4) break
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(700)
  }
  const keyBefore = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)
  const keyAfter = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (keyAfter <= keyBefore) fail(`滾動模式方向鍵沒有往下捲：${keyBefore} → ${keyAfter}`)

  // 朗讀時正在念的句子要留在畫面上
  await page.click('[aria-label="開始朗讀"]')
  await page.waitForSelector('.chapter mark[data-speaking]', { timeout: 5000 })
  const speakingVisible = await page
    .waitForFunction(
      () => {
        const mark = document.querySelector('.chapter mark[data-speaking]')
        const pager = document.querySelector('.pager--scroll')
        if (!mark || !pager) return false
        const rect = mark.getClientRects()[0]
        const bounds = pager.getBoundingClientRect()
        return !!rect && rect.top >= bounds.top - 4 && rect.bottom <= bounds.bottom + 4
      },
      null,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false)
  if (!speakingVisible) fail('滾動模式下正在朗讀的句子沒有留在畫面上')
  await page.screenshot({ path: `${outDir}/23-scroll-narration.png` })

  // 守住程式捲動旗標：連續念好幾句時，正在念的句子在內容裡的絕對位置只能前進，
  // 不能倒退。旗標壞掉時朗讀跟隨的每一次 seek 都會被誤判成使用者跳讀，
  // 反覆把畫面拉回視窗頂端那一句，絕對位置就會忽大忽小。
  // 章節念完會自動跳到下一章，位置本來就會重新從頭起算，跨章不列入比較。
  const speakingSamples = []
  for (let i = 0; i < 10; i++) {
    const sample = await page.evaluate(() => {
      const mark = document.querySelector('.chapter mark[data-speaking]')
      const pager = document.querySelector('.pager--scroll')
      if (!mark || !pager) return null
      return {
        title: document.querySelector('.topbar__title')?.textContent ?? '',
        position: pager.scrollTop + mark.getBoundingClientRect().top,
      }
    })
    if (sample !== null) speakingSamples.push(sample)
    await page.waitForTimeout(220)
  }
  if (speakingSamples.length < 3)
    fail(`朗讀樣本太少，無法驗證旗標：${speakingSamples.length}`)
  for (let i = 1; i < speakingSamples.length; i++) {
    if (speakingSamples[i].title !== speakingSamples[i - 1].title) continue
    if (speakingSamples[i].position < speakingSamples[i - 1].position - 4)
      fail(
        `朗讀位置退回頂端，程式捲動旗標可能沒有正確歸位：${speakingSamples.map((s) => s.position).join(' → ')}`,
      )
  }

  await page.click('[aria-label="暫停朗讀"]')
  await page.waitForTimeout(300)

  // 守住 Critical 1（切換分頁／滾動時的位置還原）：換到另一個內容夠長的章節。
  // 主線測試一路用的目錄第 3 項內容偏短（只比一屏多一點），捲到底也未必能跨過
  // 分頁版面的第一頁邊界，驗不出這個 bug；這裡改用第 1 項，確保有足夠篇幅可以捲。
  await page.click('[aria-label="開啟目錄"]')
  await page.waitForSelector('.drawer')
  await page.waitForTimeout(400)
  await (await page.$$('.toc__item'))[1].click()
  await page.waitForSelector('.pager--scroll')
  await page.waitForTimeout(600)

  const midBox = await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return { scrollHeight: pager.scrollHeight, clientHeight: pager.clientHeight }
  })
  if (midBox.scrollHeight <= midBox.clientHeight * 3)
    fail(`章節內容不夠長，測不出捲到中段的效果：${midBox.scrollHeight} / ${midBox.clientHeight}`)
  await page.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    pager.scrollTo({ top: (pager.scrollHeight - pager.clientHeight) / 2 })
  })
  await page.waitForTimeout(900)
  const midScrollTop = await page.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (midScrollTop < 50) fail(`捲到中段失敗，scrollTop 只有 ${midScrollTop}`)

  // 切回分頁模式，分頁行為仍然正常
  await page.click('[aria-label="閱讀設定"]')
  await page.waitForSelector('.drawer--right')
  await page.click('.setting--row:has-text("直式滾動") input')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  if (await page.$('.pager--scroll')) fail('關掉直式滾動後仍是滾動版面')
  const backToPaged = await readState(page)
  if (backToPaged.pages < 2) fail(`切回分頁後沒有重新分頁：總頁數 ${backToPaged.pages}`)
  if (backToPaged.page === 0)
    fail('切回分頁後頁碼是 0，捲動中段的位置沒有帶回去（Critical 1：切換版面時位置還原失效）')

  // 回到書櫃
  await page.click('[aria-label="回到書櫃"]')
  await page.waitForSelector('.library__grid')
  await page.waitForTimeout(300)
  if (!(await page.textContent('.book-card__progress'))) fail('書櫃沒有顯示閱讀進度')
  await page.screenshot({ path: `${outDir}/16-library-progress.png` })

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
  await phone.screenshot({ path: `${outDir}/17-phone-library.png` })
  await phone.click('.book-card__open')
  await phone.waitForSelector('.pager')
  await phone.waitForTimeout(800)
  await phone.screenshot({ path: `${outDir}/18-phone-reading.png` })
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) fail(`手機版面有 ${overflow}px 水平溢出`)

  // 拉曳換章：切到直式滾動，並跳到內容夠長的章節才測得出拉曳
  await phone.click('[aria-label="閱讀設定"]')
  await phone.waitForSelector('.drawer--right')
  await phone.click('.setting--row:has-text("直式滾動") input')
  await phone.keyboard.press('Escape')
  await phone.waitForSelector('.pager--scroll', { timeout: 5000 })
  await phone.waitForTimeout(400)

  await phone.click('[aria-label="開啟目錄"]')
  await phone.waitForSelector('.drawer')
  await phone.waitForTimeout(300)
  await (await phone.$$('.toc__item'))[1].click()
  await phone.waitForSelector('.pager--scroll')
  await phone.waitForTimeout(500)

  if (await phone.$('.pull-indicator')) fail('沒有拉曳卻出現指示器常駐元素')

  const pullBox = await phone.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    return { scrollHeight: pager.scrollHeight, clientHeight: pager.clientHeight }
  })
  if (pullBox.scrollHeight <= pullBox.clientHeight * 2)
    fail(`手機章節內容不夠長，測不出拉曳換章：${pullBox.scrollHeight} / ${pullBox.clientHeight}`)

  const pullTitle = () => phone.textContent('.topbar__title')
  const titleBeforePull = await pullTitle()
  const pullChapterTransform = () =>
    phone.evaluate(() => getComputedStyle(document.querySelector('.pager--scroll .chapter')).transform)

  const pullBoxRect = await phone.locator('.pager--scroll').boundingBox()
  const pullStartY = pullBoxRect.y + pullBoxRect.height * 0.7

  // 捲到章尾，準備測試往上拉
  await phone.evaluate(() => {
    const pager = document.querySelector('.pager--scroll')
    pager.scrollTop = pager.scrollHeight
  })
  await phone.waitForTimeout(500)

  // 案例一：拉不夠（門檻 72px，阻尼 0.4，等於要拉超過 180px 原始位移）就放開，要取消
  await touchPullStart(phone, '.pager--scroll', pullStartY, pullStartY - 90)
  await phone.waitForTimeout(80)
  const draggingTransform = await pullChapterTransform()
  if (draggingTransform === 'none') fail('拉曳中內容沒有跟著位移')
  const notArmedYet = await phone.evaluate(() => document.querySelector('.pull-indicator')?.dataset.armed)
  if (notArmedYet !== 'false') fail(`拉不夠時指示器不應標記為 armed：${notArmedYet}`)
  await touchPullEnd(phone, '.pager--scroll', pullStartY - 90)
  await phone.waitForTimeout(400)
  if ((await pullTitle()) !== titleBeforePull) fail('拉不夠門檻卻換章了')
  const canceledTransform = await pullChapterTransform()
  if (canceledTransform !== 'none') fail(`拉不夠取消後位移沒有回到 0：${canceledTransform}`)
  if (await phone.$('.pull-indicator')) fail('放開取消後指示器沒有消失')

  // 案例二：拉超過門檻，過門檻但還沒放開時截圖，放開要真的換章
  await touchPullStart(phone, '.pager--scroll', pullStartY, pullStartY - 220)
  await phone.waitForTimeout(80)
  const armed = await phone.evaluate(() => document.querySelector('.pull-indicator')?.dataset.armed)
  if (armed !== 'true') fail(`過門檻時指示器沒有標記為 armed：${armed}`)
  await phone.screenshot({ path: `${outDir}/24-pull-indicator.png` })

  await touchPullEnd(phone, '.pager--scroll', pullStartY - 220)
  await phone.waitForTimeout(500)
  if ((await pullTitle()) === titleBeforePull) fail('拉超過門檻放開卻沒有換章')
  const pullEnteredTop = await phone.evaluate(() => document.querySelector('.pager--scroll').scrollTop)
  if (pullEnteredTop > 4) fail(`拉曳換章後沒有停在章首：scrollTop ${pullEnteredTop}`)
  if (await phone.$('.pull-indicator')) fail('換章後指示器沒有消失')

  await phone.close()

  // 離線
  const offlinePage = await browser.newPage()
  await offlinePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await offlinePage.evaluate(() => navigator.serviceWorker.ready)
  await offlinePage.reload({ waitUntil: 'networkidle' })
  await offlinePage.context().setOffline(true)
  await offlinePage.reload({ waitUntil: 'load' })
  await offlinePage.waitForSelector('.library__header', { timeout: 15000 })
  await offlinePage.screenshot({ path: `${outDir}/19-offline.png` })
  await offlinePage.context().setOffline(false)
  await offlinePage.close()

  const reported = errors.filter((e) => !/favicon|fonts\.g/i.test(e))
  if (reported.length > 0) fail(`console 錯誤：\n${reported.join('\n')}`)

  console.log(`✓ 分頁閱讀正常，截圖已存至 ${outDir}/`)
} finally {
  await browser.close()
  server.kill()
}
