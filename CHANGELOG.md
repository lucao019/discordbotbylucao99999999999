# Changelog — CheckIn

Todas as alterações relevantes do projeto são registradas neste arquivo em ordem cronológica. Os registros descrevem o que foi implementado e testado, sem declarar como concluídas as etapas ainda pendentes.

---

## [Não lançado] — 2026-10-30

### Contexto

O bot precisava voltar a subir corretamente e o card de entrada de membros precisava renderizar de forma consistente. Também era necessário organizar o projeto e adicionar verificação contínua.

### Correções

- Inicialização ajustada para `tsx src/index.ts`; removido o shim `railway.js` que tentava importar TypeScript via `require`.
- Banners animados (GIF) do card de entrada passaram a ser compostos frame a frame com metadados de página corretos, evitando o empilhamento incorreto das camadas. Se a composição animada falhar, há fallback para PNG estático.
- Removido o bloco de log de depuração que imprimia variáveis de ambiente na inicialização.

### Organização

- Adicionado workflow de CI em `.github/workflows/ci.yml` (typecheck em Node 20 e 22).
- `.gitignore` e `.dockerignore` atualizados para excluir artefatos locais (`.agents/`, `.kiro/`, `dist/`).
- Removidos `dist/` desatualizado e pasta `.kiro/` vazia.
- README atualizado com estrutura do projeto, seção de Docker, integração contínua e status.

---

## [Não lançado] — 2026-10-19

### Contexto

O projeto já possuía check-in automático de membros, geração de cards gráficos e OCR de imagens no canal configurado.

O objetivo desta etapa foi adicionar um gerenciador de mensagens do canal OCR via comando slash e botões interativos do Discord.

### Etapa 1 — Módulo de operações

Criado `src/modules/ocr-manager/operations.ts`.

- `fetchAllMessages`: busca todas as mensagens do canal em lotes de 100.
- `fetchRecentMessages`: busca as N mensagens mais recentes.
- `deleteMessages`: apaga mensagens usando bulk delete para as com menos de 14 dias e exclusão individual para as mais antigas, com delay de 400 ms entre cada exclusão individual.
- `paginateMessages`: divide uma lista de mensagens em páginas de 10 itens para a interface de seleção.

### Etapa 2 — Registro do comando slash

Criado `src/modules/ocr-manager/command.ts`.

- Definição do slash command `ocr-limpar`.
- Função `registerOcrCommands` que registra o comando via REST na inicialização do bot.
- Registro com escopo de servidor quando `GUILD_ID` estiver definido; registro global caso contrário.

### Etapa 3 — Handler de interações

Criado `src/modules/ocr-manager/handler.ts`.

- `handleOcrLimparCommand`: responde ao comando slash com painel de gerenciamento ephemeral com três botões: Limpar tudo, Limpar quantidade e Seleção individual.
- `handleOcrManagerButton`: roteia botões pelo prefixo `ocr_mgr:` para os fluxos correspondentes.
- Fluxo "Limpar tudo": pede confirmação antes de apagar todas as mensagens; exibe total apagado e falhas.
- Fluxo "Limpar quantidade": permite escolher 10, 25, 50 ou 100 mensagens; exibe prévia e pede confirmação.
- Fluxo "Seleção individual": lista mensagens em páginas de 10; botões de toggle por item; navegação entre páginas; confirmação antes de apagar.
- Estado de seleção individual mantido em `Map<userId, Set<messageId>>` na memória, suficiente para a janela de 15 minutos das interações.
- Verificação de autorização: aceita `OWNER_ID` ou usuários com `ManageMessages` no canal.
- Verificação de permissão do bot: bloqueia operações se o bot não tiver `ManageMessages`.
- Restrição ao canal `OCR_CHANNEL_ID`.
- Tratamento de interações expiradas (código 10062).

### Etapa 4 — Integração no index.ts

Modificado `src/index.ts`.

- Imports de `registerOcrCommands`, `handleOcrLimparCommand` e `handleOcrManagerButton`.
- Chamada a `registerOcrCommands` no evento `ClientReady`, condicionada à presença de `DISCORD_CLIENT_ID`.
- Listener `InteractionCreate` adicionado após o `MessageCreate` existente; roteia comandos slash e botões para os handlers do módulo.
- OCR e check-in preservados sem alterações.

### Etapa 5 — Variáveis de ambiente

Adicionadas ao `.env.example`:

- `OWNER_ID`: ID do usuário com acesso irrestrito ao comando.
- `DISCORD_CLIENT_ID`: ID da aplicação, necessário para o registro do comando via REST.

### Etapa 6 — Verificação

- `npx tsc --noEmit` executado após cada etapa.
- Corrigido import de `Routes` que estava incorretamente importado de `@discordjs/rest`; movido para `discord.js`.
- Build final sem erros de TypeScript.

### Estado ao final desta etapa

**Implementado e verificado:** módulo `ocr-manager` completo, integração no `index.ts`, TypeScript compilando sem erros.

**Ainda pendente:** teste funcional no Discord com o bot conectado, configuração de `DISCORD_CLIENT_ID` e `OWNER_ID` no `.env` local.

### Próximas etapas

1. Adicionar `DISCORD_CLIENT_ID` e `OWNER_ID` ao `.env` local.
2. Iniciar o bot e confirmar que o comando `/ocr-limpar` aparece no servidor.
3. Testar cada fluxo: limpar tudo, limpar quantidade e seleção individual.
4. Confirmar que OCR e check-in continuam funcionando normalmente.
5. Criar o commit das alterações após os testes.

