# FraudLens Backend

Monolito modular multi-tenant: NestJS/TypeScript, Prisma y PostgreSQL. Sigue los principios de [fraudlens-arquitectura.md](../fraudlens-arquitectura.md), conservando el stack existente y el motor de riesgo. Web y Expo consumen una API única bajo `/api/v1`.

## Inicio local

```bash
npm ci
cp .env.example .env
npm run prisma:deploy
npm run build
npm run seed
npm run start:dev
```

Completar las conexiones PostgreSQL y las credenciales de bootstrap antes de ejecutar. El seed exige email y contraseña de al menos 12 caracteres, crea un superadministrador con membresía en la organización inicial y no reemplaza contraseñas existentes. `SEED_DEMO_DATA=true` agrega historiales sintéticos de manera idempotente. La web está en `../Frontend` y la app en `../Frontend/mobile`.

Con Docker: definir `BOOTSTRAP_ADMIN_PASSWORD` en `.env`, ejecutar `docker compose up --build` y luego `docker compose exec backend npm run seed`. El esquema se migra con el propietario y la API conecta con `fraudlens_app`, sin SUPERUSER/BYPASSRLS. Para un volumen PostgreSQL anterior, crear el rol sin borrar el volumen:

```bash
docker compose exec postgres psql -U fraudlens -d fraudlens -f /docker-entrypoint-initdb.d/10-app-role.sql
```

Web: `http://localhost:5173`; API: `http://localhost:3000/api/v1`; Swagger: `http://localhost:3000/api/docs`; PostgreSQL local: `localhost:5433`.

## Identidad y aislamiento

- Usuarios globales, membresías por tenant, roles con permisos y roles globales independientes.
- Login por email/contraseña; contraseña con scrypt y salt. Sesiones opacas: access token de 15 minutos y refresh de 7 días con rotación, almacenados como hashes. Logout revoca la sesión.
- El backend revalida membresía, estado de organización y permisos en cada solicitud. `SUPER_ADMIN` no permite acceder implícitamente a transacciones de empresas ajenas.
- La organización activa se selecciona mediante `/auth/tenant` y se verifica contra las membresías. No se acepta un tenant arbitrario en headers o payloads de negocio.
- Cada solicitud de negocio usa una transacción PostgreSQL y `set_config(..., true)`. El contexto termina al hacer commit/rollback, también con conexiones reutilizadas.
- Filtros por tenant en la aplicación más RLS forzado en transacciones, configuraciones/historial, revisiones, expedientes, auditoría, integraciones, alertas y asignaciones de modelos. FK compuestas impiden que una revisión/alerta/expediente referencie una transacción de otra empresa.
- Identidad, permisos, sesiones y hashes de credenciales necesitan consultas globales para autenticar antes de determinar el tenant; su acceso solo se expone mediante servicios autorizados.
- Claves M2M por integración, con permisos acotados; secreto devuelto una sola vez y hash persistido. Las antiguas claves fijas por rol quedan sin efecto.
- En producción la API rechaza conexiones con SUPERUSER o BYPASSRLS. Ver [infrastructure/runtime-role.sql](infrastructure/runtime-role.sql).

## API

| Ruta | Función / permiso |
|---|---|
| `POST /auth/login`, `POST /auth/refresh` | Públicas; limitadas por IP en esta instancia |
| `GET /auth/me`, `POST /auth/tenant`, `POST /auth/logout` | Sesión humana |
| `GET/POST /platform/tenants`, `PUT /platform/tenants/:id` | Administración global |
| `GET/PUT /tenant` | Organización actual, `tenant.read` |
| `GET/POST /users`, `POST /memberships`, `PUT /memberships/:userId` | Usuarios, membresías y roles del tenant |
| `GET/POST /roles`, `PUT /roles/:id` | Roles personalizados y permisos |
| `GET/POST /api-clients`, `PUT /api-clients/:id/revoke` | Integraciones M2M |
| `POST /transactions` | Ingesta y scoring, `transactions.create` |
| `GET /transactions`, `GET /transactions/:externalId` | Filtros/paginación y detalle, `transactions.read` |
| `PUT /transactions/:externalId/review` | Revisión con evidencia, `transactions.review` |
| `POST/PUT /transactions/:externalId/case` | Expedientes, `transactions.review` |
| `GET /transactions/cases/list` | Bandeja de expedientes |
| `GET /dashboard/metrics`, `GET /dashboard/heatmap` | Agregados por tenant, `dashboard.read` |
| `GET/PUT /settings/thresholds` | Configuración por tenant, `settings.read/update` |
| `GET /settings/thresholds/history`, `GET /settings/thresholds/audit` | Auditoría, `audit.read` |
| `GET /alerts`, `PUT /alerts/:id` | Alertas automáticas y seguimiento, `alerts.read/update` |
| `GET /models`, `GET/PUT /settings/model` | Modelos disponibles y selección por tenant |
| `GET/POST /platform/models`, `GET /platform/audit` | Registro de modelos y eventos globales |
| `GET /health` | Pública |

