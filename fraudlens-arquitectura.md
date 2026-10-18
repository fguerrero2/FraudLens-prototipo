# FraudLens — Arquitectura sugerida y estructura de datos

## 1. Objetivo

FraudLens se plantea como una plataforma SaaS B2B multi-tenant para detección y análisis de fraude en transacciones.

La arquitectura debe permitir:

- Un backend central expuesto mediante API.
- Un frontend web.
- Una aplicación móvil.
- Integraciones externas mediante API.
- Separación de datos por empresa o tenant.
- Usuarios con acceso a uno o varios tenants.
- Administración global de la plataforma.
- Administración independiente por tenant.
- Roles y permisos.
- Registro y consulta de transacciones.
- Configuración de parámetros antifraude.
- Dashboards y mapas de calor.
- Auditoría de acciones.
- Ejecución de modelos de Machine Learning para scoring de fraude.

---

## 2. Arquitectura recomendada

Para el MVP se recomienda una arquitectura de tipo **modular monolith multi-tenant**, evitando inicialmente una arquitectura de microservicios.

Esto permite mantener una separación clara entre dominios sin agregar complejidad innecesaria de despliegue, comunicación distribuida, observabilidad y consistencia.

### 2.1 Vista general

```text
                         ┌─────────────────────┐
                         │      CLIENTES       │
                         └──────────┬──────────┘
                                    │
        ┌───────────────────────────┼────────────────────────┐
        │                           │                        │
        ▼                           ▼                        ▼
   Frontend Web                App Mobile              Sistemas externos
   Next.js / React          React Native / Expo          Banco / Fintech
        │                           │                        │
        └───────────────────────────┼────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │   FraudLens API  │
                          │    FastAPI       │
                          └────────┬─────────┘
                                   │
                    Authentication / Authorization
                                   │
                               Tenant Context
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │               │           │            │              │
       ▼               ▼           ▼            ▼              ▼
    Tenant           Users     Transactions   Dashboard       Audit
    Module            RBAC        Module       Module         Module
                                  │
                                  ▼
                            Fraud Engine
                                  │
                       Feature Engineering
                                  │
                                  ▼
                              ML Model
                                  │
                                  ▼
                         Risk Score + Explain
                                   │
       ┌───────────────────────────┼──────────────────────────┐
       │                           │                          │
       ▼                           ▼                          ▼
  PostgreSQL                    Redis                  Object Storage
 Multi-tenant + RLS                                     ML Models
```

---

## 3. Principios de diseño

### 3.1 API única

Todos los clientes deben consumir la misma API:

- Frontend web.
- Aplicación móvil.
- Panel de administración.
- Panel de tenant.
- Integraciones externas.

Ejemplo:

```text
Web
Mobile
Admin Panel
External Systems
        │
        ▼
api.fraudlens.com
```

La lógica de autorización nunca debe residir únicamente en los frontends.

---

### 3.2 Multi-tenancy

Cada empresa que utiliza FraudLens se representa mediante un `tenant`.

Ejemplo:

```text
Tenant A
├── Users
├── Transactions
├── Settings
├── API Clients
├── Dashboards
├── Alerts
└── Audit Logs

Tenant B
├── Users
├── Transactions
├── Settings
├── API Clients
├── Dashboards
├── Alerts
└── Audit Logs
```

Todo recurso empresarial debe estar asociado a un `tenant_id`.

---

### 3.3 Aislamiento de datos

Se recomienda utilizar dos niveles de protección:

```text
Request
   │
   ▼
Backend Authorization
tenant_id + permission
   │
   ▼
Query scoped by tenant
   │
   ▼
PostgreSQL Row-Level Security
```

La separación de datos no debe depender únicamente de filtros implementados por el backend.

PostgreSQL debe reforzar el aislamiento mediante **Row-Level Security (RLS)**.

---

## 4. Modelo de identidad y acceso

### 4.1 Usuarios

Un usuario no debe pertenecer obligatoriamente a un único tenant.

