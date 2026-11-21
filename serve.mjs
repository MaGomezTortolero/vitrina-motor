import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const files = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
  ...['hero.webp', 'car-0.webp', 'car-1.webp', 'car-2.webp', 'car-3.webp']
    .map(name => [name, 'image/webp'])
])

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  const name = path === '/' ? 'index.html' : path.slice(1)
  if (!files.has(name)) {
    response.writeHead(404).end('Archivo no encontrado')
    return
  }
  try {
    const data = await readFile(new URL(name, import.meta.url))
    response.writeHead(200, { 'Content-Type': files.get(name) }).end(data)
  } catch {
    response.writeHead(500).end('No se pudo leer el archivo')
  }
}).listen(4173, '127.0.0.1', () => {
  console.log('Vitrina Motor — http://127.0.0.1:4173')
})
