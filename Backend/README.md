# FraudLens Backend

API de analisis de fraude para el MVP de FraudLens. Stack: NestJS + TypeScript, Prisma + SQLite, autenticacion por API key (placeholder).

## Setup

```bash
npm install
cp .env.example .env        # ya existe un .env de desarrollo con valores por defecto
npx prisma migrate dev --name init
npm run seed                # carga usuarios con historial transaccional de ejemplo
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api/v1`.

## Deploy (Supabase + Render)

La base de datos vive en Supabase (Postgres administrado); el servidor NestJS corre en Render (Supabase no aloja procesos Node persistentes, solo Postgres/Auth/Storage/Edge Functions).

**1) Base de datos en Supabase**
1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Ir a Project Settings → Database → Connection string y copiar:
   - **Connection pooling** (puerto `6543`, con `?pgbouncer=true`) → va en `DATABASE_URL`.
   - **Direct connection** (puerto `5432`) → va en `DIRECT_URL` (la necesita Prisma para migrar).
3. Completar esos valores en `.env`.
4. Generar las migraciones (la primera vez, contra Postgres):
   ```bash
   npx prisma migrate dev --name init
   npm run seed
   ```

**2) Servidor en Render**
1. Subir este repo a GitHub.
2. En Render: New → Blueprint, apuntar al repo (usa el `render.yaml` incluido) — o New → Web Service manual con:
   - Build command: `npm install && npm run build`
   - Start command: `npx prisma migrate deploy && npm run start`
3. Cargar las variables de entorno (`DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`, `CLIENT_API_KEY`, `ANALYST_API_KEY`, `ADMIN_API_KEY`) con los mismos valores que en `.env`, y `CORS_ORIGIN` apuntando al dominio del frontend desplegado.
4. Deploy. El tier free de Render duerme tras ~15 min sin trafico: la primera request tras la inactividad puede tardar 30-50s.

**Nota**: `postinstall` corre `prisma generate` automaticamente en cada `npm install`, asi que Render no necesita un paso extra para eso.

## Autenticacion (placeholder del MVP)

Cada request protegido requiere el header `x-api-key`. Los valores por defecto (definidos en `.env`) son:

| Rol | Header `x-api-key` | Puede |
|---|---|---|
| Sistema cliente | `client_dev_key_change_me` | `POST /transactions` |
| Analista de fraude | `analyst_dev_key_change_me` | Consultar transacciones, dashboard, umbrales |
| Administrador | `admin_dev_key_change_me` | Todo lo anterior + modificar umbrales |

La API key de administrador funciona como superusuario de cualquier ruta. Al modificar umbrales se puede mandar opcionalmente el header `x-actor-name` para identificar quien hizo el cambio (se guarda en el historial de auditoria).

## Endpoints

| Metodo | Ruta | CU | Rol |
|---|---|---|---|
| POST | `/transactions` | CU-01 / CU-02 / CU-03 / CU-04 | client |
| GET | `/transactions` | CU-05 (filtros: `date_from`, `date_to`, `risk_level`, `decision`, `user_id`, `transaction_id`, `sort`, `order`, `page`, `page_size`) | analyst |
| GET | `/transactions/:transactionId` | CU-06 | analyst |
| GET | `/dashboard/metrics` | soporte CU-05 (cards del dashboard) | analyst |
| GET | `/settings/thresholds` | CU-04 | analyst |
| PUT | `/settings/thresholds` | CU-07 | admin |
| GET | `/settings/thresholds/history` | CU-07 (auditoria) | admin |
| GET | `/health` | - | publico |

## Recorrido de demo (seccion 10 del brief)

El seed crea usuarios (`usr_01H8M2`, `usr_01G4P9`, `usr_01J7B3`, `usr_01C2L8`, `usr_01K5T1`, `usr_01E9R4`) con historial habitual: mismo pais, categoria, comercio, dispositivo y franja horaria — los mismos `user_id` que ya aparecen mockeados en el prototipo de dashboard (`Frontend/src/App.jsx`).

**1) Monto por debajo del minimo → aprobado sin ejecutar el modelo (CU-02):**
```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-demo-01","user_id":"usr_01J7B3","timestamp":"2026-08-26T15:00:00Z","amount":5000,"currency":"ARS","category":"Kiosco","merchant":"Kiosco 24","country":"Argentina","channel":"POS","device_id":"POS-Terminal-1"}'
```

**2) Transaccion habitual → aprobada por el modelo:**
```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-demo-02","user_id":"usr_01C2L8","timestamp":"2026-08-26T14:30:00Z","amount":70000,"currency":"ARS","category":"Supermercado","merchant":"Supermercados DIA","country":"Argentina","channel":"POS","device_id":"Android-App-C3"}'
```

**3) Monto elevado + ubicacion y horario atipicos → revisar:**
```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-demo-03","user_id":"usr_01G4P9","timestamp":"2026-08-26T03:15:00Z","amount":280000,"currency":"ARS","category":"Viajes","merchant":"Viajes Mundo","country":"Espana","channel":"Web"}'
```

**4) Anomalia extrema (monto, pais, dispositivo, horario, historial insuficiente) → bloquear:**
```bash
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-demo-04","user_id":"usr_01K5T1","timestamp":"2026-08-26T04:00:00Z","amount":900000,"currency":"ARS","category":"Importados","merchant":"Global Import Co","country":"Rusia","channel":"E-commerce","device_id":"unknown-device-xyz"}'
```

