# Billing Stripe (despacho)

## Seguridad

- `STRIPE_SECRET_KEY` (`sk_test_…` / `sk_live_…`) **solo en `.env` del backend**.
- **Nunca** en el frontend ni en el código fuente.
- El front solo redirige a la URL que devuelve el API (Checkout hospedado).

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/billing/status` | Cookie | Estado plan / suscripción |
| POST | `/api/billing/checkout` | Cookie | Crea Checkout → `{ url, sessionId }`. Body: `trial: false` cobra ya; `customerEmail` opcional (editable en Stripe; default = email agencia). |
| POST | `/api/billing/sync` | Cookie | Tras volver: `{ sessionId }` |
| POST | `/api/billing/webhook` | Firma Stripe | Actualiza `agency.stripe` |

## Front (ejemplo)

```ts
// Botón "Pagar / Suscribirse"
const r = await fetch("/api/billing/checkout", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const j = await r.json();
if (j.url) window.location.href = j.url;
```

Tras éxito Stripe redirige a:

`/dashboard?billing=success&session_id=cs_…`

```ts
const sessionId = new URLSearchParams(location.search).get("session_id");
if (sessionId) {
  await fetch("/api/billing/sync", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}
```

## Trial (prueba gratuita en app)

Al **registrarse**, el despacho recibe **7 días de prueba** sin tarjeta ni Stripe. El API devuelve `billing.active: true` y `billing.status: "app_trial"`.

```env
# Opcional (default 7). Pon 0 para desactivar la prueba en app.
# APP_TRIAL_DAYS=7
```

**Stripe solo al suscribirse** (`POST /api/billing/checkout` con `trial: false` o sin body). Checkout cobra desde el primer día; no hay trial en Stripe.

## Variables `.env`

```env
STRIPE_SECRET_KEY=sk_test_...
# Opcional (webhook local):
STRIPE_WEBHOOK_SECRET=whsec_...
# Opcional (Price del Dashboard); si vacío → 75 €/mes
# STRIPE_PRICE_ID=price_...
# Días de prueba gratuita en app tras registrarse (default 7; 0 = sin prueba)
# APP_TRIAL_DAYS=7
```

## Webhook local

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copia el `whsec_…` a `.env` y reinicia el backend.

## Tarjetas de prueba

https://docs.stripe.com/testing — ej. `4242 4242 4242 4242`
