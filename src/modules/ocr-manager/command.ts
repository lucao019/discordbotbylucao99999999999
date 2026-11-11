import { REST } from '@discordjs/rest'
import { Routes } from 'discord.js'
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord-api-types/v10'

// ====================================
// DEFINIÇÃO DO COMANDO
// ====================================

export const ocrLimparCommand: RESTPostAPIChatInputApplicationCommandsJSONBody = {
  name: 'ocr-limpar',
  description: 'Gerencia mensagens do canal OCR',
}

// ====================================
// REGISTRO DE COMANDOS
// ====================================

export async function registerOcrCommands(
  token: string,
  clientId: string,
  guildId?: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token)

  try {
    const rota = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId)

    await rest.put(rota, { body: [ocrLimparCommand] })

    console.log('✓ Comando /ocr-limpar registrado com sucesso.')
  } catch (error) {
    console.error('✗ Falha ao registrar comando /ocr-limpar:', error)
  }
}
