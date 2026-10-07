# Despliegue de TechStore en AWS Lightsail

Se usará una instancia Ubuntu con Node.js 24, SQLite persistente y Caddy para HTTPS. La interfaz compilada y la API salen del mismo proceso. Necesitas una cuenta AWS activa y un dominio propio para el certificado HTTPS y las redirecciones de Google.

## 1. Antes de crear recursos

En la laptop, desde la carpeta del repositorio, ejecuta:

```powershell
npm ci
npm run test --workspace api
npm run lint
npm run build
git status --short
```

Configura en [AWS Budgets](https://console.aws.amazon.com/cost-management/home#/budgets) un presupuesto mensual y una alerta por correo. Una alerta informa del gasto; no detiene automáticamente los cargos.

Consulta el precio en la consola antes de confirmar la instancia. Como referencia, el plan Linux con IPv4 público de 1 GB aparece a **USD 7/mes** en la [página oficial de precios de Lightsail](https://aws.amazon.com/lightsail/pricing/). Podrían añadirse impuestos, dominio, copias de seguridad u otros consumos. Una instancia detenida sigue generando cargos hasta eliminarla.

Si la cuenta está en el [AWS Free plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), los créditos promocionales disponibles se aplican automáticamente a los servicios elegibles, incluido Lightsail. Consulta el saldo y la fecha de vencimiento en **Billing > Free plan status**: el plan termina al agotarse los créditos o al cumplirse su plazo. Para este laboratorio, crea una sola instancia de 1 GB y usa la base SQLite integrada; evita bases de datos administradas, balanceadores, discos adicionales y snapshots mientras no sean necesarios. El [registro de dominios en Route 53 no está cubierto por los créditos promocionales](https://aws.amazon.com/awscredits/).

## 2. Crear la instancia

1. Abre [Amazon Lightsail](https://lightsail.aws.amazon.com/) y elige **Create instance**.
2. Elige una región, Linux/Unix, Ubuntu 24.04 y un plan con al menos 1 GB de RAM e IPv4 público.
3. Nómbrala `techstore` y revisa el precio antes de crearla.
4. En **Networking**, crea y adjunta una IP estática. Abre los puertos TCP 80 y 443; limita SSH 22 a tu IP si es posible. No abras el puerto 3001 públicamente.
5. En el DNS de tu dominio, crea un registro A que apunte a la IP estática.

Guías oficiales: [crear instancia](https://docs.aws.amazon.com/lightsail/latest/userguide/how-to-create-amazon-lightsail-instance-virtual-private-server-vps.html), [IP estática](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-create-static-ip.html) y [firewall](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html).

## 3. Instalar la aplicación en Ubuntu

Abre el terminal SSH de la instancia en Lightsail. Instala Git, curl y Node.js 24 siguiendo el repositorio de NodeSource:

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
```

Después, descarga y prepara el proyecto:

```bash
cd /home/ubuntu
git clone https://github.com/juniorcueva-star/Desarrollo-de-Soluciones-en-la-Nube.git techstore
cd techstore
npm ci
npm run build
npm run setup
nano .env
```

En `.env`, conserva las dos claves generadas y ajusta `PUBLIC_BASE_URL=https://TU_DOMINIO`. Para el acceso social, añade las credenciales de producción según [la guía OAuth](oauth.md). Guarda `.env` fuera de Git y haz una copia segura: perder `MFA_ENCRYPTION_KEY` impide leer los secretos TOTP existentes.

Activa el servicio de la aplicación:

```bash
sudo cp deploy/techstore.service /etc/systemd/system/techstore.service
sudo systemctl daemon-reload
sudo systemctl enable --now techstore
sudo systemctl status techstore
curl http://127.0.0.1:3001/api/health
```

## 4. Activar HTTPS

Instala Caddy con el [paquete oficial para Ubuntu](https://caddyserver.com/docs/install). Edita `/etc/caddy/Caddyfile` según `deploy/Caddyfile.example`, reemplazando `TU_DOMINIO` por el dominio que apunta a la IP estática. Luego:

```bash
sudo systemctl reload caddy
curl https://TU_DOMINIO/api/health
```

Caddy obtiene el certificado automáticamente cuando el DNS apunta a la instancia y los puertos 80 y 443 están abiertos. Consulta la [guía oficial de proxy y HTTPS](https://caddyserver.com/docs/quick-starts/reverse-proxy).

## 5. Verificar y actualizar

Abre `https://TU_DOMINIO`, registra una cuenta, configura TOTP y prueba un producto. Para convertir esa cuenta en administrador:

```bash
cd /home/ubuntu/techstore
npm run admin:promote --workspace api -- tu_correo@ejemplo.com
sudo systemctl restart techstore
```

Para una actualización posterior, crea primero una copia de seguridad de `api/data/techstore.sqlite` y `.env`. Después:

```bash
cd /home/ubuntu/techstore
git pull --ff-only
npm ci
npm run build
sudo systemctl restart techstore
```

Revisa el estado con `sudo systemctl status techstore` y los registros con `journalctl -u techstore -n 100`. Las copias de seguridad de Lightsail pueden generar cargos adicionales.
