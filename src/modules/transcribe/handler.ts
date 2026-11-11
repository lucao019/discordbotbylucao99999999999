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

      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Falha ao baixar arquivo: HTTP ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      const text = await transcribeAudio(buffer, attachment.name ?? 'audio')

      if (!text) {
        await message.reply({
          content: `Não foi possível reconhecer fala em "${attachment.name ?? 'sem nome'}".`,
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const chunks = splitText(text.replace(/```/g, "'''"))

      for (const chunk of chunks) {
        await message.reply({
          content: `\`\`\`\n${chunk}\n\`\`\``,
          allowedMentions: { repliedUser: false },
        })
      }
    } catch (error) {
      console.error('Erro ao transcrever áudio:', error)
      await message
        .reply({
          content: `Falha ao transcrever "${attachment.name ?? 'sem nome'}".`,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => undefined)
    }
  }
}