Usuarios humanos envían `Authorization: Bearer <access_token>`; integraciones envían `x-api-key: <secret>`. Los permisos se evalúan centralmente. No se puede suplantar al actor con `x-actor-name` o el campo `analyst`.

Se conservan los nombres de campos y valores de la API anterior: `transaction_id`, `user_id`, `timestamp`, `risk_score` (0–100), `risk_level` en español y `decision: aprobar/revisar/bloquear`. `transaction_id` es idempotente dentro de cada tenant. Los importes y saldos se almacenan como DECIMAL(18,2). Se admiten `latitude`/`longitude` y los campos PaySim: `operation_type`, `name_orig`, `name_dest`, `old_balance_orig`, `new_balance_orig`, `old_balance_dest`, `new_balance_dest`.

## Scoring y ML

El motor heurístico conserva señales de comportamiento y PaySim. El modelo experimental de anomalías se evalúa y promueve mediante los comandos existentes; ver [evaluation/README.md](evaluation/README.md). Se puede registrar un artefacto bajo `ML_ARTIFACT_ROOT` y asignarlo a un tenant. La versión del registro debe coincidir con la del artefacto. Los archivos se incluyen en el despliegue; el servidor no recibe uploads de modelos.

El score determina el nivel de riesgo; los umbrales del tenant determinan la decisión. La transacción conserva factores, snapshot de umbrales y versión utilizada. Un error de scoring deriva a revisión manual y genera alerta. Las revisiones humanas no reemplazan la recomendación automática. El score normalizado **no es una probabilidad calibrada de fraude**; por eso la API publica `normalized_risk_score` y no lo etiqueta como `fraud_probability`. No se inventan métricas de precisión o recall en el dashboard.

El mapa de calor agrega coordenadas a dos decimales, toma los últimos 30 días y devuelve hasta 1.000 celdas, sin descargar todas las transacciones. Las métricas de hoy usan la zona horaria del tenant.

## Migración y comprobaciones

Las migraciones nuevas asignan los registros anteriores a `00000000-0000-4000-8000-000000000001` y crean la organización `default`. No borran transacciones ni historiales. Hacer backup antes de aplicar una migración a datos reales. Los importes previos se redondean a dos decimales al convertirse a DECIMAL.

```bash
npm run build
npm test
npm run evaluate
```

Las pruebas cubren sesiones, permisos, cambios de tenant, regresiones de scoring y las migraciones reales con PostgreSQL embebido (PGlite): backfill, RLS sin filtros de aplicación, writes ajenos y limpieza de contexto. La prueba SQL usa un rol sin privilegios de bypass. No requiere Docker ni modifica una base externa.

La exportación de revisiones exige `EVALUATION_TENANT_ID` para no mezclar organizaciones:

```bash
EVALUATION_TENANT_ID=<uuid> npm run evaluation:export -- /ruta/dataset.jsonl
```

Guía de despliegue gratuito: [DEPLOYMENT.md](DEPLOYMENT.md). Redis y un bucket S3 no son dependencias obligatorias del MVP: las sesiones persisten en PostgreSQL y los artefactos viajan con el build. Se pueden incorporar cuando exista necesidad de caché distribuida o administración remota de modelos.
