# Multi-stage Dockerfile para CFO CBMERJ
# Estágio 1: Build da aplicação (Vite + TypeScript + Esbuild)
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependências
COPY package.json package-lock.json ./
RUN npm ci

# Copiar código fonte
COPY tsconfig.json vite.config.ts index.html firebase-applet-config.json ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY server.ts notionBackend.ts ./

# Gerar build de produção (Vite bundle + dist/server.cjs)
RUN npm run build
RUN npx esbuild scripts/backup-cli.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/backup-cli.mjs

# Estágio 2: Runner ultraleve para produção
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar arquivos necessários do build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Criar diretório de dados persistentes
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

# Iniciar servidor compilado
CMD ["node", "dist/server.cjs"]
