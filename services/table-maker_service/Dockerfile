FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=4008
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

EXPOSE 4008

CMD ["npm", "start"]
