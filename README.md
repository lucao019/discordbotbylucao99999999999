# CheckIn — Discord Utility Bot

Bot para Discord desenvolvido com Node.js e TypeScript. O projeto combina automação de entrada de membros com reconhecimento de texto em imagens (OCR).

## Estado do projeto

- [x] Conexão com o Discord.
- [x] Check-in automático de membros.
- [x] Geração de cards de perfil com Sharp.
- [x] Suporte a banners animados em GIF.
- [x] Modos de teste, sincronização e reconstrução da catraca.
- [x] OCR de imagens em português e inglês.
- [x] Gerenciador do canal OCR via `/ocr-limpar`.
- [x] Integração contínua (GitHub Actions) com typecheck.
- [ ] Transcrição de arquivos de áudio.
- [ ] Validar e documentar a inicialização automática após as últimas alterações no ambiente local.
- [ ] Avaliar hospedagem contínua fora do computador pessoal.

Os itens marcados como pendentes ainda não devem ser considerados funcionalidades concluídas.

## Funcionalidades

### Check-in de membros

Ao entrar um novo membro humano no servidor, o bot gera um card de perfil e publica as informações no canal configurado.

O registro pode incluir nome, usuário, identificador Discord, datas relevantes, número do membro, cargos e informações de boost disponíveis. O card pode utilizar avatar e banner, incluindo banners animados quando suportados.

### OCR de imagens

O bot processa imagens enviadas no canal configurado para OCR e devolve o texto reconhecido como mensagem copiável.

O módulo está organizado em:

- `src/modules/ocr/recognize.ts`: reconhecimento de texto com Tesseract.js.
- `src/modules/ocr/handler.ts`: validação de mensagens, anexos, download e resposta no Discord.

O handler limita o processamento a três imagens por mensagem e 8 MB por imagem. Os formatos aceitos incluem PNG, JPEG, WebP, BMP e TIFF, conforme as validações implementadas no código.

A precisão depende da qualidade da imagem. O OCR extrai texto, mas não garante interpretação correta do conteúdo.

### Gerenciador do canal OCR

O comando `/ocr-limpar` abre um painel de gerenciamento para limpar mensagens do canal OCR.

O módulo está em `src/modules/ocr-manager/` e é composto por:

- `command.ts`: definição do slash command e registro via REST na inicialização.
- `handler.ts`: roteamento das interações de botões e do comando slash.
- `operations.ts`: lógica de busca, exclusão em lote e paginação.

#### Fluxos disponíveis

**Limpar tudo** — solicita confirmação explícita antes de apagar todas as mensagens do canal. Usa bulk delete para mensagens com menos de 14 dias e exclusão individual para as mais antigas.

**Limpar quantidade** — exibe botões para escolher entre 10, 25, 50 ou 100 mensagens recentes. Mostra uma prévia e exige confirmação antes de executar.

**Seleção individual** — lista as mensagens recentes em páginas de 10 itens. Permite marcar e desmarcar individualmente antes de confirmar a exclusão.

#### Autorização

O comando só pode ser usado por:

- O usuário cujo ID está em `OWNER_ID`.
- Usuários com a permissão `ManageMessages` no canal.

O bot também verifica se possui `ManageMessages` no canal antes de executar qualquer exclusão.

#### Registro do comando

O comando é registrado via REST durante a inicialização do bot. Para isso, `DISCORD_CLIENT_ID` precisa estar configurado no `.env`.

Se `GUILD_ID` estiver definido, o comando é registrado apenas naquele servidor (útil durante o desenvolvimento, pois fica disponível imediatamente). Sem `GUILD_ID`, o registro é global e pode levar até uma hora para propagar.

#### Permissões necessárias no canal OCR

```text
View Channel
Send Messages
Read Message History
Manage Messages
```

### Transcrição de áudio

A transcrição de áudio é uma funcionalidade planejada. Ela ainda precisa de implementação e testes antes de ser anunciada como disponível.

## Integração contínua

O workflow em `.github/workflows/ci.yml` roda a cada push ou pull request na branch `main`. Ele instala as dependências com `npm ci` e executa o typecheck com `npx tsc --noEmit` nas versões 20 e 22 do Node.js.

Não há suíte de testes automatizados. A verificação de build é feita pelo typecheck. Para rodar localmente:

