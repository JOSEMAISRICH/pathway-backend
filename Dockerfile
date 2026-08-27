# PathWay Backend — imagen de producción
# Alineado con entorno local: Node v22.18.0 / npm 11.x
FROM node:22.18.0-alpine

WORKDIR /app

RUN apk add --no-cache curl \
  && addgroup -S pathway && adduser -S pathway -G pathway

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY pdf-templates ./pdf-templates

RUN node scripts/generate-ex10-template.js \
  && mkdir -p uploads/temp uploads/final \
  && chown -R pathway:pathway /app

USER pathway

ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["node", "scripts/docker-entrypoint.js"]