Por lo tanto, no se recomienda almacenar `tenant_id` directamente en la tabla `users`.

```text
users
-----
id
email
name
status
```

La relación se realiza mediante memberships:

```text
tenant_memberships
------------------
id
tenant_id
user_id
role_id
status
```

Esto permite:

```text
Usuario A
├── Tenant 1 → TENANT_ADMIN
├── Tenant 2 → ANALYST
└── Tenant 3 → VIEWER
```

---

## 5. Niveles de administración

### 5.1 Administración global

Roles de plataforma:

```text
SUPER_ADMIN
PLATFORM_SUPPORT
```

Un `SUPER_ADMIN` puede:

- Crear tenants.
- Editar tenants.
- Suspender tenants.
- Crear el primer administrador de cada tenant.
- Consultar actividad global.
- Consultar auditoría global.
- Gestionar configuración general de FraudLens.
- Gestionar modelos disponibles.

---

### 5.2 Administración por tenant

Roles sugeridos:

```text
TENANT_ADMIN
FRAUD_ANALYST
OPERATOR
VIEWER
API_MANAGER
```

Ejemplo conceptual:

```text
Platform
│
├── SUPER_ADMIN
│
└── Tenants
    │
    ├── Tenant A
    │   ├── TENANT_ADMIN
    │   ├── FRAUD_ANALYST
    │   └── VIEWER
    │
    └── Tenant B
        ├── TENANT_ADMIN
        └── OPERATOR
```

---

## 6. Roles y permisos

No se recomienda controlar acceso únicamente mediante roles.

Se recomienda implementar:

```text
User
  │
  ▼
Tenant Membership
  │
  ▼
Role
  │
  ▼
Permissions
```

### 6.1 Ejemplos de permisos

```text
tenant.read
tenant.update

users.read
users.create
users.update
users.disable

roles.read
roles.create
roles.update

transactions.read
transactions.create
transactions.review

dashboard.read

settings.read
settings.update

api_clients.read
api_clients.create
api_clients.revoke

alerts.read
alerts.update

audit.read
```

### 6.2 Ejemplo de roles

#### TENANT_ADMIN

```text
tenant.read
tenant.update
users.read
users.create
users.update
users.disable
roles.read
roles.create
roles.update
transactions.read
transactions.create
dashboard.read
settings.read
settings.update
api_clients.read
api_clients.create
api_clients.revoke
audit.read
```

#### FRAUD_ANALYST

```text
transactions.read
transactions.review
dashboard.read
alerts.read
alerts.update
```

#### VIEWER

```text
transactions.read
dashboard.read
```

El backend debe comprobar permisos de forma centralizada, por ejemplo:

```python
require_permission("transactions.read")
```

---

## 7. Contexto de tenant

Después del login, el sistema debe determinar el tenant activo.

Si el usuario tiene acceso a uno solo:

```text
Login
  │
  ▼
Tenant activo
```

Si tiene acceso a varios:

```text
Login
  │
  ▼
Seleccionar organización
  │
  ├── Tenant A
  ├── Tenant B
  └── Tenant C
```

El token o sesión puede incluir el contexto actual:

```json
{
  "sub": "user-123",
  "tenant_id": "tenant-42",
  "roles": ["FRAUD_ANALYST"],
  "permissions": [
    "transactions.read",
    "transactions.review",
    "dashboard.read"
  ]
}
```

El backend no debe confiar en un `tenant_id` arbitrario enviado por el frontend.

Debe verificar:

```text
Authenticated User
      │
      ▼
Tenant Membership
      │
      ▼
Role
      │
      ▼
Permission
      │
      ▼
Resource Access
```

---

# 8. Módulos del backend

Para el MVP se recomienda un backend modular:

```text
backend/
│
├── auth/
├── tenants/
├── users/
├── roles/
├── permissions/
├── transactions/
├── fraud/
├── ml/
├── dashboard/
├── alerts/
├── api_clients/
├── settings/
└── audit/
```

### 8.1 Auth

Responsabilidades:

