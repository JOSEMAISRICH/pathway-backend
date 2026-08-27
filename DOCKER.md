# PathWay Backend — Docker

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows) en marcha
- Archivo `.env` en la raíz (el que ya usas, o copia `.env.docker.example`)
- Imagen basada en **Node 22.18.0** (Alpine), alineada con el entorno local (Node 22.18 / npm 11.4)

## Arranque rápido (Mongo Atlas)

Con tu `.env` actual (Atlas, JWT, OpenAI, Resend…):

```bash
cd PathWay-Backend
docker compose up --build
```

o:

```bash
npm run docker:up
```

| URL | Qué es |
|-----|--------|
| http://localhost:3000 | API |
| http://localhost:3000/health | `{"ok":true}` |

Front en otra terminal (sin Docker):

```bash
cd pathwaysaas
npm run dev
```

Asegúrate de `API_PROXY_TARGET=http://localhost:3000` en el `.env.local` del front.

## Arranque con Mongo local (sin Atlas)

```bash
npm run docker:up:local
```

Equivale a:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-db.yml up --build
```

La API usa `mongodb://mongo:27017/pathway` automáticamente.

## Comandos útiles

```bash
docker compose up --build -d    # segundo plano
docker compose logs -f api      # logs en vivo
docker compose ps               # estado / healthy
docker compose down             # parar
docker compose down -v          # parar y borrar volúmenes
```

## Qué incluye

- Imagen Node 20 Alpine
- Healthcheck en `/health`
- Volumen persistente para `uploads/`
- Plantilla EX-10 de desarrollo (se genera sola si falta)
- Usuario no-root en el contenedor

## Qué no incluye

- Front Next.js (sigue en el PC o se despliega aparte)
- HTTPS / dominio público (eso lo pone el hosting)

## Variables clave (`.env`)

`MONGODB_URI`, `JWT_SECRET`, `PUBLIC_APP_ORIGIN`, `CORS_ORIGIN`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`
