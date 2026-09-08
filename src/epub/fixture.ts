import { zipSync, strToU8 } from 'fflate'

/** 1x1 透明 PNG，供測試圖片資源改寫用 */
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

export interface FixtureOptions {
  /** 省略 META-INF/container.xml */
  omitContainer?: boolean
  /** 讓 container.xml 指向不存在的 OPF */
  brokenOpfPath?: boolean
  /** spine 清空 */
  emptySpine?: boolean
  /** 章節引用不存在的圖片 */
  missingImage?: boolean
}

/** 產生一本最小但結構完整的 EPUB，作為測試 fixture。 */
export function makeEpub(options: FixtureOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {}

  files['mimetype'] = strToU8('application/epub+zip')

  if (!options.omitContainer) {
    const opfPath = options.brokenOpfPath ? 'OEBPS/nope.opf' : 'OEBPS/content.opf'
    files['META-INF/container.xml'] = strToU8(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    )
  }

  const spine = options.emptySpine
    ? ''
    : `<itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/><itemref idref="c4"/>`

  files['OEBPS/content.opf'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:test-book-1</dc:identifier>
    <dc:title>測試書名</dc:title>
    <dc:creator>測試作者</dc:creator>
    <dc:language>zh-TW</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
    <item id="c4" href="c4.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>${spine}</spine>
</package>`,
  )

  files['OEBPS/nav.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc">
  <ol>
    <li><a href="c1.xhtml">第一章</a>
      <ol><li><a href="c1.xhtml#s1">第一節</a></li></ol>
    </li>
    <li><a href="text/c2.xhtml">第二章</a></li>
  </ol>
</nav></body></html>`,
  )

  const img = options.missingImage ? 'gone.png' : 'cover.png'
  files['OEBPS/c1.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title>
<link rel="stylesheet" href="style.css"/></head>
<body><h1>第一章</h1><p id="s1">內文一。</p>
<p><img src="${img}" alt="圖"/></p>
<p><a href="text/c2.xhtml">前往第二章</a></p>
<script>alert(1)</script></body></html>`,
  )

  files['OEBPS/text/c2.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title></head>
<body><h1>第二章</h1><p>內文二。</p>
<p><a href="../c1.xhtml">回第一章</a></p></body></html>`,
  )

  files['OEBPS/c3.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第三章</title></head>
<body><h1>第三章</h1><p>內文三。</p></body></html>`,
  )

  // 以 SVG 包住封面圖，calibre 轉檔常見的寫法
  files['OEBPS/c4.xhtml'] = strToU8(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>封面</title></head>
<body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="100%" height="100%" viewBox="0 0 100 200"><image width="100" height="200" xlink:href="cover.png"/></svg>
</body></html>`,
  )

  files['OEBPS/style.css'] = strToU8('p { color: rebeccapurple }')
  files['OEBPS/cover.png'] = PNG_1PX

  return zipSync(files)
}
