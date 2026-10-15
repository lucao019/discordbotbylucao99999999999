import type { Message } from 'discord.js'
import { recognizeImage } from './recognize'

const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const MAX_IMAGES_PER_MESSAGE = 3

function isSupportedImage(attachment: Message['attachments'] extends Map<string, infer A> ? A : never): boolean {
  const mime = attachment.contentType?.split(';')[0].toLowerCase() ?? ''
  const name = attachment.name ?? ''

  return [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/bmp',
    'image/tiff',
  ].includes(mime) || /\.(png|jpe?g|webp|bmp|tif|tiff)$/i.test(name)
}

function splitText(text: string, maxLength = 1800): string[] {
  const chunks: string[] = []

  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength))
  }

  return chunks
}

export async function processOcrMessage(message: Message): Promise<void> {
  const channelId = process.env.OCR_CHANNEL_ID

  if (!channelId || message.channelId !== channelId || message.author.bot) {
    return
  }

  const images = [...message.attachments.values()]
    .filter(isSupportedImage)
    .slice(0, MAX_IMAGES_PER_MESSAGE)

  if (images.length === 0) return

  try {
    for (const image of images) {
      if (image.size > MAX_IMAGE_SIZE) {
        await message.reply({
          content: `A imagem "${image.name ?? 'sem nome'}" ultrapassa o limite de 8 MB.`,
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const url = new URL(image.url)

      if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
        continue
      }

      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Falha ao baixar imagem: HTTP ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      if (buffer.length > MAX_IMAGE_SIZE) {
        await message.reply({
          content: 'A imagem baixada ultrapassou o limite de 8 MB.',
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const text = await recognizeImage(buffer)

      if (!text) {
        await message.reply({
          content: 'Não consegui identificar texto nessa imagem.',
          allowedMentions: { repliedUser: false },
        })
        continue
      }

      const chunks = splitText(text.replace(/```/g, "'''"))

      for (let i = 0; i < chunks.length; i++) {
        const prefix = images.length > 1 ? `Imagem: ${image.name ?? 'anexo'}\n` : ''
        const part = chunks.length > 1 ? ` (parte ${i + 1}/${chunks.length})` : ''

        await message.reply({
          content: `${prefix}Texto reconhecido${part}:\n\`\`\`text\n${chunks[i]}\n\`\`\``,
          allowedMentions: { repliedUser: false },
        })
      }
    }
  } catch (error) {
    console.error('[OCR] Erro ao processar imagem:', error)

    await message.reply({
      content: 'Não foi possível processar a imagem. Confira o console do bot para ver o erro.',
      allowedMentions: { repliedUser: false },
    }).catch(() => undefined)
  }
}
