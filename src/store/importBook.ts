import { parseEpub } from '../epub/parseEpub'
import { saveBook, type BookRecord } from './library'

/** 解析 EPUB 取出書目資料後存進書櫃。回傳書櫃紀錄。 */
export async function importEpub(data: ArrayBuffer): Promise<BookRecord> {
  const book = await parseEpub(data)
  try {
    return await saveBook(
      {
        id: book.metadata.identifier || book.metadata.title,
        title: book.metadata.title,
        creator: book.metadata.creator,
        cover: book.coverImage,
      },
      data,
    )
  } finally {
    book.dispose()
  }
}
