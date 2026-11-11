import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  GuildMember,
  Message,
} from 'discord.js'

import {
  fetchAllMessages,
  deleteMessages,
  fetchRecentMessages,
  paginateMessages,
} from './operations.js'

import { ocrLimparCommand } from './command.js'

// ====================================
// ESTADO DE SELEÇÃO INDIVIDUAL
// ====================================

const selectionState = new Map<string, Set<string>>()

// ====================================
// AUTORIZAÇÃO
// ====================================

export function isAuthorized(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): boolean {
  // Somente o dono do bot (OWNER_ID no .env). Sem OWNER_ID, ninguém acessa.
  const dono = process.env.OWNER_ID?.trim()

  return Boolean(dono) && interaction.user.id === dono
}

export function botHasManageMessages(
  channel: TextChannel,
  botMember: GuildMember,
): boolean {
  return botMember
    .permissionsIn(channel)
    .has(PermissionFlagsBits.ManageMessages)
}

// ====================================
// BOTÕES AUXILIARES
// ====================================

function botaoCancelar() {
  return new ButtonBuilder()
    .setCustomId('ocr_mgr:cancel')
    .setLabel('Cancelar')
    .setStyle(ButtonStyle.Secondary)
}

function linhaDeAcao<T extends ButtonBuilder>(
  ...botoes: T[]
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...botoes)
}

// ====================================
// HANDLER DO COMANDO /ocr-limpar
// ====================================