- Login.
- Logout.
- Refresh tokens.
- Validación de sesiones.
- Identificación del usuario.
- Contexto de tenant.

### 8.2 Tenants

Responsabilidades:

- Crear empresa.
- Editar empresa.
- Suspender empresa.
- Consultar configuración.
- Gestionar límites o plan.

### 8.3 Users

Responsabilidades:

- Crear usuarios.
- Desactivar usuarios.
- Gestionar memberships.
- Gestionar roles.

### 8.4 Transactions

Responsabilidades:

- Registrar transacciones.
- Consultar transacciones.
- Filtrar por fecha, riesgo, comercio, usuario o estado.
- Revisar operaciones sospechosas.

### 8.5 Fraud

Responsabilidades:

- Construir features.
- Ejecutar scoring.
- Aplicar umbrales.
- Generar recomendación.
- Generar explicación.

### 8.6 Dashboard

Responsabilidades:

- Resumen de actividad.
- KPIs.
- Distribución de riesgo.
- Fraude por categoría.
- Fraude por horario.
- Fraude por ubicación.
- Mapa de calor.
- Tendencias temporales.

### 8.7 Audit

Responsabilidades:

- Registrar eventos críticos.
- Mantener trazabilidad.
- Permitir investigación posterior.

---

# 9. Modelo de datos propuesto

## 9.1 Tenants

```text
tenants
-------
id                  UUID PK
name                VARCHAR
slug                VARCHAR UNIQUE
status              VARCHAR
plan                VARCHAR NULL
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

---

## 9.2 Users

```text
users
-----
id                  UUID PK
email               VARCHAR UNIQUE
name                VARCHAR
password_hash       VARCHAR NULL
external_auth_id    VARCHAR NULL
status              VARCHAR
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

`password_hash` puede omitirse si se utiliza un proveedor externo de identidad.

---

## 9.3 Tenant Memberships

```text
tenant_memberships
------------------
id                  UUID PK
tenant_id           UUID FK -> tenants.id
user_id             UUID FK -> users.id
role_id             UUID FK -> roles.id
status              VARCHAR
created_at          TIMESTAMP
updated_at          TIMESTAMP

UNIQUE (tenant_id, user_id)
```

---

## 9.4 Platform Roles

Para roles globales puede utilizarse una relación independiente:

```text
platform_user_roles
-------------------
id                  UUID PK
user_id             UUID FK -> users.id
role                VARCHAR
created_at          TIMESTAMP
```

Ejemplos:

```text
SUPER_ADMIN
PLATFORM_SUPPORT
```

---

## 9.5 Roles

```text
roles
-----
id                  UUID PK
tenant_id           UUID NULL FK -> tenants.id
name                VARCHAR
type                VARCHAR
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

Si `tenant_id` es `NULL`, el rol puede considerarse de sistema.

---

## 9.6 Permissions

```text
permissions
-----------
id                  UUID PK
code                VARCHAR UNIQUE
description         VARCHAR
```

---

## 9.7 Role Permissions

```text
role_permissions
----------------
role_id             UUID FK -> roles.id
permission_id       UUID FK -> permissions.id

PRIMARY KEY (role_id, permission_id)
```

---

# 10. Transacciones

```text
transactions
------------
id                      UUID PK
tenant_id               UUID FK -> tenants.id
external_id             VARCHAR
customer_reference      VARCHAR NULL

amount                   DECIMAL
currency                 VARCHAR(3)

merchant_id              VARCHAR NULL
merchant_name            VARCHAR NULL
merchant_category        VARCHAR NULL

latitude                 DECIMAL NULL
longitude                DECIMAL NULL

transaction_timestamp    TIMESTAMP

fraud_probability        DECIMAL NULL
risk_level               VARCHAR NULL
recommended_action       VARCHAR NULL

review_status             VARCHAR NULL
reviewed_by               UUID NULL FK -> users.id
reviewed_at               TIMESTAMP NULL

model_version             VARCHAR NULL

created_at                TIMESTAMP
updated_at                TIMESTAMP

