# PathWay Backend

API Express + MongoDB para el despacho y el portal cliente (magic link).

## Requisitos

- Node.js 20+
- MongoDB
- Variables en `.env` (ver `.env.example`)

## Scripts

```bash
npm install
npm run dev          # servidor con watch (:3000)
npm test             # tests Jest
npm run pdf:template # genera EX10_template.pdf de desarrollo
npm run docker:up    # API en Docker (Atlas)
npm run docker:up:local  # API + Mongo local
npm run migrate:case-docs   # migración one-shot documentos + magicExpiresAt
bash scripts/smoke-flow.sh  # flujo API manual (requiere servidor + curl)
```

Documentación API para memoria TFG: **[docs/API-TFG.md](./docs/API-TFG.md)** · Checklist: **[docs/CHECKLIST-TFG.md](./docs/CHECKLIST-TFG.md)** · Docker: **[DOCKER.md](./DOCKER.md)** · Pagos: **[docs/BILLING-STRIPE.md](./docs/BILLING-STRIPE.md)**

## Endpoints principales

### Auth (`/api/auth`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/register` | Alta despacho |
| POST | `/login` | Sesión cookie |
| POST | `/forgot-password` | Email reset → `{PUBLIC_APP_ORIGIN}/reset-password?token=...` |
| POST | `/reset-password` | Nueva contraseña |
| GET | `/me` | Agencia logueada |

### Expedientes (`/api/cases`) — cookie despacho

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista con `progress`, `reviewStatus`, `hasRejectedDocuments`, `magicExpiresAt` |
| POST | `/` | Crear expediente (3 slots + magic link) |
| GET | `/:caseId` | Detalle con `documents[]` |
| POST | `/:id/upload` | Pasaporte + IA + PDF EX-10 |
| POST | `/:caseId/documents/upload` | Subida genérica (despacho) |
| **PATCH** | **`/:caseId/documents/:docId/review`** | **Revisión por slot** `{ status, feedbackMessage }` |
| PATCH | **`/:caseId/documents/:docId/extracted-data`** | **Corrección manual campos IA** `{ fields: { nombre, apellidos, … } }` |
| PATCH/POST | `/:id/review` | Revisión expediente completo |
| POST | `/:id/magic-link` | Generar/regenerar enlace portal |
| POST | `/:id/send-magic-email` | Email magic link (Resend) |
| GET | `/:id/final-pdf` | PDF EX-10 |

### Portal cliente (`/api/magic`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:token` | Estado portal (404/410 si inválido/caducado) |
| POST | `/:token/upload-passport` | Pasaporte + IA + EX-10 |
| POST | `/:token/upload` | Domicilio/foto (`file` + `docId`) |
| GET | `/:token/final-pdf` | PDF (cuando `reviewStatus === approved`) |

### Archivos

```
GET /api/files/{agencyId}/{caseId}/{filename}?token={magicToken}
```

## Revisión por documento

```http
PATCH /api/cases/:caseId/documents/:docId/review
Content-Type: application/json

{
  "status": "approved" | "rejected",
  "feedbackMessage": "..."   // obligatorio si rejected (min 3 chars)
}
```

- No modifica `case.reviewStatus` global (sigue `pending` hasta revisión de expediente).
- Actualiza `progress` y `hasRejectedDocuments` en respuestas.
- Email Resend al rechazar un slot (si `RESEND_API_KEY`).

## Variables de entorno clave

```env
MONGODB_URI=...
JWT_SECRET=...              # mismo valor que Next.js (pathwaysaas)
PUBLIC_APP_ORIGIN=http://localhost:5500
MAGIC_LINK_TTL_DAYS=30
RESEND_API_KEY=re_...
RESEND_FROM=PathWay <onboarding@resend.dev>
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-4o
```

### Extracción de pasaporte (OpenAI visión)

Obligatorio en local **solo si quieres extracción real** al subir pasaporte (`POST /api/magic/:token/upload-passport` o `POST /api/cases/:id/upload`):