export async function handleOcrLimparCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ocrChannelId = process.env.OCR_CHANNEL_ID

  if (!ocrChannelId || interaction.channelId !== ocrChannelId) {
    await interaction.reply({
      content: 'Este comando só funciona no canal OCR.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!isAuthorized(interaction)) {
    await interaction.reply({
      content: 'Sem permissão.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guild = interaction.guild

  if (!guild) {
    await interaction.reply({
      content: 'Não foi possível verificar o servidor.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const botMember = await guild.members.fetchMe()
  const channel = interaction.channel

  if (!(channel instanceof TextChannel)) {
    await interaction.reply({
      content: 'Canal inválido.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!botHasManageMessages(channel, botMember)) {
    await interaction.reply({
      content: 'O bot não tem permissão ManageMessages neste canal.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const embed = new EmbedBuilder()
    .setTitle('Gerenciador do canal OCR')
    .setDescription('Escolha uma ação abaixo.')

  const linha = linhaDeAcao(
    new ButtonBuilder()
      .setCustomId('ocr_mgr:clear_all')
      .setLabel('Limpar tudo')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ocr_mgr:clear_count')
      .setLabel('Limpar quantidade')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ocr_mgr:select')
      .setLabel('Seleção individual')
      .setStyle(ButtonStyle.Secondary),
    botaoCancelar(),
  )

  await interaction.reply({
    embeds: [embed],
    components: [linha],
    flags: MessageFlags.Ephemeral,
  })
}

// ====================================
// PÁGINA DE SELEÇÃO INDIVIDUAL
// ====================================

async function mostrarPaginaSelecao(
  interaction: ButtonInteraction,
  page: number,
): Promise<void> {
  const channel = interaction.channel

  if (!(channel instanceof TextChannel)) return

  const userId = interaction.user.id

  if (!selectionState.has(userId)) {
    selectionState.set(userId, new Set())
  }

  const selecionados = selectionState.get(userId)!
  const mensagens = await fetchRecentMessages(channel, 100)
  const { items, totalPages, page: paginaAtual } = paginateMessages(mensagens, page)

  const linhas: string[] = items.map((msg, index) => {
    const marcado = selecionados.has(msg.id) ? '►' : ' '
    const autor = (msg.author.username ?? 'desconhecido').slice(0, 20)
    const conteudo = (msg.content || '[sem texto]').slice(0, 40)
    const data = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(msg.createdTimestamp))

    return `\`${marcado} ${index + 1}.\` **${autor}** — ${conteudo} *(${data})*`
  })

  const embed = new EmbedBuilder()
    .setTitle(`Seleção individual — Página ${paginaAtual + 1}/${totalPages}`)
    .setDescription(linhas.length > 0 ? linhas.join('\n') : 'Nenhuma mensagem encontrada.')

  // Botões de toggle para cada item
  const botoesToggle: ButtonBuilder[] = items.map((msg, index) => {
    const marcado = selecionados.has(msg.id)
    return new ButtonBuilder()
      .setCustomId(`ocr_mgr:toggle:${msg.id}`)
      .setLabel(marcado ? `[${index + 1}]` : `${index + 1}`)
      .setStyle(marcado ? ButtonStyle.Success : ButtonStyle.Secondary)
  })

  const componentes: ActionRowBuilder<ButtonBuilder>[] = []

  // Linhas de toggles (máximo 5 por linha)
  for (let i = 0; i < botoesToggle.length; i += 5) {
    componentes.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...botoesToggle.slice(i, i + 5),
      ),
    )
  }

  // Linha de ação: apagar selecionados (só aparece quando há seleção) + cancelar
  // Navegação só aparece quando há mais de uma página
  const botoesAcao: ButtonBuilder[] = []

  if (totalPages > 1) {
    botoesAcao.push(
      new ButtonBuilder()
        .setCustomId(`ocr_mgr:page:prev:${Math.max(0, paginaAtual - 1)}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(paginaAtual === 0),
      new ButtonBuilder()
        .setCustomId(`ocr_mgr:page:next:${Math.min(totalPages - 1, paginaAtual + 1)}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(paginaAtual >= totalPages - 1),
    )
  }

  if (selecionados.size > 0) {
    botoesAcao.push(
      new ButtonBuilder()
        .setCustomId('ocr_mgr:confirm_select')
        .setLabel(`Apagar ${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''}`)
        .setStyle(ButtonStyle.Danger),
    )
  }

  botoesAcao.push(botaoCancelar())

  componentes.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...botoesAcao),
  )

  await interaction.editReply({
    embeds: [embed],
    components: componentes,
  })
}

// ====================================
// HANDLER DOS BOTÕES
// ====================================

export async function handleOcrManagerButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId

  try {
    // CANCELAR
    if (customId === 'ocr_mgr:cancel') {
      await interaction.update({
        content: 'Operação cancelada.',
        embeds: [],
        components: [],
      })
      return
    }

    // LIMPAR TUDO — confirmação
    if (customId === 'ocr_mgr:clear_all') {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirmar limpeza total')
        .setDescription(
          'Isso apagará **todas** as mensagens do canal OCR. Deseja continuar?',
        )
        .setColor(0xff0000)

      const linha = linhaDeAcao(
        new ButtonBuilder()
          .setCustomId('ocr_mgr:confirm_all')
          .setLabel('Confirmar')
          .setStyle(ButtonStyle.Danger),
        botaoCancelar(),
      )

      await interaction.update({ embeds: [embed], components: [linha] })
      return
    }

    // LIMPAR TUDO — executar
    if (customId === 'ocr_mgr:confirm_all') {
      await interaction.deferUpdate()

      const channel = interaction.channel

      if (!(channel instanceof TextChannel)) {
        await interaction.editReply({
          content: 'Canal inválido.',
          embeds: [],
          components: [],
        })
        return
      }

      const mensagens = await fetchAllMessages(channel)
      const { deleted, failed } = await deleteMessages(channel, mensagens)

      const embed = new EmbedBuilder()
        .setTitle('Limpeza concluída')
        .addFields(
          { name: 'Apagadas', value: String(deleted), inline: true },
          { name: 'Falhas', value: String(failed), inline: true },
        )

      await interaction.editReply({ embeds: [embed], components: [] })
      return
    }

    // LIMPAR QUANTIDADE — escolher
    if (customId === 'ocr_mgr:clear_count') {
      const embed = new EmbedBuilder()
        .setTitle('Limpar quantidade')
        .setDescription('Selecione quantas mensagens recentes deseja apagar:')

      const linha = linhaDeAcao(
        new ButtonBuilder()
          .setCustomId('ocr_mgr:count:10')
          .setLabel('10')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ocr_mgr:count:25')
          .setLabel('25')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ocr_mgr:count:50')
          .setLabel('50')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ocr_mgr:count:100')
          .setLabel('100')
          .setStyle(ButtonStyle.Primary),
        botaoCancelar(),
      )

      await interaction.update({ embeds: [embed], components: [linha] })
      return
    }

    // LIMPAR QUANTIDADE — prévia
    if (customId.startsWith('ocr_mgr:count:')) {
      await interaction.deferUpdate()

      const n = parseInt(customId.split(':')[2] ?? '0', 10)

      const channel = interaction.channel

      if (!(channel instanceof TextChannel)) {
        await interaction.editReply({
          content: 'Canal inválido.',
          embeds: [],
          components: [],
        })
        return
      }

      const mensagens = await fetchRecentMessages(channel, n)

      const embed = new EmbedBuilder()
        .setTitle('Prévia da operação')
        .setDescription(
          `Apagar **${mensagens.length}** mensagens recentes. Confirmar?`,
        )

      const linha = linhaDeAcao(
        new ButtonBuilder()
          .setCustomId(`ocr_mgr:confirm_count:${n}`)
          .setLabel('Confirmar')
          .setStyle(ButtonStyle.Danger),
        botaoCancelar(),
      )

      await interaction.editReply({ embeds: [embed], components: [linha] })
      return
    }

    // CONFIRMAR QUANTIDADE — executar
    if (customId.startsWith('ocr_mgr:confirm_count:')) {
      await interaction.deferUpdate()

      const n = parseInt(customId.split(':')[2] ?? '0', 10)

      const channel = interaction.channel

      if (!(channel instanceof TextChannel)) {
        await interaction.editReply({
          content: 'Canal inválido.',
          embeds: [],
          components: [],
        })
        return
      }

      const mensagens = await fetchRecentMessages(channel, n)
      const { deleted, failed } = await deleteMessages(channel, mensagens)

      const embed = new EmbedBuilder()
        .setTitle('Limpeza concluída')
        .addFields(
          { name: 'Apagadas', value: String(deleted), inline: true },
          { name: 'Falhas', value: String(failed), inline: true },
        )

      await interaction.editReply({ embeds: [embed], components: [] })
      return
    }

    // SELEÇÃO INDIVIDUAL — abrir página 0
    if (customId === 'ocr_mgr:select') {
      await interaction.deferUpdate()
      await mostrarPaginaSelecao(interaction, 0)
      return
    }

    // SELEÇÃO INDIVIDUAL — navegar
    if (customId.startsWith('ocr_mgr:page:')) {
      await interaction.deferUpdate()
      const partes = customId.split(':')
      const pagina = parseInt(partes[3] ?? '0', 10)
      await mostrarPaginaSelecao(interaction, pagina)
      return
    }

    // SELEÇÃO INDIVIDUAL — toggle
    if (customId.startsWith('ocr_mgr:toggle:')) {
      await interaction.deferUpdate()

      const msgId = customId.split(':')[2]

      if (!msgId) return

      const userId = interaction.user.id

      if (!selectionState.has(userId)) {
        selectionState.set(userId, new Set())
      }

      const selecionados = selectionState.get(userId)!

      if (selecionados.has(msgId)) {
        selecionados.delete(msgId)
      } else {
        selecionados.add(msgId)
      }

      // Re-renderiza a página atual buscando os itens visíveis para descobrir a página
      const channel = interaction.channel

      if (!(channel instanceof TextChannel)) return

      const mensagens = await fetchRecentMessages(channel, 100)
      const msgIndex = mensagens.findIndex((m) => m.id === msgId)
      const page = msgIndex >= 0 ? Math.floor(msgIndex / 10) : 0

      await mostrarPaginaSelecao(interaction, page)
      return
    }

    // SELEÇÃO INDIVIDUAL — confirmar
    if (customId === 'ocr_mgr:confirm_select') {
      await interaction.deferUpdate()

      const userId = interaction.user.id
      const selecionados = selectionState.get(userId) ?? new Set<string>()

      if (selecionados.size === 0) {
        await interaction.editReply({
          content: 'Nenhuma mensagem selecionada.',
          embeds: [],
          components: [],
        })
        return
      }

      const channel = interaction.channel

      if (!(channel instanceof TextChannel)) {
        await interaction.editReply({
          content: 'Canal inválido.',
          embeds: [],
          components: [],
        })
        return
      }

      const todasMensagens = await fetchRecentMessages(channel, 100)
      const paraApagar = todasMensagens.filter((m) => selecionados.has(m.id))

      const { deleted, failed } = await deleteMessages(channel, paraApagar)

      selectionState.delete(userId)

      const embed = new EmbedBuilder()
        .setTitle('Seleção apagada')
        .addFields(
          { name: 'Apagadas', value: String(deleted), inline: true },
          { name: 'Falhas', value: String(failed), inline: true },
        )

      await interaction.editReply({ embeds: [embed], components: [] })
      return
    }
  } catch (error: unknown) {
    // Interação expirada — ignorar silenciosamente
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 10062
    ) {
      console.log('[OCR-MGR] Interação expirada, ignorando.')
      return
    }

    console.error('[OCR-MGR] Erro no handler de botão:', error)

    try {
      await interaction.followUp({
        content: `Ocorreu um erro: ${error instanceof Error ? error.message : String(error)}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch {
      // Ignorar falha no followUp
    }
  }
}

// Referência ao nome do comando (evita string hardcoded em src/index.ts)
export const OCR_LIMPAR_COMMAND_NAME = ocrLimparCommand.name
