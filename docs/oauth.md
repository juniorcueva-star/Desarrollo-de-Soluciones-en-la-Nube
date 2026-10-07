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

La URL publicada actualmente es `https://98-90-249-127.sslip.io`. Las redirecciones exactas son:

```text
Google: https://98-90-249-127.sslip.io/api/oauth/google/callback
GitHub: https://98-90-249-127.sslip.io/api/oauth/github/callback
```

1. En [GitHub Developer Settings](https://github.com/settings/developers), abre **OAuth Apps > New OAuth App**. Usa `TechStore Lab 8` como nombre, `https://98-90-249-127.sslip.io` como **Homepage URL** y la redirección GitHub anterior como **Authorization callback URL**. Registra la aplicación y genera un **Client secret**.
2. En [Google Auth Platform](https://console.cloud.google.com/auth), crea o selecciona un proyecto. Completa **Branding** y **Audience**; para pruebas, usa audiencia externa en modo de prueba e incluye tu cuenta en **Test users**. En **Clients**, crea un cliente **Web application** con la redirección Google anterior. Anota el Client ID y Client secret. Si Google exige verificar el dominio y rechaza el nombre compartido de `sslip.io`, no declares que eres dueño de `sslip.io`; habrá que usar un subdominio gratuito que puedas controlar y verificar.
3. En el SSH de Lightsail, abre `/home/ubuntu/techstore/.env` con `nano .env` y añade las cuatro líneas siguientes, reemplazando los valores con los que te entregaron los proveedores. Guarda con **Ctrl+O**, **Enter**, **Ctrl+X**. No cambies las claves `JWT_SECRET` ni `MFA_ENCRYPTION_KEY`.

```text
GOOGLE_CLIENT_ID=tu_id_google
GOOGLE_CLIENT_SECRET=tu_secreto_google
GITHUB_CLIENT_ID=tu_id_github
GITHUB_CLIENT_SECRET=tu_secreto_github
```

4. En el mismo SSH, reinicia y comprueba la disponibilidad:

```bash
sudo systemctl restart techstore
curl -fsS https://98-90-249-127.sslip.io/api/oauth/available
```

La respuesta debe indicar `"google":true` y `"github":true`. Después cierra sesión en TechStore y prueba **cada botón** hasta completar el código MFA. Un proveedor que aparezca disponible no queda verificado hasta que finalice su flujo de inicio de sesión.

Documentación oficial: [Google OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server) y [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
