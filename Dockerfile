FROM node:20-alpine

# Canvas braucht native Dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

WORKDIR /app

COPY package.json ./
RUN npm install --production

# Kopiert die Server-Datei und ALLE Schriftarten
COPY server.js ./
COPY *.ttf ./

EXPOSE 3000

CMD ["node", "server.js"]
