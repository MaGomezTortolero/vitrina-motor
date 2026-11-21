import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const demo = process.argv.includes('--demo')
const host = process.env.HOST || '127.0.0.1'
if (demo && host !== '127.0.0.1') throw Error('La demo solo escucha en 127.0.0.1.')
const db = new DatabaseSync(process.env.VITRINA_DB || (demo ? 'vitrina.demo.sqlite' : 'vitrina.sqlite'))
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS companies (
    slug TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY, password TEXT NOT NULL, company TEXT REFERENCES companies(slug)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email), expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY, company TEXT NOT NULL REFERENCES companies(slug),
    title TEXT NOT NULL, price INTEGER NOT NULL, status TEXT NOT NULL, year INTEGER NOT NULL,
    km INTEGER NOT NULL, description TEXT NOT NULL, plate TEXT NOT NULL, owners INTEGER,
    soat TEXT NOT NULL, rtm TEXT NOT NULL, checked TEXT NOT NULL, fines TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY, vehicle INTEGER NOT NULL REFERENCES vehicles(id), kind TEXT NOT NULL,
    mime TEXT NOT NULL, body BLOB NOT NULL, UNIQUE(vehicle, kind)
  );
`)
const query = (sql, ...args) => db.prepare(sql).get(...args)
const rows = (sql, ...args) => db.prepare(sql).all(...args)
const run = (sql, ...args) => db.prepare(sql).run(...args)
const hash = (password, salt = randomBytes(16).toString('hex')) =>
  salt + ':' + scryptSync(password, salt, 64).toString('hex')
const digest = token => createHash('sha256').update(token).digest('hex')
const columns = new Set(rows('PRAGMA table_info(vehicles)').map(column => column.name))
for (const [name, definition] of Object.entries({
  brand:"TEXT NOT NULL DEFAULT ''", model:"TEXT NOT NULL DEFAULT ''",
  transmission:"TEXT NOT NULL DEFAULT ''", fuel:"TEXT NOT NULL DEFAULT ''",
  finance:'INTEGER NOT NULL DEFAULT 0', trade:'INTEGER NOT NULL DEFAULT 0',
  cover:'INTEGER NOT NULL DEFAULT 1'
})) {
  if (!columns.has(name)) db.exec(`ALTER TABLE vehicles ADD COLUMN ${name} ${definition}`)
}
const photoKinds = ['foto','foto-2','foto-3','foto-4','foto-5']
const transmissions = ['','Automática','Manual']
const fuels = ['','Gasolina','Diésel','Híbrido','Eléctrico']
const brandOf = v => v.brand || v.title.trim().split(/\s+/)[0]
const tags = v => `<span class="tag ${v.status === 'Reservado' ? 'reserved' : ''}">${esc(v.status)}</span>` +
  (v.finance ? '<span class="tag">Financiación</span>' : '') +
  (v.trade ? '<span class="tag">Retoma</span>' : '')
const specs = v => [v.year,v.km.toLocaleString('es-CO')+' km',esc(v.transmission),esc(v.fuel)].filter(Boolean).join(' · ')
if (demo) {
  for (const [slug, name] of [['bogota', 'Motor Bogotá'], ['andes', 'Autos Andes']]) {
    run('INSERT OR IGNORE INTO companies(slug,name,phone) VALUES(?,?,?)', slug, name, '')
    run('INSERT OR IGNORE INTO users VALUES(?,?,?)', slug + '@demo.test', hash('VitrinaDemo2026!'), slug)
    if (!query('SELECT id FROM vehicles WHERE company=?', slug)) {
      const {lastInsertRowid} = run(`INSERT INTO vehicles(company,title,price,status,year,km,description,plate,owners,soat,rtm,checked,fines)
        VALUES(?,?,?,'Disponible',2024,24000,'Vehículo ficticio de demostración','',NULL,'','','','')`,
        slug, slug === 'bogota' ? 'Toyota Corolla Cross' : 'Mazda 3 Grand Touring', 98500000)
      const image = slug === 'bogota' ? 'car-0.webp' : 'car-1.webp'
      run("INSERT INTO files(vehicle,kind,mime,body) VALUES(?,'foto','image/webp',?)",
        lastInsertRowid, readFileSync(new URL(image,import.meta.url)))
    }
  }
}
if (demo) {
  transaction(() => {
    const created = run('INSERT OR IGNORE INTO companies(slug,name,phone) VALUES(?,?,?)','moviblind','MoviBlind','')
    if (!created.changes) return
    run('INSERT INTO users VALUES(?,?,?)','moviblind@demo.test',hash('VitrinaDemo2026!'),'moviblind')
    const inventory = [
      ['Toyota','RAV4',2024,18400,139900000,'Híbrido','Disponible',1,1,0],
      ['Honda','Civic',2023,26500,89900000,'Gasolina','Disponible',1,0,1],
      ['Mazda','CX-5',2024,21600,119900000,'Gasolina','Disponible',1,1,2],
      ['Ford','F-150',2023,38000,186500000,'Gasolina','Reservado',0,1,3],
    ]
    for (const [brand,model,year,km,price,fuel,status,finance,trade,imageIndex] of inventory) {
      const {lastInsertRowid} = run(`INSERT INTO vehicles
        (company,title,price,status,year,km,description,plate,owners,soat,rtm,checked,fines,brand,model,transmission,fuel,finance,trade)
        VALUES('moviblind',?,?,?,?,?,?,'',NULL,'','','','',?,?,'Automática',?,?,?)`,
        brand+' '+model,price,status,year,km,'Ejemplo de catálogo. Imagen y datos ilustrativos.',brand,model,fuel,finance,trade)
      run("INSERT INTO files(vehicle,kind,mime,body) VALUES(?,'foto','image/webp',?)",
        lastInsertRowid,readFileSync(new URL('car-'+imageIndex+'.webp',import.meta.url)))
    }
  })
}
let moviblindLogo
if (demo) {
  try {
    moviblindLogo = readFileSync(new URL('moviblind-logo.png',import.meta.url))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
const adminEmail = demo ? 'admin@demo.test' : process.env.VITRINA_ADMIN_EMAIL?.trim().toLowerCase()
const adminPassword = demo ? 'VitrinaDemo2026!' : process.env.VITRINA_ADMIN_PASSWORD
if (!query('SELECT email FROM users WHERE company IS NULL')) {
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw Error('Configura VITRINA_ADMIN_EMAIL y VITRINA_ADMIN_PASSWORD (mínimo 12 caracteres) o usa --demo.')
  }
  run('INSERT INTO users VALUES(?,?,NULL)', adminEmail, hash(adminPassword))
}
const publicStatuses = ['Disponible', 'Reservado']
const statuses = ['Borrador', ...publicStatuses, 'Vendido']
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]))
const money = new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0})
const page = (title, body, layout = 'workspace') => `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Vitrina Motor</title><link rel="stylesheet" href="/style.css">
<style>
.workspace>h1{font-size:clamp(2rem,5vw,3.4rem);margin:12px 0 24px}.workspace section,.workspace fieldset,.workspace article{padding:20px;background:#fff;border:1px solid var(--line);border-radius:14px;margin:16px 0;min-width:0}.workspace section form,.workspace fieldset{display:grid;gap:12px}.workspace form>button{justify-self:start;margin-top:8px}.workspace .grid,.tools{align-items:start}.tools{display:flex;gap:12px;flex-wrap:wrap}.tools a,.workspace fieldset a{text-decoration:underline}.workspace legend{font-weight:800}.workspace textarea{min-height:92px}.access{max-width:480px;margin:24px auto}.access .card-body{gap:18px}.access form{display:grid;gap:14px}.login-error{background:#fff0e7;color:#853419;padding:12px;border-radius:8px}.detail{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:20px;margin-top:20px}.detail .image{border-radius:15px}.detail h1{font-size:clamp(2rem,4vw,3.8rem)}.detail .card-body{align-content:start;gap:18px}.detail p{overflow-wrap:anywhere}.filters .filter-action{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.hero{min-height:360px}.company-card .secondary,.card-body .secondary{justify-self:start}.directory{margin-top:26px}.back{display:inline-block;margin:10px 0;font-weight:700}.prospect{--accent:#e4c084}.prospect-brand{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding:12px 16px;background:white;border:1px solid var(--line);border-radius:12px}.prospect-brand img{width:110px;height:auto}.metrics{margin:20px 0}.workspace .stock article{margin:0}.workspace .stock article .actions a{text-decoration:none}@media(max-width:680px){.detail{grid-template-columns:1fr}.hero{min-height:295px}.top .secondary{padding:8px 10px}.workspace section,.workspace fieldset{padding:14px}}
</style></head><body><header class="top"><div class="wrap bar"><a class="brand" href="/"><b>VM</b> Vitrina Motor</a><nav aria-label="Navegación principal"><a class="secondary" href="/panel">Panel de empresas</a></nav></div></header>
<main class="wrap ${layout}">${layout === 'workspace' ? `<h1>${esc(title)}</h1>` : ''}${body}</main></body></html>`
const hero = (title, description, anchor, label) => `<section class="hero"><div><h1>${esc(title)}</h1>
<p>${esc(description)}</p><a class="primary" href="#${anchor}">${label}</a></div></section>`
const field = (label, name, value = '', options = '') =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${options}></label>`
const form = (action, body, upload = false) =>
  `<form method="post" action="${action}" ${upload ? 'enctype="multipart/form-data"' : ''}>${body}</form>`
const select = (name, options, value) => `<select name="${name}">${options.map(option =>
  `<option value="${esc(option)}" ${value === option ? 'selected' : ''}>${esc(option || (name === 'brand' ? 'Todas' : 'Sin especificar'))}</option>`).join('')}</select>`
const submit = label => `<button class="primary">${label}</button>`
const logout = form('/salir', submit('Cerrar sesión'))
const links = '<p class="tools"><a href="https://www.runt.gov.co/consultaCiudadana/">Consultar RUNT</a><a href="https://www.fcm.org.co/simit/">Consultar SIMIT</a></p>'
function userFor(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)vitrina=([a-f0-9]{64})(?:;|$)/)?.[1]
  if (!token) return
  return query(`SELECT users.email,users.company,sessions.token FROM sessions JOIN users USING(email)
    LEFT JOIN companies ON companies.slug=users.company
    WHERE token=? AND expires>? AND (users.company IS NULL OR companies.enabled=1)`, digest(token), Date.now())
}
function redirect(response, location) {
  response.writeHead(303, {Location:location}).end()
}
function show(response, title, body, status = 200, layout = 'workspace') {
  response.writeHead(status, {'Content-Type':'text/html; charset=utf-8'}).end(page(title, body, layout))
}
function fail(status, message) {
  throw Object.assign(Error(message), {status})
}
async function bodyOf(request) {
  const parts = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 33 * 1024 * 1024) fail(413, 'La carga supera el tamaño permitido.')
    parts.push(chunk)
  }
  try {
    return await new Response(Buffer.concat(parts), {
      headers:{'Content-Type':request.headers['content-type'] || ''}
    }).formData()
  } catch {
    fail(400, 'Formulario inválido.')
  }
}
function photos(id) {
  return rows("SELECT kind FROM files WHERE vehicle=? AND (kind='foto' OR kind LIKE 'foto-%')",id)
    .map(file => photoKinds.indexOf(file.kind)+1).filter(Boolean).sort((a,b)=>a-b)
}
function photoUrl(id, slot, privatePhoto = false) {
  return `/${privatePhoto ? 'foto-inventario' : 'foto'}/${id}/${slot}`
}
function image(id, title, privatePhoto = false, slot) {
  const available = id ? photos(id) : []
  const cover = id && query('SELECT cover FROM vehicles WHERE id=?',id)?.cover
  const selected = slot || (available.includes(cover) ? cover : available[0])
  const content = selected ? `<img loading="lazy" alt="${esc(title)}" src="${photoUrl(id,selected,privatePhoto)}">` : '<span>Sin foto</span>'
  return `<div class="image">${content}</div>`
}
function directory(response) {
  const companies = rows(`SELECT c.slug,c.name,COUNT(DISTINCT v.id) AS total,
    MAX(CASE WHEN f.id IS NOT NULL THEN v.id END) AS cover
    FROM companies c LEFT JOIN vehicles v ON v.company=c.slug AND v.status IN ('Disponible','Reservado')
    LEFT JOIN files f ON f.vehicle=v.id AND f.kind IN ('foto','foto-2','foto-3','foto-4','foto-5')
    WHERE c.enabled=1 GROUP BY c.slug ORDER BY c.name`)
  show(response,'Concesionarios', hero('Encuentra tu próximo vehículo', 'Explora los catálogos y contacta directamente al concesionario.', 'concesionarios', 'Ver concesionarios') +
    `<div class="section-title" id="concesionarios"><h2>Concesionarios</h2></div><div class="grid directory">${companies.map(c =>
      `<article class="card company-card">${image(c.cover,c.name)}<div class="card-body"><h3>${esc(c.name)}</h3>
      <p class="meta">${c.total} ${c.total === 1 ? 'vehículo publicado' : 'vehículos publicados'}</p>
      <a class="secondary" href="/c/${c.slug}">Ver catálogo</a></div></article>`).join('') || '<p class="empty">Aún no hay concesionarios publicados.</p>'}</div>`,200,'public')
}
function catalog(response, company, params) {
  const branded = demo && company.slug === 'moviblind'
  const branding = branded ? `<div class="prospect-brand">
    ${moviblindLogo ? '<img src="/moviblind-logo.png" alt="MoviBlind">' : '<strong>MoviBlind</strong>'}
    <p>Demostración privada · Vehículos, precios y condiciones ilustrativos</p>
    <a class="secondary" href="/ingresar?demo=moviblind">Acceso a inventario</a></div>` : ''
  const vehicles = rows("SELECT id,title,price,year,km,status,brand,transmission,fuel,finance,trade FROM vehicles WHERE company=? AND status IN ('Disponible','Reservado') ORDER BY id DESC", company.slug)
  const search = (params.get('q') || '').slice(0,120).trim()
  const brand = params.get('brand') || ''
  const brands = [...new Set(vehicles.map(brandOf))].sort((a,b)=>a.localeCompare(b,'es'))
  const max = params.get('max') || ''
  const year = params.get('year') || ''
  const status = params.get('status') || 'Todos'
  const sort = params.get('sort') || 'Más recientes'
  const filtered = vehicles.filter(v => v.title.toLowerCase().includes(search.toLowerCase()) &&
    (!brand || brandOf(v) === brand) && (!max || v.price <= Number(max)) && (!year || v.year >= Number(year)) &&
    (!publicStatuses.includes(status) || v.status === status))
  if (sort === 'Menor precio') filtered.sort((a,b) => a.price-b.price)
  if (sort === 'Mayor precio') filtered.sort((a,b) => b.price-a.price)
  show(response, company.name, branding + `<a class="back" href="/">← Concesionarios</a>` +
    hero(company.name, 'Consulta el inventario y encuentra un vehículo para tu presupuesto.', 'vehiculos', 'Explorar vehículos') +
    `<div class="section-title" id="vehiculos"><div><h2>Vehículos publicados</h2><p>${filtered.length} de ${vehicles.length}</p></div></div>
    <form class="filters" action="/c/${company.slug}#vehiculos">
    ${field('Marca o modelo','q',search,'type="search" maxlength="120" placeholder="Ej. Toyota"')}
    <label>Marca${select('brand',['',...brands],brand)}</label>
    ${field('Precio máximo (COP)','max',max,'type="number" min="1"')}
    ${field('Año desde','year',year,'type="number" min="1900" max="2100"')}
    <label>Estado${select('status',['Todos',...publicStatuses],status)}</label>
    <label>Orden${select('sort',['Más recientes','Menor precio','Mayor precio'],sort)}</label>
    <div class="filter-action">${submit('Buscar')}<a class="secondary" href="/c/${company.slug}#vehiculos">Limpiar</a></div></form>
    <div class="grid">${filtered.map(v => `<article class="card">${image(v.id,v.title)}<div class="card-body">
    <div>${tags(v)}</div><h3>${esc(v.title)}</h3>
    <p class="meta">${specs(v)}</p><p class="price">${money.format(v.price)}</p>
    <a class="secondary" href="/c/${company.slug}/${v.id}">Ver ficha</a></div></article>`).join('') || '<p class="empty">No encontramos vehículos con estos filtros.</p>'}</div>`,200,branded ? 'public prospect' : 'public')
}
function vehiclePage(response, company, vehicle, selected) {
  const available = photos(vehicle.id)
  const slot = available.includes(Number(selected)) ? Number(selected) : undefined
  const message = encodeURIComponent('Hola, me interesa el vehículo ' + vehicle.title + '. ¿Sigue disponible?')
  const contact = company.phone
    ? `<a class="primary" href="https://wa.me/${company.phone}?text=${message}">Consultar por WhatsApp</a>`
    : '<p class="meta">El concesionario aún no ha configurado su WhatsApp.</p>'
  show(response, vehicle.title, `<a class="back" href="/c/${company.slug}">← Catálogo de ${esc(company.name)}</a>
    <div class="detail"><div>${image(vehicle.id,vehicle.title,false,slot)}
    ${available.length > 1 ? `<div class="gallery">${available.map((number,index) => `<a href="?foto=${number}" aria-label="Ver foto ${index+1}"><img alt="" src="${photoUrl(vehicle.id,number)}"></a>`).join('')}</div>` : ''}</div><section class="card card-body">
    <p>${tags(vehicle)}</p>
    <h1>${esc(vehicle.title)}</h1><p class="meta">${specs(vehicle)}</p>
    <p class="price">${money.format(vehicle.price)}</p><p>${esc(vehicle.description)}</p><div>${contact}</div>
    <div class="tools"><button class="secondary" type="button" data-copy-link>Copiar enlace</button><a class="secondary" href="/c/${company.slug}/${vehicle.id}?descargar=1">Descargar ficha</a></div><p role="status" id="share-status"></p>
    <script src="/compartir.js" defer></script>
    </section></div>`,200,'public')
}
function download(response, company, vehicle) {
  const images = rows('SELECT kind,mime,body FROM files WHERE vehicle=?',vehicle.id)
    .filter(file => photoKinds.includes(file.kind))
    .sort((a,b) => Number(b.kind === photoKinds[vehicle.cover-1]) - Number(a.kind === photoKinds[vehicle.cover-1]))
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(vehicle.title)}</title>
  <style>body{font:16px system-ui;color:#142923;max-width:860px;margin:auto;padding:24px}img{width:100%;border-radius:12px;margin:10px 0}.tag{display:inline-block;background:#e9f2dc;padding:6px 12px;margin:4px;border-radius:25px}</style></head><body>
  <p>${esc(company.name)}</p><h1>${esc(vehicle.title)}</h1><p>${tags(vehicle)}</p><h2>${money.format(vehicle.price)}</h2>
  <p>${specs(vehicle)}</p><p>${esc(vehicle.description)}</p>
  ${company.phone ? `<p><a href="https://wa.me/${company.phone}">Contactar al concesionario</a></p>` : ''}
  ${images.map(file => `<img alt="${esc(vehicle.title)}" src="data:${file.mime};base64,${Buffer.from(file.body).toString('base64')}">`).join('')}</body></html>`
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="ficha-vehiculo.html"'}).end(html)
}
function loginPage(response, error = '', email = '') {
  const demoInfo = demo ? '<div class="notice"><strong>Cuentas de prueba</strong><p>admin@demo.test · bogota@demo.test · andes@demo.test · moviblind@demo.test</p><p>Contraseña: <code>VitrinaDemo2026!</code></p></div>' : ''
  show(response,'Acceso al panel',`<section class="card access"><div class="card-body"><h2>Acceso al panel</h2>
    ${error ? '<p class="login-error" role="alert">' + esc(error) + '</p>' : ''}
    ${form('/ingresar',field('Correo','email',email,'type="email" required autocomplete="username"') +
      field('Contraseña','password','','type="password" required autocomplete="current-password"') + submit('Ingresar'))}
    ${demoInfo}</div></section>`,error ? 401 : 200,'public')
}
function editor(response, company, vehicle = {}) {
  const {id} = vehicle
  const files = id ? rows('SELECT kind FROM files WHERE vehicle=?', id).map(file => file.kind) : []
  const upload = (label, kind, accept) => `<label>${label}<input type="file" name="${kind}" accept="${accept}"></label>${files.includes(kind) && kind.endsWith('-pdf') ? `<a href="/expediente/${id}/${kind}">Descargar documento guardado</a>` : ''}`
  show(response, id ? 'Editar vehículo' : 'Nuevo vehículo', `<p><a href="/panel">Volver al inventario</a></p>
    ${form(id ? '/vehiculos/' + id : '/vehiculos', `
      <fieldset><legend>Ficha pública</legend><div class="grid">
      ${field('Marca','brand',id ? brandOf(vehicle) : '','required maxlength="40"')}
      ${field('Modelo y versión','model',vehicle.model || (id ? vehicle.title.slice(brandOf(vehicle).length).trim() : ''),'required maxlength="120"')}
      <label>Transmisión${select('transmission',transmissions,vehicle.transmission)}</label>
      <label>Combustible${select('fuel',fuels,vehicle.fuel)}</label>
      ${field('Precio en COP','price',vehicle.price,'type="number" min="1" required')}
      ${field('Año','year',vehicle.year,'type="number" min="1900" max="2100" required')}
      ${field('Kilometraje','km',vehicle.km,'type="number" min="0" required')}
      <label>Estado${select('status',statuses,vehicle.status)}</label></div>
      <label>Descripción pública<textarea name="description" maxlength="2000">${esc(vehicle.description)}</textarea></label>
      <div class="tools"><label class="check"><input type="checkbox" name="finance" ${vehicle.finance ? 'checked' : ''}> Acepta financiación</label>
      <label class="check"><input type="checkbox" name="trade" ${vehicle.trade ? 'checked' : ''}> Acepta retoma</label></div>
      <h2>Fotos del vehículo</h2><p class="meta">Hasta 5 fotos. Elige la portada y guarda los cambios.</p>
      <div class="form-grid">${photoKinds.map((kind,index) => `<div>
      ${files.includes(kind) ? image(id,vehicle.title,true,index+1) : ''}
      ${upload('Foto ' + (index+1) + ' (hasta 4 MB)',kind,'image/jpeg,image/png,image/webp')}
      <label class="check"><input type="radio" name="cover" value="${index+1}" ${(vehicle.cover || 1) === index+1 ? 'checked' : ''}> Usar como portada</label>
      ${files.includes(kind) ? `<label class="check"><input type="checkbox" name="remove" value="${index+1}"> Quitar foto guardada</label>` : ''}</div>`).join('')}</div></fieldset>
      <fieldset><legend>Expediente privado</legend><div class="grid">
      ${field('Placa','plate',vehicle.plate,'maxlength="10"')}
      ${field('Cantidad de propietarios anteriores','owners',vehicle.owners,'type="number" min="0" max="999"')}
      ${field('Vencimiento SOAT','soat',vehicle.soat,'type="date"')}
      ${field('Vencimiento técnico-mecánica','rtm',vehicle.rtm,'type="date"')}
      ${field('Fecha de consulta de multas','checked',vehicle.checked,'type="date"')}
      ${field('Resultado de consulta de multas','fines',vehicle.fines,'maxlength="500"')}</div>
      ${links}
      ${upload('Documento SOAT (PDF, máximo 4 MB)','soat-pdf','application/pdf')}
      ${upload('Documento técnico-mecánica (PDF, máximo 4 MB)','rtm-pdf','application/pdf')}
      ${upload('Soporte de consulta de multas (PDF, máximo 4 MB)','simit-pdf','application/pdf')}</fieldset>
      ${submit('Guardar vehículo')}`, true)}`)
}
function panel(response, user) {
  if (!user.company) {
    const companies = rows('SELECT * FROM companies ORDER BY name')
    show(response, 'Administración de empresas', `${logout}<section><h2>Dar de alta una empresa</h2>
      ${form('/empresas', `${field('Nombre comercial','name','','required maxlength="120"')}
      ${field('Identificador para el enlace','slug','','required maxlength="40"')}
      ${field('WhatsApp con indicativo, solo números','phone','','pattern="[1-9][0-9]{7,14}"')}
      ${field('Correo del administrador','email','','type="email" required')}
      ${field('Contraseña inicial (mínimo 12 caracteres)','password','','type="password" minlength="12" required')}
      ${submit('Crear empresa y acceso')}`)}</section>
      <div class="grid">${companies.map(c => `<article><h2>${esc(c.name)}</h2><p>${c.enabled ? 'Activa' : 'Suspendida'}</p>
      ${c.enabled ? `<a href="/c/${c.slug}">Ver catálogo</a>` : ''}
      ${form('/empresas/' + c.slug, submit(c.enabled ? 'Suspender acceso y catálogo' : 'Reactivar empresa'))}</article>`).join('')}</div>`)
    return
  }
  const company = query('SELECT * FROM companies WHERE slug=?', user.company)
  const vehicles = rows('SELECT * FROM vehicles WHERE company=? ORDER BY id DESC', user.company)
  show(response, company.name + ' · Inventario', `<div class="tools"><a href="/c/${company.slug}">Ver catálogo público</a><a class="primary" href="/vehiculos/nuevo">Agregar vehículo</a>${logout}</div>
    <section>${form('/contacto', field('WhatsApp del concesionario','phone',company.phone,'pattern="[1-9][0-9]{7,14}"') + submit('Guardar contacto'))}</section>
    <div class="metrics">${statuses.map(status => `<div><strong>${vehicles.filter(v => v.status === status).length}</strong>${esc(status)}</div>`).join('')}</div>
    <div class="stock">${vehicles.map(v => `<article>${image(v.id,v.title,true)}<div><h3>${esc(v.title)}</h3><p>${money.format(v.price)}</p><p>${tags(v)}</p>
    <p class="muted">SOAT ${expiry(v.soat)} · Técnico-mecánica ${expiry(v.rtm)}</p>
    </div><div class="actions"><a class="secondary" href="/vehiculos/${v.id}">Editar expediente</a>${publicStatuses.includes(v.status) ? `<a class="secondary" href="/c/${company.slug}/${v.id}">Ficha pública</a>` : ''}</div></article>`).join('') || '<p>Aún no hay vehículos.</p>'}</div>`)
}
function expiry(date) {
  if (!date) return 'sin fecha'
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date())
  const days = (Date.parse(date) - Date.parse(today)) / 86400000
  return days < 0 ? 'vencido' : days <= 30 ? 'vence en ' + days + ' días' : 'vigente hasta ' + esc(date)
}
const text = (data, name, max) => String(data.get(name) || '').trim().slice(0,max)
function integer(data, name, min, max) {
  const raw = data.get(name)
  const value = Number(raw)
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(400, 'Revisa los valores numéricos del formulario.')
  }
  return value
}
function date(data, name) {
  const value = text(data, name, 30)
  if (value && (!/^\d{4}-\d\d-\d\d$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) {
    fail(400, 'Revisa las fechas del expediente.')
  }
  return value
}
function phoneOf(data) {
  const phone = text(data,'phone',30)
  if (phone && !/^[1-9]\d{7,14}$/.test(phone)) fail(400, 'WhatsApp debe incluir el indicativo y solo números.')
  return phone
}
function transaction(work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    work()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
async function saveVehicle(data, user, vehicle) {
  const company = user.company
  const brand = text(data,'brand',40)
  const model = text(data,'model',120)
  const title = [brand,model].filter(Boolean).join(' ')
  const transmission = text(data,'transmission',30)
  const fuel = text(data,'fuel',30)
  if (!transmissions.includes(transmission) || !fuels.includes(fuel)) fail(400,'Revisa la transmisión y el combustible.')
  const cover = data.get('cover') ? integer(data,'cover',1,5) : 1
  const status = text(data,'status',20)
  if (!brand || !model || !statuses.includes(status)) fail(400, 'Completa el nombre y selecciona un estado válido.')
  const values = [title, integer(data,'price',1,1e12), status, integer(data,'year',1900,2100),
    integer(data,'km',0,1e7), text(data,'description',2000), text(data,'plate',10).toUpperCase(),
    data.get('owners') ? integer(data,'owners',0,999) : null, date(data,'soat'), date(data,'rtm'),
    date(data,'checked'), text(data,'fines',500)]
  const uploads = []
  for (const kind of [...photoKinds,'soat-pdf','rtm-pdf','simit-pdf']) {
    const file = data.get(kind)
    if (!(file instanceof File) || !file.size) continue
    if (file.size > 4 * 1024 * 1024) fail(413, 'Cada archivo debe pesar como máximo 4 MB.')
    const bytes = Buffer.from(await file.arrayBuffer())
    let mime
    if (photoKinds.includes(kind)) {
      if (bytes.subarray(0,3).toString('hex') === 'ffd8ff') mime = 'image/jpeg'
      else if (bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a') mime = 'image/png'
      else if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') mime = 'image/webp'
    } else if (bytes.toString('ascii',0,5) === '%PDF-') mime = 'application/pdf'
    if (!mime) fail(400, 'El tipo de archivo no coincide con el campo.')
    uploads.push([kind,mime,bytes])
  }
  transaction(() => {
    if (!query('SELECT token FROM sessions WHERE token=? AND expires>?', user.token, Date.now())) fail(403,'La sesión ya no está activa.')
    const id = vehicle?.id ?? run(`INSERT INTO vehicles
      (company,title,price,status,year,km,description,plate,owners,soat,rtm,checked,fines)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,company,...values).lastInsertRowid
    if (vehicle) run(`UPDATE vehicles SET title=?,price=?,status=?,year=?,km=?,description=?,
      plate=?,owners=?,soat=?,rtm=?,checked=?,fines=? WHERE id=? AND company=?`,...values,id,company)
    for (const [index,kind] of photoKinds.entries()) {
      if (data.getAll('remove').includes(String(index+1))) run('DELETE FROM files WHERE vehicle=? AND kind=?',id,kind)
    }
    for (const upload of uploads) run(`INSERT INTO files(vehicle,kind,mime,body) VALUES(?,?,?,?)
      ON CONFLICT(vehicle,kind) DO UPDATE SET mime=excluded.mime,body=excluded.body`,id,...upload)
    const available = photos(id)
    run('UPDATE vehicles SET brand=?,model=?,transmission=?,fuel=?,finance=?,trade=?,cover=? WHERE id=? AND company=?',
      brand,model,transmission,fuel,Number(data.has('finance')),Number(data.has('trade')),
      available.includes(cover) ? cover : (available[0] || 1), id,company)
  })
}
const secure = process.env.VITRINA_SECURE_COOKIE === '1'
const cookie = (token, age) => `vitrina=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`
const unavailable = () => fail(404,'No encontramos esta página.')
const port = Number(process.env.PORT || 4174)
const attempts = new Map()
const dummyPassword = hash(randomBytes(32).toString('hex'))
const server = createServer(async (request,response) => {
  response.setHeader('X-Content-Type-Options','nosniff')
  response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
  response.setHeader('Cache-Control','no-store')
  try {
    const url = new URL(request.url,'http://localhost')
    const [,route,key,sub,extra] = url.pathname.split('/')
    if (extra !== undefined) unavailable()
    const user = userFor(request)
    if (request.method === 'POST') {
      const expected = process.env.VITRINA_ORIGIN || 'http://' + request.headers.host
      if (request.headers.origin !== expected) fail(403,'Origen del formulario inválido.')
      if (route === 'ingresar' && !key) {
        const address = request.socket.remoteAddress
        const now = Date.now()
        for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip)
        const previous = attempts.get(address)
        if (previous?.until > now && previous.count >= 10) fail(429,'Demasiados intentos. Intenta en unos minutos.')
        const data = await bodyOf(request)
        const email = text(data,'email',254).toLowerCase()
        const account = query(`SELECT users.*,companies.enabled FROM users LEFT JOIN companies ON companies.slug=users.company WHERE email=?`,email)
        const reference = account?.password || dummyPassword
        const actual = hash(text(data,'password',256),reference.split(':')[0])
        if (!timingSafeEqual(Buffer.from(reference),Buffer.from(actual)) || !account || account.enabled === 0) {
          const active = attempts.get(address)
          attempts.set(address, {count:active?.until > now ? active.count + 1 : 1,until:now + 300000})
          return loginPage(response,'Verifica el correo y la contraseña.',email)
        }
        attempts.delete(address)
        const token = randomBytes(32).toString('hex')
        run('DELETE FROM sessions WHERE expires<=?',now)
        run('INSERT INTO sessions VALUES(?,?,?)',digest(token),account.email,now + 28800000)
        response.setHeader('Set-Cookie',cookie(token,28800))
        return redirect(response,'/panel')
      }
      if (!user) return redirect(response,'/ingresar')
      if (route === 'salir') {
        run('DELETE FROM sessions WHERE token=?',user.token)
        response.setHeader('Set-Cookie',cookie('',0))
        return redirect(response,'/')
      }
      if (route === 'empresas' && !user.company) {
        if (key && !sub) {
          transaction(() => {
            run('UPDATE companies SET enabled=1-enabled WHERE slug=?',key)
            run('DELETE FROM sessions WHERE email IN (SELECT email FROM users WHERE company=?)',key)
          })
        } else if (!key) {
          const data = await bodyOf(request)
          const name = text(data,'name',120)
          const slug = text(data,'slug',50)
          const email = text(data,'email',254).toLowerCase()
          const password = text(data,'password',256)
          if (!name || !/^[a-z0-9-]{2,40}$/.test(slug) || !/^\S+@[^\s@]+\.\S+$/.test(email) || password.length < 12) fail(400,'Revisa los datos de la empresa y del administrador.')
          const phone = phoneOf(data)
          if (query('SELECT slug FROM companies WHERE slug=?',slug) || query('SELECT email FROM users WHERE email=?',email)) fail(409,'El identificador o el correo ya está en uso.')
          transaction(() => {
            run('INSERT INTO companies(slug,name,phone) VALUES(?,?,?)',slug,name,phone)
            run('INSERT INTO users VALUES(?,?,?)',email,hash(password),slug)
          })
        } else unavailable()
        return redirect(response,'/panel')
      }
      if (route === 'contacto' && user.company && !key) {
        const data = await bodyOf(request)
        run('UPDATE companies SET phone=? WHERE slug=? AND enabled=1',phoneOf(data),user.company)
        return redirect(response,'/panel')
      }
      if (route === 'vehiculos' && user.company && !sub) {
        const vehicle = key && query('SELECT * FROM vehicles WHERE company=? AND id=?',user.company,key)
        if (key && !vehicle) unavailable()
        await saveVehicle(await bodyOf(request),user,vehicle)
        return redirect(response,'/panel')
      }
      return unavailable()
    }
    if (request.method !== 'GET') fail(405,'Método no permitido.')
    if (!route) return directory(response)
    if (route === 'compartir.js' && !key) {
      return response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(
        `document.querySelector('[data-copy-link]').addEventListener('click', async () => {
          const url = location.origin + location.pathname
          try {
            await navigator.clipboard.writeText(url)
            document.querySelector('#share-status').textContent = 'Enlace copiado.'
          } catch {
            document.querySelector('#share-status').textContent = url
          }
        })`)
    }
    if (route === 'style.css' && !key) {
      return response.writeHead(200,{'Content-Type':'text/css; charset=utf-8'})
        .end(readFileSync(new URL('style.css',import.meta.url)))
    }
    if (route === 'hero.webp' && !key) {
      return response.writeHead(200,{'Content-Type':'image/webp'})
        .end(readFileSync(new URL('hero.webp',import.meta.url)))
    }
    if (route === 'moviblind-logo.png' && !key && moviblindLogo) {
      return response.writeHead(200,{'Content-Type':'image/png'}).end(moviblindLogo)
    }
    if (route === 'ingresar' && !key) return loginPage(response,'',demo && url.searchParams.get('demo') === 'moviblind' ? 'moviblind@demo.test' : '')
    if (route === 'panel' && !key) return user ? panel(response,user) : redirect(response,'/ingresar')
    if (route === 'c' && key) {
      const company = query('SELECT * FROM companies WHERE slug=? AND enabled=1',key)
      if (!company) return unavailable()
      if (!sub) return catalog(response,company,url.searchParams)
      const vehicle = query("SELECT * FROM vehicles WHERE id=? AND company=? AND status IN ('Disponible','Reservado')",sub,key)
      if (!vehicle) return unavailable()
      if (url.searchParams.get('descargar') === '1') return download(response,company,vehicle)
      return vehiclePage(response,company,vehicle,url.searchParams.get('foto'))
    }
    if (route === 'vehiculos' && user?.company && key && !sub) {
      if (key === 'nuevo') return editor(response,user.company)
      const vehicle = query('SELECT * FROM vehicles WHERE id=? AND company=?',key,user.company)
      return vehicle ? editor(response,user.company,vehicle) : unavailable()
    }
    if (route === 'foto-inventario' && user?.company && key) {
      const file = query(`SELECT f.mime,f.body FROM files f JOIN vehicles v ON v.id=f.vehicle
        WHERE v.id=? AND v.company=? AND f.kind=?`,key,user.company,photoKinds[Number(sub || 1)-1] || '')
      return file ? response.writeHead(200,{'Content-Type':file.mime}).end(file.body) : unavailable()
    }
    if (route === 'foto' && key) {
      const file = query(`SELECT f.mime,f.body FROM files f JOIN vehicles v ON v.id=f.vehicle
        JOIN companies c ON c.slug=v.company WHERE v.id=? AND f.kind=? AND c.enabled=1
        AND v.status IN ('Disponible','Reservado')`,key,photoKinds[Number(sub || 1)-1] || '')
      return file ? response.writeHead(200,{'Content-Type':file.mime}).end(file.body) : unavailable()
    }
    if (route === 'expediente' && user?.company && key && ['soat-pdf','rtm-pdf','simit-pdf'].includes(sub)) {
      const file = query('SELECT f.mime,f.body FROM files f JOIN vehicles v ON v.id=f.vehicle WHERE v.id=? AND v.company=? AND f.kind=?',key,user.company,sub)
      return file ? response.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${sub}.pdf"`}).end(file.body) : unavailable()
    }
    return unavailable()
  } catch (error) {
    if (!error.status) console.error(error)
    if (!response.headersSent) show(response,error.status ? error.message : 'Ocurrió un error', '<p><a href="/panel">Volver al panel</a></p>',error.status || 500)
  }
})
server.listen(port,host,() => console.log(`Vitrina Motor Empresas — http://${host}:${server.address().port}`))
