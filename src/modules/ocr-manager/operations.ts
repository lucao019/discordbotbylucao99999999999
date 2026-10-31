import { Message, TextChannel } from 'discord.js'

// ====================================
// UTILIDADES
// ====================================

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const QUATORZE_DIAS = 14 * 24 * 60 * 60 * 1000

// ====================================
// BUSCAR MENSAGENS
// ====================================

export async function fetchAllMessages(
  channel: TextChannel,
): Promise<Message[]> {
  const mensagens: Message[] = []
  let lastId: string | undefined

  while (true) {
    const opcoes: { limit: number; before?: string } = { limit: 100 }

    if (lastId) {
      opcoes.before = lastId
    }

    const lote = await channel.messages.fetch(opcoes)

    if (lote.size === 0) break

    mensagens.push(...lote.values())
    lastId = lote.last()?.id

    if (lote.size < 100) break
  }

  return mensagens
}

export async function fetchRecentMessages(
  channel: TextChannel,
  count: number,
): Promise<Message[]> {
  const limite = Math.min(count, 100)
  const lote = await channel.messages.fetch({ limit: limite })
  return [...lote.values()]
}

// ====================================
// APAGAR MENSAGENS
// ====================================

export async function deleteMessages(
  channel: TextChannel,
  messages: Message[],
): Promise<{ deleted: number; failed: number }> {
  const agora = Date.now()
  const recentes: Message[] = []
  const antigas: Message[] = []

  for (const msg of messages) {
    if (agora - msg.createdTimestamp < QUATORZE_DIAS) {
      recentes.push(msg)
    } else {
      antigas.push(msg)
    }
  }

  let deleted = 0
  let failed = 0

  // Apagar em lote (mensagens com menos de 14 dias)
  for (let i = 0; i < recentes.length; i += 100) {
    const lote = recentes.slice(i, i + 100)

    try {
      const resultado = await channel.bulkDelete(lote, true)
      deleted += resultado.size
    } catch (error) {
      console.error('[OCR-MGR] Falha no bulkDelete:', error)
      failed += lote.length
    }
  }

  // Apagar individualmente (mensagens com 14 dias ou mais)
  for (const msg of antigas) {
    try {
      await msg.delete()
      deleted++
      await esperar(400)
    } catch (error) {
      console.error(`[OCR-MGR] Falha ao apagar ${msg.id}:`, error)
      failed++
    }
  }

  return { deleted, failed }
}

// ====================================
// PAGINAÇÃO
// ====================================

export function paginateMessages(
  messages: Message[],
  page: number,
): { items: Message[]; totalPages: number; page: number } {
  const porPagina = 10
  const totalPages = Math.max(1, Math.ceil(messages.length / porPagina))
  const paginaSegura = Math.max(0, Math.min(page, totalPages - 1))
  const inicio = paginaSegura * porPagina
  const items = messages.slice(inicio, inicio + porPagina)

  return { items, totalPages, page: paginaSegura }
}
