
const state = {
  settings: {},
  menu: [],
  promos: { promocodes: [] },
  zones: { day: null, night: null, base: null },
  currentZoneSource: 'day',
  selectedMenuIndex: -1,
  selectedPromoIndex: -1,
  map: null,
  drawnItems: null,
};
const qs=(s,e=document)=>e.querySelector(s); const qsa=(s,e=document)=>[...e.querySelectorAll(s)];
const PATHS = { settings:'data/settings.json', menu:'data/menu.json', promos:'data/promokod.json', day:'data/zones_day.geojson', night:'data/zones_night.geojson', base:'data/zones.geojson' };

async function api(path, opts={}) {
  const res = await fetch(path, { credentials:'include', headers:{'Content-Type':'application/json', ...(opts.headers||{})}, ...opts });
  if (res.status===401) { location.href='/login'; throw new Error('Требуется вход'); }
  const text = await res.text(); let data;
  try{ data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || 'Ошибка запроса');
  return data;
}
function notice(msg, type='ok'){ const n=qs('#notice'); n.textContent=msg; n.className=`notice ${type==='ok'?'ok':'err'}`; setTimeout(()=>n.className='notice',3500); }
function esc(s=''){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function slugify(str=''){ return String(str).trim().toLowerCase().replace(/ё/g,'e').replace(/[^a-zа-я0-9]+/gi,'-').replace(/^-+|-+$/g,''); }
function pretty(obj){ return JSON.stringify(obj, null, 2); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function getCurrentZones(){ return state.zones[state.currentZoneSource] || {type:'FeatureCollection',features:[]}; }
function setCurrentZones(v){ state.zones[state.currentZoneSource] = v; }

async function savePath(path, content){
  return api('/api/file', { method:'POST', body: JSON.stringify({ path, content }) });
}
async function uploadAsset(file, targetPath){
  const b64 = await fileToBase64(file);
  return api('/api/asset', { method:'POST', body: JSON.stringify({ path: targetPath, contentBase64: b64, message: `Upload ${targetPath}` }) });
}
function fileToBase64(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(',')[1]); r.onerror=reject; r.readAsDataURL(file); }); }