| Variable | Descripción |
|----------|-------------|
| `OPENAI_API_KEY` | Clave de OpenAI. Sin ella, la subida funciona pero no hay IA. |
| `OPENAI_VISION_MODEL` | Modelo visión (default `gpt-4o`; alias `OPENAI_MODEL`). |
| `EXTRACTION_MOCK=true` | Dev: no llama OpenAI → `ingestionStatus: requires_review` con nota. |
| `SKIP_PASSPORT_EXTRACTION=true` | Dev: guarda archivo → `ingestionStatus: processed` sin IA. |

**Estados de extracción (contrato v1.0):** `processed` (OK), `requires_review` (campos ilegibles o vacíos), `error` (fallo técnico: 429, API caída, key inválida).

Si ves `429 You exceeded your current quota` en logs (`[passportExtractor][vision-error]`), usa `EXTRACTION_MOCK=true` para probar el flujo sin coste o recarga crédito en OpenAI.

### `PUBLIC_APP_ORIGIN` (crítico)

Todas las URLs al cliente (`magicLinkUrl`, emails, reset password) usan **solo** esta variable (no el `Origin` del request).

| Entorno | Ejemplo |
|---------|---------|
| PC local | `http://localhost:5500` |
| Móvil misma WiFi | `http://192.168.1.XX:5500` |
| Producción | `https://tudominio.com` |

### Resend (emails)

- Magic link al crear: `POST /api/cases` con `{ "sendMagicLinkEmail": true }`
- Reenvío manual: `POST /api/cases/:id/send-magic-email`
- Email HTML con logo `{PUBLIC_APP_ORIGIN}/email/pathway-logo.png` (servido por Next)
- Pie opcional: `PRIVACY_POLICY_URL` en `.env`
- Rechazo por documento, aprobación/rechazo de expediente, olvidé contraseña

**Sandbox:** con `onboarding@resend.dev` solo llega a emails **verificados** en tu cuenta Resend. Para clientes reales, verifica un dominio en [resend.com/domains](https://resend.com/domains) y actualiza `RESEND_FROM`.

Sin `RESEND_API_KEY`: crear expediente responde `201` con `emailSent: false` y `emailError` claro (no 502 opaco).

## Crear expediente + email automático

```http
POST /api/cases
Cookie: pw_session

{
  "clientName": "Juan Pérez",
  "clientEmail": "juan@email.com",
  "clientPhone": "+34 600 000 000",
  "sendMagicLinkEmail": true
}
```

**Respuesta 201:**

```json
{
  "case": { "id", "clientName", "clientEmail", "magicToken", "magicLinkToken", "magicLinkUrl", "magicExpiresAt", "documents": [3 slots], ... },
  "emailSent": true
}
```

Si el envío falla: `emailSent: false` y `emailError` con motivo legible.

## Auth

- Cookie `pw_session` en login/register
- JSON opcional: `{ "token": "<jwt>" }` si el proxy no pasa `Set-Cookie`
- Reset: `{PUBLIC_APP_ORIGIN}/reset-password?token=...`

## Docker

Guía completa: **[DOCKER.md](./DOCKER.md)**

```bash
# Con tu .env (Atlas):
docker compose up --build

# Sin Atlas (Mongo en Docker):
docker compose -f docker-compose.yml -f docker-compose.local-db.yml up --build
```

API en **http://localhost:3000** (`/health` → `{"ok":true}`).  
El front Next sigue en el PC (`npm run dev` en pathwaysaas).

## Contrato `Case` (campos front)

`clientName`, `clientEmail`, `clientPhone`, `magicToken`, `magicLinkToken`, `magicLinkUrl`, `magicExpiresAt`, `progress`, `status`, `reviewStatus`, `feedbackMessage`, `hasRejectedDocuments`, `documents[]`, `finalPdfUrl`, `updatedAt`.

Listado `GET /api/cases`: cada fila incluye `documentsCount`, `hasRejectedDocuments`, `reviewStatus`, `progress`.

## Front (pathwaysaas)

Proxy Next.js: `/api/*` → `http://localhost:3000`

Tras este backend, el front puede activar subida de `proof_address` y `photo` y la revisión por documento sin cambios adicionales de contrato.
