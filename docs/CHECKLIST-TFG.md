# Checklist cierre backend (TFG)

## Hecho en el repo

- [x] API completa (auth, cases, magic, PDF, extracción IA)
- [x] Corrección manual de datos extraídos
- [x] Case Engine MVP-3 / EX-10
- [x] Plantilla `pdf-templates/EX10_template.pdf`
- [x] Docker: Dockerfile + compose + local-db + DOCKER.md
- [x] Documentación API: `docs/API-TFG.md`
- [x] Tests: `npm test` → **105 passed**

## Tú (manual, 5–15 min)

1. Abrir **Docker Desktop** hasta que diga Running
2. En PathWay-Backend:
   ```bash
   docker compose up --build
   ```
3. Comprobar http://localhost:3000/health → `{"ok":true}`
4. Front: `pathwaysaas` → `npm run dev` → demo del flujo completo

## Opcional (no bloquea el TFG)

- [ ] Dominio propio en Resend → emails a cualquier destinatario
- [ ] Sustituir EX10_template.pdf por el PDF oficial del ministerio
