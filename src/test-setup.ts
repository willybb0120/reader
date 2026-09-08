// jsdom 未實作 Object URL，測試中以計數器替代。
let counter = 0
const store = new Map<string, Blob>()

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${++counter}`
    store.set(url, blob)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    store.delete(url)
  }
}
