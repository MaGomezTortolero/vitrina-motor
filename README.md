# Vitrina Motor

Demo de catálogo e inventario para concesionarios. El comprador puede buscar vehículos y consultar su ficha. Desde el panel se pueden cargar fotos, elegir una portada, editar precios y especificaciones, y gestionar el estado de cada vehículo.

## Ejecutar en VS Code

Abre la carpeta del proyecto y ejecuta `npm run dev` en la terminal. Luego abre http://127.0.0.1:4173. Se requiere Node.js. El proyecto usa HTML, CSS y JavaScript y funciona sin instalar paquetes.

## Probar la demo

1. Filtra por marca y precio en el catálogo y abre la ficha de un vehículo.
2. En el panel crea un vehículo, añade fotos y elige el estado Disponible.
3. Vuelve al catálogo y abre su ficha. Puedes copiar un enlace o descargar una ficha HTML con sus imágenes.
4. Configura en el panel un número de WhatsApp con indicativo internacional para habilitar el contacto desde las fichas.

Los vehículos iniciales, precios e imágenes son de demostración. El inventario y la configuración se guardan en el navegador. El enlace de ficha comparte una copia de los datos y las fotos de muestra. Usa la ficha descargable para compartir también las fotos que hayas cargado. Para que un enlace funcione en otro dispositivo, la aplicación debe estar alojada en una dirección accesible para el destinatario.

`npm run check` verifica la sintaxis de JavaScript.

## Vitrina Motor Empresas

Requiere Node.js 24 o posterior. En la terminal de VS Code ejecuta:

```powershell
$env:VITRINA_DB = "vitrina.demo.sqlite"
npm run empresas:demo
```

Abre http://127.0.0.1:4174. Las tres cuentas de prueba usan la contraseña `VitrinaDemo2026!`.

| Cuenta | Función |
| --- | --- |
| `admin@demo.test` | Crear empresas y suspender o reactivar sus accesos y catálogos |
| `bogota@demo.test` | Editar inventario y expedientes de Motor Bogotá |
| `andes@demo.test` | Editar inventario y expedientes de Autos Andes |

Cada empresa configura su número de WhatsApp en el panel. Los compradores consultan las fichas en `/c/<empresa>/<vehículo>`. El expediente admite SOAT, técnico-mecánica y soporte de consulta de multas en PDF. RUNT y SIMIT se consultan en sus sitios oficiales y el resultado de SIMIT se registra manualmente. Los registros y archivos quedan en SQLite. La demo original sigue disponible con `npm run dev`.

Para arrancar con datos propios, usa `npm run empresas` con una base nueva y configura `VITRINA_ADMIN_EMAIL` y `VITRINA_ADMIN_PASSWORD` (mínimo 12 caracteres) para el primer inicio. Las credenciales de muestra son solo para la demo local. Un despliegue requiere un volumen persistente para `VITRINA_DB`, copia de seguridad, HTTPS y las variables `VITRINA_ORIGIN` (origen HTTPS exacto), `VITRINA_SECURE_COOKIE=1`, `HOST` y `PORT` según el alojamiento. La portada y los documentos admiten hasta 4 MB por archivo.
