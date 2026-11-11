import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'

// Pasta onde ficam os logs de erro (um arquivo por dia).
const LOG_DIR = path.resolve(process.cwd(), 'logs')
// Logs mais antigos que isso (em dias) são apagados ao iniciar.
const RETENCAO_DIAS = 14

function arquivoDeHoje() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return path.join(
    LOG_DIR,
    `erros-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`,
  )
}

function escrever(nivel: string, texto: string) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const linha = `[${new Date().toISOString()}] ${nivel} ${texto}\n`
    fs.appendFileSync(arquivoDeHoje(), linha, 'utf8')
  } catch {
    // Se o log falhar, nunca derrubar o bot por isso.
  }
}

function limparAntigos() {
  try {
    const limite = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000
    for (const nome of fs.readdirSync(LOG_DIR)) {
      if (!/^erros-.*\.log$/.test(nome)) continue
      const caminho = path.join(LOG_DIR, nome)
      if (fs.statSync(caminho).mtimeMs < limite) fs.unlinkSync(caminho)
    }
  } catch {
    // Pasta ainda não existe ou sem permissão: ignorar.
  }
}

export function initLogger() {
  limparAntigos()

  // Tudo que o código já imprime com console.error / console.warn
  // continua aparecendo no terminal e também vai para o arquivo.
  const originalError = console.error.bind(console)
  const originalWarn = console.warn.bind(console)

  console.error = (...args: unknown[]) => {
    originalError(...args)
    escrever('ERROR', format(...args))
  }

  console.warn = (...args: unknown[]) => {
    originalWarn(...args)
    escrever('WARN ', format(...args))
  }

  // Crash: registra o motivo e encerra (um gerenciador como pm2 ou
  // Docker pode reiniciar o processo depois).
  process.on('uncaughtException', (error) => {
    escrever('FATAL', `uncaughtException: ${format(error)}`)
    originalError('FATAL uncaughtException:', error)
    process.exit(1)
  })

  // Promessa rejeitada sem tratamento: registra e mantém o bot vivo.
  process.on('unhandledRejection', (reason) => {
    escrever('ERROR', `unhandledRejection: ${format(reason)}`)
    originalError('unhandledRejection:', reason)
  })

  process.on('exit', (code) => {
    if (code !== 0) escrever('INFO ', `Processo encerrado com código ${code}`)
  })

  escrever('INFO ', 'Bot iniciando')
}
