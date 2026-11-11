import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
} from 'discord.js'

import {
  deleteMessages,
  fetchAllMessages,
  fetchRecentMessages,
} from '../ocr-manager/operations.js'

// ====================================
// PAINEL DE CONFIGURAÇÕES (#configs)
// ====================================
//
// Uma mensagem fixa com botões. Cada ação destrutiva pede confirmação
// (mensagem só visível para quem clicou) antes de executar.

const PREFIXO = 'cfg:'
const MARCA_RODAPE = 'CheckIn • Painel de configurações'

export type PainelAcoes = {
  refazerCards: (modo: 'nitro' | 'restantes') => Promise<void>
  reconstruirCatraca: () => Promise<void>
}

type Acao = 'ocr_tudo' | 'ocr_50' | 'refazer_cards' | 'rebuild'

const ACOES: Record<
  Acao,
  { titulo: string; aviso: string; irreversivel: boolean }
> = {
  ocr_tudo: {
    titulo: 'Limpar o canal OCR inteiro',
    aviso: 'Apaga **todas** as mensagens do canal OCR (suas, do bot, tudo).',
    irreversivel: true,
  },
  ocr_50: {
    titulo: 'Limpar as últimas 50 mensagens do OCR',
    aviso: 'Apaga as **50 mensagens mais recentes** do canal OCR.',
    irreversivel: true,
  },
  refazer_cards: {
    titulo: 'Refazer todos os cards do #catraca',
    aviso:
      'Gera os cards de novo **editando as mensagens que já existem**. Nada é apagado e a ordem não muda.',
    irreversivel: false,
  },
  rebuild: {
    titulo: 'Reconstruir o #catraca do zero',
    aviso:
      'Apaga **todas as mensagens do bot e as mensagens de entrada** do #catraca e gera todos os cards de novo, renumerando pela ordem de entrada. Leva vários minutos.',
    irreversivel: true,
  },
}

let acoes: PainelAcoes | undefined
let ocupado = false

// ====================================
// AUTORIZAÇÃO
// ====================================

// Somente o dono do bot (OWNER_ID no .env). Sem OWNER_ID, ninguém acessa.
function autorizado(interaction: ButtonInteraction): boolean {
  const dono = process.env.OWNER_ID?.trim()

  return Boolean(dono) && interaction.user.id === dono
}

// ====================================
// PAINEL
// ====================================

function montarPainel() {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Painel de configurações')
    .setDescription(
      [
        'Use os botões abaixo. Ações que apagam algo pedem confirmação antes.',
        '',
        '**🧹 Canal OCR**',
        '• *Limpar tudo*: apaga todas as mensagens do canal.',
        '• *Limpar últimas 50*: apaga só as mais recentes.',
        '',
        '**🪪 Canal #catraca**',
        '• *Refazer cards*: atualiza os cards existentes, sem apagar.',
        '• *Reconstruir do zero*: apaga e gera tudo de novo.',
        '',
        'Para escolher mensagens uma a uma, use `/ocr-limpar`.',
      ].join('\n'),
    )
    .setColor(0x5865f2)
    .setFooter({ text: MARCA_RODAPE })

  const linhaOcr = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}ask:ocr_tudo`)
      .setLabel('Limpar OCR (tudo)')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}ask:ocr_50`)
      .setLabel('Limpar OCR (últimas 50)')
      .setEmoji('🧽')
      .setStyle(ButtonStyle.Secondary),
  )

  const linhaCatraca = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}ask:refazer_cards`)
      .setLabel('Refazer cards')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${PREFIXO}ask:rebuild`)
      .setLabel('Reconstruir #catraca do zero')
      .setEmoji('🏗️')
      .setStyle(ButtonStyle.Danger),
  )

  return { embeds: [embed], components: [linhaOcr, linhaCatraca] }
}

