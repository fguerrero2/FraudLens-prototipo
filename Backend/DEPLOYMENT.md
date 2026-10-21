# Publicación del MVP

Los límites de los planes gratuitos cambian; confirmarlos en las páginas oficiales antes de crear recursos. Supabase ya tiene las migraciones aplicadas y el rol `fraudlens_app` creado. La API en Render y la web en Vercel todavía requieren configuración y despliegue.

## Restricción de costos y alcance

FraudLens es un proyecto universitario y el despliegue debe mantenerse en opciones gratuitas: **Render Free, Supabase Free, Vercel Hobby y las cuotas gratuitas de Expo/EAS**. No se autoriza activar pruebas pagas, actualizar planes, agregar complementos pagos ni crear recursos que generen cargos.

Antes de crear o modificar un recurso, verificar su plan y costo. Si una cuota gratuita no alcanza, una función requiere un plan pago o aparece un costo, detener esa operación y pedir una decisión al equipo; no cambiar de plan ni continuar con cargos automáticamente. Mantener aprobación humana para acciones de escritura en Supabase y para cambios o despliegues de producción mediante MCP. La automatización debe fallar de forma segura ante falta de cuota y explicar qué paso quedó pendiente.

## Servicios

| Parte | Opción | Configuración |
|---|---|---|
| API | Render Web Service Free | NestJS Node 22, raíz `Backend`, `render.yaml` |
| PostgreSQL | Supabase Free | PostgreSQL; roles separados para runtime y migraciones |
| Web | Vercel Hobby | Raíz `Frontend`, build `npm run build`, salida `dist` |
| Móvil | Expo / EAS | Proyecto `Frontend/mobile`; APK Android para distribución interna |

