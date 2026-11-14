import { createCanvas } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

function isReadableText(text) {
  const value = String(text || '')
  const printable = value.replace(/\s/g, '')
  const controls = (value.match(CONTROL_CHARACTERS) || []).length
  const words = value.match(/[A-Za-z]{2,}/g)?.length || 0
  return printable.length >= 100 && controls / Math.max(value.length, 1) < 0.02 && words >= 20
}

async function extractWithPdfJs(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push({
      page: pageNumber,
      text: content.items.map((item) => item.str || '').join(' ').trim(),
      pageObject: page,
    })
  }
  return { pageCount: document.numPages, pages }
}

async function ocrPages(pages) {
  const worker = await createWorker('eng')
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    })
    const output = []
    for (const pageData of pages) {
      const viewport = pageData.pageObject.getViewport({ scale: 3 })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      await pageData.pageObject.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise
      const result = await worker.recognize(canvas.toBuffer('image/png'))
      output.push({ page: pageData.page, text: result.data.text.trim() })
    }
    return output
  } finally {
    await worker.terminate()
  }
}

export async function extractPdfText(buffer) {
  const extracted = await extractWithPdfJs(buffer)
  const directPages = extracted.pages.map(({ page, text }) => ({ page, text }))
  const directText = directPages.map(({ text }) => text).join('\f')

  if (isReadableText(directText)) {
    return { method: 'text', pageCount: extracted.pageCount, pages: directPages }
  }

  const ocrPagesResult = await ocrPages(extracted.pages)
  const ocrText = ocrPagesResult.map(({ text }) => text).join('\f')
  return {
    method: 'ocr',
    pageCount: extracted.pageCount,
    pages: ocrPagesResult,
    readable: isReadableText(ocrText),
  }
}

export { isReadableText }
