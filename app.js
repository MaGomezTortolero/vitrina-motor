'use strict';
const $ = id => document.getElementById(id);
const states = ['Borrador', 'Disponible', 'Reservado', 'Vendido'];
const currency = new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 });
const number = new Intl.NumberFormat('es-CO');
const examples = [
  ['Toyota','Corolla Cross XEI',2024,18400,114900000,'Automática','Híbrido',true,true,'Disponible'],
  ['Mazda','3 Grand Touring',2023,26500,89900000,'Automática','Gasolina',true,false,'Disponible'],
  ['Renault','Duster Intens',2024,21600,79900000,'Manual','Gasolina',true,true,'Disponible'],
  ['Nissan','Frontier XE',2023,38000,126500000,'Manual','Diésel',false,true,'Reservado'],
].map(([brand,model,year,km,price,transmission,fuel,finance,trade,status],i) => ({
  id:'demo-'+(i+1),brand,model,year,km,price,transmission,fuel,finance,trade,status,
  photos:['car-'+i+'.webp'],description:'Ficha de demostración con especificaciones e imagen ilustrativas.'
}));
const key = 'vitrina-motor-v1';
let data;
try { data = JSON.parse(localStorage.getItem(key)); } catch { data = null; }
if (!Array.isArray(data?.vehicles)) data = {vehicles:examples,phone:''};
let editing = null, pictures = [], toastTimer;
const form = $('vehicle-form');
const filters = $('filters');
const title = v => v.brand+' '+v.model;
const encode = s => encodeURIComponent(s);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isImage = s => typeof s === 'string' && (/^car-[0-3]\.webp$/.test(s) || /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(s));
const photo = (src,alt) => isImage(src) ? '<img src="'+safe(src)+'" alt="'+safe(alt)+'">' : '<span>Sin foto</span>';
const imageBox = (src,alt) => '<div class="image">'+photo(src,alt)+'</div>';
const active = v => ['Disponible','Reservado'].includes(v.status);
const tags = v => '<span class="tag '+(v.status==='Reservado'?'reserved':'')+'">'+safe(v.status)+'</span>' +
  (v.finance ? '<span class="tag">Financiación</span>' : '') + (v.trade ? '<span class="tag">Retoma</span>' : '');
