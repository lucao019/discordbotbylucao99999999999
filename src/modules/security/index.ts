import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js'

// ====================================
// SEGURANÇA: LOG DE MODERAÇÃO, ANTI-RAID E ANTI-SPAM
// ====================================
//
// Variáveis (.env):
//   SECURITY_LOG_CHANNEL_ID  canal privado onde caem logs e alertas (obrigatório)
//   RAID_JOIN_THRESHOLD      entradas na janela para considerar raid (padrão 5)
//   RAID_WINDOW_SECONDS      tamanho da janela, em segundos (padrão 60)
//   NEW_ACCOUNT_DAYS         conta com menos dias que isso é "nova" (padrão 7)
//   RAID_AUTO_LOCK           "true" trava os convites sozinho ao detectar raid

const PREFIXO = 'sec:'

const numero = (nome: string, padrao: number) => {
  const valor = Number(process.env[nome])
  return Number.isFinite(valor) && valor > 0 ? valor : padrao
}

const RAID_THRESHOLD = () => numero('RAID_JOIN_THRESHOLD', 5)
const RAID_WINDOW_MS = () => numero('RAID_WINDOW_SECONDS', 60) * 1000
const NEW_ACCOUNT_MS = () => numero('NEW_ACCOUNT_DAYS', 7) * 24 * 60 * 60 * 1000

const COOLDOWN_ALERTA_MS = 5 * 60 * 1000
const JANELA_FLOOD_MS = 5000
const LIMITE_FLOOD = 6
const LIMITE_MENCOES = 5
const JANELA_STRIKES_MS = 10 * 60 * 1000
const STRIKES_PARA_PUNIR = 3
const TIMEOUT_FLOOD_MS = 10 * 60 * 1000
const TIMEOUT_STRIKES_MS = 30 * 60 * 1000

const REGEX_CONVITE =
  /(?:discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[a-z0-9-]+/i
const REGEX_LINK = /https?:\/\/\S+/i

const cortar = (texto: string, max = 900) =>
  texto.length > max ? `${texto.slice(0, max)}…` : texto

const dono = () => process.env.OWNER_ID?.trim()

// ====================================
// CANAIS
// ====================================

function canaisIgnorados(): Set<string> {
  // Canais onde apagar mensagens é rotina (limpeza do OCR, cards do #catraca,
  // painel) ou que são do próprio sistema de log.
  return new Set(
    [
      process.env.OCR_CHANNEL_ID,
      process.env.CATRACA_CHANNEL_ID,
      process.env.CONFIG_CHANNEL_ID,
      process.env.SECURITY_LOG_CHANNEL_ID,
    ]
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id)),
  )
}

async function canalDeLog(client: Client): Promise<TextChannel | null> {
  const id = process.env.SECURITY_LOG_CHANNEL_ID?.trim()
  if (!id) return null

  const canal = await client.channels.fetch(id).catch(() => null)
  return canal instanceof TextChannel ? canal : null
}

async function registrar(
  client: Client,
  embed: EmbedBuilder,
  components: ActionRowBuilder<ButtonBuilder>[] = [],
) {
  try {
    const canal = await canalDeLog(client)
    if (!canal) return
    await canal.send({ embeds: [embed], components })
  } catch (error) {
    console.error('Segurança: falha ao enviar para o canal de log:', error)
  }
}

// ====================================
// QUEM É ISENTO
// ====================================

function ehEquipe(member: GuildMember | null): boolean {
  if (!member) return false
  if (member.id === dono()) return true

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  )
}

function idadeDaConta(timestamp: number): string {
  const dias = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (dias < 1) return 'menos de 1 dia'
  return dias === 1 ? '1 dia' : `${dias} dias`
}

// ====================================
// 1) LOG DE MODERAÇÃO
// ====================================

