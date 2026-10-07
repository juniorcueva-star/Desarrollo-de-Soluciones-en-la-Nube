# Configurar Google y GitHub

La aplicación usa el flujo OAuth con estado y PKCE. Después del acceso social exige el mismo código TOTP antes de entregar un JWT. Las credenciales van en `.env`, que Git ignora. No las pegues en un issue, commit ni mensaje.

## 1. Desarrollo local

El servidor y la interfaz deben estar encendidos con `npm run dev:api` y `npm run dev:web`.

En [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configura la pantalla de consentimiento y crea un cliente OAuth de tipo **Aplicación web**. Agrega esta URI de redirección exacta:

```text
http://localhost:5173/api/oauth/google/callback
```

Si la aplicación está en modo de prueba, agrega tu correo como usuario de prueba. Guarda el ID y el secreto del cliente.

En [GitHub Developer Settings](https://github.com/settings/developers), crea una **OAuth App** para desarrollo local. Usa:

```text
Homepage URL: http://localhost:5173
Authorization callback URL: http://localhost:5173/api/oauth/github/callback
```

Guarda el ID y genera un secreto para esta aplicación.

Abre el archivo `.env` local y agrega:

```text
PUBLIC_BASE_URL=http://localhost:5173
GOOGLE_CLIENT_ID=tu_id
GOOGLE_CLIENT_SECRET=tu_secreto
GITHUB_CLIENT_ID=tu_id
GITHUB_CLIENT_SECRET=tu_secreto
```

Reinicia la API y comprueba que los botones Google y GitHub estén disponibles. Nunca subas `.env` al repositorio.

## 2. Producción

Cuando conozcas el dominio HTTPS, agrega en Google otra URI exacta:

```text
https://TU_DOMINIO/api/oauth/google/callback
```

Crea otra OAuth App de GitHub para producción con `https://TU_DOMINIO` como página principal y `https://TU_DOMINIO/api/oauth/github/callback` como callback. Coloca sus credenciales en el `.env` del servidor y establece `PUBLIC_BASE_URL=https://TU_DOMINIO`. Reinicia el servicio.

Documentación oficial: [Google OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server) y [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