UNIQUE (tenant_id, external_id)
```

Estados posibles:

```text
risk_level:
LOW
MEDIUM
HIGH
CRITICAL

recommended_action:
APPROVE
REVIEW
BLOCK

review_status:
PENDING
APPROVED
CONFIRMED_FRAUD
FALSE_POSITIVE
```

---

# 11. Parámetros por tenant

```text
tenant_settings
---------------
id                      UUID PK
tenant_id               UUID FK -> tenants.id

review_threshold        DECIMAL
block_threshold         DECIMAL

default_currency        VARCHAR(3)
timezone                VARCHAR

model_id                UUID NULL
configuration           JSONB

created_at              TIMESTAMP
updated_at              TIMESTAMP
```

Ejemplo:

```text
review_threshold = 0.60
block_threshold  = 0.85
```

Estos valores deben considerarse parámetros de negocio configurables.

---

# 12. Clientes API

Las integraciones externas deben utilizar credenciales independientes de los usuarios humanos.

```text
api_clients
-----------
id                  UUID PK
tenant_id           UUID FK -> tenants.id
name                VARCHAR
client_id           VARCHAR UNIQUE
secret_hash         VARCHAR
status              VARCHAR
last_used_at        TIMESTAMP NULL
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

Nunca se debe persistir el secreto en texto plano.

Opcionalmente:

```text
api_client_permissions
----------------------
api_client_id
permission_id
```

---

# 13. Auditoría

```text
audit_logs
----------
id                  UUID PK
tenant_id           UUID NULL FK -> tenants.id
actor_user_id       UUID NULL FK -> users.id
api_client_id       UUID NULL FK -> api_clients.id

action              VARCHAR
entity_type         VARCHAR
entity_id           UUID NULL

metadata            JSONB
ip_address          VARCHAR NULL
user_agent          VARCHAR NULL

created_at          TIMESTAMP
```

Ejemplos de eventos:

```text
TENANT_CREATED
TENANT_UPDATED
USER_CREATED
USER_DISABLED
ROLE_CHANGED
PERMISSION_CHANGED
API_KEY_CREATED
API_KEY_REVOKED
THRESHOLD_CHANGED
TRANSACTION_CREATED
TRANSACTION_REVIEWED
TRANSACTION_MARKED_FRAUD
MODEL_CHANGED
LOGIN_SUCCESS
LOGIN_FAILED
```

---

# 14. Alertas

```text
alerts
------
id                  UUID PK
tenant_id           UUID FK -> tenants.id
transaction_id      UUID FK -> transactions.id
type                VARCHAR
severity            VARCHAR
status              VARCHAR
assigned_to         UUID NULL FK -> users.id
created_at          TIMESTAMP
resolved_at         TIMESTAMP NULL
```

---

# 15. Modelos de Machine Learning

```text
ml_models
---------
id                  UUID PK
name                VARCHAR
version             VARCHAR
status              VARCHAR
model_type          VARCHAR
artifact_path       VARCHAR
metrics             JSONB
created_at          TIMESTAMP
```

Para permitir modelos específicos por tenant:

```text
tenant_models
-------------
id                  UUID PK
tenant_id           UUID FK -> tenants.id
model_id            UUID FK -> ml_models.id
enabled             BOOLEAN
configuration       JSONB
created_at          TIMESTAMP
```

---

# 16. Explicaciones del modelo

Opcionalmente se pueden persistir las explicaciones:

```text
transaction_explanations
------------------------
id                  UUID PK
tenant_id           UUID FK -> tenants.id
transaction_id      UUID FK -> transactions.id
model_id            UUID FK -> ml_models.id
method              VARCHAR
explanation          JSONB
created_at          TIMESTAMP
```

Ejemplo:

```json
{
  "method": "SHAP",
  "features": [
    {
      "name": "amount_deviation",
      "contribution": 0.24
    },
    {
      "name": "location_mismatch",
      "contribution": 0.18
    }
  ]
}
```

---

# 17. Dashboard

