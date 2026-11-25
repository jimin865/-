/* 이단·사이비 정보 레이어 — 기존 제보 지도(Leaflet) 위에 "얹기만" 합니다.
   기존 제보 마커·제보하기·위치 알림 코드는 건드리지 않고, 별도 레이어/별도 DOM으로 동작합니다.
   데이터: data/heresy.kml (Google 내 지도에서 내려받은 KML). 없으면 구글 원본 주소를 시도하고, 모두 실패하면 원본 지도 링크를 안내합니다. */
(function(){
'use strict';
const MID='1gWkHv_Qkwql726xjLd1wFXRl-32Sceo';
const URLS=['data/heresy.kml','https://www.google.com/maps/d/kml?mid='+MID+'&forcekml=1'];
const VIEW='https://www.google.com/maps/d/viewer?mid='+MID;
const BASE='#6D3FC4';
const LV=[['밀집','#4C1D95'],['보통','#8B5CF6'],['드묾','#C4B5FD']];   // 밀집도 3단계 (색)
const R_NEAR=3000;
const R_LIST=5000;                                                  // 목록에 보여 줄 내 주변 반경(m)                                                  // 밀집도 계산 반경(m)
/* 시·도별 기준 도시 좌표(위도,경도). 주소가 없을 때 가장 가까운 기준점의 시·도로 분류 */
const CITY={
 서울:[[37.57,126.98],[37.50,127.03],[37.55,126.85],[37.65,127.06]],부산:[[35.18,129.08],[35.16,129.16],[35.10,128.97]],
 대구:[[35.87,128.60],[35.77,128.43]],인천:[[37.46,126.71],[37.51,126.72],[37.75,126.49]],광주:[[35.16,126.85]],대전:[[36.35,127.38]],울산:[[35.54,129.31]],세종:[[36.48,127.29]],
 경기:[[37.26,127.03],[37.42,127.13],[37.66,126.83],[37.24,127.18],[37.50,126.77],[37.32,126.83],[37.64,127.22],[37.20,126.83],[36.99,127.11],[37.74,127.03],[37.76,126.78],[37.43,127.26],[37.49,127.49],[37.89,127.20],[37.27,127.44]],
 강원:[[37.88,127.73],[37.34,127.92],[37.75,128.88],[38.21,128.59],[37.52,129.11],[37.18,128.46],[38.15,127.31]],
 충북:[[36.64,127.49],[36.99,127.93],[37.13,128.19],[36.49,127.73],[36.17,127.78]],
 충남:[[36.82,127.11],[36.45,127.12],[36.33,126.61],[36.78,126.45],[36.19,127.10],[36.89,126.63],[36.60,126.66]],
 전북:[[35.82,127.15],[35.97,126.74],[35.95,126.96],[35.57,126.86],[35.42,127.39]],
 전남:[[34.81,126.39],[34.76,127.66],[34.95,127.49],[35.02,126.71],[34.57,126.60],[35.32,126.99],[34.31,126.76]],
 경북:[[36.02,129.34],[35.86,129.22],[36.14,128.11],[36.57,128.73],[36.12,128.34],[35.83,128.74],[36.41,128.16],[36.99,129.40]],
 경남:[[35.23,128.68],[35.18,128.11],[34.85,128.43],[35.23,128.89],[35.50,128.75],[34.88,128.62],[35.69,127.91]],
 제주:[[33.50,126.53],[33.25,126.56]]};
const SHORT={충청북:'충북',충청남:'충남',전라북:'전북',전라남:'전남',경상북:'경북',경상남:'경남'};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(s,r)=>(r||document).querySelector(s);
const fmt=m=>m<1000?Math.round(m/10)*10+'m':(m/1000).toFixed(1)+'km';
const hav=(a,b)=>{const dy=(b.lat-a.lat)*110540,dx=(b.lng-a.lng)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(dx,dy);};

/* ---------- KML 읽기 ---------- */
function htmlText(h){return new DOMParser().parseFromString(String(h||'').replace(/<br\s*\/?>/gi,'\n'),'text/html').body.textContent.trim();}
function parseKML(txt){
  const doc=new DOMParser().parseFromString(txt,'text/xml');
  if(doc.querySelector('parsererror'))return [];
  const out=[],kid=(el,t)=>el&&[...el.children].find(e=>e.tagName===t);
  doc.querySelectorAll('Placemark').forEach(pm=>{
    const c=pm.querySelector('Point > coordinates');if(!c)return;          // 점(핀)만 사용
    const p=c.textContent.trim().split(',').map(Number),lng=p[0],lat=p[1];
    if(!isFinite(lat)||!isFinite(lng))return;
    let addr='';
    pm.querySelectorAll('Data').forEach(d=>{if(/주소|addr/i.test(d.getAttribute('name')||'')){const v=kid(d,'value');if(v)addr=v.textContent.trim();}});
    const f=pm.closest('Folder');
    let desc=htmlText((kid(pm,'description')||{}).textContent);
    if(!addr){const L=desc.split('\n');addr=L[0].trim();desc=L.slice(1).join('\n').trim();}   // 내 지도는 주소를 설명란 첫 줄에 적음
    out.push({name:(kid(pm,'name')||{}).textContent||'',group:((kid(f,'name')||{}).textContent||'').trim()||'미분류',desc,addr,lat,lng});
  });
  return out;
}
/* ---------- 분류 ---------- */
function regionOf(it){
  const m=(it.addr||'').match(/^\s*(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충북|충청남|충남|전라북|전북|전라남|전남|경상북|경북|경상남|경남|제주)/);
  if(m)return SHORT[m[1]]||m[1];
  let best='해외',bd=1.5;                                                   // 기준 도시에서 멀면(해외 등) '해외'
  for(const s in CITY)for(const c of CITY[s]){const d=Math.hypot(c[0]-it.lat,(c[1]-it.lng)*.8);if(d<bd){bd=d;best=s;}}
  return best;
}
function density(items){            // 각 지점 반경 3km 안의 지점 수 → 상위 15% 밀집 / 다음 40% 보통 / 나머지 드묾
  const G=.04,grid=new Map(),K=(a,b)=>a+','+b;
  items.forEach(it=>{const k=K(Math.floor(it.lat/G),Math.floor(it.lng/G));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(it);});
  items.forEach(it=>{let n=0;const a=Math.floor(it.lat/G),b=Math.floor(it.lng/G);
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)(grid.get(K(a+i,b+j))||[]).forEach(o=>{if(hav(it,o)<=R_NEAR)n++;});
    it.n=n;});
  const s=items.map(i=>i.n).sort((a,b)=>a-b);
  const mid=s[Math.floor(s.length*.6)]||1,hi=Math.max(s[Math.floor(s.length*.85)]||2,mid+1);
  items.forEach(it=>{it.lv=it.n>=hi?0:it.n>=mid?1:2;});
  return {mid,hi};
}
/* ---------- 상태·화면 ---------- */
let map=null,getUser=()=>null,rend=null,layer=null,all=[],cut={mid:2,hi:3},topG=[],loaded=false;
const S={mode:'all',val:null,on:true};
const MODES=[['all','전체'],['region','지역별'],['group','단체별'],['dens','밀집도']];
const pop=it=>`<b>${esc(it.name||'이름 없음')}</b><br><span style="color:#5C6780">${esc(it.group)} · ${esc(it.region)}</span>${it.addr?'<br>'+esc(it.addr):''}${it.desc?'<br><small>'+esc(it.desc.slice(0,240))+'</small>':''}`;
const count=(arr,k)=>{const m={};arr.forEach(i=>m[i[k]]=(m[i[k]]||0)+1);return Object.entries(m).sort((a,b)=>b[1]-a[1]);};

function visible(){
  const q=(($('#map-q')||{}).value||'').trim();
  return all.filter(it=>{
    if(S.mode==='region'&&S.val&&it.region!==S.val)return false;
    if(S.mode==='group'&&S.val&&(S.val==='__etc'?topG.includes(it.group):it.group!==S.val))return false;
    if(S.mode==='dens'&&S.val!==null&&it.lv!==S.val)return false;
    return !q||(it.name+' '+it.group+' '+it.addr+' '+it.desc+' '+it.region).includes(q);
  });
}
function render(fit){
  if(!map||!loaded)return;
  if(layer)map.removeLayer(layer);
  const vis=visible(),dens=S.mode==='dens',useCl=!dens&&window.L.markerClusterGroup;
  layer=useCl?L.markerClusterGroup({chunkedLoading:true,showCoverageOnHover:false,maxClusterRadius:45,
    iconCreateFunction:c=>{const n=c.getChildCount();return L.divIcon({className:'',iconSize:[30,30],html:`<div class="hzc" style="background:${n>=100?'#4C1D95':n>=20?BASE:'#8B5CF6'}">${n}</div>`});}}):L.layerGroup();
  vis.forEach(it=>layer.addLayer(L.circleMarker([it.lat,it.lng],{renderer:rend,radius:dens?9-it.lv*1.5:6,color:'#fff',weight:1.5,
    fillColor:dens?LV[it.lv][1]:BASE,fillOpacity:.92}).bindPopup(()=>pop(it))));
  if(S.on)layer.addTo(map);
  if(fit&&vis.length&&S.mode!=='all')map.fitBounds(L.latLngBounds(vis.map(i=>[i.lat,i.lng])),{padding:[50,50],maxZoom:13});
  list(vis);
}
function list(vis){
  const sec=$('#hz-sec');sec.style.display=S.on?'flex':'none';if(!S.on)return;
  const u=getUser(),q=(($('#map-q')||{}).value||'').trim(),me=u&&{lat:u[0],lng:u[1]};
  if(!me&&!q){                                                        // 위치를 모르면 목록 대신 안내
    $('#hz-title').textContent='내 주변 이단 정보';
    $('#hz-list').innerHTML='<div class="empty">내 위치를 켜면 반경 5km 안의 정보만 보여 드려요<br><button class="hz-c" id="hz-loc" style="margin-top:10px;pointer-events:auto">내 위치 찾기</button></div>';
    return;
  }
  let a=vis.map(it=>({it,d:me?hav(me,it):null}));
  if(me&&!q)a=a.filter(x=>x.d<=R_LIST);                              // 검색 중이 아니면 반경 5km 안만
  if(me)a.sort((x,y)=>x.d-y.d);
  $('#hz-title').textContent=q?`검색 결과 ${a.length}곳`:`내 주변 5km 이단 정보 ${a.length}곳 · 가까운 순`;
  $('#hz-list').innerHTML=a.length?a.slice(0,30).map(({it,d})=>`<button class="row" data-id="${it.id}"><span class="dot hz">●</span><span class="t"><b>${esc(it.name||'이름 없음')}</b><span>${esc(it.group)} · ${esc(it.region)}</span></span>${d!=null?`<span class="dist">${fmt(d)}</span>`:''}</button>`).join('')
      +(a.length>30?`<div class="empty">가까운 30곳만 보여 드려요 (외 ${a.length-30}곳은 지도에서 확인)</div>`:'')
    :'<div class="empty">내 주변 5km 안에는 조건에 맞는 정보가 없어요</div>';
}
function bar(){
  $('#hz-modes').innerHTML=MODES.filter(m=>m[0]!=='group'||topG.length>1).map(m=>`<button class="hz-c m" data-mode="${m[0]}" aria-pressed="${S.mode===m[0]}">${m[1]}</button>`).join('');
  const chip=(v,t,dot)=>`<button class="hz-c s" data-val="${esc(v)}" aria-pressed="${String(S.val)===String(v)||(v===''&&S.val===null)}">${dot?`<i style="background:${dot}"></i>`:''}${esc(t)}</button>`;
  let h='';
  if(S.mode==='region')h=chip('','전체')+count(all,'region').map(([r,n])=>chip(r,`${r} ${n}`)).join('');
  else if(S.mode==='group'){const g=count(all,'group');h=chip('','전체')+g.slice(0,12).map(([r,n])=>chip(r,`${r} ${n}`)).join('')+(g.length>12?chip('__etc',`기타 ${g.length-12}곳`):'');}
  else if(S.mode==='dens')h=chip('','전체')+LV.map((l,i)=>chip(i,l[0],l[1])).join('')+`<span class="hz-note">반경 3km 안 ${cut.hi}곳↑ 밀집 · ${cut.mid}곳↑ 보통</span>`;
  $('#hz-sub').innerHTML=h;
}
function msg(t,link){$('#hz-sub').innerHTML=`<span class="hz-note">${esc(t)}${link?` <a href="${VIEW}" target="_blank" rel="noopener">원본 지도 열기</a>`:''}</span>`;}

async function load(){
  for(const u of URLS){
    try{const r=await fetch(u);if(!r.ok)continue;const a=parseKML(await r.text());if(a.length)return a;}catch(e){}
  }
  return null;
}
function build(){
  const wrap=$('#v-map .mapwrap');wrap.classList.add('hz-has');
  const st=document.createElement('style');st.textContent=`
.hz-has .mapbadge{top:auto;bottom:36px}
.hz-bar{position:absolute;left:0;right:0;top:72px;z-index:500;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.hz-r{display:flex;gap:6px;overflow-x:auto;padding:2px 16px;scrollbar-width:none}.hz-r::-webkit-scrollbar{display:none}
.hz-c{flex:none;pointer-events:auto;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600;background:var(--bg);border:1.5px solid var(--line);box-shadow:0 1px 6px rgba(0,0,0,.12);white-space:nowrap}
.hz-c[aria-pressed=true]{background:#5B21B6;border-color:#5B21B6;color:#fff}
.hz-c.m[aria-pressed=true]{background:var(--ink);border-color:var(--ink)}
.hz-c.rep[aria-pressed=true]{background:var(--red);border-color:var(--red)}
.hz-c i{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:6px;border:1.5px solid #fff;vertical-align:-1px}
.hz-note{flex:none;pointer-events:auto;background:rgba(255,255,255,.94);border-radius:10px;padding:4px 10px;font-size:12px;color:var(--sub)}
.hzc{width:30px;height:30px;border-radius:15px;color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.row .dot.hz{background:#EDE7FB;color:#5B21B6;font-size:14px}
.hz-hide-reports .leaflet-marker-icon:has(.cnt){display:none}`;
  document.head.appendChild(st);
  const b=document.createElement('div');b.className='hz-bar';
  b.innerHTML=`<div class="hz-r"><button class="hz-c" data-t="on" aria-pressed="true">이단 정보</button><button class="hz-c rep" data-t="rep" aria-pressed="true">사용자 제보</button></div><div class="hz-r" id="hz-modes"></div><div class="hz-r" id="hz-sub"></div>`;
  wrap.appendChild(b);
  const sec=document.createElement('div');sec.className='sec';sec.id='hz-sec';sec.style.cssText='gap:8px;border-top:1px solid var(--line);padding-top:12px';
  sec.innerHTML=`<div class="sec-head"><h2 id="hz-title">이단 정보</h2></div><div id="hz-list" style="display:flex;flex-direction:column;gap:8px"></div>
  <p class="muted" style="font-size:12px">출처: Google 내 지도 '이단 위치 및 주소록'(제작자 공개 지도). 특정 교계 기준으로 '이단'으로 분류된 단체의 위치 정보이며, 불법·위험 여부를 뜻하지 않아요. 정확하지 않을 수 있는 참고 정보예요. <a href="${VIEW}" target="_blank" rel="noopener">원본 지도</a></p>`;
  $('#v-map .sheet').appendChild(sec);
  b.addEventListener('click',e=>{
    const c=e.target.closest('button');if(!c)return;
    if(c.dataset.t==='on'){S.on=!S.on;c.setAttribute('aria-pressed',S.on);render(false);}
    else if(c.dataset.t==='rep'){const on=c.getAttribute('aria-pressed')!=='true';c.setAttribute('aria-pressed',on);$('#lmap').classList.toggle('hz-hide-reports',!on);}
    else if(c.dataset.mode){S.mode=c.dataset.mode;S.val=null;if(!S.on){S.on=true;$('[data-t=on]',b).setAttribute('aria-pressed',true);}bar();render(true);}
    else if(c.dataset.val!==undefined){const v=c.dataset.val;S.val=v===''?null:(S.mode==='dens'?+v:v);bar();render(true);}
  });
  sec.addEventListener('click',e=>{
    if(e.target.closest('#hz-loc')){const lb=$('#loc-btn');if(lb)lb.click();return;}
    const r=e.target.closest('[data-id]');if(!r)return;const it=all[+r.dataset.id];
    map.setView([it.lat,it.lng],Math.max(map.getZoom(),15));L.popup().setLatLng([it.lat,it.lng]).setContent(pop(it)).openOn(map);
    $('#v-map .mapwrap').scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  const q=$('#map-q');if(q)q.addEventListener('input',()=>render(false));
}
window.Heresy={
  attach(m,gu){
    if(map||!window.L)return;map=m;getUser=gu||getUser;rend=L.canvas({padding:.5});build();
    msg('이단 정보를 불러오는 중이에요…');$('#hz-modes').innerHTML='';
    load().then(a=>{
      if(!a){msg('이단 정보를 불러오지 못했어요.',true);$('#hz-sec').style.display='none';return;}
      all=a.map((it,i)=>Object.assign(it,{id:i,region:regionOf(it)}));
      cut=density(all);topG=count(all,'group').map(g=>g[0]);loaded=true;bar();render(false);
    });
  },
  onShow(){if(loaded)render(false);},
  refresh(){if(loaded)render(false);},
  _t:{parseKML,regionOf,density}
};
})();