function bindTabs(){
  qsa('.nav button').forEach(btn=>btn.onclick=()=>{
    qsa('.nav button').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    qsa('.section').forEach(s=>s.classList.remove('active')); qs(`#tab-${btn.dataset.tab}`).classList.add('active');
    const titles={dashboard:'Обзор',settings:'Настройки сайта',menu:'Меню',promos:'Промокоды',banners:'Акции и баннеры',zones:'Зоны доставки',raw:'Raw JSON'};
    qs('#pageTitle').textContent=titles[btn.dataset.tab]||'Панель';
    if(btn.dataset.tab==='zones') setTimeout(initMapIfNeeded, 30);
  });
}
function renderDashboard(){
  qs('#statMenu').textContent = state.menu.length;
  qs('#statCats').textContent = new Set(state.menu.map(x=>x.category).filter(Boolean)).size;
  qs('#statPromos').textContent = (state.promos.promocodes||[]).length;
  qs('#statZones').textContent = (getCurrentZones().features||[]).length;
  qs('#dashboardSummary').innerHTML = `Сайт: <b>${esc(state.settings.siteName||'Прожарим')}</b><br>Логотип: <span class="mono">${esc(state.settings.logo||'')}</span><br>Баннеров акций: <b>${(state.settings.promotions||[]).length}</b><br>Точек самовывоза: <b>${(state.settings.pickupAddresses||[]).length}</b>`;
}
function fillSettingsForm(){
  const s=state.settings||{};
  for (const key of ['metaTitle','metaDescription','siteName','siteSub','heroBadge','heroTitleHtml','heroDesc','logo','favicon','footerText']) {
    const el=qs('#s-'+key); if (el) el.value = s[key] || '';
  }
  qs('#s-pickupAddresses').value=(s.pickupAddresses||[]).join('\n');
  qs('#s-contacts').value=pretty(s.contacts||[]);
  qs('#s-socials').value=pretty(s.socials||[]);
  qs('#s-heroStats').value=pretty(s.heroStats||[]);
  qs('#s-deliveryInfo').value=pretty(s.deliveryInfo||{});
  if(s.logo){ qs('#logoPreview').src=s.logo; qs('#logoPreview').classList.remove('hidden'); }
  if(s.favicon){ qs('#faviconPreview').src=s.favicon; qs('#faviconPreview').classList.remove('hidden'); }
}
function readSettingsForm(){
  const out={};
  for (const key of ['metaTitle','metaDescription','siteName','siteSub','heroBadge','heroTitleHtml','heroDesc','logo','favicon','footerText']) out[key]=qs('#s-'+key).value.trim();
  out.pickupAddresses = qs('#s-pickupAddresses').value.split('\n').map(s=>s.trim()).filter(Boolean);
  out.contacts = JSON.parse(qs('#s-contacts').value || '[]');
  out.socials = JSON.parse(qs('#s-socials').value || '[]');
  out.heroStats = JSON.parse(qs('#s-heroStats').value || '[]');
  out.deliveryInfo = JSON.parse(qs('#s-deliveryInfo').value || '{}');
  out.promotions = state.settings.promotions || [];
  return out;
}
function renderCategoryFilter(){
  const cats=['', ...new Set(state.menu.map(x=>x.category).filter(Boolean))];
  qs('#menuCategoryFilter').innerHTML = cats.map(c=>`<option value="${esc(c)}">${esc(c||'Все категории')}</option>`).join('');
}
function filteredMenu(){
  const q=(qs('#menuSearch').value||'').trim().toLowerCase(); const c=qs('#menuCategoryFilter').value;
  return state.menu.map((item,index)=>({item,index})).filter(({item})=>{
    const okQ=!q || String(item.name||'').toLowerCase().includes(q) || String(item.id||'').toLowerCase().includes(q);
    const okC=!c || item.category===c; return okQ&&okC;
  });
}
function renderMenuList(){
  renderCategoryFilter();
  const wrap=qs('#menuList'); const list=filteredMenu();
  wrap.innerHTML = list.map(({item,index})=>`<div class="item ${state.selectedMenuIndex===index?'active':''}" data-i="${index}"><div class="name">${esc(item.name||'Без названия')}</div><div class="meta">${esc(item.category||'Без категории')} • ${esc(item.weight||'')} • ${Number(item.price||0)} ₽</div>${item.hit?'<span class="badge">hit</span>':''}${item.hidden?'<span class="badge">hidden</span>':''}</div>`).join('') || '<div class="muted">Нет позиций</div>';
  qsa('.item',wrap).forEach(el=>el.onclick=()=>{ state.selectedMenuIndex=Number(el.dataset.i); fillMenuForm(); renderMenuList(); });
}
function fillMenuForm(){
  const item=state.menu[state.selectedMenuIndex] || {};
  ['id','category','name','desc','price','weight','img'].forEach(k=>qs('#m-'+k).value=item[k]??'');
  qs('#m-hit').checked=!!item.hit; qs('#m-hidden').checked=!!item.hidden;
  const extras = {};
  Object.keys(item).forEach(k=>{ if(/^(price|weight|label|variant|size|img)\d+$/.test(k)) extras[k]=item[k]; });
  qs('#m-extras').value=pretty(extras);
}
function readMenuForm(){
  const base={ id:qs('#m-id').value.trim() || slugify(qs('#m-name').value), category:qs('#m-category').value.trim(), name:qs('#m-name').value.trim(), desc:qs('#m-desc').value.trim(), price:Number(qs('#m-price').value||0), weight:qs('#m-weight').value.trim(), img:qs('#m-img').value.trim(), hit:qs('#m-hit').checked };
  if(qs('#m-hidden').checked) base.hidden=true;
  const extras = JSON.parse(qs('#m-extras').value || '{}');
  return { ...base, ...extras };
}
function renderPromoList(){
  const arr=state.promos.promocodes||[]; const wrap=qs('#promoList');
  wrap.innerHTML=arr.map((p,i)=>`<div class="item ${state.selectedPromoIndex===i?'active':''}" data-i="${i}"><div class="name">${esc(p.title||p.code)}</div><div class="meta">${esc(p.code)} • ${Number(p.percent||0)}% • ${p.active?'active':'inactive'}</div></div>`).join('') || '<div class="muted">Нет промокодов</div>';
  qsa('.item',wrap).forEach(el=>el.onclick=()=>{ state.selectedPromoIndex=Number(el.dataset.i); fillPromoForm(); renderPromoList(); });
}
function fillPromoForm(){ const p=state.promos.promocodes?.[state.selectedPromoIndex] || {}; qs('#p-title').value=p.title||''; qs('#p-code').value=p.code||''; qs('#p-percent').value=p.percent||0; qs('#p-active').checked=!!p.active; }
function readPromoForm(){ return { title:qs('#p-title').value.trim(), code:qs('#p-code').value.trim(), percent:Number(qs('#p-percent').value||0), active:qs('#p-active').checked }; }
function renderBanners(){
  const list=(state.settings.promotions||[]); const order=qs('#bannerOrder'); const listWrap=qs('#bannerList');
  order.innerHTML=list.map((b,i)=>`<div class="item"><div class="row"><img src="/${esc(b.img)}" class="assetPreview"><div><div class="name">${esc(b.title||b.alt||`Баннер ${i+1}`)}</div><div class="meta mono">${esc(b.img)}</div><div class="row" style="margin-top:10px"><button class="btn2" data-move="up" data-i="${i}">↑</button><button class="btn2" data-move="down" data-i="${i}">↓</button><button class="btnDanger" data-del="${i}">Удалить</button></div></div></div></div>`).join('') || '<div class="muted">Баннеров пока нет</div>';
  listWrap.innerHTML=list.map((b,i)=>`<div class="item"><img src="/${esc(b.img)}" class="assetPreview"><div class="meta mono">${esc(b.img)}</div></div>`).join('') || '<div class="muted">SVG не загружены</div>';
  qsa('[data-move]',order).forEach(btn=>btn.onclick=()=>{ const i=Number(btn.dataset.i), dir=btn.dataset.move; const arr=state.settings.promotions; const j=dir==='up'?i-1:i+1; if(j<0||j>=arr.length)return; [arr[i],arr[j]]=[arr[j],arr[i]]; renderBanners(); syncRaw(); });
  qsa('[data-del]',order).forEach(btn=>btn.onclick=()=>{ state.settings.promotions.splice(Number(btn.dataset.del),1); renderBanners(); syncRaw(); notice('Баннер удалён из списка показа. SVG файл в репозитории остаётся.'); });
}
function syncRaw(){ qs('#rawSettings').value=pretty(state.settings); qs('#rawMenu').value=pretty(state.menu); qs('#rawPromos').value=pretty(state.promos); qs('#rawZones').value=pretty(getCurrentZones()); }
function renderAll(){ renderDashboard(); fillSettingsForm(); renderMenuList(); fillMenuForm(); renderPromoList(); fillPromoForm(); renderBanners(); renderZoneList(); syncRaw(); }