El dashboard no necesariamente necesita una tabla propia para cada indicador.

Puede calcular datos agregados mediante queries, vistas materializadas o cache.

Ejemplos:

```text
Total de transacciones
Fraudes detectados
Transacciones en revisión
Monto total procesado
Monto sospechoso
Precision del modelo
Recall
Riesgo promedio
Fraude por categoría
Fraude por ubicación
Fraude por hora
Fraude por comercio
```

Para mayor escala pueden agregarse tablas resumen:

```text
dashboard_daily_metrics
-----------------------
id
tenant_id
date
transaction_count
fraud_count
review_count
total_amount
fraud_amount
avg_risk_score
created_at
```

---

# 18. Mapa de calor

El frontend no debe descargar todas las transacciones para generar el mapa.

Se recomienda exponer un endpoint agregado:

```http
GET /api/v1/dashboard/heatmap
```

Respuesta conceptual:

```json
[
  {
    "lat": -34.6037,
    "lon": -58.3816,
    "transactions": 840,
    "frauds": 31,
    "risk": 0.82
  }
]
```

El backend debe realizar la agregación.

---

# 19. API de transacciones

## Registrar una transacción

```http
POST /api/v1/transactions
```

Ejemplo:

```json
{
  "external_id": "TX-123456",
  "customer_reference": "customer-382",
  "amount": 50000,
  "currency": "ARS",
  "merchant_name": "Comercio XYZ",
  "merchant_category": "electronics",
  "latitude": -34.6037,
  "longitude": -58.3816,
  "transaction_timestamp": "2026-10-07T18:30:00-03:00"
}
```

Respuesta:

```json
{
  "transaction_id": "uuid",
  "fraud_probability": 0.87,
  "risk_level": "HIGH",
  "recommended_action": "REVIEW",
  "model_version": "fraudlens-v1"
}
```

---

# 20. Flujo de scoring

```text
Sistema cliente
      │
      ▼
POST /transactions
      │
      ▼
Autenticación API Client
      │
      ▼
Identificación de tenant
      │
      ▼
Validación payload
      │
      ▼
Feature Engineering
      │
      ▼
Modelo ML
      │
      ▼
Fraud Probability
      │
      ▼
Tenant Thresholds
      │
      ▼
Recommended Action
      │
      ▼
Persistencia
      │
      ▼
Respuesta API
```

---

# 21. Separación entre score y decisión

El modelo debe producir un score.

Ejemplo:

```text
fraud_probability = 0.87
```

La política del tenant determina la acción:

```text
0.00 ───────── 0.60 ───────── 0.85 ───────── 1.00
 APPROVE          REVIEW             BLOCK
```

Esto permite modificar la política sin reentrenar el modelo.

---

# 22. Row-Level Security

Ejemplo conceptual:

```sql
ALTER TABLE transactions
ENABLE ROW LEVEL SECURITY;
```

Política:

```sql
CREATE POLICY tenant_isolation
ON transactions
USING (
    tenant_id = current_setting('app.tenant_id')::uuid
);
```

El mismo patrón debe aplicarse a las tablas sensibles asociadas al tenant.

Ejemplos:

```text
transactions
tenant_settings
api_clients
alerts
audit_logs
transaction_explanations
dashboard_daily_metrics
tenant_models
```

---

# 23. Índices recomendados

Algunos índices iniciales:

```sql
CREATE INDEX idx_transactions_tenant
ON transactions (tenant_id);

CREATE INDEX idx_transactions_tenant_timestamp
ON transactions (tenant_id, transaction_timestamp DESC);

CREATE INDEX idx_transactions_tenant_risk
ON transactions (tenant_id, risk_level);

CREATE INDEX idx_transactions_tenant_review
ON transactions (tenant_id, review_status);

CREATE INDEX idx_memberships_user
ON tenant_memberships (user_id);

CREATE INDEX idx_memberships_tenant
ON tenant_memberships (tenant_id);

CREATE INDEX idx_audit_tenant_created
ON audit_logs (tenant_id, created_at DESC);
```