function ligarLogDeModeracao(client: Client) {
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return
    if (canaisIgnorados().has(message.channelId)) return

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('🗑️ Mensagem apagada')
      .addFields(
        { name: 'Canal', value: `<#${message.channelId}>`, inline: true },
        {
          name: 'Autor',
          value: message.author ? `<@${message.author.id}> (${message.author.username})` : 'desconhecido',
          inline: true,
        },
        {
          name: 'Conteúdo',
          value: message.content ? cortar(message.content) : '*não estava em cache*',
        },
      )
      .setTimestamp()

    await registrar(client, embed)
  })

  client.on(Events.MessageUpdate, async (antes, depois) => {
    if (!depois.guild || depois.author?.bot) return
    if (canaisIgnorados().has(depois.channelId)) return
    if (!antes.content || !depois.content || antes.content === depois.content) return

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('✏️ Mensagem editada')
      .setDescription(`[Ir para a mensagem](${depois.url})`)
      .addFields(
        { name: 'Canal', value: `<#${depois.channelId}>`, inline: true },
        {
          name: 'Autor',
          value: depois.author ? `<@${depois.author.id}>` : 'desconhecido',
          inline: true,
        },
        { name: 'Antes', value: cortar(antes.content, 500) },
        { name: 'Depois', value: cortar(depois.content, 500) },
      )
      .setTimestamp()

    await registrar(client, embed)
  })

  client.on(Events.GuildBanAdd, async (ban) => {
    const embed = new EmbedBuilder()
      .setColor(0x992d22)
      .setTitle('🔨 Membro banido')
      .addFields(
        { name: 'Usuário', value: `<@${ban.user.id}> (${ban.user.username})`, inline: true },
        { name: 'Motivo', value: ban.reason ?? 'não informado', inline: true },
      )
      .setTimestamp()

    await registrar(client, embed)
  })

  client.on(Events.GuildBanRemove, async (ban) => {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('♻️ Banimento removido')
      .addFields({ name: 'Usuário', value: `<@${ban.user.id}> (${ban.user.username})` })
      .setTimestamp()

    await registrar(client, embed)
  })

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return

    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle('🚪 Membro saiu')
      .addFields(
        { name: 'Usuário', value: `<@${member.user.id}> (${member.user.username})`, inline: true },
        {
          name: 'Ficou no servidor',
          value: member.joinedTimestamp ? idadeDaConta(member.joinedTimestamp) : 'desconhecido',
          inline: true,
        },
      )
      .setTimestamp()

    await registrar(client, embed)
  })
}

// ====================================
// 2) ANTI-RAID
// ====================================

type Entrada = { id: string; nome: string; quando: number; criada: number }

const entradas: Entrada[] = []
let ultimoAlerta = 0
// Quem entrou na janela do último alerta, para o botão de expulsar contas novas.
const alvosDoAlerta = new Map<string, string[]>()

function ligarAntiRaid(client: Client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return

    const agora = Date.now()

    entradas.push({
      id: member.id,
      nome: member.user.username,
      quando: agora,
      criada: member.user.createdTimestamp,
    })

    // Descarta entradas fora da janela.
    while (entradas.length > 0 && agora - entradas[0]!.quando > RAID_WINDOW_MS()) {
      entradas.shift()
    }

    if (entradas.length < RAID_THRESHOLD()) return
    if (agora - ultimoAlerta < COOLDOWN_ALERTA_MS) return

    ultimoAlerta = agora
    await dispararAlertaDeRaid(client, member.guild, [...entradas])
  })
}

