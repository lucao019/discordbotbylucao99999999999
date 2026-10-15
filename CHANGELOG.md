# Changelog — CheckIn

Todas as alterações relevantes do projeto são registradas neste arquivo em ordem cronológica. Os registros descrevem o que foi implementado e testado, sem declarar como concluídas as etapas ainda pendentes.

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

### Próximas etapas

1. Revisar `git status --short`, `git diff --check` e `git diff --stat`.
2. Conferir os arquivos de código, documentação e dependências.
3. Garantir que `.env` e o backup temporário não sejam incluídos no commit.
4. Criar o commit após a revisão.
5. Investigar e testar a hospedagem gratuita na Oracle Cloud.

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
