FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# 1) Instala Chromium + dependÃªncias comuns
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# 2) Diz pro Puppeteer onde estÃ¡ o Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# (opcional) evita o Puppeteer tentar baixar Chrome na instalaÃ§Ã£o
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 3) DependÃªncias Node
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 4) CÃ³digo
COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]

