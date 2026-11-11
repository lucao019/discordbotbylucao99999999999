import 'dotenv/config'
import { initLogger } from './logger'

initLogger()

import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  Message,
  TextChannel,
  User,
} from 'discord.js'

import sharp from 'sharp'
import { processOcrMessage } from './modules/ocr/handler'
import { registerOcrCommands } from './modules/ocr-manager/command.js'
import { handleOcrLimparCommand, handleOcrManagerButton } from './modules/ocr-manager/handler.js'
import { processTranscribeMessage } from './modules/transcribe/handler'
import { startTwitchLiveMonitor } from './modules/twitch/liveMonitor'

const token = process.env.DISCORD_TOKEN
const userId = process.env.USER_ID
const catracaChannelIdEnv = process.env.CATRACA_CHANNEL_ID

if (!token) {
  throw new Error('DISCORD_TOKEN não encontrado no .env')
}

if (!catracaChannelIdEnv) {
  throw new Error('CATRACA_CHANNEL_ID não encontrado no .env')
}

const catracaChannelId: string = catracaChannelIdEnv

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

// ====================================
// UTILIDADES
// ====================================

function dataHora(ms: number | null) {
  if (!ms) return 'null'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms))
}

function idadeConta(createdTimestamp: number) {
  const dias = Math.floor(
    (Date.now() - createdTimestamp) /
      (1000 * 60 * 60 * 24),
  )

  if (dias < 1) return 'menos de 1 dia'
  if (dias < 30) return `${dias} dias`

  const meses = Math.floor(dias / 30.4375)

  if (meses < 12) {
    return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  }

  const anos = Math.floor(meses / 12)
  const restoMeses = meses % 12

  if (restoMeses === 0) {
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  }

  return `${anos} ${
    anos === 1 ? 'ano' : 'anos'
  }, ${restoMeses} ${
    restoMeses === 1 ? 'mês' : 'meses'
  }`
}