async function dispararAlertaDeRaid(client: Client, guild: Guild, grupo: Entrada[]) {
  const novas = grupo.filter((e) => Date.now() - e.criada < NEW_ACCOUNT_MS())
  const alertaId = String(Date.now())

  alvosDoAlerta.set(alertaId, novas.map((e) => e.id))

  let travou = false

  if (process.env.RAID_AUTO_LOCK?.trim().toLowerCase() === 'true') {
    travou = await alterarConvites(guild, true)
  }

  const lista = grupo
    .slice(0, 15)
    .map((e) => `• <@${e.id}> (${e.nome}) — conta com ${idadeDaConta(e.criada)}`)
    .join('\n')

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('🚨 Possível raid detectado')
    .setDescription(
      `${grupo.length} entradas em menos de ${Math.round(RAID_WINDOW_MS() / 1000)}s.\n` +
        `${novas.length} delas são contas novas (menos de ${Math.round(NEW_ACCOUNT_MS() / 86_400_000)} dias).` +
        (travou ? '\n\n🔒 **Convites travados automaticamente.**' : ''),
    )
    .addFields({ name: 'Entradas', value: cortar(lista, 1000) })
    .setTimestamp()

  const linha = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}lock`)
      .setLabel('Travar convites')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}unlock`)
      .setLabel('Liberar convites')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}kickask:${alertaId}`)
      .setLabel(`Expulsar contas novas (${novas.length})`)
      .setEmoji('🥾')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(novas.length === 0),
  )

  await registrar(client, embed, [linha])
}

async function alterarConvites(guild: Guild, travar: boolean): Promise<boolean> {
  try {
    await guild.disableInvites(travar)
    return true
  } catch (error) {
    console.error('Segurança: não foi possível alterar os convites:', error)
    return false
  }
}

// ====================================
// 3) ANTI-SPAM E LINKS
// ====================================

const historicoMensagens = new Map<string, number[]>()
const strikes = new Map<string, number[]>()

async function aplicarStrike(
  client: Client,
  member: GuildMember,
  motivo: string,
): Promise<void> {
  const agora = Date.now()
  const recentes = (strikes.get(member.id) ?? []).filter((t) => agora - t < JANELA_STRIKES_MS)
  recentes.push(agora)
  strikes.set(member.id, recentes)

  if (recentes.length < STRIKES_PARA_PUNIR) return

  strikes.delete(member.id)

  const punido = await member
    .timeout(TIMEOUT_STRIKES_MS, `Segurança: ${STRIKES_PARA_PUNIR} infrações em 10 min (${motivo})`)
    .then(() => true)
    .catch(() => false)

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⛔ Membro silenciado automaticamente')
    .addFields(
      { name: 'Usuário', value: `<@${member.id}> (${member.user.username})`, inline: true },
      { name: 'Duração', value: `${TIMEOUT_STRIKES_MS / 60000} min`, inline: true },
      { name: 'Motivo', value: `${STRIKES_PARA_PUNIR} infrações em 10 min. Última: ${motivo}` },
      ...(punido ? [] : [{ name: 'Aviso', value: 'Não consegui aplicar o timeout. Falta a permissão *Moderar membros* ou o cargo do bot está abaixo do usuário.' }]),
    )
    .setTimestamp()

  await registrar(client, embed)
}

async function infracao(
  client: Client,
  message: Message,
  member: GuildMember,
  motivo: string,
) {
  await message.delete().catch(() => undefined)

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🛡️ Mensagem removida automaticamente')
    .addFields(
      { name: 'Motivo', value: motivo },
      { name: 'Autor', value: `<@${member.id}> (${member.user.username})`, inline: true },
      { name: 'Canal', value: `<#${message.channelId}>`, inline: true },
      { name: 'Conteúdo', value: message.content ? cortar(message.content, 500) : '*vazio*' },
    )
    .setTimestamp()

  await registrar(client, embed)
  await aplicarStrike(client, member, motivo)
}