---

## [Não lançado] — 2026-10-16

### Documentação

- Reorganizado o README para distinguir funcionalidades disponíveis e planejadas.
- Documentados os requisitos, as variáveis de ambiente, os comandos operacionais e os testes de OCR.
- Registrada a transcrição de áudio como funcionalidade planejada, ainda não implementada.
- Incluídas orientações de segurança e revisão antes de commits.

### Estado

- Check-in e OCR já estavam documentados e haviam sido testados anteriormente em ambiente local.
- Esta atualização altera a documentação; não implementa transcrição de áudio.
- A inicialização automática no Windows e a hospedagem contínua precisam de validação independente.

---

## [Não lançado] — 2026-10-15

### Contexto

O projeto já possuía um bot Discord com check-in automático de membros, geração de cards gráficos e modos operacionais para teste, sincronização e reconstrução da catraca.

O objetivo desta etapa foi adicionar OCR de imagens mantendo as funções existentes.

### Etapa 1 — Dependência de OCR

- Adicionada a dependência `tesseract.js` ao projeto usando `npm install tesseract.js`.
- Confirmada a instalação com `npm ls tesseract.js --depth=0`.
- Versão observada durante a implementação: `7.0.0`.

### Etapa 2 — Módulo de reconhecimento

Criado `src/modules/ocr/recognize.ts`.

- Inicialização do worker Tesseract com os idiomas português e inglês (`por+eng`).
- Reutilização da promessa do worker para evitar inicializações repetidas a cada imagem.
- Retorno do texto reconhecido com espaços externos removidos.

### Etapa 3 — Handler de imagens

Criado `src/modules/ocr/handler.ts`.

- Restrição de processamento ao canal definido por `OCR_CHANNEL_ID`.
- Ignora mensagens de bots.
- Seleção de anexos de imagem compatíveis.
- Limite de três imagens por mensagem e 8 MB por imagem.
- Download limitado a hosts de anexos do Discord.
- Timeout de 30 segundos para download.
- Respostas em blocos de texto para facilitar a cópia do resultado.
- Tratamento de OCR vazio e falhas de processamento.

### Etapa 4 — Configuração e integração

- Adicionada a variável `OCR_CHANNEL_ID` ao `.env.example`.
- Integrado o handler ao `src/index.ts`.
- Adicionadas as intents `GuildMessages` e `MessageContent` ao cliente Discord.
- Registrado o evento `MessageCreate` para encaminhar mensagens do canal configurado ao handler.
- Mantida a rotina original `GuildMemberAdd`, responsável pelo check-in automático.

### Etapa 5 — Diagnóstico de execução

#### Diretório de execução incorreto

Foi executado `npm start` em `C:\WINDOWS\system32`, causando `ENOENT` porque o `package.json` não estava naquele diretório.

Correção: executar os comandos dentro de `C:\CheckIn`.

#### Intents não autorizadas

A inicialização retornou `Used disallowed intents`.

Correção: habilitar no Discord Developer Portal a intenção de membros do servidor e a intenção de conteúdo da mensagem. Após a configuração, o bot iniciou e exibiu `CHECKIN LAYERED ONLINE`, seguido do nome `CheckIn#9342` e da mensagem de espera por novos membros.

### Etapa 6 — Testes funcionais

- Executado `npm start -- --test`.
- Confirmada a geração e publicação do card de teste.
- Executado o modo `--rebuild` para reconstruir os registros dos membros atuais.
- Confirmado o funcionamento do OCR em um teste real no Discord.

Os testes foram realizados em ambiente local, com o bot conectado ao Discord.

### Estado ao final desta etapa

**Validado localmente:** conexão do bot, modo de teste do card, reconstrução da catraca e OCR.

**Ainda pendente:** revisão final do Git, commit das alterações e configuração de hospedagem contínua.

---

## [1.1.0] — 2026-09-28

### Adicionado

- Suporte a banners animados do Discord em GIF.
- Detecção automática do formato do card: PNG ou GIF.
- Composição de avatar, nome, usuário e informações do membro sobre banners animados.

### Melhorado

- Tree View reorganizada em português.
- Melhor organização das informações de identidade, conta Discord, servidor e cargos.
- Campos opcionais agora aparecem somente quando possuem informação.
- Melhorias no sistema de renderização dos cards.
- Melhorias no processo de reconstrução dos CheckIns.

### Corrigido

- Tratamento do `CATRACA_CHANNEL_ID` no TypeScript.
- Referência do attachment para utilizar automaticamente `checkin-profile.png` ou `checkin-profile.gif`.
- Problemas de composição e transparência durante animações GIF.

---

## [1.0.0] — 2026-09-28

### Adicionado

- Primeira versão funcional do CheckIn.
- Registro automático de novos membros.
- Card visual de perfil.
- Tree View com informações do membro.
- Comando de teste do CheckIn.
- Sincronização dos membros existentes.
- Reconstrução dos registros da catraca.
- Integração com Discord usando `discord.js`.
- Execução local com Node.js e TypeScript.

---

## Formato recomendado para novas entradas

Para cada alteração futura, registrar:

- **Objetivo:** o que precisava ser resolvido.
- **Estado anterior:** como o projeto funcionava antes da mudança.
- **Ferramentas:** programas e dependências utilizados.
- **Procedimento:** comandos e arquivos alterados, na ordem executada.
- **Problemas:** mensagens de erro e suas causas.
- **Correção:** o que resolveu o problema.
- **Teste:** resultado efetivamente observado.
- **Checkpoint:** o que está estável e o que ainda falta.
