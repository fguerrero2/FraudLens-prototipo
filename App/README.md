# FraudLens App — web + API en un solo deploy

Aplicación Next.js que sirve **la web y la API `/api/v1` desde el mismo proyecto**, pensada para desplegarse completa en Vercel con PostgreSQL (Supabase o Neon). Reemplaza al esquema anterior de tres servicios (web Vite en Vercel, API NestJS en Render y PostgreSQL en Supabase). La app móvil Expo sigue en [mobile](mobile/README.md) y consume la misma API.

| Carpeta | Contenido |
|---|---|
| `app/` | Rutas de Next: la página (`page.jsx`) y una sola función para toda la API (`api/v1/[...path]/route.ts`) |
| `web/` | La web React (login, organización, transacciones, revisiones, expedientes, umbrales, administración, mapa) |
| `server/` | Lógica de negocio: servicios, DTOs, guard de autenticación, contexto de tenant y router HTTP |
| `prisma/` | Esquema, migraciones y seed |
| `test/` | Tests unitarios, de RLS (PGlite) y de punta a punta contra Docker |
| `evaluation/` | Evaluación y promoción de modelos ([README](evaluation/README.md)) |
| `mobile/` | App React Native/Expo; `mobile/shared` tiene los catálogos de idioma que usa también la web |

## Inicio local

### Con Docker (recomendado para pruebas internas)

Una sola imagen (`fraudlens-app`) con la web y la API, más un PostgreSQL que simula Supabase:

```bash
docker compose up --build -d
BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD='<12+ caracteres>' SEED_DEMO_DATA=true docker compose run --rm seed
```

- Web: http://localhost:3000 · API: http://localhost:3000/api/v1 · PostgreSQL: `localhost:5433`
- Al iniciar, el contenedor aplica las migraciones con el propietario (`DIRECT_URL`) y atiende con `fraudlens_app`, sin SUPERUSER ni BYPASSRLS.
- Pruebas contra el contenedor:

```bash
TEST_EMAIL=admin@example.com TEST_PASSWORD='<la del seed>' npm run test:docker        # smoke test, solo lectura
TEST_EMAIL=admin@example.com TEST_PASSWORD='<la del seed>' node test/e2e-docker.cjs   # punta a punta, ESCRIBE datos
```

`e2e-docker.cjs` crea transacciones, organizaciones y clientes API: **usarlo solo contra el Docker local**.

### Sin Docker

```bash
npm ci
cp .env.example .env      # completar las conexiones PostgreSQL
npm run prisma:deploy
npm run seed
npm run dev
```

## Cómo se reemplazó NestJS

La lógica de negocio no cambió: los servicios, DTOs y reglas de permisos son los mismos. Lo que hacía el framework ahora lo hace `server/http/router.ts`:

| NestJS | Ahora |
|---|---|
| Controllers con decoradores `@Get`, `@Permissions`, `@Public`, `@PlatformRoles` | Tablas de rutas `server/*/*.routes.ts` con `permissions`, `public`, `platformRoles` |
| `AuthGuard` global | El mismo guard (`server/common/guards/auth.guard.ts`), llamado por el router |
| `TenantInterceptor` | El router abre la transacción con `set_config('app.tenant_id', …, true)` antes del handler |
| `ValidationPipe` (whitelist + transform) | `class-validator` / `class-transformer` con las mismas opciones y el mismo formato de error |
| `ParseUUIDPipe` | `uuidParams` en la ruta |
| `AllExceptionsFilter` | Mismo cuerpo de error: `statusCode`, `message`, `timestamp`, `path` |
| Inyección de dependencias | `server/app.ts` crea una instancia de cada servicio por proceso |

Se mantiene el contrato: rutas, nombres de campos, códigos (POST responde 201) y cuerpos de error.

**Login por QR:** antes los desafíos vivían en memoria. En Vercel cada pedido puede caer en una instancia distinta, así que ahora se guardan en la tabla `QrChallenge` (solo el hash del `challenge_id`) y se consumen una sola vez.

**Límite de intentos de login:** sigue en memoria. En Vercel cuenta por instancia de función, no globalmente.

## Identidad y aislamiento

- Usuarios globales, membresías por tenant, roles con permisos y roles globales independientes.
- Login por email/contraseña; contraseña con scrypt y salt. Sesiones opacas: access token de 15 minutos y refresh de 7 días con rotación, almacenados como hashes. Logout revoca la sesión.
- El backend revalida membresía, estado de organización y permisos en cada solicitud. `SUPER_ADMIN` no permite acceder implícitamente a transacciones de empresas ajenas.
- La organización activa se selecciona mediante `/auth/tenant` y se verifica contra las membresías. No se acepta un tenant arbitrario en headers o payloads de negocio.
- Cada solicitud de negocio usa una transacción PostgreSQL y `set_config(..., true)`. El contexto termina al hacer commit/rollback, también con conexiones reutilizadas (pooler).
- Filtros por tenant en la aplicación más RLS forzado en transacciones, configuraciones/historial, revisiones, expedientes, auditoría, integraciones, alertas y asignaciones de modelos. FK compuestas impiden que una revisión/alerta/expediente referencie una transacción de otra empresa.
- Claves M2M por integración, con permisos acotados; secreto devuelto una sola vez y hash persistido.
- En producción la API rechaza conexiones con SUPERUSER o BYPASSRLS. Ver [infrastructure/runtime-role.sql](infrastructure/runtime-role.sql).

