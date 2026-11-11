# Image aplikasi NusaBite ERP. Database MySQL berjalan terpisah (lihat docker-compose.yml).
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY views ./views
COPY public ./public

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
