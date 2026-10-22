/** @type {import('next').NextConfig} */
const nextConfig = {
  // Loaded from node_modules at runtime instead of being bundled into the API function.
  serverExternalPackages: ['@prisma/client', 'exceljs'],
  // Anomaly model artifacts are read from disk by the API (ML_ARTIFACT_ROOT=./models).
  // Swagger UI assets are read from node_modules by /api/docs.
  outputFileTracingIncludes: {
    '/api/v1/[...path]': ['./models/**/*'],
    '/api/docs/[[...file]]': ['./node_modules/swagger-ui-dist/swagger-ui.css', './node_modules/swagger-ui-dist/swagger-ui-bundle.js', './node_modules/swagger-ui-dist/favicon-32x32.png'],
  },
  poweredByHeader: false,
  // Keep server class names: OpenAPI schema names come from the DTO class names (LoginDto, not "L").
  experimental: { serverMinification: false },
};

export default nextConfig;