const details = v => safe(v.year)+' · '+number.format(v.km)+' km · '+safe(v.transmission)+' · '+safe(v.fuel);
function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent=message;
  $('toast').hidden=false;
  toastTimer=setTimeout(()=> $('toast').hidden=true,4000);
}
function persist(next) {
  try { localStorage.setItem(key,JSON.stringify(next)); data=next; return true; }
  catch { notify('No se pudo guardar. Reduce la cantidad de fotos e inténtalo de nuevo.'); return false; }
}
function renderCatalog() {
  const values = new FormData(filters);
  const query=String(values.get('search')||'').toLowerCase().trim();
  const brand=values.get('brand');
  const max=values.get('max');
  const status=values.get('status');
  const inventory=data.vehicles.filter(active);
  const brands=[...new Set(inventory.map(v=>v.brand))].sort((a,b)=>a.localeCompare(b,'es'));
  filters.elements.brand.replaceChildren(new Option('Todas',''),...brands.map(s=>new Option(s,s)));
  filters.elements.brand.value=brands.includes(brand)?brand:'';
  const visible=inventory.filter(v=>title(v).toLowerCase().includes(query) &&
    (!filters.elements.brand.value || v.brand===brand) && (!max || v.price<=Number(max)) &&
    (!status || v.status===status));
  if (values.get('sort')) visible.sort((a,b)=>values.get('sort')==='asc'?a.price-b.price:b.price-a.price);
  $('count').textContent=visible.length+' de '+inventory.length+' vehículos publicados';
  $('cards').innerHTML=visible.map(v=>'<article class="card">'+imageBox(v.photos[0],title(v))+
    '<div class="card-body"><div>'+tags(v)+'</div><h3>'+safe(title(v))+'</h3><p class="meta">'+details(v)+
    '</p><p class="price">'+currency.format(v.price)+'</p><button class="secondary" data-view="'+safe(v.id)+
    '">Ver ficha</button></div></article>').join('') || '<p class="empty">No encontramos vehículos con estos filtros.</p>';
}
function renderInventory() {
  $('metrics').innerHTML=states.map(status=>'<div><strong>'+data.vehicles.filter(v=>v.status===status).length+
    '</strong>'+status+'</div>').join('');
  $('stock').innerHTML=data.vehicles.map(v=>'<article>'+imageBox(v.photos[0],title(v))+
    '<div><h3>'+safe(title(v))+'</h3><p class="meta">'+safe(v.year)+' · '+currency.format(v.price)+
    '</p><div>'+tags(v)+'</div></div><div class="actions"><button class="secondary" data-view="'+safe(v.id)+
    '">Ver</button><button class="secondary" data-edit="'+safe(v.id)+'">Editar</button></div></article>').join('') ||
    '<p class="empty">Agrega el primer vehículo.</p>';
}
function view(which) {
  const inventory=which==='inventory';
  $('inventory').hidden=!inventory;
  $('catalog').hidden=inventory;
  $('inventory-tab').setAttribute('aria-pressed',inventory);
  $('catalog-tab').setAttribute('aria-pressed',!inventory);
  if (inventory) renderInventory(); else renderCatalog();
}
function linkFor(v) {
  const url = new URL(location.href);
  const snapshot = {...v, photos:v.photos.filter(src=>/^car-[0-3]\.webp$/.test(src)), phone:data.phone};
  url.hash='ficha='+encode(JSON.stringify(snapshot));
  return url.href;
}
function display(v, owner=false) {
  const phone=owner ? data.phone : v.phone;
  const canContact=active(v) && /^\d{8,15}$/.test(phone||'');
  const message='Hola, me interesa el '+title(v)+' '+v.year+'. ¿Podrían darme más información?';
  const dialog=$('detail');
  dialog.innerHTML='<div class="modal-head"><h2>'+safe(title(v))+'</h2><button class="secondary" data-close="detail">Cerrar</button></div>'+
    '<div class="modal-content"><div id="main-photo">'+imageBox(v.photos[0],title(v))+'</div>'+
    '<div class="gallery">'+v.photos.map((src,i)=>'<button aria-label="Ver foto '+(i+1)+'" data-photo="'+i+'">'+photo(src,'')+'</button>').join('')+
    '</div><div>'+tags(v)+'</div><p class="price">'+currency.format(v.price)+'</p><p>'+details(v)+'</p><p>'+safe(v.description)+'</p>'+
    '<div class="modal-actions">'+(canContact?'<a class="primary" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+phone+'?text='+encode(message)+'">Consultar por WhatsApp</a>':'')+
    (active(v)?'<button id="share" class="secondary">Copiar enlace</button><button id="download" class="secondary">Descargar ficha</button>':'')+
    '</div></div>';
  dialog.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=> $('main-photo').innerHTML=imageBox(v.photos[Number(b.dataset.photo)],title(v)));
  if (active(v)) {
    $('share').onclick=async()=> {
      const url=owner?linkFor(v):location.href;
      try {
        await navigator.clipboard.writeText(url);
        notify(v.photos.some(p=>p.startsWith('data:'))?'Enlace copiado. Para incluir tus fotos, descarga la ficha.':'Enlace copiado.');
      } catch { window.prompt('Copia el enlace de la ficha',url); }
    };
    $('download').onclick=()=>download(v,canContact?'https://wa.me/'+phone+'?text='+encode(message):null);
  }
  if (!dialog.open) dialog.showModal();
}
async function download(v, contact) {
  try {
    const images=await Promise.all(v.photos.map(async src=>{
      if (src.startsWith('data:')) return src;
      const response=await fetch(src);
      if(!response.ok) throw Error('Foto no disponible');
      const blob=await response.blob();
      return await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=reject;
        reader.readAsDataURL(blob);
      });
    }));
    const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+
      safe(title(v))+'</title><style>body{font:17px system-ui;color:#172522;max-width:850px;margin:auto;padding:24px}img{width:100%;border-radius:12px;margin-bottom:12px}h1{font-size:2.4rem}a{color:#245730}</style><main><p>VITRINA MOTOR</p><h1>'+safe(title(v))+
      '</h1><p>'+tags(v)+'</p><h2>'+currency.format(v.price)+'</h2><p>'+details(v)+'</p><p>'+safe(v.description)+'</p>'+
      (contact?'<p><a href="'+safe(contact)+'">Consultar por WhatsApp</a></p>':'')+
      images.map(src=>photo(src,title(v))).join('')+'</main></html>';
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;a.download='ficha-vehiculo.html';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  } catch { notify('No se pudo descargar la ficha.'); }
}
function renderPhotos() {
  $('photo-list').innerHTML=pictures.map((src,i)=>'<div>'+photo(src,'Foto '+(i+1))+
    '<button type="button" class="secondary" data-cover="'+i+'" '+(i===0?'disabled':'')+'>'+(i===0?'Portada':'Usar de portada')+
    '</button><button type="button" class="secondary" data-remove="'+i+'">Quitar</button></div>').join('');
}
function edit(v) {
  editing=v?.id??null;
  pictures=[...(v?.photos??[])];
  form.reset();
  $('form-status').textContent='';
  $('editor-title').textContent=v?'Editar vehículo':'Agregar vehículo';
  if(v) for(const name of ['brand','model','year','km','price','transmission','fuel','status','description','finance','trade']) {
    const field=form.elements[name];
    if(field.type==='checkbox') field.checked=v[name];
    else field.value=v[name];
  }
  renderPhotos();
  $('editor').showModal();
}
async function resize(file) {
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,850/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.72);
  } finally { bitmap.close(); }
}
$('photos').onchange=async event=>{
  const files=[...event.target.files];
  event.target.value='';
  const status=$('form-status');
  if(files.length+pictures.length>5 || files.some(f=>f.size>15000000 || !['image/jpeg','image/png','image/webp'].includes(f.type))) {
    status.textContent='Selecciona hasta 5 imágenes JPG, PNG o WebP de menos de 15 MB cada una.';return;
  }
  $('save-vehicle').disabled=true;
  $('photos').disabled=true;
  status.textContent='Preparando fotos…';
  try {
    pictures.push(...await Promise.all(files.map(resize)));
    renderPhotos();status.textContent='';
  } catch {status.textContent='No se pudo leer una de las fotos.';}
  finally {$('save-vehicle').disabled=false;$('photos').disabled=false;}
};
$('photo-list').onclick=event=>{
  const {cover,remove}=event.target.dataset;
  if(cover!==undefined) pictures.unshift(pictures.splice(Number(cover),1)[0]);
  if(remove!==undefined) pictures.splice(Number(remove),1);
  renderPhotos();
};
form.onsubmit=event=>{
  event.preventDefault();
  const f=new FormData(form);
  const v={id:editing??crypto.randomUUID(),photos:[...pictures]};
  for(const k of ['brand','model','description','transmission','fuel','status']) v[k]=String(f.get(k)).trim();
  for(const k of ['year','km','price']) v[k]=Number(f.get(k));
  for(const k of ['finance','trade']) v[k]=f.has(k);
  if(!v.brand || !v.model || (active(v) && !v.photos.length)) {
    $('form-status').textContent='Escribe la marca y el modelo. Para publicar el vehículo, agrega al menos una foto.';
    return;
  }
  const vehicles=editing?data.vehicles.map(item=>item.id===editing?v:item):[v,...data.vehicles];
  if(persist({...data,vehicles})) {$('editor').close();renderInventory();notify('Vehículo guardado.');}
};
$('phone').value=data.phone;
$('save-phone').onclick=()=>{
  const phone=$('phone').value.replace(/[\s()+-]/g,'');
  if(phone&&!/^\d{8,15}$/.test(phone)){notify('Usa el indicativo del país y el número de WhatsApp.');return;}
  if(persist({...data,phone})){ $('phone').value=phone;notify('WhatsApp guardado.');}
};
document.addEventListener('click',event=>{
  const b=event.target.closest('button');
  if (!b) return;
  if (b.dataset.close && !(b.dataset.close==='editor' && $('photos').disabled)) $(b.dataset.close).close();
  const v=data.vehicles.find(item=>item.id===(b.dataset.view??b.dataset.edit));
  if(v&&b.dataset.view) display(v,true);
  if(v&&b.dataset.edit) edit(v);
});
$('editor').addEventListener('cancel',event=>{if($('photos').disabled)event.preventDefault();});
$('catalog-tab').onclick=()=>view('catalog');
$('inventory-tab').onclick=()=>view('inventory');
$('add').onclick=()=>edit();
filters.onsubmit=event=>event.preventDefault();
filters.oninput=renderCatalog;
$('clear').onclick=()=>{filters.reset();renderCatalog();};
function showShared() {
  if (!location.hash.startsWith('#ficha=')) return;
  try {
    const v=JSON.parse(decodeURIComponent(location.hash.slice(7)));
    if(!active(v)||typeof v.brand!=='string'||typeof v.model!=='string'||!Array.isArray(v.photos)||
      !Number.isFinite(v.price)||!Number.isFinite(v.km)) throw Error('invalid');
    v.photos=v.photos.filter(isImage).slice(0,5);
    display(v);
  } catch {notify('El enlace de la ficha no es válido.');}
}
window.addEventListener('hashchange',showShared);
renderCatalog();
showShared();