## API

**Documentación interactiva:** Swagger UI en [`/api/docs`](http://localhost:3000/api/docs) y especificación OpenAPI 3.1 en [`/api/v1/openapi.json`](http://localhost:3000/api/v1/openapi.json). Se genera desde la misma tabla de rutas que atiende los pedidos y desde los DTOs (`class-validator-jsonschema`), así que no se edita a mano: cada endpoint muestra el permiso o rol que exige y el cuerpo esperado con sus validaciones. Las respuestas exitosas no tienen esquema detallado; los errores sí (`ErrorResponse`).

- `npm run openapi` regenera [`openapi.json`](openapi.json) en el repo, listo para importar en Postman. `test/openapi.test.ts` falla si quedó desactualizado.
- El build no minifica el código del servidor (`serverMinification: false` en `next.config.mjs`): los nombres de los esquemas salen de los nombres de las clases DTO.

Usuarios humanos envían `Authorization: Bearer <access_token>`; integraciones envían `x-api-key: <secret>`.

| Ruta | Función / permiso |
|---|---|
| `POST /auth/login`, `POST /auth/refresh` | Públicas; limitadas por IP en cada instancia |
| `POST /auth/qr/challenge`, `GET /auth/qr/status/:id`, `POST /auth/qr/authorize` | Login por QR (los dos primeros son públicos) |
| `GET /auth/me`, `POST /auth/tenant`, `POST /auth/logout` | Sesión humana |
| `GET/POST /platform/tenants`, `PUT /platform/tenants/:id`, `POST/PUT /platform/tenants/:id/admins` | Administración global |
| `GET /platform/report/tenants?format=json\|xlsx\|txt`, `GET /platform/history` | Reporte e historial de organizaciones |
| `GET/PUT /tenant` | Organización actual, `tenant.read` |
| `GET/POST /users`, `GET /users/history`, `POST /memberships`, `PUT /memberships/:id` | Usuarios y membresías del tenant |
| `GET/POST /roles`, `PUT /roles/:id` | Roles personalizados y permisos |
| `GET/POST /api-clients`, `PUT /api-clients/:id/revoke` | Integraciones M2M |
| `POST /transactions` | Ingesta y scoring, `transactions.create` |
| `GET /transactions`, `GET /transactions/:externalId` | Filtros/paginación y detalle, `transactions.read` |
| `PUT /transactions/:externalId/review` | Revisión con evidencia, `transactions.review` |
| `POST/PUT /transactions/:externalId/case`, `GET /transactions/cases/list` | Expedientes |
| `GET /dashboard/metrics`, `GET /dashboard/heatmap` | Agregados por tenant, `dashboard.read` |
| `GET/PUT /settings/thresholds`, `GET /settings/thresholds/history`, `GET /settings/thresholds/audit` | Umbrales y auditoría |
| `GET /alerts`, `PUT /alerts/:id` | Alertas, `alerts.read/update` |
| `GET /models`, `GET/PUT /settings/model`, `GET/POST /platform/models`, `GET /platform/audit` | Modelos |
| `GET /health` | Pública |

Campos: `transaction_id` (idempotente dentro de cada tenant), `user_id`, `timestamp`, `risk_score` (0–100), `risk_level` en español y `decision: aprobar/revisar/bloquear`. Importes en DECIMAL(18,2). Se admiten `latitude`/`longitude` y los campos PaySim.

## Scoring y ML

El motor heurístico conserva señales de comportamiento y PaySim. El modelo de anomalías se evalúa y promueve con los comandos de [evaluation](evaluation/README.md). Los artefactos van en `models/` y se incluyen en el deploy (`outputFileTracingIncludes` en `next.config.mjs`); el servidor no recibe uploads. El score normalizado **no es una probabilidad calibrada de fraude**.

## Web

El login mantiene los tokens en memoria y los renueva con rotación; al recargar se pide login de nuevo. La web es una app de cliente (`app/page.jsx` la carga sin render en servidor) y llama a la API en el mismo origen (`/api/v1`), así que no necesita CORS. `NEXT_PUBLIC_API_URL` solo hace falta para apuntar a otra API. Idiomas: `en-US` y `es-419`, con catálogos compartidos en `mobile/shared`.

## Comprobaciones

```bash
npm test        # 30 tests (sesiones, permisos, router, QR, OpenAPI, scoring, migraciones con RLS en PGlite) + i18n
npm run build   # build de producción de Next, con chequeo de tipos
```

Guía de despliegue: [DEPLOYMENT.md](DEPLOYMENT.md).
