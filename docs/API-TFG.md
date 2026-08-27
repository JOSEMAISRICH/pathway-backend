# PathWay Backend — Referencia API (memoria TFG)

Documento técnico del API REST. Base URL local: `http://localhost:3000`.  
El front (pathwaysaas) llama a `/api/*` vía proxy hacia Express.

---

## 1. Arquitectura

```
Cliente (navegador)
  → Next.js :5500  (UI despacho + portal magic link)
      → proxy /api/* → Express :3000
          → MongoDB Atlas (o Mongo Docker)
          → OpenAI (extracción pasaporte)
          → Resend (emails)
```

**Colecciones principales:** Agency, Expediente/Client, Document.

---

## 2. Autenticación (despacho)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Alta agencia |
| POST | `/api/auth/login` | — | Cookie `pw_session` (JWT) |
| POST | `/api/auth/logout` | — | Cierra sesión |
| GET | `/api/auth/me` | Cookie | Agencia actual |
| POST | `/api/auth/forgot-password` | — | Email reset |
| POST | `/api/auth/reset-password` | — | Nueva contraseña |

El portal del **cliente final** no usa login: autentica con **token magic link** en la URL.

---

## 3. Expedientes (agencia)

Todas requieren cookie de sesión.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/cases/types` | Tipos de trámite (MVP-3, EX-10) |
| GET | `/api/cases` | Listado |
| POST | `/api/cases` | Crear (`clientName`, `clientEmail`, `caseType`, opcional `sendMagicLinkEmail`) |
| GET | `/api/cases/:id` | Detalle + `documents[]` + checklist |
| PATCH | `/api/cases/:id` | Actualizar datos básicos |
| DELETE | `/api/cases/:id` | Borrar |
| POST | `/api/cases/:id/upload` | Subir pasaporte (IA + PDF) |
| POST | `/api/cases/:id/documents/upload` | Subida genérica (despacho) |
| PATCH | `/api/cases/:id/documents/:docId/review` | Aprobar/rechazar documento |
| PATCH | `/api/cases/:id/documents/:docId/extracted-data` | Corregir campos IA a mano |
| PATCH/POST | `/api/cases/:id/review` | Aprobar/rechazar expediente |
| POST | `/api/cases/:id/magic-link` | Regenerar enlace portal |
| POST | `/api/cases/:id/send-magic-email` | Enviar email magic link |
| GET | `/api/cases/:id/final-pdf` | Descargar PDF EX-10 |
| GET | `/api/cases/:id/passport-original` | Original del pasaporte |

### Tipos de expediente (`caseType`)

| ID | Documentos |
|----|------------|
| `MVP-3` | pasaporte, domicilio, foto |
| `EX-10` | + tasa 790, empadronamiento, antecedentes |

---

## 4. Portal cliente (magic link)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/magic/:token` | Estado del expediente / docs |
| POST | `/api/magic/:token/upload-passport` | Subir pasaporte + extracción IA |
| POST | `/api/magic/:token/upload` | Domicilio/foto (`file` + `docId`) |
| GET | `/api/magic/:token/final-pdf` | PDF si expediente aprobado |
| GET | `/api/magic/:token/passport-original` | Original pasaporte |

---

## 5. Extracción IA (contrato ExtractedData v1.0)

Tras subir pasaporte, `ingestionStatus`:

| Estado | Significado |
|--------|-------------|
| `processed` | Campos OK |
| `requires_review` | IA respondió pero faltan campos / ilegibles |
| `error` | Fallo técnico (429, API, sin key) |

Campos típicos: `nombre`, `apellidos`, `numero_pasaporte`, `nacionalidad`, `fecha_nacimiento`, `sexo`, `numero_nie`, etc.

Corrección manual (despacho):

```http
PATCH /api/cases/:caseId/documents/:docId/extracted-data
{ "fields": { "apellidos": "García", "numero_pasaporte": "X1234567" } }
```

---

## 6. Emails (Resend)

Disparados por:

- Crear expediente con `sendMagicLinkEmail: true`
- `POST /api/cases/:id/send-magic-email`
- Revisión / rechazo (notificaciones)

**Sandbox actual:** con `RESEND_FROM=…@resend.dev` solo llega al email verificado de la cuenta Resend. Producción: dominio verificado + `RESEND_FROM=noreply@tudominio.com`.

---

## 7. Health y Docker

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | `{ "ok": true }` |

```bash
docker compose up --build
# o con Mongo local:
docker compose -f docker-compose.yml -f docker-compose.local-db.yml up --build
```

Ver `DOCKER.md`.

---

## 8. Flujo demo (defensa TFG)

1. Login agencia → crear expediente EX-10 / MVP-3  
2. Enviar / copiar magic link  
3. Cliente sube pasaporte + domicilio + foto  
4. IA extrae datos (o `requires_review` → corregir en dashboard)  
5. Despacho aprueba documentos → aprueba expediente  
6. Generación PDF EX-10 → descarga  

---

## 9. Tests

```bash
npm test
```

Suite Jest (auth, cases, magic, extracción, PDF, case engine, etc.).
