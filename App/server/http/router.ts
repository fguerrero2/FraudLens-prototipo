import 'reflect-metadata';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { AccessRule, AuthGuard, GuardRequest } from '../common/guards/auth.guard';
import { Identity, tenantContext } from '../common/context/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, HttpException, NotFoundException } from './errors';
import { Logger } from './logger';

export const API_PREFIX = '/api/v1';
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteContext {
  params: Record<string, string>;
  query: any;
  body: any;
  identity: Identity;
  actor?: string;
}
export interface Route extends AccessRule {
  method: Method;
  path: string;
  // Documentation only (OpenAPI): one-line summary, plain query params without a DTO and extra responses.
  summary: string;
  queryParams?: Array<{ name: string; description?: string; enum?: string[] }>;
  responses?: Record<string, unknown>;
  // DTO classes validated like the global NestJS ValidationPipe (whitelist + transform).
  body?: ClassConstructor<object>;
  query?: ClassConstructor<object>;
  // Path params that must be UUIDs (former ParseUUIDPipe).
  uuidParams?: string[];
  handler(ctx: RouteContext): unknown;
}

const logger = new Logger('HTTP');

function match(route: Route, method: string, path: string) {
  if (route.method !== method) return null;
  const expected = route.path.split('/').filter(Boolean), actual = path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
    else if (expected[i] !== actual[i]) return null;
  }
  return params;
}

// First declared route wins, as in NestJS (e.g. transactions/cases/list before transactions/:id).
function resolveRoute(routes: Route[], method: string, path: string) {
  for (const route of routes) {
    const params = match(route, method, path);
    if (params) return { route, params };
  }
  return undefined;
}

async function validated(dto: ClassConstructor<object>, plain: unknown) {
  const instance = plainToInstance(dto, plain ?? {});
  const errors = await validate(instance, { whitelist: true });
  if (errors.length) throw new BadRequestException({
    message: 'Faltan datos obligatorios o son invalidos',
    fields: errors.map(e => ({ field: e.property, errors: Object.values(e.constraints ?? {}) })),
  });
  return instance;
}

async function readJson(request: Request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new BadRequestException('El cuerpo del pedido no es JSON válido'); }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (process.env.CORS_ORIGIN ?? '').split(',').map(o => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, Accept-Language',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  // Like Express: null/undefined results become an empty body.
  return new Response(body === undefined || body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export function createRouter(routes: Route[], deps: { guard: AuthGuard; prisma: PrismaService }) {
  return async function dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(API_PREFIX.length) || '/';
    const cors = corsHeaders(request);
    const start = Date.now();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const hit = resolveRoute(routes, request.method, path);
      if (!hit) throw new NotFoundException(`Cannot ${request.method} ${url.pathname}`);
      const { route, params } = hit;
      await deps.prisma.init();
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => { headers[key] = value; });
      const req: GuardRequest = { method: request.method, url: url.pathname + url.search, ip: headers['x-forwarded-for']?.split(',')[0].trim() || headers['x-real-ip'], headers };
      await deps.guard.canActivate(route, req);
      for (const name of route.uuidParams ?? []) if (!isUUID(params[name])) throw new BadRequestException('Validation failed (uuid is expected)');
      const ctx: RouteContext = {
        params,
        query: route.query ? await validated(route.query, Object.fromEntries(url.searchParams)) : Object.fromEntries(url.searchParams),
        body: route.body ? await validated(route.body, await readJson(request)) : undefined,
        identity: req.identity!,
        actor: req.actor,
      };
      const identity = req.identity;
      // Business data only runs inside a transaction with the tenant set for PostgreSQL RLS.
      const result = identity?.tenantId
        ? await deps.prisma.identity.$transaction(async db => {
          await db.$queryRaw`SELECT set_config('app.tenant_id', ${identity.tenantId}, true)`;
          return tenantContext.run({ identity, db }, async () => await route.handler(ctx));
        }, { timeout: 15000 })
        : await route.handler(ctx);
      logger.log(`${request.method} ${url.pathname} -> OK (${Date.now() - start}ms)`);
      if (result instanceof Response) {
        Object.entries(cors).forEach(([key, value]) => result.headers.set(key, value));
        return result;
      }
      return json(request.method === 'POST' ? 201 : 200, result, cors);
    } catch (exception) {
      const isHttp = exception instanceof HttpException;
      const status = isHttp ? exception.getStatus() : 500;
      const body = isHttp ? exception.getResponse() : { message: 'Error interno del servidor' };
      logger.warn(`${request.method} ${url.pathname} -> ERROR ${status} (${Date.now() - start}ms)`);
      if (!isHttp) logger.error(`Error no controlado en ${request.method} ${url.pathname}`, (exception as Error)?.stack);
      const payload = typeof body === 'string' ? { message: body } : body;
      return json(status, { statusCode: status, ...payload, timestamp: new Date().toISOString(), path: url.pathname + url.search }, cors);
    }
  };
}
