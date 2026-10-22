import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { API_PREFIX, Route } from './router';

// Builds the OpenAPI 3 document from the same route table that serves requests, so it cannot drift.
const TAGS: Array<[RegExp, string, string]> = [
  [/^\/(health|openapi\.json)/, 'Sistema', 'Estado del servicio y esta especificación'],
  [/^\/auth/, 'Autenticación', 'Login, sesiones, organización activa y login por QR'],
  [/^\/platform/, 'Plataforma', 'Administración global: organizaciones, modelos, reportes y auditoría (roles de plataforma)'],
  [/^\/(tenant|users|memberships|roles|api-clients)/, 'Organización', 'Organización activa: usuarios, membresías, roles e integraciones M2M'],
  [/^\/transactions/, 'Transacciones', 'Ingesta y scoring, consulta, revisión y expedientes'],
  [/^\/dashboard/, 'Dashboard', 'Métricas y mapa de calor de la organización activa'],
  [/^\/(settings|models)/, 'Configuración', 'Umbrales, historial y modelo de riesgo de la organización'],
  [/^\/alerts/, 'Alertas', 'Alertas automáticas y su seguimiento'],
];
const tagOf = (path: string) => TAGS.find(([pattern]) => pattern.test(path))?.[1] ?? 'Otros';

const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } });

function access(route: Route) {
  if (route.public) return 'Pública.';
  const parts: string[] = [];
  if (route.permissions?.length) parts.push(`Requiere organización activa y permisos: ${route.permissions.map(p => `\`${p}\``).join(', ')}.`);
  if (route.platformRoles?.length) parts.push(`Requiere rol de plataforma: ${route.platformRoles.map(r => `\`${r}\``).join(' o ')}.`);
  if (!parts.length) parts.push('Requiere sesión.');
  return parts.join(' ');
}

// "date or date-time" alternatives overlap, so they are anyOf (accept either), not oneOf (exactly one).
function anyOfForAlternatives<T>(value: T): T {
  if (Array.isArray(value)) return value.map(anyOfForAlternatives) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === 'oneOf' ? 'anyOf' : key, anyOfForAlternatives(item)])) as T;
}

export function buildOpenApi(routes: Route[], version: string) {
  const schemas: Record<string, any> = anyOfForAlternatives(validationMetadatasToSchemas({ refPointerPrefix: '#/components/schemas/' }));
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    const parameters: unknown[] = [...route.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name, in: 'path', required: true,
      schema: route.uuidParams?.includes(name) ? { type: 'string', format: 'uuid' } : { type: 'string' },
    }));
    if (route.query) {
      const schema = schemas[route.query.name];
      for (const [name, property] of Object.entries<any>(schema?.properties ?? {})) {
        parameters.push({ name, in: 'query', required: (schema.required ?? []).includes(name), schema: property });
      }
    }
    for (const param of route.queryParams ?? []) parameters.push({ in: 'query', required: false, schema: { type: 'string', ...(param.enum ? { enum: param.enum } : {}) }, name: param.name, description: param.description });
    const responses: Record<string, unknown> = {
      [route.method === 'POST' ? '201' : '200']: { description: 'OK', content: { 'application/json': { schema: {} } } },
    };
    if (route.body || route.query || route.uuidParams?.length) responses['400'] = errorResponse('Datos inválidos (lista de campos en `fields`)');
    if (!route.public) {
      responses['401'] = errorResponse('Sin sesión, sesión vencida o credencial inválida');
      responses['403'] = errorResponse('Permisos insuficientes');
    }
    if (route.path.includes(':')) responses['404'] = errorResponse('Recurso inexistente en la organización activa');
    if (route.public && route.method === 'POST' && route.path.startsWith('/auth/')) responses['429'] = errorResponse('Demasiados intentos; reintentar en un minuto');
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = {
      tags: [tagOf(route.path)],
      summary: route.summary,
      description: access(route),
      operationId: `${route.method.toLowerCase()}${route.path.replace(/[^A-Za-z0-9]+(\w)?/g, (_, c: string = '') => c.toUpperCase())}`,
      security: route.public ? [] : [{ bearer: [] }, { apiKey: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(route.body ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${route.body.name}` } } } } } : {}),
      responses: { ...responses, ...route.responses },
    };
  }
  // Query DTOs are documented as parameters, not as reusable schemas.
  for (const route of routes) if (route.query) delete schemas[route.query.name];
  return {
    // 3.1 uses JSON Schema 2020-12, which is what class-validator-jsonschema emits (e.g. numeric exclusiveMinimum).
    openapi: '3.1.0',
    info: {
      title: 'FraudLens API',
      version,
      description: [
        'API multi-tenant de FraudLens. Usuarios humanos: `Authorization: Bearer <access_token>` (obtenido en `POST /auth/login`). Integraciones: `x-api-key: <secret>` (creado en `POST /api-clients`).',
        'Las rutas de negocio operan sobre la **organización activa** de la sesión (`POST /auth/tenant`); nunca se acepta un tenant en headers o payloads.',
        'Especificación generada desde el código: no se edita a mano.',
      ].join('\n\n'),
    },
    servers: [{ url: API_PREFIX }],
    tags: TAGS.map(([, name, description]) => ({ name, description })),
    paths,
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'Access token de una sesión humana (15 minutos).' },
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Secreto de una integración M2M; solo permisos acotados.' },
      },
      schemas: {
        ...schemas,
        ErrorResponse: {
          type: 'object',
          required: ['statusCode', 'message', 'timestamp', 'path'],
          properties: {
            statusCode: { type: 'integer', example: 400 },
            message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            error: { type: 'string', example: 'Bad Request' },
            fields: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, errors: { type: 'array', items: { type: 'string' } } } } },
            timestamp: { type: 'string', format: 'date-time' },
            path: { type: 'string', example: '/api/v1/transactions' },
          },
        },
      },
    },
  };
}
