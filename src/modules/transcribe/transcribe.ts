import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DEFAULT_LANGUAGE = 'pt'
const WHISPER_TIMEOUT_MS = 5 * 60 * 1000

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada.`)
  }

  return value
}

function run(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Tempo limite excedido ao executar ${path.basename(bin)}.`))
    }, timeoutMs)

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function convertToWav(input: Buffer, inputName: string, dir: string): Promise<string> {
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg'
  const source = path.join(dir, `source${path.extname(inputName) || '.bin'}`)
  const target = path.join(dir, 'audio.wav')

  await writeFile(source, input)

  const { code, stderr } = await run(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', target],
    WHISPER_TIMEOUT_MS,
  )

  if (code !== 0) {
    throw new Error(`ffmpeg falhou ao converter o áudio: ${stderr.trim() || `código ${code}`}`)
  }

  return target
}

function parseTranscript(output: string): string {
  return output
    .split('\n')
    .map((line) => line.replace(/^\[[^\]]*\]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim()
}

export async function transcribeAudio(buffer: Buffer, inputName: string): Promise<string> {
  const bin = requireEnv('WHISPER_BIN')
  const model = requireEnv('WHISPER_MODEL')
  const language = process.env.WHISPER_LANGUAGE || DEFAULT_LANGUAGE

  const dir = await mkdtemp(path.join(tmpdir(), 'checkin-transcribe-'))

  try {
    const wav = await convertToWav(buffer, inputName, dir)

    const { code, stdout, stderr } = await run(
      bin,
      ['-m', model, '-f', wav, '-l', language, '-nt'],
      WHISPER_TIMEOUT_MS,
    )

    if (code !== 0) {
      throw new Error(`whisper falhou ao transcrever: ${stderr.trim() || `código ${code}`}`)
    }

    return parseTranscript(stdout)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
