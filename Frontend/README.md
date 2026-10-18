# FraudLens web y móvil

Web React/Vite con login, selector de organización, transacciones, revisiones, expedientes, umbrales y administración. Consume la API multi-tenant de `../Backend` con sesiones humanas; no incluye claves API en el bundle. Proyecto React Native/Expo independiente en [mobile](mobile/README.md).

```bash
npm ci
cp .env.example .env
npm run dev
```

Configurar solo `VITE_API_URL` con la URL del backend. El servidor debe incluir el origen de la web en `CORS_ORIGIN`. Para generar el sitio estático: `npm run build`; salida `dist`.

El login mantiene access/refresh tokens en memoria, renueva el acceso con rotación y revoca la sesión al salir. Al recargar se pide login nuevamente. El backend decide permisos y tenant; los botones se adaptan a los permisos para evitar acciones no disponibles. Al cambiar organización se desmonta la vista y se carga el nuevo contexto.

El mapa usa Leaflet y celdas agregadas de `/dashboard/heatmap`. Las coordenadas se incorporan al crear transacciones; el navegador no necesita descargar todas las operaciones. El fondo cartográfico utiliza OpenStreetMap y muestra su atribución.

Publicación en Vercel: raíz `Frontend`, comando `npm run build`, carpeta `dist`, `VITE_API_URL=https://<api>.onrender.com/api/v1`. No agregar secretos a variables `VITE_*`. `vercel.json` configura el fallback de la SPA. Guía completa: [DEPLOYMENT.md](../Backend/DEPLOYMENT.md).

El botón **Cambiar idioma** del login aplica el idioma a toda la interfaz y conserva la selección en el dispositivo: `en-US` para Inglés (Estados Unidos) y `es-419` para Español (Latinoamérica). `es-US` corresponde a español de Estados Unidos, por lo que no se utiliza para inglés. La web usa localStorage y la app usa SecureStore; la preferencia es independiente en cada dispositivo. El idioma predeterminado es español latinoamericano. Los catálogos compartidos están en `mobile/shared`; no se traducen nombres, identificadores ni comentarios ingresados por usuarios. Las peticiones incluyen `Accept-Language`. Verificación del módulo compartido: `node --test test/i18n.test.mjs`.
