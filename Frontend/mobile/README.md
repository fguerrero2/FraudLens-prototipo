# FraudLens móvil

React Native y Expo SDK 57. Consume la misma API que la web. Incluye login, restauración de sesión, SecureStore, selector de organización, dashboard, paginación, detalle y revisión con evidencia. La administración de usuarios e integraciones se realiza desde la web.

```bash
npm ci
cp .env.example .env
npm start
```

`EXPO_PUBLIC_API_URL` es una URL pública, sin secretos. En un teléfono físico, usar la IP LAN de la computadora en desarrollo. Para publicar apuntar a la API HTTPS.

Verificación de bundle Android: `npm run export`. Esto genera JavaScript/Hermes para Android; no un APK. Para APK interno:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`eas.json` define build interno APK y perfil de producción. Cambiar los identificadores de aplicación de `app.json` antes de publicar en tiendas. EAS Free tiene cuotas; las tiendas requieren cuentas propias. Consultar [guía de despliegue](../../Backend/DEPLOYMENT.md).

Se verificaron los bundles JavaScript/Hermes de Android e iOS. La ejecución en dispositivo y los binarios nativos requieren el entorno correspondiente y no se validaron en esta sesión.
