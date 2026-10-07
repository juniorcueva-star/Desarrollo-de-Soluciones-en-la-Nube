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
