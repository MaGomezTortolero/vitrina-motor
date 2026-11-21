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
const page = (title, body) => `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Vitrina Motor</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f1f4f3;color:#153030;font:16px system-ui}main,nav{max-width:1100px;margin:auto;padding:24px}header{background:#122e2b;color:#fff}nav{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}a{color:#136253}nav a{color:#fff}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.05}section,article,fieldset{background:#fff;border-radius:14px;padding:20px;margin:12px 0;border:1px solid #d9e3df}label{display:grid;gap:6px;margin:8px 0}input,select,textarea,button{font:inherit;padding:.65rem;border:1px solid #829994;border-radius:7px;max-width:100%}button,.primary{background:#16594c;color:white;cursor:pointer;padding:.65rem .9rem;border-radius:7px;text-decoration:none;display:inline-block}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}.photo{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:10px}.price{font-weight:750;font-size:1.35rem}.muted{color:#455f59}.tools{display:flex;gap:16px;flex-wrap:wrap}textarea{min-height:90px}legend{font-weight:bold}
</style><header><nav><a href="/">Vitrina Motor</a><div class="tools"><a href="/panel">Panel</a></div></nav></header><main><h1>${esc(title)}</h1>${body}</main></html>`
const field = (label, name, value = '', options = '') =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${options}></label>`
const form = (action, body, upload = false) =>
  `<form method="post" action="${action}" ${upload ? 'enctype="multipart/form-data"' : ''}>${body}</form>`
const select = (name, options, value) => `<select name="${name}">${options.map(option =>
  `<option ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`
const submit = label => `<button>${label}</button>`
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
function show(response, title, body, status = 200) {
  response.writeHead(status, {'Content-Type':'text/html; charset=utf-8'}).end(page(title, body))
}
function fail(status, message) {
  throw Object.assign(Error(message), {status})
}
async function bodyOf(request) {
  const parts = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 17 * 1024 * 1024) fail(413, 'La carga supera el tamaño permitido.')
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
function photo(id) {
  return query("SELECT id FROM files WHERE vehicle=? AND kind='foto'", id)
    ? `<img class="photo" alt="" src="/foto/${id}">` : ''
}
function catalog(response, company, search) {
  const vehicles = rows("SELECT id,title,price,year,km,status FROM vehicles WHERE company=? AND status IN ('Disponible','Reservado') ORDER BY id DESC", company.slug)
  const filtered = vehicles.filter(v => v.title.toLowerCase().includes(search.trim().toLowerCase()))
  show(response, company.name, `<form><label>Buscar vehículo<input name="q" value="${esc(search)}"></label>${submit('Buscar')}</form>
    <div class="grid">${filtered.map(v => `<article>${photo(v.id)}<p>${esc(v.status)}</p><h2><a href="/c/${company.slug}/${v.id}">${esc(v.title)}</a></h2><p>${v.year} · ${v.km.toLocaleString('es-CO')} km</p><p class="price">${money.format(v.price)}</p></article>`).join('') || '<p>No hay vehículos que coincidan.</p>'}</div>`)
}
function vehiclePage(response, company, vehicle) {
  const message = encodeURIComponent('Hola, me interesa el vehículo ' + vehicle.title + '. ¿Sigue disponible?')
  const contact = company.phone
    ? `<a class="primary" href="https://wa.me/${company.phone}?text=${message}">Consultar por WhatsApp</a>`
    : '<p>El concesionario aún no ha configurado su WhatsApp.</p>'
  show(response, vehicle.title, `<p><a href="/c/${company.slug}">${esc(company.name)}</a> · ${esc(vehicle.status)}</p>
    <section>${photo(vehicle.id)}<p>${vehicle.year} · ${vehicle.km.toLocaleString('es-CO')} km</p>
    <p class="price">${money.format(vehicle.price)}</p><p>${esc(vehicle.description)}</p>${contact}</section>`)
}
function editor(response, company, vehicle = {}) {
  const {id} = vehicle
  const files = id ? rows('SELECT kind FROM files WHERE vehicle=?', id).map(file => file.kind) : []
  const upload = (label, kind, accept) => `<label>${label}<input type="file" name="${kind}" accept="${accept}"></label>${files.includes(kind) && kind !== 'foto' ? `<a href="/expediente/${id}/${kind}">Descargar documento guardado</a>` : ''}`
  show(response, id ? 'Editar vehículo' : 'Nuevo vehículo', `<p><a href="/panel">Volver al inventario</a></p>
    ${form(id ? '/vehiculos/' + id : '/vehiculos', `
      <fieldset><legend>Ficha pública</legend><div class="grid">
      ${field('Marca, modelo y versión','title',vehicle.title,'required maxlength="120"')}
      ${field('Precio en COP','price',vehicle.price,'type="number" min="1" required')}
      ${field('Año','year',vehicle.year,'type="number" min="1900" max="2100" required')}
      ${field('Kilometraje','km',vehicle.km,'type="number" min="0" required')}
      <label>Estado${select('status',statuses,vehicle.status)}</label></div>
      <label>Descripción pública<textarea name="description" maxlength="2000">${esc(vehicle.description)}</textarea></label>
      ${upload('Foto de portada (máximo 4 MB)','foto','image/jpeg,image/png,image/webp')}</fieldset>
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
  show(response, company.name + ' · Inventario', `<div class="tools"><a href="/c/${company.slug}">Ver catálogo público</a><a class="primary" href="/vehiculos/nuevo">Nuevo vehículo</a>${logout}</div>
    <section>${form('/contacto', field('WhatsApp del concesionario','phone',company.phone,'pattern="[1-9][0-9]{7,14}"') + submit('Guardar contacto'))}</section>
    <div class="grid">${vehicles.map(v => `<article><h2>${esc(v.title)}</h2><p>${esc(v.status)} · ${money.format(v.price)}</p>
    <p class="muted">SOAT ${expiry(v.soat)} · Técnico-mecánica ${expiry(v.rtm)}</p>
    <a href="/vehiculos/${v.id}">Editar expediente</a>${publicStatuses.includes(v.status) ? ` · <a href="/c/${company.slug}/${v.id}">Ficha pública</a>` : ''}</article>`).join('') || '<p>Aún no hay vehículos.</p>'}</div>`)
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
  const title = text(data,'title',120)
  const status = text(data,'status',20)
  if (!title || !statuses.includes(status)) fail(400, 'Completa el nombre y selecciona un estado válido.')
  const values = [title, integer(data,'price',1,1e12), status, integer(data,'year',1900,2100),
    integer(data,'km',0,1e7), text(data,'description',2000), text(data,'plate',10).toUpperCase(),
    data.get('owners') ? integer(data,'owners',0,999) : null, date(data,'soat'), date(data,'rtm'),
    date(data,'checked'), text(data,'fines',500)]
  const uploads = []
  for (const kind of ['foto','soat-pdf','rtm-pdf','simit-pdf']) {
    const file = data.get(kind)
    if (!(file instanceof File) || !file.size) continue
    if (file.size > 4 * 1024 * 1024) fail(413, 'Cada archivo debe pesar como máximo 4 MB.')
    const bytes = Buffer.from(await file.arrayBuffer())
    let mime
    if (kind === 'foto') {
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
    for (const upload of uploads) run(`INSERT INTO files(vehicle,kind,mime,body) VALUES(?,?,?,?)
      ON CONFLICT(vehicle,kind) DO UPDATE SET mime=excluded.mime,body=excluded.body`,id,...upload)
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
  response.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
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
          fail(401,'Verifica el correo y la contraseña.')
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
    if (!route) return show(response,'Concesionarios',`<div class="grid">${rows('SELECT slug,name FROM companies WHERE enabled=1 ORDER BY name').map(c =>
      `<article><h2><a href="/c/${c.slug}">${esc(c.name)}</a></h2></article>`).join('') || '<p>Aún no hay concesionarios publicados.</p>'}</div>`)
    if (route === 'ingresar' && !key) return show(response,'Acceso al panel',form('/ingresar',
      field('Correo','email','','type="email" required autocomplete="username"') +
      field('Contraseña','password','','type="password" required autocomplete="current-password"') +
      submit('Ingresar')))
    if (route === 'panel' && !key) return user ? panel(response,user) : redirect(response,'/ingresar')
    if (route === 'c' && key) {
      const company = query('SELECT * FROM companies WHERE slug=? AND enabled=1',key)
      if (!company) return unavailable()
      if (!sub) return catalog(response,company,url.searchParams.get('q') || '')
      const vehicle = query("SELECT * FROM vehicles WHERE id=? AND company=? AND status IN ('Disponible','Reservado')",sub,key)
      return vehicle ? vehiclePage(response,company,vehicle) : unavailable()
    }
    if (route === 'vehiculos' && user?.company && key && !sub) {
      if (key === 'nuevo') return editor(response,user.company)
      const vehicle = query('SELECT * FROM vehicles WHERE id=? AND company=?',key,user.company)
      return vehicle ? editor(response,user.company,vehicle) : unavailable()
    }
    if (route === 'foto' && key && !sub) {
      const file = query(`SELECT f.mime,f.body FROM files f JOIN vehicles v ON v.id=f.vehicle
        JOIN companies c ON c.slug=v.company WHERE v.id=? AND f.kind='foto' AND c.enabled=1
        AND v.status IN ('Disponible','Reservado')`,key)
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
