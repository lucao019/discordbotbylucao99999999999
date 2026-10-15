# CheckIn — Discord Bot

Bot para Discord desenvolvido em Node.js e TypeScript. O projeto reúne o sistema original de check-in de membros, geração de cards gráficos de perfil e extração de texto de imagens por OCR.

> **Estado atual:** check-in testado, reconstrução dos registros executada e OCR testado com sucesso no Discord. Hospedagem 24/7 ainda não configurada.

## 1. Objetivo do projeto

O CheckIn automatiza tarefas de entrada e organização de membros de um servidor Discord.

O projeto possui duas funções principais:

- **Check-in de membros:** detecta entradas, gera um card de perfil e publica informações do membro no canal configurado para a catraca.
- **OCR de imagens:** recebe imagens em um canal dedicado, reconhece o texto presente nelas e responde com texto copiável.

As funcionalidades são mantidas no mesmo bot, organizadas em módulos para facilitar futuras expansões.

## 2. Tecnologias utilizadas

| Tecnologia | Finalidade |
|---|---|
| Node.js | Ambiente de execução JavaScript |
| TypeScript | Desenvolvimento com tipagem |
| discord.js | Integração com a API do Discord |
| Sharp | Processamento e composição de imagens |
| Tesseract.js | Reconhecimento óptico de caracteres (OCR) |
| dotenv | Leitura de variáveis do arquivo `.env` |
| tsx | Execução do código TypeScript |
| npm | Instalação e gerenciamento de dependências |
| Git | Controle de versões |

## 3. Funcionalidades

### 3.1. Check-in automático

O bot escuta o evento `GuildMemberAdd`.

Quando um membro humano entra no servidor, o código chama a função `gerarCheckIn()` e tenta publicar seu registro no canal configurado em `CATRACA_CHANNEL_ID`.

O registro contém:

- Nome de exibição e nome de usuário.
- Identificador da conta.
- Data de criação e idade aproximada da conta.
- Data de entrada no servidor.
- Número do membro no registro.
- Cargos e informações de boost, quando aplicáveis.
- Card gráfico com avatar, banner quando disponível e identificação do CheckIn.

O card é montado com Sharp e publicado como anexo em uma mensagem incorporada (*embed*).

### 3.2. OCR de imagens

O módulo de OCR fica em `src/modules/ocr/`.

O funcionamento é dividido em duas partes:

- `recognize.ts`: inicializa o Tesseract.js e reconhece texto em português e inglês (`por+eng`).
- `handler.ts`: valida mensagens, seleciona imagens, baixa os anexos permitidos, executa o reconhecimento e responde no Discord.

O processamento é restrito ao canal cujo identificador está em `OCR_CHANNEL_ID`.

Limites implementados no handler:

- Até três imagens por mensagem.
- Até 8 MB por imagem.
- Tipos de imagem reconhecidos por MIME type ou extensão: PNG, JPEG, WebP, BMP e TIFF.
- Download limitado a hosts de anexos do Discord.
- Tempo limite de 30 segundos para o download.
- Respostas divididas em blocos para evitar mensagens excessivamente longas.
- Tratamento de texto vazio e falhas de processamento.

O OCR transforma o texto reconhecido em uma resposta copiável. Ele não interpreta necessariamente o significado do conteúdo nem garante reconhecimento perfeito em imagens de baixa qualidade.

## 4. Estrutura relevante do projeto

```text
C:\CheckIn
├── src
│   ├── index.ts
│   └── modules
│       └── ocr
│           ├── handler.ts
│           └── recognize.ts
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── CHANGELOG.md
```

A estrutura acima destaca os arquivos envolvidos neste trabalho. Outros arquivos e módulos existentes no repositório devem ser preservados.

### Responsabilidade de cada arquivo