// Cria o painel no canal ou atualiza o que já existe (sem duplicar).
export async function initConfigPanel(
  client: Client,
  funcoes: PainelAcoes,
): Promise<void> {
  acoes = funcoes

  const canalId = process.env.CONFIG_CHANNEL_ID?.trim()

  if (!canalId) {
    console.warn(
      'Painel de configurações não iniciado: defina CONFIG_CHANNEL_ID no .env.',
    )
    return
  }

  try {
    const canal = await client.channels.fetch(canalId)

    if (!canal || !(canal instanceof TextChannel)) {
      console.error('Painel de configurações: CONFIG_CHANNEL_ID não é um canal de texto.')
      return
    }

    const recentes = await canal.messages.fetch({ limit: 50 })
    const existente = recentes.find(
      (m) =>
        m.author.id === client.user?.id &&
        m.embeds[0]?.footer?.text === MARCA_RODAPE,
    )

    if (existente) {
      await existente.edit(montarPainel())
    } else {
      await canal.send(montarPainel())
    }

    console.log('✓ Painel de configurações pronto.')
  } catch (error) {
    console.error('Erro ao criar o painel de configurações:', error)
  }
}

// ====================================
// EXECUÇÃO DAS AÇÕES
// ====================================

async function executar(acao: Acao, client: Client): Promise<string> {
  if (!acoes) throw new Error('Painel não inicializado.')

  if (acao === 'ocr_tudo' || acao === 'ocr_50') {
    const ocrId = process.env.OCR_CHANNEL_ID
    const canal = ocrId ? await client.channels.fetch(ocrId) : null

    if (!canal || !(canal instanceof TextChannel)) {
      throw new Error('OCR_CHANNEL_ID não aponta para um canal de texto.')
    }

    const mensagens =
      acao === 'ocr_tudo'
        ? await fetchAllMessages(canal)
        : await fetchRecentMessages(canal, 50)

    if (mensagens.length === 0) return 'O canal OCR já está vazio.'

    const { deleted, failed } = await deleteMessages(canal, mensagens)

    return (
      `🧹 ${deleted} mensagem(ns) apagada(s) no canal OCR.` +
      (failed > 0 ? ` ⚠️ ${failed} não puderam ser apagadas.` : '')
    )
  }

  if (acao === 'refazer_cards') {
    await acoes.refazerCards('nitro')
    await acoes.refazerCards('restantes')
    return '🔄 Cards refeitos.'
  }

  await acoes.reconstruirCatraca()
  return '🏗️ #catraca reconstruído.'
}

// ====================================
// BOTÕES
// ====================================

export async function handleConfigPanelButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!autorizado(interaction)) {
    await interaction.reply({
      content: '⛔ Este painel é restrito ao dono do bot.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const [, tipo, valor] = interaction.customId.split(':')

  // 1) Pedir confirmação (mensagem só visível para quem clicou)
  if (tipo === 'ask' && valor && valor in ACOES) {
    const acao = valor as Acao
    const info = ACOES[acao]

    const linha = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIXO}ok:${acao}`)
        .setLabel('Confirmar')
        .setStyle(info.irreversivel ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${PREFIXO}no`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    )

    await interaction.reply({
      content:
        `**${info.titulo}**\n${info.aviso}` +
        (info.irreversivel ? '\n\n⚠️ **Não dá para desfazer.**' : ''),
      components: [linha],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // 2) Cancelar
  if (tipo === 'no') {
    await interaction.update({ content: 'Cancelado.', components: [] })
    return
  }

  // 3) Confirmado: executar
  if (tipo === 'ok' && valor && valor in ACOES) {
    const acao = valor as Acao

    if (ocupado) {
      await interaction.update({
        content: '⏳ Já existe uma ação em andamento. Aguarde terminar e tente de novo.',
        components: [],
      })
      return
    }

    ocupado = true

    await interaction.update({
      content: `⏳ Executando: **${ACOES[acao].titulo}**… isso pode levar alguns minutos.`,
      components: [],
    })

    try {
      const resultado = await executar(acao, interaction.client)
      await interaction.editReply({ content: `✅ ${resultado}` })
    } catch (error) {
      console.error('Erro no painel de configurações:', error)
      await interaction
        .editReply({ content: '❌ Falhou. Veja a pasta `logs/` para o motivo.' })
        .catch(() => undefined)
    } finally {
      ocupado = false
    }
  }
}