Render Free puede suspender la API por inactividad y su filesystem es efímero. Supabase, Vercel y Expo/EAS tienen cuotas y condiciones propias que pueden cambiar. Esta combinación sirve para demos y baja carga; no ofrece disponibilidad continua ni reemplaza backups. Confirmar los límites y términos vigentes antes de cada despliegue. [Render Free](https://render.com/docs/free), [Supabase pricing](https://supabase.com/pricing), [Vercel pricing](https://vercel.com/pricing), [Expo pricing](https://expo.dev/pricing).

La web Vite se publica como contenido estático en Vercel. [Guía de Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite). Supabase proporciona PostgreSQL administrado; usar el pooler de sesión para Prisma Migrate y el transaccional para la API. [Conexiones PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 1. Supabase PostgreSQL y bootstrap

1. Crear un proyecto Supabase en una región cercana a Render y definir una contraseña fuerte para el usuario propietario `postgres`.
2. Desde **Connect** en Supabase, copiar una URL del pooler de sesión compatible con IPv4; respetar el formato de usuario que muestra Supabase (el pooler suele requerir `<usuario>.<project-ref>`). Usar temporalmente esa URL de propietario como `DATABASE_URL` y `DIRECT_URL` en el entorno local de `Backend`; aplicar el esquema con `npm run prisma:deploy`. No ejecutar `prisma migrate dev` en hosting.
3. En el SQL Editor de Supabase, ejecutar `infrastructure/runtime-role.sql` como propietario después de crear las tablas. Es una operación de primera instalación: crea `fraudlens_app`, concede permisos y lo deja sin `BYPASSRLS`.
4. Crear las URLs permanentes para Render desde **Connect**: `DIRECT_URL` usa el pooler de sesión con el usuario propietario; `DATABASE_URL` usa el pooler transaccional con `fraudlens_app` en el formato de usuario que indique Supabase (habitualmente `fraudlens_app.<project-ref>`). Conservar `sslmode=require`, agregar `pgbouncer=true&connection_limit=3` a la URL transaccional y no usar roles con `BYPASSRLS`. No guardar estas URLs en el frontend ni en Git.
5. Con `DATABASE_URL` apuntando al rol `fraudlens_app`, configurar temporalmente en un entorno local controlado `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 12 caracteres), luego ejecutar `npm run build && npm run seed`. Para cargar transacciones ficticias de demo, establecer también `SEED_DEMO_DATA=true`. No poner credenciales de bootstrap en variables `VITE_*` ni dejarlas configuradas permanentemente en Render.

Validar el rol conectado por `DATABASE_URL`:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'fraudlens_app';
```

`rolsuper` y `rolbypassrls` deben ser false. La API verifica esto al iniciar en producción. RLS no reemplaza los permisos del backend. Las tablas de identidad son globales para resolver la sesión y las membresías.

## 2. API en Render

Importar el Blueprint `Backend/render.yaml` (indicar esa ruta en Render), o crear un Web Service con raíz `Backend`:

- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run prisma:deploy && npm run start`.
- Health: `/api/v1/health`.
- `NODE_ENV=production`, `NODE_VERSION=22`.
- `DATABASE_URL`: rol de runtime; `DIRECT_URL`: propietario de migraciones.
- `CORS_ORIGIN`: origen exacto de la web de Vercel, por ejemplo `https://<proyecto>.vercel.app`. Varios orígenes se separan con comas; no se usa wildcard.

Las migraciones usan `DIRECT_URL`. Los modelos opcionales se incluyen en `Backend/models` durante el build; no depender de archivos subidos al filesystem efímero. Si se usa `FRAUD_MODEL_PATH`, apuntar a un archivo incluido. El entrenamiento y la promoción se ejecutan fuera de la instancia gratuita.

## 3. Web en Vercel

Importar el repositorio en Vercel y establecer `Frontend` como **Root Directory**. Usar `npm run build` y `dist` como **Output Directory**. Configurar `VITE_API_URL=https://<api>.onrender.com/api/v1` en las variables de entorno de Preview y Production, y seleccionar Node.js 22.x. `Frontend/vercel.json` redirige rutas de cliente a la SPA. No definir claves API ni contraseñas como variables `VITE_*`.

Al obtener la URL pública de Vercel, configurar ese origen exacto en `CORS_ORIGIN` de Render. Si la URL del servicio de Render difiere de la usada al crear el proyecto Vercel, actualizar `VITE_API_URL` y volver a desplegar el frontend. Ingresar con el administrador de bootstrap y crear usuarios/membresías e integraciones desde Administración. Los tokens web se guardan en memoria; recargar la página requiere login.

## 4. App móvil

```bash
cd Frontend/mobile
npm ci
cp .env.example .env
npm start
```

Configurar `EXPO_PUBLIC_API_URL=https://<api>.onrender.com/api/v1`. Para un dispositivo físico en desarrollo, usar la IP LAN de la computadora, no `localhost`. Expo guarda la sesión en SecureStore y rota el refresh al renovar el acceso.

Build interno Android:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`eas.json` configura un APK instalable, que se puede distribuir sin Play Store. EAS ofrece builds en su plan Free dentro de sus cuotas; no se creó ni subió un APK en esta sesión. [EAS Build](https://docs.expo.dev/build/setup/), [planes Expo](https://expo.dev/pricing).

La aplicación móvil se instala en el dispositivo y no necesita un servidor de frontend separado. Publicar en App Store o Google Play requiere cuentas de desarrollador y implica cargos de registro o suscripción ([Apple](https://developer.apple.com/support/compare-memberships/), [Google Play](https://support.google.com/googleplay/android-developer/answer/6112435)); no se considera parte del hosting gratuito de la API/web.

## Validación posterior al despliegue

Comprobar health, login, cambio de organización, lectura paginada, registro de una transacción, revisión, umbrales y revocación de una credencial M2M. Un VIEWER debe recibir 403 al intentar modificar; una organización distinta no debe ver el `transaction_id` de otra. API completa en `/api/docs`.

Antes de datos reales, configurar backups en el proveedor y validar el rol de runtime. Los planes gratuitos son adecuados para la demo/MVP con baja carga; no garantizan disponibilidad continua.

## Dependencias pendientes

Se aplicaron los parches compatibles del backend y la web. La auditoría sigue señalando `deepmerge-ts` en la herramienta de configuración de Prisma y dependencias transitivas de las herramientas de Expo (`braces`, `node-forge`, `uuid`). No se forzaron downgrades de Prisma/Expo ni cambios incompatibles. Revisar los avisos y actualizaciones de los proveedores antes de usar datos reales; el build y los tests no sustituyen esa revisión.
