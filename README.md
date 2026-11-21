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