---

# 24. Stack tecnológico sugerido

| Componente | Tecnología sugerida |
|---|---|
| Frontend web | React + Next.js |
| Mobile | React Native + Expo |
| Backend | Python + FastAPI |
| ML | scikit-learn / XGBoost / SHAP |
| Base de datos | PostgreSQL |
| Cache | Redis |
| Auth | Keycloak, Auth0 o implementación propia para MVP |
| Documentación API | OpenAPI / Swagger |
| Mapas | MapLibre / Leaflet |
| Containers | Docker |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions |
| Model storage | S3 compatible / Object Storage |

---

# 25. Estructura sugerida de repositorios

Una alternativa simple es:

```text
fraudlens/
│
├── backend/
│
├── frontend-web/
│
├── mobile/
│
├── ml/
│
├── infrastructure/
│
├── docs/
│
└── docker-compose.yml
```

Otra opción es separar proyectos:

```text
fraudlens-backend
fraudlens-web
fraudlens-mobile
fraudlens-ml
fraudlens-docs
```

Para un TIF, un monorepo puede simplificar integración y despliegue.

---

# 26. Evolución futura

## Fase 1 — MVP

```text
Web + Mobile
      │
      ▼
Modular Backend API
      │
      ├── PostgreSQL
      ├── Redis
      └── ML Model
```

## Fase 2

```text
             API Gateway
                  │
      ┌───────────┼───────────┐
      │           │           │
   Core API     ML API     Analytics
      │           │           │
 PostgreSQL     Models      Warehouse
```

## Fase 3

Si el volumen lo requiere:

```text
                   API Gateway
                        │
          ┌─────────────┼─────────────┐
          │             │             │
      Identity     Transactions      Admin
          │             │             │
          └─────────────┼─────────────┘
                        │
                   Event Bus
                 Kafka / Queue
                        │
        ┌───────────────┼───────────────┐
        │               │               │
      Fraud           Alerts         Analytics
      Engine                         Pipeline
```

---

# 27. Decisiones arquitectónicas principales

1. FraudLens será una plataforma SaaS multi-tenant.
2. Todos los recursos empresariales deberán estar asociados a un `tenant`.
3. Un usuario podrá pertenecer a múltiples tenants.
4. La autorización se evaluará por combinación de:
   - identidad;
   - tenant;
   - rol;
   - permiso.
5. Los administradores globales se gestionarán de forma independiente a los roles de tenant.
6. El backend será la única fuente de verdad para autorización.
7. PostgreSQL reforzará el aislamiento mediante Row-Level Security.
8. Las integraciones externas utilizarán credenciales M2M independientes de los usuarios humanos.
9. El MVP utilizará un modular monolith.
10. El score del modelo estará separado de la decisión de negocio.
11. Toda operación sensible quedará registrada en auditoría.
12. El dashboard consumirá datos agregados del backend.
13. El mapa de calor no cargará transacciones crudas de forma masiva.
14. La arquitectura deberá permitir evolucionar posteriormente hacia servicios independientes sin exigirlo desde el MVP.

---

# 28. Diagrama conceptual de relaciones

```text
users
  │
  │
  ├──────── platform_user_roles
  │
  ▼
tenant_memberships
  │
  ├──────── roles ─────── role_permissions ───── permissions
  │
  ▼
tenants
  │
  ├──────── tenant_settings
  ├──────── api_clients
  ├──────── transactions
  │             │
  │             ├──────── alerts
  │             └──────── transaction_explanations
  │
  ├──────── tenant_models ─────── ml_models
  ├──────── dashboard_daily_metrics
  └──────── audit_logs
```

---

# 29. Regla principal de seguridad

> Todo recurso empresarial de FraudLens debe estar asociado a un tenant, y toda autorización debe evaluarse conjuntamente sobre identidad, tenant y permiso.

El aislamiento entre tenants no debe depender del frontend ni únicamente de filtros de aplicación, sino que debe reforzarse también en la base de datos.