- `src/index.ts`: inicialização do cliente Discord, intents, check-in automático, modos de teste e encaminhamento das mensagens para o OCR.
- `src/modules/ocr/recognize.ts`: reconhecimento de texto com Tesseract.js.
- `src/modules/ocr/handler.ts`: validação e processamento das imagens enviadas ao canal OCR.
- `.env`: configurações privadas da instalação local.
- `.env.example`: modelo das variáveis necessárias, sem credenciais reais.
- `package.json`: dependências e scripts npm.
- `package-lock.json`: versões resolvidas das dependências.

## 5. Pré-requisitos

Antes de iniciar o projeto, tenha instalado:

1. Node.js em uma versão compatível com as dependências.
2. npm, incluído normalmente com Node.js.
3. Git, caso deseje clonar ou versionar o repositório.
4. Uma aplicação de bot criada no Discord Developer Portal.
5. Um servidor Discord no qual o bot possa acessar os canais necessários.

## 6. Instalação passo a passo

Abra o PowerShell e entre na pasta do projeto:

```powershell
Set-Location C:\CheckIn
```

Confira as versões instaladas:

```powershell
node --version
npm --version
git --version
```

Instale as dependências declaradas no projeto:

```powershell
npm install
```

Durante a implementação do OCR, a dependência foi adicionada com:

```powershell
npm install tesseract.js
```

Confira se ela está instalada:

```powershell
npm ls tesseract.js --depth=0
```

A versão observada durante o desenvolvimento foi `tesseract.js@7.0.0`.

## 7. Configuração do arquivo .env

Crie ou edite o arquivo `.env` na raiz do projeto.

As variáveis utilizadas pelo código são:

```dotenv
DISCORD_TOKEN=SEU_TOKEN_PRIVADO
USER_ID=ID_DO_USUARIO_PARA_TESTE
CATRACA_CHANNEL_ID=ID_DO_CANAL_DA_CATRACA
OCR_CHANNEL_ID=ID_DO_CANAL_OCR
```

Substitua os valores de exemplo pelos identificadores corretos da sua instalação.

- `DISCORD_TOKEN`: token privado do bot.
- `USER_ID`: identificador do membro usado no modo de teste.
- `CATRACA_CHANNEL_ID`: canal em que os cards de check-in são publicados.
- `OCR_CHANNEL_ID`: canal exclusivo para processar imagens por OCR.

O `.env` não deve ser publicado no GitHub. Mantenha-o listado no `.gitignore` e nunca inclua o token em prints, mensagens ou documentação pública.

O `.env.example` deve conter apenas os nomes das variáveis e valores vazios ou de exemplo.

## 8. Configuração do Discord Developer Portal

Acesse:

https://discord.com/developers/applications

Selecione a aplicação CheckIn e entre em **Bot**.

Em **Intenções de gateway privilegiadas**, habilite:

- **Intenção dos membros do servidor** (*Server Members Intent*).
- **Intenção de conteúdo da mensagem** (*Message Content Intent*).

A intenção de presença não é necessária para as funções documentadas aqui.

Salve as alterações.

O código utiliza as intents `Guilds`, `GuildMembers`, `GuildMessages` e `MessageContent`. As duas primeiras intents privilegiadas da lista acima são necessárias para o comportamento implementado.

Também confira as permissões do bot nos canais: visualizar o canal, ler o histórico quando necessário e enviar mensagens. Para publicar cards, ele precisa poder enviar mensagens incorporadas e anexar arquivos.

## 9. Como iniciar o bot

No PowerShell:

```powershell
Set-Location C:\CheckIn
npm start
```

Quando a conexão funcionar, o terminal deverá exibir o nome do bot e a mensagem de que está aguardando novos membros.

Mantenha o processo ativo. Enquanto o bot estiver desconectado, ele não executará o evento de entrada em tempo real.

## 10. Modos de operação e testes

### Testar a geração de um card

```powershell
npm start -- --test
```

O modo de teste usa `USER_ID` para localizar um membro existente e chama a rotina de geração do card em modo de teste.

Esse teste verifica a geração e o envio do card. Ele não simula uma entrada real no servidor.

### Sincronizar os registros

```powershell
npm start -- --sync
```

O modo de sincronização percorre os membros atuais, exclui contas de bot da coleção e envia cards com a numeração calculada para cada membro.