```powershell
npx tsc --noEmit
```

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js | Execução |
| TypeScript | Código-fonte |
| discord.js | API do Discord |
| Sharp | Processamento de imagens e cards |
| Tesseract.js | OCR |
| dotenv | Variáveis de ambiente |
| tsx | Execução do TypeScript |
| npm | Dependências |
| Docker | Empacotamento e deploy |
| GitHub Actions | Integração contínua |
| Git | Controle de versões |

## Requisitos

- Node.js e npm instalados.
- Aplicação de bot criada no [Discord Developer Portal](https://discord.com/developers/applications).
- Permissões adequadas nos canais do servidor.
- Intents de membros do servidor e conteúdo de mensagens habilitadas no Developer Portal.

## Instalação

Clone o repositório e entre na pasta:

```powershell
git clone https://github.com/lucao019/discord-checkin-bot.git
Set-Location "discord-checkin-bot"
npm install
```

Crie o arquivo `.env` com as variáveis necessárias:

```dotenv
DISCORD_TOKEN=
USER_ID=
CATRACA_CHANNEL_ID=
OCR_CHANNEL_ID=
```

Preencha os valores localmente. Nunca publique o token do bot.

## Configuração das variáveis

- `DISCORD_TOKEN`: token privado do bot.
- `USER_ID`: ID do membro utilizado pelo modo de teste.
- `CATRACA_CHANNEL_ID`: ID do canal de check-in.
- `OCR_CHANNEL_ID`: ID do canal de OCR.
- `OWNER_ID`: ID do usuário com acesso irrestrito ao `/ocr-limpar`.
- `DISCORD_CLIENT_ID`: ID da aplicação do bot no Developer Portal (necessário para registrar o comando slash).
- `GUILD_ID` (opcional): ID do servidor para registro local do comando durante desenvolvimento.

O arquivo `.env.example` serve como modelo sem credenciais reais. O arquivo `.env` deve permanecer ignorado pelo Git.

## Executar o bot

Na pasta do projeto:

```powershell
npm start
```

O processo precisa permanecer ativo para receber eventos e mensagens.

## Modos de operação

Testar a geração de um card:

```powershell
npm start -- --test
```

Sincronizar os registros dos membros atuais:

```powershell
npm start -- --sync
```

Reconstruir a catraca:

```powershell
npm start -- --rebuild
```

**Atenção:** `--rebuild` remove mensagens do próprio bot e mensagens de sistema identificadas no canal da catraca antes de gerar os registros novamente. Confira o canal e entenda o efeito antes de executar.

## Deploy com Docker

O projeto inclui um `Dockerfile` baseado em `node:18-alpine` com a inicialização via `npm start`. A imagem instala as dependências com `npm ci` (incluindo `tsx`, usado em tempo de execução) e roda o bot com `tsx src/index.ts`.

Para construir e rodar localmente:

```powershell
docker build -t checkin .
docker run --env-file .env checkin
```

As variáveis de ambiente devem ser fornecidas em tempo de execução — nunca embutidas na imagem. O `.dockerignore` mantém `node_modules`, `.env`, `.git` e outros artefatos locais fora do contexto de build.

## Testar o OCR

1. Configure `OCR_CHANNEL_ID`.
2. Inicie o bot.
3. Envie uma imagem com texto no canal configurado.
4. Compare a resposta com o conteúdo original.

Se não houver resposta, confira a conexão do bot, as permissões do canal, o ID configurado e os erros do terminal.

## Estrutura principal

```text
CheckIn
├── .github
│   └── workflows
│       └── ci.yml
├── src
│   ├── index.ts
│   └── modules
│       ├── ocr
│       │   ├── handler.ts
│       │   └── recognize.ts
│       └── ocr-manager
│           ├── command.ts
│           ├── handler.ts
│           └── operations.ts
├── eng.traineddata
├── por.traineddata
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── package.json
├── package-lock.json
├── README.md
└── CHANGELOG.md
```

## Segurança

- Nunca versione `.env` ou tokens.
- Não publique credenciais em logs, prints ou documentação.
- Revise `git status` antes de cada commit.
- Use `git diff --check` para verificar problemas de formatação.
- Não execute `--rebuild` sem avaliar o efeito sobre o canal.
- Registre no changelog somente alterações realmente feitas e testadas.

## Desenvolvimento e histórico

O histórico das alterações está em [CHANGELOG.md](CHANGELOG.md).

Próximas etapas: implementar e testar a transcrição de áudio, revisar a inicialização automática no Windows e avaliar opções de hospedagem contínua.
