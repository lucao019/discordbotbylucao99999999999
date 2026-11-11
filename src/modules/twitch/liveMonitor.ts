import { Client } from 'discord.js'

interface TwitchAccessTokenResponse {
  access_token: string
  expires_in: number
}

interface TwitchStream {
  id: string
  user_name: string
  title: string
}

interface TwitchStreamsResponse {
  data: TwitchStream[]
}

interface LiveMonitorConfig {
  clientId: string
  clientSecret: string
  channelLogin: string
  discordChannelId: string
}

const pollIntervalMs = 60_000

function readConfig(): LiveMonitorConfig | null {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim()
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim()
  const channelLogin = process.env.TWITCH_CHANNEL_LOGIN?.trim().toLowerCase()
  const discordChannelId = process.env.TWITCH_NOTIFY_CHANNEL_ID?.trim()

  if (!clientId || !clientSecret || !channelLogin || !discordChannelId) {
    console.error(
      'Monitoramento Twitch não iniciado: configure TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNEL_LOGIN e TWITCH_NOTIFY_CHANNEL_ID no .env.',
    )
    return null
  }

  if (!/^[a-z0-9_]{1,25}$/.test(channelLogin)) {
    console.error('Monitoramento Twitch não iniciado: TWITCH_CHANNEL_LOGIN inválido.')
    return null
  }

  if (!/^\d{17,20}$/.test(discordChannelId)) {
    console.error('Monitoramento Twitch não iniciado: TWITCH_NOTIFY_CHANNEL_ID inválido.')
    return null
  }

  return {
    clientId,
    clientSecret,
    channelLogin,
    discordChannelId,
  }
}

function createTokenProvider(config: LiveMonitorConfig) {
  let token: string | undefined
  let expiresAt = 0

  return async function getAccessToken() {
    if (token && Date.now() < expiresAt - 60_000) {
      return token
    }

    const url = new URL('https://id.twitch.tv/oauth2/token')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('client_secret', config.clientSecret)
    url.searchParams.set('grant_type', 'client_credentials')

    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) {
      throw new Error(`Twitch OAuth retornou HTTP ${response.status}.`)
    }

    const result = (await response.json()) as TwitchAccessTokenResponse
    if (!result.access_token || !result.expires_in) {
      throw new Error('Twitch OAuth retornou uma resposta inválida.')
    }

    token = result.access_token
    expiresAt = Date.now() + result.expires_in * 1000
    return token
  }
}

async function getLiveStream(
  config: LiveMonitorConfig,
  getAccessToken: () => Promise<string>,
) {
  const token = await getAccessToken()
  const url = new URL('https://api.twitch.tv/helix/streams')
  url.searchParams.set('user_login', config.channelLogin)

  const response = await fetch(url, {
    headers: {
      'Client-Id': config.clientId,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Twitch Helix retornou HTTP ${response.status}.`)
  }

  const result = (await response.json()) as TwitchStreamsResponse
  return result.data[0] ?? null
}

export function startTwitchLiveMonitor(client: Client) {
  const config = readConfig()
  if (!config) return

  const getAccessToken = createTokenProvider(config)
  let lastStreamId: string | null = null

  console.log(
    `Monitoramento Twitch ativo para ${config.channelLogin}; verificações a cada ${pollIntervalMs / 1000} segundos.`,
  )

  const checkStream = async () => {
    try {
      const stream = await getLiveStream(config, getAccessToken)

      if (!stream) {
        lastStreamId = null
        return
      }

      if (stream.id === lastStreamId) return

      const channel = await client.channels.fetch(config.discordChannelId)
      if (!channel?.isTextBased() || !('send' in channel)) {
        throw new Error(
          'O destino configurado para notificações não é um canal de texto acessível.',
        )
      }

      await channel.send({
        content: `[AO VIVO] **${stream.user_name} está ao vivo na Twitch!**\n${stream.title}\nhttps://www.twitch.tv/${config.channelLogin}`,
        allowedMentions: { parse: [] },
      })

      lastStreamId = stream.id
      console.log(`Notificação de live enviada para ${config.channelLogin}.`)
    } catch (error) {
      console.error(
        'Falha ao verificar/enviar notificação da Twitch:',
        error instanceof Error ? error.message : error,
      )
    } finally {
      setTimeout(() => {
        void checkStream()
      }, pollIntervalMs)
    }
  }

  void checkStream()
}
