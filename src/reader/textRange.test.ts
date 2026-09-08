import { describe, expect, test } from 'vitest'
import { createRange, getTextOffsets, plainText, wrapRange } from './textRange'

function root(html: string): HTMLElement {
  const element = document.createElement('div')
  element.innerHTML = html
  return element
}

describe('plainText', () => {
  test('串接所有文字節點', () => {
    expect(plainText(root('<p>abc</p><p>de<em>f</em></p>'))).toBe('abcdef')
  })
})

describe('createRange 與 getTextOffsets', () => {
  test('單一文字節點內的位移', () => {
    const container = root('<p>0123456789</p>')

    const range = createRange(container, 2, 5)!

    expect(range.toString()).toBe('234')
    expect(getTextOffsets(container, range)).toEqual({ start: 2, end: 5 })
  })

  test('跨元素的位移', () => {
    const container = root('<p>abc</p><p>def</p>')

    const range = createRange(container, 1, 5)!

    expect(range.toString()).toBe('bcde')
    expect(getTextOffsets(container, range)).toEqual({ start: 1, end: 5 })
  })

  test('邊界落在元素節點上時也算得出位移', () => {
    const container = root('<p>abc</p><p>def</p>')
    const range = document.createRange()
    range.selectNodeContents(container.querySelectorAll('p')[1])

    expect(getTextOffsets(container, range)).toEqual({ start: 3, end: 6 })
  })

  test('位移超出文字長度時夾到結尾', () => {
    const container = root('<p>abc</p>')

    expect(createRange(container, 1, 99)!.toString()).toBe('bc')
  })

  test('沒有文字時回傳 null', () => {
    expect(createRange(root('<p></p>'), 0, 3)).toBeNull()
  })
})

describe('wrapRange', () => {
  test('把選取範圍包進 mark 並保留原文字', () => {
    const container = root('<p>0123456789</p>')

    const marks = wrapRange(container, 2, 5, 'note-1')

    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('234')
    expect(marks[0].dataset.annotation).toBe('note-1')
    expect(plainText(container)).toBe('0123456789')
  })

  test('跨元素時每段各包一個 mark', () => {
    const container = root('<p>abc</p><p>def</p>')

    const marks = wrapRange(container, 1, 5, 'note-2')

    expect(marks.map((mark) => mark.textContent)).toEqual(['bc', 'de'])
    expect(plainText(container)).toBe('abcdef')
  })

  test('包裝後位移仍然可以還原同一段文字', () => {
    const container = root('<p>abcdefghij</p>')

    wrapRange(container, 2, 5, 'note-3')

    expect(createRange(container, 2, 5)!.toString()).toBe('cde')
  })
})