async function loadAll(){
  const [settings, menu, promos, day, night, base] = await Promise.all([
    api('/api/file?path='+encodeURIComponent(PATHS.settings)).then(r=>r.content).catch(()=>({})),
    api('/api/file?path='+encodeURIComponent(PATHS.menu)).then(r=>r.content),
    api('/api/file?path='+encodeURIComponent(PATHS.promos)).then(r=>r.content),
    api('/api/file?path='+encodeURIComponent(PATHS.day)).then(r=>r.content).catch(()=>({type:'FeatureCollection',features:[]})),
    api('/api/file?path='+encodeURIComponent(PATHS.night)).then(r=>r.content).catch(()=>({type:'FeatureCollection',features:[]})),
    api('/api/file?path='+encodeURIComponent(PATHS.base)).then(r=>r.content).catch(()=>({type:'FeatureCollection',features:[]})),
  ]);
  state.settings=settings||{}; state.menu=menu||[]; state.promos=promos||{promocodes:[]}; state.zones={day:day||{type:'FeatureCollection',features:[]}, night:night||{type:'FeatureCollection',features:[]}, base:base||{type:'FeatureCollection',features:[]}};
  state.selectedMenuIndex = state.menu.length ? 0 : -1; state.selectedPromoIndex = state.promos.promocodes?.length ? 0 : -1;
  renderAll(); refreshMapData();
}
async function saveAll(){
  await Promise.all([
    savePath(PATHS.settings, state.settings),
    savePath(PATHS.menu, state.menu),
    savePath(PATHS.promos, state.promos),
    savePath(PATHS.day, state.zones.day),
    savePath(PATHS.night, state.zones.night),
    savePath(PATHS.base, state.zones.base),
  ]);
}
function bindActions(){
  bindTabs();
  qs('#reloadBtn').onclick=()=>loadAll().then(()=>notice('Данные обновлены')).catch(e=>notice(e.message,'err'));
  qs('#saveAllBtn').onclick=()=>saveAll().then(()=>notice('Все изменения сохранены')).catch(e=>notice(e.message,'err'));
  qs('#logoutBtn').onclick=async()=>{ try{ await api('/api/logout',{method:'POST',body:'{}'}) }catch{} location.href='/login'; };
  qs('#settingsForm').onsubmit=(e)=>{ e.preventDefault(); try{ state.settings=readSettingsForm(); renderDashboard(); renderBanners(); syncRaw(); notice('Настройки применены локально'); }catch(err){ notice('Ошибка в JSON полях настроек: '+err.message,'err'); } };
  qs('#logoUpload').onchange=async(e)=>{ const f=e.target.files?.[0]; if(!f)return; const ext=(f.name.split('.').pop()||'png').toLowerCase(); const target=`assets/logo-admin.${ext}`; try{ await uploadAsset(f,target); qs('#s-logo').value=target; state.settings.logo=target; fillSettingsForm(); syncRaw(); notice('Логотип загружен'); }catch(err){ notice(err.message,'err'); } };
  qs('#faviconUpload').onchange=async(e)=>{ const f=e.target.files?.[0]; if(!f)return; const ext=(f.name.split('.').pop()||'png').toLowerCase(); const target=`assets/favicon-admin.${ext}`; try{ await uploadAsset(f,target); qs('#s-favicon').value=target; state.settings.favicon=target; fillSettingsForm(); syncRaw(); notice('Favicon загружен'); }catch(err){ notice(err.message,'err'); } };

  qs('#menuSearch').oninput=renderMenuList; qs('#menuCategoryFilter').onchange=renderMenuList;
  qs('#newItemBtn').onclick = ()=>{ state.menu.unshift({id:`new-item-${Date.now()}`, category:'', name:'Новый товар', desc:'', price:0, weight:'', img:'', hit:false}); state.selectedMenuIndex=0; renderMenuList(); fillMenuForm(); };
  qs('#quickNewItem').onclick=()=>{ qsa('.nav button').find(b=>b.dataset.tab==='menu').click(); qs('#newItemBtn').click(); };
  qs('#menuForm').onsubmit=(e)=>{ e.preventDefault(); try{ const item=readMenuForm(); if(!item.name) throw new Error('Введите название'); if(state.selectedMenuIndex<0){ state.menu.unshift(item); state.selectedMenuIndex=0; } else state.menu[state.selectedMenuIndex]=item; renderMenuList(); syncRaw(); renderDashboard(); notice('Товар обновлён'); }catch(err){ notice(err.message,'err'); } };
  qs('#cloneItemBtn').onclick=()=>{ if(state.selectedMenuIndex<0)return; const src=clone(state.menu[state.selectedMenuIndex]); src.id=`${src.id}-copy-${Date.now()}`; src.name=`${src.name} (копия)`; state.menu.splice(state.selectedMenuIndex+1,0,src); state.selectedMenuIndex+=1; renderMenuList(); fillMenuForm(); syncRaw(); };
  qs('#deleteItemBtn').onclick=()=>{ if(state.selectedMenuIndex<0)return; state.menu.splice(state.selectedMenuIndex,1); state.selectedMenuIndex=state.menu.length?0:-1; renderMenuList(); fillMenuForm(); syncRaw(); renderDashboard(); notice('Товар удалён'); };
  qs('#menuImageUpload').onchange=async(e)=>{ const f=e.target.files?.[0]; if(!f)return; const ext=(f.name.split('.').pop()||'webp').toLowerCase(); const clean=(qs('#m-name').value.trim() || f.name).replace(/[\\/:*?"<>|]+/g,'').trim(); const target=`assets/photos/${clean}.${ext}`; try{ await uploadAsset(f,target); qs('#m-img').value=target; notice('Фото блюда загружено'); }catch(err){ notice(err.message,'err'); } };

  qs('#newPromoBtn').onclick=()=>{ state.promos.promocodes.unshift({title:'Новый промокод', code:`promo${Date.now()}`, percent:10, active:true}); state.selectedPromoIndex=0; renderPromoList(); fillPromoForm(); };
  qs('#quickNewPromo').onclick=()=>{ qsa('.nav button').find(b=>b.dataset.tab==='promos').click(); qs('#newPromoBtn').click(); };
  qs('#promoForm').onsubmit=(e)=>{ e.preventDefault(); const p=readPromoForm(); if(!p.code){ notice('Введите код промокода','err'); return; } if(state.selectedPromoIndex<0){ state.promos.promocodes.unshift(p); state.selectedPromoIndex=0; } else state.promos.promocodes[state.selectedPromoIndex]=p; renderPromoList(); syncRaw(); renderDashboard(); notice('Промокод обновлён'); };
  qs('#deletePromoBtn').onclick=()=>{ if(state.selectedPromoIndex<0)return; state.promos.promocodes.splice(state.selectedPromoIndex,1); state.selectedPromoIndex=state.promos.promocodes.length?0:-1; renderPromoList(); fillPromoForm(); syncRaw(); renderDashboard(); notice('Промокод удалён'); };

  qs('#addBannerBtn').onclick=async()=>{ const f=qs('#bannerUpload').files?.[0]; if(!f){ notice('Выбери SVG файл','err'); return; } const clean=f.name.replace(/[^a-zA-Z0-9._-]+/g,'-'); const target=`assets/promos/${clean}`; try{ await uploadAsset(f,target); state.settings.promotions = state.settings.promotions || []; state.settings.promotions.push({ img: target, alt: clean, title: clean.replace(/\.[^.]+$/,''), text:'' }); renderBanners(); syncRaw(); notice('SVG баннер загружен и добавлен в список'); }catch(err){ notice(err.message,'err'); } };
  qs('#quickBanner').onclick=()=>{ qsa('.nav button').find(b=>b.dataset.tab==='banners').click(); qs('#bannerUpload').click(); };

  qsa('[data-zone-source]').forEach(btn=>btn.onclick=()=>{ qsa('[data-zone-source]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.currentZoneSource=btn.dataset.zoneSource; refreshMapData(); renderZoneList(); syncRaw(); renderDashboard(); });
  qs('#newZoneMetaBtn').onclick=()=>{ refreshMapData(); renderZoneList(); syncRaw(); notice('Список зон обновлён'); };

  qs('#applyRawSettings').onclick=()=>{ try{ state.settings=JSON.parse(qs('#rawSettings').value); renderAll(); notice('settings.json применён'); }catch(err){ notice(err.message,'err'); } };
  qs('#applyRawMenu').onclick=()=>{ try{ state.menu=JSON.parse(qs('#rawMenu').value); state.selectedMenuIndex=state.menu.length?0:-1; renderAll(); notice('menu.json применён'); }catch(err){ notice(err.message,'err'); } };
  qs('#applyRawPromos').onclick=()=>{ try{ state.promos=JSON.parse(qs('#rawPromos').value); state.selectedPromoIndex=state.promos.promocodes?.length?0:-1; renderAll(); notice('promokod.json применён'); }catch(err){ notice(err.message,'err'); } };
  qs('#applyRawZones').onclick=()=>{ try{ setCurrentZones(JSON.parse(qs('#rawZones').value)); refreshMapData(); renderZoneList(); notice('GeoJSON применён'); }catch(err){ notice(err.message,'err'); } };
}

function initMapIfNeeded(){
  if(state.map) return;
  state.map = L.map('adminMap').setView([51.7682, 55.0969], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution:'© OpenStreetMap' }).addTo(state.map);
  state.drawnItems = new L.FeatureGroup().addTo(state.map);
  const drawControl = new L.Control.Draw({
    edit: { featureGroup: state.drawnItems },
    draw: { polyline:false, rectangle:true, circle:false, marker:false, circlemarker:false, polygon:true }
  });
  state.map.addControl(drawControl);
  state.map.on(L.Draw.Event.CREATED, e=>{
    const layer = e.layer; state.drawnItems.addLayer(layer);
    const feature = layer.toGeoJSON();
    feature.properties = { zone:`Новая зона ${getCurrentZones().features.length+1}`, restaurant:'', deliveryPrice:0 };
    getCurrentZones().features.push(feature);
    bindZoneLayer(layer, feature);
    renderZoneList(); syncRaw(); renderDashboard();
  });
  state.map.on(L.Draw.Event.EDITED, ()=> exportMapToGeoJSON());
  state.map.on(L.Draw.Event.DELETED, ()=> exportMapToGeoJSON());
  refreshMapData();
}
function bindZoneLayer(layer, feature){
  const p=feature.properties||{};
  layer.bindPopup(`<b>${esc(p.zone||'Зона')}</b><br>${esc(p.restaurant||'')}<br>${Number(p.deliveryPrice||0)} ₽`);
}
function exportMapToGeoJSON(){
  const fc = { type:'FeatureCollection', features:[] };
  state.drawnItems.eachLayer(layer=>{
    const f = layer.toGeoJSON();
    f.properties = layer.feature?.properties || f.properties || { zone:'Зона', restaurant:'', deliveryPrice:0 };
    fc.features.push(f);
  });
  setCurrentZones(fc); renderZoneList(); syncRaw(); renderDashboard();
}
function refreshMapData(){
  if(!state.map || !state.drawnItems) return;
  state.drawnItems.clearLayers();
  const fc = getCurrentZones();
  const layers=[];
  (fc.features||[]).forEach(feature=>{
    const layer=L.geoJSON(feature).getLayers()[0];
    if(!layer) return;
    layer.feature = clone(feature);
    bindZoneLayer(layer, feature);
    state.drawnItems.addLayer(layer); layers.push(layer);
  });
  if(layers.length){ const group = new L.featureGroup(layers); state.map.fitBounds(group.getBounds().pad(0.12)); }
}
function renderZoneList(){
  const wrap=qs('#zoneList'); const features=getCurrentZones().features||[];
  wrap.innerHTML = features.map((f,i)=>`<div class="zoneItem"><div><strong>${esc(f.properties?.zone||`Зона ${i+1}`)}</strong></div><div class="small muted">${esc(f.properties?.restaurant||'')}</div><div class="small">${Number(f.properties?.deliveryPrice||0)} ₽</div><div class="row" style="margin-top:10px"><input class="input" data-zone-name="${i}" value="${esc(f.properties?.zone||'')}"><input class="input" data-zone-restaurant="${i}" value="${esc(f.properties?.restaurant||'')}"><input class="input" type="number" data-zone-price="${i}" value="${Number(f.properties?.deliveryPrice||0)}"><button class="btnDanger" data-zone-del="${i}">Удалить</button></div></div>`).join('') || '<div class="muted">Нет зон</div>';
  qsa('[data-zone-name]').forEach(el=>el.oninput=()=>{ features[Number(el.dataset.zoneName)].properties.zone=el.value; refreshMapData(); syncRaw(); });
  qsa('[data-zone-restaurant]').forEach(el=>el.oninput=()=>{ features[Number(el.dataset.zoneRestaurant)].properties.restaurant=el.value; refreshMapData(); syncRaw(); });
  qsa('[data-zone-price]').forEach(el=>el.oninput=()=>{ features[Number(el.dataset.zonePrice)].properties.deliveryPrice=Number(el.value||0); refreshMapData(); syncRaw(); });
  qsa('[data-zone-del]').forEach(btn=>btn.onclick=()=>{ features.splice(Number(btn.dataset.zoneDel),1); refreshMapData(); renderZoneList(); syncRaw(); renderDashboard(); });
}

async function boot(){
  await api('/api/session');
  bindActions();
  await loadAll();
}
boot().catch(err=>notice(err.message,'err'));
