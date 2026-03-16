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

COPY server.js ./
COPY server.js ./
COPY Inter-Bold.ttf ./
COPY Inter-Light.ttf ./

EXPOSE 3000

CMD ["node", "server.js"]