function ligarAntiSpam(client: Client) {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot || message.system) return

    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null))

    if (!member || ehEquipe(member)) return

    const conteudo = message.content ?? ''

    // Convite de outro servidor.
    if (REGEX_CONVITE.test(conteudo)) {
      await infracao(client, message, member, 'Convite de outro servidor')
      return
    }

    // @everyone/@here ou menções em massa.
    const mencoes = message.mentions.users.size + message.mentions.roles.size
    if (message.mentions.everyone || mencoes >= LIMITE_MENCOES) {
      await infracao(client, message, member, 'Menções em massa')
      return
    }

    // Link enviado por conta nova que acabou de entrar.
    const contaNova = Date.now() - message.author.createdTimestamp < NEW_ACCOUNT_MS()
    const acabouDeEntrar = member.joinedTimestamp
      ? Date.now() - member.joinedTimestamp < 10 * 60 * 1000
      : false

    if (contaNova && acabouDeEntrar && REGEX_LINK.test(conteudo)) {
      await infracao(client, message, member, 'Link de conta nova que acabou de entrar')
      return
    }

    // Flood de mensagens.
    const agora = Date.now()
    const historico = (historicoMensagens.get(member.id) ?? []).filter(
      (t) => agora - t < JANELA_FLOOD_MS,
    )
    historico.push(agora)
    historicoMensagens.set(member.id, historico)

    if (historico.length >= LIMITE_FLOOD) {
      historicoMensagens.delete(member.id)
      await message.delete().catch(() => undefined)

      const silenciado = await member
        .timeout(TIMEOUT_FLOOD_MS, 'Segurança: flood de mensagens')
        .then(() => true)
        .catch(() => false)

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('🌊 Flood de mensagens')
        .addFields(
          { name: 'Usuário', value: `<@${member.id}> (${member.user.username})`, inline: true },
          { name: 'Canal', value: `<#${message.channelId}>`, inline: true },
          {
            name: 'Ação',
            value: silenciado
              ? `Silenciado por ${TIMEOUT_FLOOD_MS / 60000} min.`
              : 'Não consegui silenciar (falta *Moderar membros* ou cargo do bot abaixo do usuário).',
          },
        )
        .setTimestamp()

      await registrar(client, embed)
    }
  })

  // Limpa o histórico em memória de tempos em tempos.
  setInterval(() => {
    const agora = Date.now()

    for (const [id, tempos] of historicoMensagens) {
      if (tempos.every((t) => agora - t >= JANELA_FLOOD_MS)) historicoMensagens.delete(id)
    }

    for (const [id, tempos] of strikes) {
      if (tempos.every((t) => agora - t >= JANELA_STRIKES_MS)) strikes.delete(id)
    }
  }, 60_000).unref()
}

// ====================================
// BOTÕES DOS ALERTAS (somente o dono)
// ====================================

export async function handleSecurityButton(interaction: ButtonInteraction): Promise<void> {
  const permitido = Boolean(dono()) && interaction.user.id === dono()

  if (!permitido) {
    await interaction.reply({
      content: '⛔ Restrito ao dono do bot.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guild = interaction.guild

  if (!guild) return

  const [, acao, alertaId] = interaction.customId.split(':')

  if (acao === 'lock' || acao === 'unlock') {
    const ok = await alterarConvites(guild, acao === 'lock')

    await interaction.reply({
      content: ok
        ? acao === 'lock'
          ? '🔒 Convites travados. Ninguém novo consegue entrar por convite.'
          : '🔓 Convites liberados.'
        : '❌ Não consegui alterar os convites. O bot precisa da permissão *Gerenciar servidor*.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (acao === 'kickask' && alertaId) {
    const quantidade = alvosDoAlerta.get(alertaId)?.length ?? 0

    const linha = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIXO}kickok:${alertaId}`)
        .setLabel('Confirmar expulsão')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${PREFIXO}cancel`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.reply({
      content: `Expulsar **${quantidade}** conta(s) nova(s) que entraram nesse raid? Elas podem voltar com um convite novo.`,
      components: [linha],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (acao === 'cancel') {
    await interaction.update({ content: 'Cancelado.', components: [] })
    return
  }

  if (acao === 'kickok' && alertaId) {
    const ids = alvosDoAlerta.get(alertaId) ?? []

    await interaction.update({ content: `⏳ Expulsando ${ids.length} conta(s)…`, components: [] })

    let expulsos = 0

    for (const id of ids) {
      const alvo = await guild.members.fetch(id).catch(() => null)
      if (!alvo || ehEquipe(alvo)) continue

      const ok = await alvo
        .kick('Segurança: conta nova em raid')
        .then(() => true)
        .catch(() => false)

      if (ok) expulsos++
    }

    alvosDoAlerta.delete(alertaId)

    await interaction.editReply({
      content: `🥾 ${expulsos} de ${ids.length} expulsa(s).`,
    })
  }
}

// ====================================
// INICIALIZAÇÃO
// ====================================

export function initSecurity(client: Client): void {
  if (!process.env.SECURITY_LOG_CHANNEL_ID?.trim()) {
    console.warn(
      'Segurança: SECURITY_LOG_CHANNEL_ID não definido. As proteções rodam, mas sem log nem alertas.',
    )
  }

  ligarLogDeModeracao(client)
  ligarAntiRaid(client)
  ligarAntiSpam(client)

  console.log('✓ Módulo de segurança ativo (log, anti-raid, anti-spam).')
}
