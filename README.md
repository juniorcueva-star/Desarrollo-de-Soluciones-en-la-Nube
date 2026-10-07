# TechStore

Aplicación web para el caso de estudio del laboratorio 8 de Desarrollo de Soluciones en la Nube. El objetivo es gestionar el inventario de una cadena de tiendas con autenticación de varios factores y permisos según el perfil de cada usuario.

## Alcance del laboratorio

- Registro con correo único, nombre completo, tienda y contraseña segura.
- Inicio de sesión con bloqueo tras cinco intentos fallidos.
- Segundo factor TOTP con códigos de seis dígitos que cambian cada 30 segundos; máximo tres intentos por inicio de sesión.
- Emisión de JWT únicamente después de completar el segundo factor.
- Inicio de sesión con Google y GitHub.
- Cuatro perfiles: administrador, gerente de tienda, empleado de ventas y auditor.
- Gestión de productos, existencias y reportes según los permisos de cada perfil.

## Tecnologías elegidas

- Interfaz: React con Vite.
- API: Node.js con Express.
- Base de datos local: SQLite mediante `node:sqlite` de Node.js 24.
- Control de versiones: Git y GitHub.

El desarrollo comienza en la laptop. La configuración de OAuth y el despliegue en AWS se harán en etapas posteriores, cuando la aplicación local funcione.

Consulta [el plan de trabajo](docs/plan.md) para ver las etapas y sus criterios de avance.

## Ejecutar en esta laptop

Se requiere Node.js 24 o superior y npm. Desde la raíz del repositorio:

```powershell
npm install
npm run dev:api
```

En una segunda terminal, desde la misma carpeta:

```powershell
npm run dev:web
```

Abre la dirección local que muestre Vite, normalmente `http://localhost:5173`. La pantalla indica si la API y SQLite están conectadas. El endpoint de comprobación también se puede abrir en `http://127.0.0.1:3001/api/health`.

La aplicación todavía está en su etapa de preparación. El registro, el inventario y los inicios de sesión se añadirán en los siguientes commits.
