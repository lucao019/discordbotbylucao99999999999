FROM node:18-alpine

WORKDIR /app

# Copiar package files primeiro (para cache de dependências)
COPY package*.json ./

# Instalar dependências (inclui tsx, necessário para rodar TypeScript)
RUN npm ci

# Copiar TODO o código fonte
COPY . .

CMD ["npm", "start"]