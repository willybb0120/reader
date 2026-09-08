export const COLORS = ['yellow', 'green', 'blue', 'pink'] as const
export type Color = (typeof COLORS)[number]

export interface Annotation {
  id: string
  chapterIndex: number
  chapterTitle: string
  /** 章節純文字中的字元位移 */
  start: number
  end: number
  text: string
  note?: string
  color: Color
  createdAt: number
}

export type AnnotationDraft = Omit<Annotation, 'id' | 'createdAt'>

const KEY_PREFIX = 'reader:annotations:'

function read(bookId: string): Annotation[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + bookId)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Annotation[]) : []
  } catch {
    return []
  }
}

function write(bookId: string, annotations: Annotation[]): void {
  try {
    localStorage.setItem(KEY_PREFIX + bookId, JSON.stringify(annotations))
  } catch {
    // 空間不足：標註僅在本次工作階段有效
  }
}

function byPosition(a: Annotation, b: Annotation): number {
  return a.chapterIndex - b.chapterIndex || a.start - b.start
}

export function listAnnotations(bookId: string): Annotation[] {
  return read(bookId).sort(byPosition)
}

export function addAnnotation(bookId: string, draft: AnnotationDraft): Annotation {
  const annotation: Annotation = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  write(bookId, [...read(bookId), annotation])
  return annotation
}

export function updateAnnotation(
  bookId: string,
  id: string,
  patch: Partial<Pick<Annotation, 'note' | 'color'>>,
): void {
  write(
    bookId,
    read(bookId).map((item) => (item.id === id ? { ...item, ...patch } : item)),
  )
}

export function removeAnnotation(bookId: string, id: string): void {
  write(
    bookId,
    read(bookId).filter((item) => item.id !== id),
  )
}

/** 匯出成 Markdown，依章節分組。 */
export function toMarkdown(bookTitle: string, annotations: Annotation[]): string {
  const lines: string[] = [`# ${bookTitle}`, '']
  let lastChapter: number | null = null

  for (const annotation of [...annotations].sort(byPosition)) {
    if (annotation.chapterIndex !== lastChapter) {
      lines.push(`## ${annotation.chapterTitle}`, '')
      lastChapter = annotation.chapterIndex
    }
    lines.push(`> ${annotation.text}`, '')
    if (annotation.note) lines.push(annotation.note, '')
  }

  return lines.join('\n')
}