### Reconstruir a catraca

```powershell
npm start -- --rebuild
```

**Atenção:** a reconstrução apaga, no canal configurado para a catraca, as mensagens do próprio CheckIn e as mensagens identificadas pelo Discord como mensagens de sistema. Em seguida, gera novamente os cards dos membros atuais.

Não use esse comando como substituto de um teste comum. Ele altera o histórico do canal e deve ser executado conscientemente.

Os modos `--test`, `--sync` e `--rebuild` encerram o cliente ao terminar ou ao tratar uma falha no fluxo de inicialização.

## 11. Como testar o OCR

1. Inicie o bot com `npm start`.
2. Abra o canal cujo ID está em `OCR_CHANNEL_ID`.
3. Envie uma imagem contendo texto.
4. Aguarde o reconhecimento e confira a resposta.
5. Copie o texto retornado e compare com a imagem original.

O primeiro reconhecimento pode demorar enquanto os dados de idioma necessários são preparados. A disponibilidade desses dados e o acesso à internet podem afetar a primeira execução.

Teste também imagens com texto pequeno, múltiplas linhas e diferentes níveis de qualidade.

Mensagens em outros canais não devem ser processadas pelo handler de OCR.

## 12. Histórico de problemas e soluções

### Erro `ENOENT` ao executar `npm start`

**Causa:** o comando foi executado em `C:\WINDOWS\system32`, onde não existe o `package.json` do projeto.

**Solução:**

```powershell
Set-Location C:\CheckIn
npm start
```

### Erro `Used disallowed intents`

**Causa identificada:** o Discord recusou a conexão porque uma ou mais intents solicitadas não estavam autorizadas na aplicação.

**Solução aplicada:** habilitar as intents privilegiadas de membros do servidor e conteúdo de mensagens no Developer Portal, salvar as configurações e iniciar novamente o bot.

### OCR sem resposta

Verifique:

1. Se o bot está conectado.
2. Se `OCR_CHANNEL_ID` corresponde ao canal correto.
3. Se o bot pode visualizar o canal e enviar mensagens.
4. Se a mensagem contém um anexo de imagem compatível.
5. Se o terminal mostra algum erro durante o processamento.

Não publique o `.env` para diagnosticar esse problema.

## 13. Segurança e boas práticas

- Nunca versionar o `.env`.
- Não compartilhar tokens ou credenciais.
- Não apagar backups sem verificar se são necessários.
- Executar `git diff --check` antes de registrar alterações.
- Revisar o conteúdo de cada arquivo antes do commit.
- Testar o check-in e o OCR após alterações em `src/index.ts`.
- Evitar reconstruções desnecessárias do canal da catraca.
- Registrar no changelog apenas mudanças efetivamente realizadas e verificadas.

## 14. Hospedagem

Atualmente, o projeto foi testado em ambiente local no Windows.

O objetivo futuro é avaliar uma hospedagem que mantenha o processo Node.js ativo 24 horas por dia, sem depender do PC pessoal.

Oracle Cloud é uma possibilidade a ser investigada, mas sua configuração, disponibilidade de recursos gratuitos e funcionamento contínuo ainda precisam ser testados. Não considere a hospedagem concluída antes dessa validação.

## 15. Estado do projeto

- [x] Bot conectado ao Discord.
- [x] Geração de card verificada pelo modo `--test`.
- [x] Reconstrução dos registros dos membros executada.
- [x] OCR testado no canal configurado.
- [x] Intents privilegiadas configuradas.
- [ ] Revisão final de todos os arquivos e do Git.
- [ ] Commit das alterações documentadas.
- [ ] Configuração e teste de hospedagem 24/7.

## 16. Próxima etapa

Antes de publicar uma nova versão, revisar o `README.md`, o `CHANGELOG.md`, o diff do código e o estado do Git. Só então registrar o commit da versão validada.

O objetivo é manter um histórico reproduzível: cada etapa deve informar o que foi feito, por que foi necessário, qual comando foi executado, qual resultado foi observado e qual é o próximo checkpoint.
