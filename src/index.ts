import 'dotenv/config'

import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  TextChannel,
  User,
} from 'discord.js'

import sharp from 'sharp'
import { processOcrMessage } from './modules/ocr/handler'

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
): Promise<{
  buffer: Buffer
  extension: 'png' | 'gif'
}> {
  const largura = 900
  const altura = 390
  const bannerHeight = 220



  const avatarSize = 150
  const avatarX = 50
  const avatarY = 170

  const bannerAnimado =
    user.banner?.startsWith('a_') ?? false

  const bannerUrl = user.bannerURL({
    size: 1024,
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
      height="180"
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

  const bordaSize = avatarSize + 14

  const borda = Buffer.from(`
    <svg
      width="${bordaSize}"
      height="${bordaSize}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="${bordaSize / 2}"
        cy="${bordaSize / 2}"
        r="${bordaSize / 2 - 2}"
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
          font-size: 36px;
          font-weight: 700;
          font-family: Arial, sans-serif;
        }

        .user {
          fill: #b5bac1;
          font-size: 22px;
          font-family: Arial, sans-serif;
        }

        .member {
          fill: #b5bac1;
          font-size: 19px;
          font-family: Arial, sans-serif;
        }

        .checkin {
          fill: #7d8590;
          font-size: 16px;
          font-family: Arial, sans-serif;
        }
      </style>

      <text
        x="230"
        y="285"
        class="name"
      >${displayName}</text>

      <text
        x="230"
        y="320"
        class="user"
      >@${username}</text>

      <text
        x="230"
        y="352"
        class="member"
      >MEMBER #${numero}</text>

      <text
        x="745"
        y="360"
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
  top: 40,
  left: 0,
},
    {
      input: borda,
      top: avatarY - 7,
      left: avatarX - 7,
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

  const metadata = await sharp(
    bannerBuffer,
    {
      animated: true,
    },
  ).metadata()

  const paginas = metadata.pages ?? 1

  const delays =
    metadata.delay &&
    metadata.delay.length === paginas
      ? metadata.delay
      : Array(paginas).fill(100)


    const layersAnimadas: sharp.OverlayOptions[] = []

  for (let pagina = 0; pagina < paginas; pagina++) {
    const offsetY = pagina * altura

    for (const layer of layersFixas) {
      layersAnimadas.push({
        ...layer,
        top:
          typeof layer.top === 'number'
            ? layer.top + offsetY
            : offsetY,
      })
    }
  }

  const buffer = await sharp(
    bannerBuffer,
    {
      animated: true,
    },
  )
    .resize(largura, bannerHeight, {
  fit: 'cover',
  position: 'centre',
})
.extend({
  bottom: altura - bannerHeight,
  background: '#111318',
})
    .composite(layersAnimadas)
    .gif({
      loop: metadata.loop ?? 0,
      delay: delays,
    })
    .toBuffer()

    return {
    buffer,
    extension: 'gif',
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

      .setTimestamp()

  if (user.accentColor != null) {
  embed.setColor(
    user.accentColor,
  )
}

  await channel.send({
    embeds: [embed],
    files: [arquivo],
  })

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

      // SYNC
      if (
        process.argv.includes('--sync')
      ) {
        await sincronizarCatraca()

        client.destroy()
        return
      }

      console.log(
        'Aguardando novos membros...',
      )
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
})

client.login(token)