## Senales estilo PaySim (campos opcionales)

Ademas de los campos del brief original, `POST /transactions` acepta campos opcionales inspirados en el dataset ["Synthetic Financial Datasets For Fraud Detection" (PaySim)](https://www.kaggle.com/datasets/ealaxi/paysim1) — el mismo que usa el notebook de referencia de Carmen Castro González. Se usan como senales extra del motor de riesgo cuando el sistema cliente los provee (billeteras, transferencias con saldo):

| Campo | Tipo | Analogo en PaySim |
|---|---|---|
| `operation_type` | `CASH_IN \| CASH_OUT \| DEBIT \| PAYMENT \| TRANSFER` | `type` |
| `name_orig` | string | `nameOrig` |
| `old_balance_orig` / `new_balance_orig` | number | `oldbalanceOrg` / `newbalanceOrig` |
| `name_dest` | string | `nameDest` |
| `old_balance_dest` / `new_balance_dest` | number | `oldbalanceDest` / `newbalanceDest` |

Al igual que en PaySim, estas senales solo se activan para `TRANSFER`/`CASH_OUT` (los unicos tipos donde ese dataset registra fraude real):

- **Vaciamiento total de origen**: `old_balance_orig - amount ≈ 0` y `new_balance_orig = 0` → patron clasico de cuenta comprometida.
- **Saldo destino sin reflejar la operacion**: `old_balance_dest = new_balance_dest = 0` pese a recibir el monto.
- **Inconsistencia de saldo**: `old_balance_orig - amount ≠ new_balance_orig`.
- **Transferencia sobre el limite de control**: `amount > 200.000` con `operation_type = TRANSFER` — replica la regla `isFlaggedFraud` de PaySim.

El seed crea un usuario adicional de billetera (`usr_01W3F7`) con historial de transferencias con saldos consistentes, para poder probar estas senales de inmediato:

```bash
# Consistente con el historial -> aprobar
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-paysim-01","user_id":"usr_01W3F7","timestamp":"2026-08-26T15:00:00Z","amount":28000,"currency":"ARS","category":"Billetera virtual","merchant":"Wallet P2P","country":"Argentina","channel":"App","device_id":"Android-App-W7","operation_type":"TRANSFER","name_orig":"usr_01W3F7","old_balance_orig":120000,"new_balance_orig":92000,"name_dest":"dest-4821","old_balance_dest":50000,"new_balance_dest":78000}'

# Vaciamiento total + saldo destino sin reflejar el ingreso -> bloquear
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-paysim-02","user_id":"usr_01W3F7","timestamp":"2026-08-26T15:05:00Z","amount":115000,"currency":"ARS","category":"Billetera virtual","merchant":"Wallet P2P","country":"Argentina","channel":"App","device_id":"Android-App-W7","operation_type":"TRANSFER","name_orig":"usr_01W3F7","old_balance_orig":115000,"new_balance_orig":0,"name_dest":"dest-9999","old_balance_dest":0,"new_balance_dest":0}'

# Transferencia sobre el limite de control -> revisar
curl -X POST http://localhost:3000/api/v1/transactions \
  -H "x-api-key: client_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"transaction_id":"trx-paysim-03","user_id":"usr_01W3F7","timestamp":"2026-08-26T15:10:00Z","amount":250000,"currency":"ARS","category":"Billetera virtual","merchant":"Wallet P2P","country":"Argentina","channel":"App","device_id":"Android-App-W7","operation_type":"TRANSFER","name_orig":"usr_01W3F7","old_balance_orig":300000,"new_balance_orig":50000,"name_dest":"dest-1122","old_balance_dest":20000,"new_balance_dest":270000}'
```

**Ver el detalle de una transaccion:**
```bash
curl http://localhost:3000/api/v1/transactions/trx-demo-04 -H "x-api-key: analyst_dev_key_change_me"
```

**Cambiar umbrales (solo admin) y ver que una nueva transaccion usa la config actualizada:**
```bash
curl -X PUT http://localhost:3000/api/v1/settings/thresholds \
  -H "x-api-key: admin_dev_key_change_me" -H "x-actor-name: Francisco" -H "Content-Type: application/json" \
  -d '{"review_threshold":50,"block_threshold":80}'
```

## Notas de diseno

- El motor de riesgo (`src/risk`) es una heuristica ponderada y determinista (no ML) sobre desvio de monto, pais/categoria/dispositivo no habituales, horario inusual y frecuencia de operaciones, mas las senales opcionales estilo PaySim descriptas arriba — cumple el alcance del MVP (seccion 9: sin entrenamiento automatico ni modelos avanzados).
- Los rangos de nivel de riesgo (bajo/medio/alto/critico) se recalculan a partir de los umbrales configurados, no estan hardcodeados.
- Cada transaccion persiste el snapshot de umbrales vigentes al momento del analisis, para que cambios posteriores de configuracion no alteren resultados historicos.
- Un error inesperado en el calculo de riesgo nunca aprueba silenciosamente: la transaccion queda con `status: "analisis_no_disponible"` y `decision: "revisar"`.
