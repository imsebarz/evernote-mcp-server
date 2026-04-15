# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY vendor ./vendor
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/vendor ./vendor
COPY README.md mcp.json .

# Tokens path (mount a volume and point here)
ENV EVERNOTE_TOKEN_PATH=/data/tokens.json

CMD ["node", "dist/api-server.js"]
