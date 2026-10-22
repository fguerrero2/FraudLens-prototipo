# Publicación — un solo deploy en Vercel + PostgreSQL

Los límites de los planes gratuitos cambian; confirmarlos en las páginas oficiales antes de crear recursos. Según la guía anterior, Supabase ya tiene aplicadas las migraciones hasta `20261021000000_platform_audit_log` y el rol `fraudlens_app` creado. La migración `20261022000000_qr_challenges` se aplica en el primer deploy de esta versión.

## Restricción de costos y alcance

FraudLens es un proyecto universitario y el despliegue debe mantenerse en opciones gratuitas: **Vercel Hobby, Supabase Free (o Neon Free) y las cuotas gratuitas de Expo/EAS**. No se autoriza activar pruebas pagas, actualizar planes, agregar complementos pagos ni crear recursos que generen cargos.

Antes de crear o modificar un recurso, verificar su plan y costo. Si una cuota gratuita no alcanza, una función requiere un plan pago o aparece un costo, detener esa operación y pedir una decisión al equipo; no cambiar de plan ni continuar con cargos automáticamente. Mantener aprobación humana para acciones de escritura en Supabase y para cambios o despliegues de producción mediante MCP.

## Servicios

| Parte | Opción | Configuración |
|---|---|---|
| Web + API | Vercel Hobby | Proyecto Next.js, **Root Directory `App`**, una función para `/api/v1/*` |
| PostgreSQL | Supabase Free (o Neon Free) | Roles separados para runtime (`fraudlens_app`) y migraciones (propietario) |
| Móvil | Expo / EAS | Proyecto `App/mobile`; APK Android para distribución interna |

Vercel Hobby es para uso no comercial. Supabase Free pausa el proyecto tras un período sin uso: **abrir la app antes de una demo**. [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing), [Neon pricing](https://neon.com/pricing), [Expo pricing](https://expo.dev/pricing).

## 1. PostgreSQL (Supabase)

Si es una base nueva:

1. Crear el proyecto Supabase en una región cercana a la región de funciones de Vercel.
2. Desde **Connect**, copiar la URL del **pooler de sesión** con el usuario propietario. Usarla como `DATABASE_URL` y `DIRECT_URL` en un `.env` local de `App` y aplicar el esquema con `npm run prisma:deploy`.
3. En el SQL Editor, ejecutar `infrastructure/runtime-role.sql` como propietario. Crea `fraudlens_app` sin `BYPASSRLS`.
4. Con `DATABASE_URL` apuntando a `fraudlens_app`, ejecutar `npm run seed` con `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (12+ caracteres) definidos solo en ese momento.

Validar el rol de runtime:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'fraudlens_app';
```

Los dos deben ser `false`. La API lo verifica en producción antes del primer pedido y se niega a atender si no se cumple.

## 2. Vercel

1. Importar el repositorio en Vercel y elegir **`App`** como **Root Directory**. Vercel detecta Next.js; usar Node.js 22.x.
2. Variables de entorno (Production y Preview):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Pooler **transaccional** (puerto 6543) con `fraudlens_app.<project-ref>`; agregar `?sslmode=require&pgbouncer=true&connection_limit=3` |
| `DIRECT_URL` | Pooler **de sesión** (puerto 5432) con el usuario propietario; solo para migraciones |

3. Deploy. El script `vercel-build` corre `prisma generate`, **`prisma migrate deploy`** y `next build`: las migraciones pendientes se aplican en cada deploy.

> ⚠️ Los deploys de Preview usan las mismas variables: si apuntan a la misma base, también migran producción. Para una prueba aislada, configurar en Preview otra base (por ejemplo, una rama de Neon).

`connection_limit` no puede ser 1: algunas rutas consultan tablas de identidad mientras está abierta la transacción del tenant y necesitan una segunda conexión.

No hace falta `CORS_ORIGIN`: la web llama a la API en el mismo origen. Solo configurarlo si otro sitio web va a consumir la API. La app móvil nativa no lo necesita.

## 3. App móvil

```bash
cd App/mobile
npm ci
cp .env.example .env
npm start
```

Configurar `EXPO_PUBLIC_API_URL=https://<proyecto>.vercel.app/api/v1`. Build interno Android:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

## Validación posterior al despliegue

Comprobar health, login, cambio de organización, lectura paginada, registro de una transacción, revisión, umbrales, login por QR y revocación de una credencial M2M. Un VIEWER debe recibir 403 al intentar modificar; una organización distinta no debe ver el `transaction_id` de otra. La documentación de la API queda en `https://<proyecto>.vercel.app/api/docs`. El smoke test de solo lectura sirve contra producción:

```bash
TEST_API_URL=https://<proyecto>.vercel.app/api/v1 TEST_EMAIL=... TEST_PASSWORD=... npm run test:docker
```

`test/e2e-docker.cjs` **escribe datos**: no correrlo contra producción.

## Prueba local equivalente

`compose.yaml` levanta la misma imagen de la app con un PostgreSQL local y los mismos dos roles. Ver [README](README.md#con-docker-recomendado-para-pruebas-internas).

## Dependencias pendientes

`npm audit --omit=dev` señala `deepmerge-ts` (herramienta de configuración de Prisma) y `uuid` (dependencia de `exceljs`), igual que en la versión anterior. No se forzaron downgrades ni cambios incompatibles. Next.js no agrega avisos. Revisar antes de usar datos reales.
