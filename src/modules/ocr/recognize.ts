import { createWorker } from 'tesseract.js'

let workerPromise: ReturnType<typeof createWorker> | undefined

export async function recognizeImage(buffer: Buffer): Promise<string> {
  workerPromise ??= createWorker('por+eng')

  const worker = await workerPromise
  const result = await worker.recognize(buffer)

  return result.data.text.trim()
}
