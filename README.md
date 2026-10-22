# FraudLens-prototipo

Prototipo de FraudLens: **web y API en un solo proyecto Next.js** (`App/`), pensado para un único deploy en Vercel con PostgreSQL (Supabase o Neon).

| Carpeta | Qué es |
|---|---|
| [`App/`](App/README.md) | Web React + API `/api/v1` (Next.js), Prisma, tests y evaluación del modelo |
| [`App/mobile/`](App/mobile/README.md) | App React Native/Expo que consume la misma API |
| [`Datasets/`](Datasets/README.md) | Datasets abiertos para evaluar el motor de riesgo |
| [`fraudlens-arquitectura.md`](fraudlens-arquitectura.md) | Documento de arquitectura |
| [`estructura.md`](estructura.md) | Diagrama de la estructura actual |

## Correr todo con Docker

```bash
cd App
docker compose up --build -d
BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD='<12+ caracteres>' SEED_DEMO_DATA=true docker compose run --rm seed
```

- Web: http://localhost:3000
- API: http://localhost:3000/api/v1
- PostgreSQL: `localhost:5433` (dentro de Docker, `postgres:5432`)

Una sola imagen (`fraudlens-app`) sirve la web y la API, igual que en Vercel. Comandos útiles: `docker compose ps`, `docker compose logs -f app`, `docker compose down`.

Despliegue: [App/DEPLOYMENT.md](App/DEPLOYMENT.md).

> Hasta la rama `003_fix_fraud_tests` el prototipo estaba separado en `Backend/` (NestJS en Render) y `Frontend/` (Vite en Vercel). Ese esquema queda en el historial de git.
