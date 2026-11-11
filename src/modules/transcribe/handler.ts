import type { Attachment, Message } from 'discord.js'
import { transcribeAudio } from './transcribe'

const MAX_MEDIA_SIZE = 25 * 1024 * 1024
const MAX_MEDIA_PER_MESSAGE = 3

function isMedia(attachment: Attachment): boolean {
  const mime = attachment.contentType?.split(';')[0].toLowerCase() ?? ''
  const name = attachment.name ?? ''

  return (
    mime.startsWith('audio/') ||
    mime.startsWith('video/') ||
    /\.(ogg|oga|opus|mp3|m4a|wav|flac|webm|mp4|mov|mkv)$/i.test(name)
  )
}

function isImage(attachment: Attachment): boolean {
  const mime = attachment.contentType?.split(';')[0].toLowerCase() ?? ''
  const name = attachment.name ?? ''

  return (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|bmp|tif|tiff)$/i.test(name)
  )
}

function splitText(text: string, maxLength = 1800): string[] {
  const chunks: string[] = []

  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength))
  }

  return chunks
}

// Mantém o aviso de "carregando": o bot aparece digitando e a mensagem de
// status mostra o tempo decorrido. Retorna a função que encerra os dois.
function iniciarCarregamento(message: Message, status: Message, nome: string) {
  const inicio = Date.now()
  const frames = ['⏳', '⌛']
  let n = 0

  const digitando = () => {
    if ('sendTyping' in message.channel) {
      message.channel.sendTyping().catch(() => undefined)
    }
  }

  digitando()
  const typingTimer = setInterval(digitando, 8000)

  const statusTimer = setInterval(() => {
    const segundos = Math.round((Date.now() - inicio) / 1000)
    n++
    status
      .edit({
        content: `${frames[n % frames.length]} Transcrevendo **${nome}**… ${segundos}s`,
        allowedMentions: { repliedUser: false },
      })
      .catch(() => undefined)
  }, 5000)

  return () => {
    clearInterval(typingTimer)
    clearInterval(statusTimer)
  }
}

export async function processTranscribeMessage(message: Message): Promise<void> {
  const channelId = process.env.OCR_CHANNEL_ID

  if (!channelId || message.channelId !== channelId || message.author.bot) {
    return
  }

  // O OCR trata imagens no mesmo canal; a transcrição cuida apenas de áudio/vídeo.
  const media = [...message.attachments.values()]
    .filter((attachment) => isMedia(attachment) && !isImage(attachment))
    .slice(0, MAX_MEDIA_PER_MESSAGE)

  if (media.length === 0) return

  for (const attachment of media) {
    let status: Message | undefined
    let parar: (() => void) | undefined

    try {
      if (attachment.size > MAX_MEDIA_SIZE) {
        await message.reply({
          content: `O arquivo "${attachment.name ?? 'sem nome'}" ultrapassa o limite de 25 MB.`,
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const url = new URL(attachment.url)

      if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
        continue
      }

      const nome = attachment.name ?? 'audio'

      // Aviso de carregamento imediato, antes do download e da transcrição.
      status = await message.reply({
        content: `⏳ Transcrevendo **${nome}**… 0s`,
        allowedMentions: { repliedUser: false },
      })
      parar = iniciarCarregamento(message, status, nome)

      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Falha ao baixar arquivo: HTTP ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const text = await transcribeAudio(buffer, nome)

      parar()
      parar = undefined

      if (!text) {
        await status.edit({
          content: `Não foi possível reconhecer fala em "${nome}".`,
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const chunks = splitText(text.replace(/```/g, "'''"))

      // O primeiro trecho substitui a mensagem de carregamento.
      for (const [i, chunk] of chunks.entries()) {
        const content = `\`\`\`\n${chunk}\n\`\`\``

        if (i === 0) {
          await status.edit({ content, allowedMentions: { repliedUser: false } })
        } else {
          await message.reply({ content, allowedMentions: { repliedUser: false } })
        }
      }
    } catch (error) {
      parar?.()
      console.error('Erro ao transcrever áudio:', error)

      const falha = `Falha ao transcrever "${attachment.name ?? 'sem nome'}".`

      if (status) {
        await status
          .edit({ content: falha, allowedMentions: { repliedUser: false } })
          .catch(() => undefined)
      } else {
        await message
          .reply({ content: falha, allowedMentions: { repliedUser: false } })
          .catch(() => undefined)
      }
    }
  }
}
