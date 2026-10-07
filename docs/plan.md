# Plan de trabajo de TechStore

Cada etapa se guardará en un commit verificable. No se guardarán contraseñas, tokens, secretos OAuth ni archivos de base de datos en Git.

## 1. Preparación

- Conectar la carpeta local con el repositorio de GitHub.
- Comprobar Git, Node.js, npm y VS Code.
- Crear la estructura de interfaz y API y comprobar que ambas arrancan.

## 2. Cuentas y autenticación local

- Definir tiendas, usuarios y roles en la base de datos.
- Registrar usuarios con correo único y validar la contraseña requerida por el laboratorio.
- Guardar contraseñas con una función de hash apropiada.
- Bloquear temporalmente el inicio de sesión después de cinco fallos.
- Configurar TOTP y verificar hasta tres intentos de código por inicio de sesión.
- Entregar el JWT solo después de superar TOTP.

El registro público no podrá asignar permisos de administrador ni gerente. La asignación de roles y tiendas quedará bajo control del administrador.

## 3. Inventario y permisos

- Crear, consultar y actualizar productos y existencias.
- Aplicar los permisos de los cuatro perfiles en la API, incluyendo el límite por tienda.
- Añadir reportes de solo lectura y comprobar que el auditor no modifica datos.

## 4. Acceso con Google y GitHub

- Registrar las aplicaciones OAuth externas y configurar sus credenciales fuera del repositorio.
- Vincular identidades externas con usuarios y aplicar el segundo factor y los mismos permisos.

## 5. Publicación y entrega

- Preparar configuración de producción, despliegue en AWS y documentación de uso.
- Verificar los flujos de seguridad y redactar las conclusiones del laboratorio con resultados reales.
