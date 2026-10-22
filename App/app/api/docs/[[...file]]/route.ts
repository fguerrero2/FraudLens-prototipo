import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Swagger UI at /api/docs (same URL the NestJS version used), served from swagger-ui-dist without a CDN.
export const runtime = 'nodejs';

const ASSETS: Record<string, string> = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'favicon-32x32.png': 'image/png',
};

const PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FraudLens API · Documentación</title>
  <link rel="icon" type="image/png" href="/api/docs/favicon-32x32.png" />
  <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui', deepLinking: true, docExpansion: 'none', tagsSorter: 'alpha', tryItOutEnabled: false });
  </script>
</body>
</html>`;

export async function GET(_request: Request, { params }: { params: Promise<{ file?: string[] }> }) {
  const { file } = await params;
  if (!file?.length) return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const name = file.join('/');
  const type = ASSETS[name];
  if (!type) return new Response('Not found', { status: 404 });
  // Files are included in the Vercel function through outputFileTracingIncludes (next.config.mjs).
  const body = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', 'swagger-ui-dist', name));
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
}