function escaparXml(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function buscarUsuarioCompleto(user: User) {
  try {
    return await user.fetch(true)
  } catch {
    return user
  }
}

async function baixarImagem(url: string) {
  const resposta = await fetch(url)

  if (!resposta.ok) {
    throw new Error(
      `Falha ao baixar imagem: ${resposta.status}`,
    )
  }

  return Buffer.from(await resposta.arrayBuffer())
}

// ====================================
// CARD GRÁFICO
// ====================================



async function gerarProfileCard(
  member: GuildMember,
  user: User,
  numero: number,
  // 2 = card em alta resolução (1800×780); 1 = tamanho original (900×390).
  escala = 2,
): Promise<{
  buffer: Buffer
  extension: 'png' | 'gif'
}> {
  const S = escala
  const largura = 900 * S
  const altura = 390 * S
  const bannerHeight = 220 * S

  const avatarSize = 150 * S
  const avatarX = 50 * S
  const avatarY = 170 * S

  const bannerAnimado =
    user.banner?.startsWith('a_') ?? false

  const bannerUrl = user.bannerURL({
    size: bannerAnimado ? 1024 : 2048,
    extension: bannerAnimado
      ? 'gif'
      : 'png',
  })

  const avatarUrl = member.displayAvatarURL({
    size: 512,
    extension: 'png',
  })

  // --------------------------------
  // ELEMENTOS FIXOS DO CARD
  // --------------------------------

  const gradiente = Buffer.from(`
    <svg
      width="${largura}"
      height="${180 * S}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="fade"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="#111318"
            stop-opacity="0"
          />

          <stop
            offset="100%"
            stop-color="#111318"
            stop-opacity="1"
          />
        </linearGradient>
      </defs>

      <rect
        width="100%"
        height="100%"
        fill="url(#fade)"
      />
    </svg>
  `)

  // --------------------------------
  // AVATAR
  // --------------------------------

  const avatarOriginal =
    await baixarImagem(avatarUrl)

  const mascaraAvatar = Buffer.from(`
    <svg
      width="${avatarSize}"
      height="${avatarSize}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="${avatarSize / 2}"
        cy="${avatarSize / 2}"
        r="${avatarSize / 2}"
        fill="white"
      />
    </svg>
  `)

  const avatar = await sharp(avatarOriginal)
    .resize(avatarSize, avatarSize, {
      fit: 'cover',
    })
    .composite([
      {
        input: mascaraAvatar,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer()

  // --------------------------------
  // BORDA DO AVATAR
  // --------------------------------

  const bordaSize = avatarSize + 14 * S

  const borda = Buffer.from(`
    <svg
      width="${bordaSize}"
      height="${bordaSize}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="${bordaSize / 2}"
        cy="${bordaSize / 2}"
        r="${bordaSize / 2 - 2 * S}"
        fill="#111318"
      />
    </svg>
  `)

  // --------------------------------
  // TEXTO
  // --------------------------------

  const displayName = escaparXml(
    member.displayName,
  )

  const username = escaparXml(
    user.username,
  )

  const texto = Buffer.from(`
    <svg
      width="${largura}"
      height="${altura}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>
        .name {
          fill: white;
          font-size: ${36 * S}px;
          font-weight: 700;
          font-family: Arial, sans-serif;
        }

        .user {
          fill: #b5bac1;
          font-size: ${22 * S}px;
          font-family: Arial, sans-serif;
        }

        .member {
          fill: #b5bac1;
          font-size: ${19 * S}px;
          font-family: Arial, sans-serif;
        }

        .checkin {
          fill: #7d8590;
          font-size: ${16 * S}px;
          font-family: Arial, sans-serif;
        }
      </style>

      <text
        x="${230 * S}"
        y="${285 * S}"
        class="name"
      >${displayName}</text>

      <text
        x="${230 * S}"
        y="${320 * S}"
        class="user"
      >@${username}</text>

      <text
        x="${230 * S}"
        y="${352 * S}"
        class="member"
      >MEMBER #${numero}</text>

      <text
        x="${745 * S}"
        y="${360 * S}"
        class="checkin"
      >CHECKIN</text>
    </svg>
  `)

  // --------------------------------
  // LAYERS FIXAS
  // --------------------------------

  const layersFixas: sharp.OverlayOptions[] = [
    {
  input: gradiente,
  top: 40 * S,
  left: 0,
},
    {
      input: borda,
      top: avatarY - 7 * S,
      left: avatarX - 7 * S,
    },
    {
      input: avatar,
      top: avatarY,
      left: avatarX,
    },
    {
      input: texto,
      top: 0,
      left: 0,
    },
  ]

  // --------------------------------
  // SEM BANNER
  // --------------------------------

  if (!bannerUrl) {
    const buffer = await sharp({
      create: {
        width: largura,
        height: altura,
        channels: 4,
        background: '#111318',
      },
    })
      .composite(layersFixas)
      .png()
      .toBuffer()

    return {
      buffer,
      extension: 'png',
    }
  }

  const bannerBuffer =
    await baixarImagem(bannerUrl)

  // --------------------------------
  // BANNER ESTÁTICO
  // --------------------------------

  if (!bannerAnimado) {
    const banner = await sharp(bannerBuffer)
      .resize(largura, bannerHeight, {
  fit: 'cover',
  position: 'centre',
})
      .png()
      .toBuffer()

    const buffer = await sharp({
      create: {
        width: largura,
        height: altura,
        channels: 4,
        background: '#111318',
      },
    })
      .composite([
        {
  input: banner,
  top: 0,
  left: 0,
},
        ...layersFixas,
      ])
      .png()
      .toBuffer()

    return {
      buffer,
      extension: 'png',
    }
  }

  // --------------------------------
  // BANNER ANIMADO
  // --------------------------------

  try {
    const metadata = await sharp(bannerBuffer, { animated: true }).metadata()

    const paginas = metadata.pages ?? 1
    // O sharp só aceita 0..65535; valores fora disso (ex.: 65536) viram loop infinito.
    const loop =
      metadata.loop !== undefined && metadata.loop <= 65535 ? metadata.loop : 0
    const delays =
      metadata.delay && metadata.delay.length === paginas
        ? metadata.delay
        : Array<number>(paginas).fill(100)

    // Compõe cada quadro do banner como um card completo (900×390)
    const quadros: Buffer[] = []

    for (let pagina = 0; pagina < paginas; pagina++) {
      const fundoBanner = await sharp(bannerBuffer, {
        animated: true,
        page: pagina,
        pages: 1,
      })
        .resize(largura, bannerHeight, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer()

      const quadro = await sharp({
        create: {
          width: largura,
          height: altura,
          channels: 4,
          background: '#111318',
        },
      })
        .composite([
          { input: fundoBanner, top: 0, left: 0 },
          ...layersFixas,
        ])
        .raw()
        .toBuffer()

      quadros.push(quadro)
    }

    // Empilha os quadros em RGBA cru e codifica como um único GIF animado.
    // pageHeight faz o sharp reinterpretar a imagem empilhada como N quadros.
    const buffer = await sharp(Buffer.concat(quadros), {
      raw: {
        width: largura,
        height: altura * paginas,
        channels: 4,
        pageHeight: altura,
      },
    })
      .gif({ loop, delay: delays })
      .toBuffer()

    // Limite de upload do Discord: se o GIF em alta resolução ficar pesado,
    // refaz em tamanho normal.
    if (buffer.length > 8 * 1024 * 1024 && S > 1) {
      console.warn(
        `[CATRACA] GIF de ${(buffer.length / 1048576).toFixed(1)} MB; refazendo em escala 1x.`,
      )
      return gerarProfileCard(member, user, numero, 1)
    }

    return { buffer, extension: 'gif' }
  } catch (erro) {
    console.error(
      '[CATRACA] Falha no banner animado, usando PNG estático:',
      erro,
    )

    const banner = await sharp(bannerBuffer)
      .resize(largura, bannerHeight, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()

    const buffer = await sharp({
      create: {
        width: largura,
        height: altura,
        channels: 4,
        background: '#111318',
      },
    })
      .composite([
        { input: banner, top: 0, left: 0 },
        ...layersFixas,
      ])
      .png()
      .toBuffer()

    return { buffer, extension: 'png' }
  }
}

// ====================================
// TREE VIEW
// ====================================

function gerarTree(
  member: GuildMember,
  user: User,
  numero: number,
) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.name)

  const linhas: string[] = []

  linhas.push('MEMBRO')

  // IDENTIDADE
  linhas.push('├─ identidade')
  linhas.push(
    `│  ├─ nome no servidor: ${member.displayName}`,
  )
  linhas.push(
    `│  ├─ usuário: ${user.username}`,
  )
  linhas.push(
    `│  └─ id: ${user.id}`,
  )

  linhas.push('│')

  // CONTA DISCORD
  linhas.push('├─ conta Discord')
  linhas.push(
    `│  ├─ criada em: ${dataHora(
      user.createdTimestamp,
    )}`,
  )
  linhas.push(
    `│  └─ idade da conta: ${idadeConta(
      user.createdTimestamp,
    )}`,
  )

  linhas.push('│')

  // SERVIDOR
  linhas.push('├─ servidor')

  const dadosServidor: string[] = [
    `entrou em: ${dataHora(member.joinedTimestamp)}`,
    `membro: #${numero}`,
  ]

  // Só mostra apelido se realmente existir
  if (member.nickname) {
    dadosServidor.push(
      `apelido: ${member.nickname}`,
    )
  }

  // Só mostra boost se o membro estiver boostando
  if (member.premiumSinceTimestamp) {
    dadosServidor.push(
      `boost desde: ${dataHora(
        member.premiumSinceTimestamp,
      )}`,
    )
  }

  dadosServidor.forEach((dado, index) => {
    const ultimo =
      index === dadosServidor.length - 1

    linhas.push(
      `│  ${ultimo ? '└─' : '├─'} ${dado}`,
    )
  })

  // CARGOS
  if (roles.length > 0) {
    linhas.push('│')
    linhas.push('├─ cargos')

    roles.forEach((role, index) => {
      const ultimo =
        index === roles.length - 1

      linhas.push(
        `│  ${
          ultimo ? '└─' : '├─'
        } ${role}`,
      )
    })
  }

  // TRANSFORMA A ÚLTIMA SEÇÃO EM └─
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (linhas[i]?.startsWith('├─')) {
      linhas[i] = linhas[i]!.replace(
        '├─',
        '└─',
      )
      break
    }
  }

  return linhas.join('\n')
}

// ====================================
// GERAR CHECKIN
// ====================================

async function gerarCheckIn(
  member: GuildMember,
  teste = false,
  numeroMembro?: number,
  editar?: Message,
) {
  const channel =
    await client.channels.fetch(
      catracaChannelId,
    )

  if (
    !channel ||
    !(channel instanceof TextChannel)
  ) {
    throw new Error(
      '#catraca não encontrado.',
    )
  }

  const user =
    await buscarUsuarioCompleto(
      member.user,
    )

  const numero =
    numeroMembro ??
    member.guild.memberCount

  console.log(
    `Renderizando perfil de ${user.username}...`,
  )

  const profileCard =
    await gerarProfileCard(
      member,
      user,
      numero,
    )

  console.log(
    `  card ${profileCard.extension.toUpperCase()}: ${(profileCard.buffer.length / 1048576).toFixed(2)} MB`,
  )

  const nomeArquivo =
  `checkin-profile.${profileCard.extension}`

const arquivo =
  new AttachmentBuilder(
    profileCard.buffer,
    {
      name: nomeArquivo,
    },
  )

  const tree =
    gerarTree(
      member,
      user,
      numero,
    )

  const embed =
    new EmbedBuilder()
      .setAuthor({
        name: teste
          ? 'CheckIn • TEST MODE'
          : 'CheckIn • MEMBER ENTRY',
      })

      .setDescription(
        [
          '```text',
          tree,
          '```',
        ].join('\n'),
      )

      .setImage(
  `attachment://${nomeArquivo}`,
)

      .setFooter({
        text:
          `CheckIn • ${member.guild.name}` +
          ` • ${user.id}`,
      })

      .setTimestamp(editar?.createdTimestamp ?? Date.now())

  if (user.accentColor != null) {
  embed.setColor(
    user.accentColor,
  )
}

  if (editar) {
    // Substitui o card no lugar, mantendo a posição e a data da mensagem.
    await editar.edit({
      embeds: [embed],
      files: [arquivo],
      attachments: [],
    })
  } else {
    await channel.send({
      embeds: [embed],
      files: [arquivo],
    })
  }

  console.log(
    `✓ ${user.username} → membro #${numero}`,
  )
}

// ====================================
// BUSCAR MEMBROS
// ====================================

async function obterMembrosOrdenados() {
  const guild =
    client.guilds.cache.first()

  if (!guild) {
    throw new Error(
      'Servidor não encontrado.',
    )
  }

  const collection =
    await guild.members.fetch()

  return [...collection.values()]
    .filter(
      (member) => !member.user.bot,
    )
    .sort(
      (a, b) =>
        (a.joinedTimestamp ?? 0) -
        (b.joinedTimestamp ?? 0),
    )
}

// ====================================
// SINCRONIZAÇÃO
// ====================================

async function sincronizarCatraca() {
  console.log('')
  console.log(
    '=================================',
  )
  console.log(
    '      CHECKIN LAYERED • SYNC',
  )
  console.log(
    '=================================',
  )

  const membros =
    await obterMembrosOrdenados()

  console.log(
    `${membros.length} membros encontrados.`,
  )

  let enviados = 0

  for (
    let i = 0;
    i < membros.length;
    i++
  ) {
    try {
      await gerarCheckIn(
        membros[i],
        false,
        i + 1,
      )

      enviados++

      await esperar(1800)
    } catch (error) {
      console.error(
        `✗ ${membros[i].user.username}`,
        error,
      )
    }
  }

  console.log(
    `${enviados} cards enviados.`,
  )
}


// ====================================
// RECUPERAÇÃO DE MEMBROS PERDIDOS
// ====================================

// Lê o #catraca e devolve os IDs que já têm card.
// O ID do membro é o último trecho do rodapé do embed.
async function idsJaRegistrados(channel: TextChannel) {
  const registrados = new Set<string>()
  let antes: string | undefined

  while (true) {
    const mensagens = await channel.messages.fetch({
      limit: 100,
      ...(antes ? { before: antes } : {}),
    })

    if (mensagens.size === 0) break

    for (const message of mensagens.values()) {
      if (message.author.id !== client.user?.id) continue

      for (const embed of message.embeds) {
        const id = embed.footer?.text?.split('•').pop()?.trim()
        if (id && /^\d{15,25}$/.test(id)) registrados.add(id)
      }
    }

    antes = mensagens.last()?.id
    if (mensagens.size < 100) break
  }

  return registrados
}

// Cria cards apenas para quem entrou com o bot offline.
async function recuperarMembrosFaltantes() {
  const channel = await client.channels.fetch(catracaChannelId)

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('#catraca não encontrado.')
  }

  const registrados = await idsJaRegistrados(channel)
  const membros = await obterMembrosOrdenados()

  const faltantes = membros
    .map((member, i) => ({ member, numero: i + 1 }))
    .filter(({ member }) => !registrados.has(member.id))

  if (faltantes.length === 0) {
    console.log('Catraca em dia: nenhum membro faltando.')
    return
  }

  console.log(
    `${faltantes.length} membro(s) sem card. Recuperando...`,
  )

  let enviados = 0

  for (const { member, numero } of faltantes) {
    try {
      await gerarCheckIn(member, false, numero)
      enviados++
      await esperar(1800)
    } catch (error) {
      console.error(`✗ ${member.user.username}`, error)
    }
  }

  console.log(
    `${enviados}/${faltantes.length} cards recuperados.`,
  )
}

// ====================================
// REFAZER CARDS DE QUEM TEM NITRO
// ====================================

// A API não informa o Nitro de outros usuários; banner e avatar animado
// só existem com Nitro, então servem como indicador.
function temNitro(user: User) {
  return Boolean(user.banner) || (user.avatar?.startsWith('a_') ?? false)
}

// modo 'nitro' refaz quem tem Nitro; 'restantes' refaz todos os outros.
async function refazerCards(modo: 'nitro' | 'restantes') {
  const channel = await client.channels.fetch(catracaChannelId)

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('#catraca não encontrado.')
  }

  const guild = channel.guild
  const mensagens: Message[] = []
  let antes: string | undefined

  while (true) {
    const lote = await channel.messages.fetch({
      limit: 100,
      ...(antes ? { before: antes } : {}),
    })

    if (lote.size === 0) break

    for (const m of lote.values()) {
      if (m.author.id === client.user?.id && m.embeds.length > 0) mensagens.push(m)
    }

    antes = lote.last()?.id
    if (lote.size < 100) break
  }

  let refeitos = 0
  let ignorados = 0

  for (const message of mensagens.reverse()) {
    const embed = message.embeds[0]
    const id = embed?.footer?.text?.split('•').pop()?.trim()
    if (!id || !/^\d{15,25}$/.test(id)) continue

    const member = await guild.members.fetch(id).catch(() => null)
    if (!member) {
      ignorados++
      continue
    }

    const user = await buscarUsuarioCompleto(member.user)
    if (temNitro(user) !== (modo === 'nitro')) continue

    const numero = Number(/membro: #(\d+)/.exec(embed?.description ?? '')?.[1])

    try {
      await gerarCheckIn(
        member,
        false,
        Number.isFinite(numero) && numero > 0 ? numero : undefined,
        message,
      )
      refeitos++
      await esperar(1800)
    } catch (error) {
      console.error(`✗ ${user.username}`, error)
    }
  }

  console.log(
    `${refeitos} card(s) refeito(s) (${modo}). ${ignorados} membro(s) que saíram foram ignorados.`,
  )
}

// ====================================
// REBUILD COMPLETO DA CATRACA
// ====================================

async function reconstruirCatraca() {
  const channel = await client.channels.fetch(
    catracaChannelId,
  )

  if (
    !channel ||
    !(channel instanceof TextChannel)
  ) {
    throw new Error(
      '#catraca não encontrado.',
    )
  }

  console.log('')
  console.log('=================================')
  console.log('       CHECKIN • REBUILD')
  console.log('=================================')
  console.log('Limpando registros antigos...')

  let apagadas = 0

  while (true) {
    const mensagens = await channel.messages.fetch({
      limit: 100,
    })

    if (mensagens.size === 0) {
      break
    }

    const paraApagar = mensagens.filter(
      (message) => {
        // Mensagens produzidas pelo CheckIn.
        if (
          client.user &&
          message.author.id === client.user.id
        ) {
          return true
        }

        // Mensagens automáticas de entrada do Discord.
        // Não toca em conversas normais.
        if (message.system) {
          return true
        }

        return false
      },
    )

    if (paraApagar.size === 0) {
      break
    }

    for (const message of paraApagar.values()) {
      try {
        await message.delete()

        apagadas++

        console.log(
          `🗑 Mensagem removida: ${message.id}`,
        )

        await esperar(400)
      } catch (error) {
        console.log(
          `⚠ Não foi possível remover ${message.id}`,
        )
      }
    }

    // Se recebemos menos de 100, chegamos ao fim
    // do histórico disponível nessa busca.
    if (mensagens.size < 100) {
      break
    }
  }

  console.log('')
  console.log(`${apagadas} mensagens removidas.`)
  console.log('')
  console.log('Reconstruindo membros...')
  console.log('')

  const membros =
    await obterMembrosOrdenados()

  let enviados = 0

  for (
    let i = 0;
    i < membros.length;
    i++
  ) {
    const member = membros[i]

    try {
      await gerarCheckIn(
        member,
        false,
        i + 1,
      )

      enviados++

      await esperar(1800)
    } catch (error) {
      console.error(
        `✗ ${member.user.username}`,
        error,
      )
    }
  }

  console.log('')
  console.log('=================================')
  console.log('       REBUILD CONCLUÍDO')
  console.log('=================================')
  console.log(
    `Mensagens antigas removidas: ${apagadas}`,
  )
  console.log(
    `Novos cards enviados: ${enviados}`,
  )
}


// ====================================
// READY
// ====================================

client.on('error', (error) => console.error('Erro do cliente Discord:', error))
client.on('shardError', (error) => console.error('Erro de conexão (shard):', error))

client.once(
  Events.ClientReady,
  async (readyClient) => {
    console.log(
      '=================================',
    )
    console.log(
      '     CHECKIN LAYERED ONLINE',
    )
    console.log(
      '=================================',
    )
    console.log(
      `Bot: ${readyClient.user.tag}`,
    )

    // Registrar comando /ocr-limpar
    const clientId = process.env.DISCORD_CLIENT_ID

    if (!clientId) {
      console.log(
        '⚠ DISCORD_CLIENT_ID não configurado — comando /ocr-limpar não será registrado.',
      )
    } else {
      await registerOcrCommands(
        token,
        clientId,
        process.env.GUILD_ID,
      )
    }

    try {
      // TESTE
      if (
        process.argv.includes('--test')
      ) {
        if (!userId) {
          throw new Error(
            'USER_ID não encontrado.',
          )
        }

        const guild =
          readyClient.guilds.cache.first()

        if (!guild) {
          throw new Error(
            'Servidor não encontrado.',
          )
        }

        const member =
          await guild.members.fetch(
            userId,
          )

        await gerarCheckIn(
          member,
          true,
        )

        console.log(
          '✓ Teste concluído.',
        )

        client.destroy()
        return
      }

      // REBUILD
      if (
        process.argv.includes('--rebuild')
      ) {
        await reconstruirCatraca()

        client.destroy()
        return
      }      

      // REFAZER CARDS COM NITRO
      if (process.argv.includes('--refazer-nitro')) {
        await refazerCards('nitro')
        client.destroy()
        return
      }

      // REFAZER OS DEMAIS CARDS (SEM NITRO)
      if (process.argv.includes('--refazer-restantes')) {
        await refazerCards('restantes')

        client.destroy()
        return
      }

      // SYNC
      if (
        process.argv.includes('--sync')
      ) {
        await sincronizarCatraca()

        client.destroy()
        return
      }

      // Cobre quem entrou enquanto o bot estava offline.
      try {
        await recuperarMembrosFaltantes()
      } catch (error) {
        console.error('Erro na recuperação:', error)
      }

      console.log(
        'Aguardando novos membros...',
      )
      startTwitchLiveMonitor(readyClient)
    } catch (error) {
      console.error(
        'ERRO:',
        error,
      )

      client.destroy()
    }
  },
)

// ====================================
// ENTRADA REAL
// ====================================

client.on(
  Events.GuildMemberAdd,
  async (member) => {
    if (member.user.bot) return

    try {
      console.log(
        `→ Entrada: ${member.user.username}`,
      )

      await gerarCheckIn(member)
    } catch (error) {
      console.error(
        'Erro no CheckIn:',
        error,
      )
      }
  },
)


client.on(Events.MessageCreate, async (message) => {
  if (!process.env.OCR_CHANNEL_ID || message.channelId !== process.env.OCR_CHANNEL_ID) return
  await processOcrMessage(message)
  await processTranscribeMessage(message)
})

// ====================================
// INTERAÇÕES (SLASH COMMANDS E BOTÕES)
// ====================================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ocr-limpar') {
        await handleOcrLimparCommand(interaction)
      }
      return
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ocr_mgr:')) {
        await handleOcrManagerButton(interaction)
      }
    }
  } catch (error) {
    console.error('Erro no InteractionCreate:', error)
  }
})

client.login(token)