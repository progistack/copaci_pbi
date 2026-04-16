// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — UI Controls, Tab System & Initialization
// ═══════════════════════════════════════════════════════════════

// ─── GLOBAL STATE (declared in 00_config.js) ────────────────
// currentYear, currentTab, tabBuilt → see 00_config.js

// ─── SERIES FILTER PILLS ─────────────────────────────────────
// Renders a row of toggleable chips above a multi-series chart so the
// user can show/hide datasets on click. Pills replace the built-in
// Chart.js legend (which we disable via legend:false in chartOpts).
// Auto-creates the host container as a sibling of the chart-container.
function mountSeriesFilter(chartKey,canvasId){
  const canvas=document.getElementById(canvasId);
  if(!canvas)return;
  const card=canvas.closest('.chart-card');
  if(!card)return;
  let host=card.querySelector('.series-pills');
  if(!host){
    host=document.createElement('div');
    host.className='series-pills';
    const cont=canvas.closest('.chart-container');
    if(cont)card.insertBefore(host,cont);
    else card.appendChild(host);
  }
  host.innerHTML='';
  const chart=CI[chartKey];
  if(!chart)return;
  chart.data.datasets.forEach((ds,i)=>{
    if(!ds.label)return;
    // Pick the most "visible" color for the pill dot — borderColor for line
    // charts, backgroundColor for bars. Skip CanvasGradient/array values.
    let color='#0d9488';
    if(typeof ds.borderColor==='string')color=ds.borderColor;
    else if(typeof ds.backgroundColor==='string')color=ds.backgroundColor;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='series-pill';
    if(ds.hidden)btn.classList.add('off');
    btn.style.setProperty('--dot',color);
    btn.innerHTML=`<span class="pill-dot"></span>${esc(ds.label)}`;
    btn.addEventListener('click',()=>{
      ds.hidden=!ds.hidden;
      btn.classList.toggle('off',ds.hidden);
      chart.update();
    });
    host.appendChild(btn);
  });
}

// Tab builders — each builds only when first accessed.
// Wrapped in try/catch so a single tab crash doesn't block the entire dashboard.
function safeTabBuild(name,fn){
  return ()=>{try{fn()}catch(e){console.error('[BI Finance] Erreur onglet '+name+':',e)}}
}
const TAB_BUILDERS={
  synthese:safeTabBuild('synthese',()=>{buildSynthese()}),
  pl:safeTabBuild('pl',()=>{buildFinTable('plTable','plHead','plBody',PL_DATA);buildPLCharts();mountExpandControl(document.getElementById('plToolbar'),'plTable')}),
  bilan:safeTabBuild('bilan',()=>{buildBilanTable();buildBilanCharts()}),
  tresorerie:safeTabBuild('tresorerie',()=>{buildTresorerie()}),
  kpis:safeTabBuild('kpis',()=>{buildKpis()}),
  dettes:safeTabBuild('dettes',()=>{buildDettes()}),
  cfs:safeTabBuild('cfs',()=>{buildCFS()}),
};

function switchTab(tabId){
  currentTab=tabId;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tabId));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===tabId));
  window.scrollTo(0,0);
  // Lazy build
  if(!tabBuilt[tabId]&&TAB_BUILDERS[tabId]){tabBuilt[tabId]=true;TAB_BUILDERS[tabId]()}
  // Re-apply month column highlight (lost when a fresh table was just rendered)
  applyMonthHighlight();
}

function toggleTheme(){
  const el=document.documentElement;
  el.setAttribute('data-theme',el.getAttribute('data-theme')==='dark'?'light':'dark');
  _refreshDarkCache();
  // Destroy all charts and mark ALL tabs as needing rebuild
  destroyChartsFor('');
  Object.keys(tabBuilt).forEach(k=>tabBuilt[k]=false);
  // Rebuild only the active tab now — others will lazy-rebuild on switch
  TAB_BUILDERS[currentTab]();
  tabBuilt[currentTab]=true;
  applyMonthHighlight();
}

function changeYear(delta){
  const minY=CURRENT_FISCAL_YEAR-2, maxY=CURRENT_FISCAL_YEAR;
  const newYear=Math.max(minY,Math.min(maxY,STATE.year+delta));
  if(newYear===STATE.year)return;
  STATE.year=newYear;
  currentYear=newYear;
  document.getElementById('yearLabel').textContent=newYear;
  refreshAll();
}

function toggleCompare(){
  STATE.compareN1=!STATE.compareN1;
  document.getElementById('compareN1').classList.toggle('active',STATE.compareN1);
  refreshAll();
}
function toggleCompareBudget(){
  STATE.compareBudget=!STATE.compareBudget;
  document.getElementById('compareBudget').classList.toggle('active',STATE.compareBudget);
  refreshAll();
}

// Tab click handlers
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>switchTab(tab.dataset.tab));
});

// Month pill handlers — rebuild current tab + highlight column to reflect selected month
const TAB_CHART_PREFIX={synthese:'s',pl:'p',bilan:'b',tresorerie:'t',kpis:'k',dettes:'d',cfs:'c'};
function applyMonthHighlight(){
  // Clear any previous highlight (both th and td)
  document.querySelectorAll('.fin-table .col-hl').forEach(el=>el.classList.remove('col-hl'));
  if(STATE.selectedMonth==='all')return;
  // Tag every cell (header + body) carrying the matching data-col so the
  // accent rail spans the full column from header to last row.
  const sel=`.fin-table th[data-col="${STATE.selectedMonth}"], .fin-table td[data-col="${STATE.selectedMonth}"]`;
  document.querySelectorAll(sel).forEach(el=>el.classList.add('col-hl'));
}
document.querySelectorAll('#monthPills .pill').forEach(pill=>{
  pill.addEventListener('click',function(){
    document.querySelectorAll('#monthPills .pill').forEach(p=>p.classList.remove('active'));
    this.classList.add('active');
    STATE.selectedMonth=this.dataset.m;
    // Working-capital ratios depend on the bilan snapshot at the new month
    // AND on the YTD/LTM flow up to that month — must refresh BEFORE the
    // tab rebuild so the KPI/Tréso/Synthèse panels render with live values.
    recomputeRatios();
    // Rebuild the current tab's charts + tables so values reflect the selected month.
    // Some tabs rebuild their tables on build, so we apply the column highlight AFTER rebuild.
    if(tabBuilt[currentTab]){
      const prefix=TAB_CHART_PREFIX[currentTab];
      if(prefix)destroyChartsFor(prefix);
      tabBuilt[currentTab]=false;
      const builder=TAB_BUILDERS[currentTab];
      if(builder)builder();
      tabBuilt[currentTab]=true;
    }
    applyMonthHighlight();
  });
});

// Mode handlers — trigger full data refresh
document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click',function(){
    const newMode=this.dataset.mode;
    if(newMode===STATE.mode)return;
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    STATE.mode=newMode;
    refreshAll();
  });
});

// Header buttons — no inline onclick
document.getElementById('yearPrev').addEventListener('click',()=>changeYear(-1));
document.getElementById('yearNext').addEventListener('click',()=>changeYear(1));
document.getElementById('compareN1').addEventListener('click',toggleCompare);
document.getElementById('compareBudget').addEventListener('click',toggleCompareBudget);
document.getElementById('themeBtn').addEventListener('click',toggleTheme);
document.getElementById('drillOverlay').addEventListener('click',closeDrill);
document.getElementById('drillBack').addEventListener('click',drillGoBack);
document.getElementById('drillCloseBtn').addEventListener('click',closeDrill);

// ─── DRILL PANEL RESIZE (drag handle) ───────────────────────
// Allows the user to drag the left edge of the drill panel to resize it.
// Updates the --drill-w CSS variable on the panel. Min 380px, max 85vw.
(function initDrillResize(){
  const handle=document.getElementById('drillResize');
  const panel=document.getElementById('drillPanel');
  if(!handle||!panel)return;
  let dragging=false,startX=0,startW=0,rafId=0;
  function applyWidth(clientX){
    cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(()=>{
      const delta=startX-clientX;
      const maxW=Math.floor(window.innerWidth*0.85);
      const newW=Math.max(380,Math.min(maxW,startW+delta));
      panel.style.setProperty('--drill-w',newW+'px');
    });
  }
  handle.addEventListener('mousedown',function(e){
    e.preventDefault();
    dragging=true;
    startX=e.clientX;
    startW=panel.offsetWidth;
    panel.classList.add('resizing');
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    applyWidth(e.clientX);
  });
  document.addEventListener('mouseup',function(){
    if(!dragging)return;
    dragging=false;
    cancelAnimationFrame(rafId);
    panel.classList.remove('resizing');
    document.body.style.cursor='';
    document.body.style.userSelect='';
  });
  // Touch support (mobile / tablet)
  handle.addEventListener('touchstart',function(e){
    if(e.touches.length!==1)return;
    e.preventDefault();
    dragging=true;
    startX=e.touches[0].clientX;
    startW=panel.offsetWidth;
    panel.classList.add('resizing');
  },{passive:false});
  document.addEventListener('touchmove',function(e){
    if(!dragging||e.touches.length!==1)return;
    e.preventDefault();
    applyWidth(e.touches[0].clientX);
  },{passive:false});
  document.addEventListener('touchend',function(){
    if(!dragging)return;
    dragging=false;
    panel.classList.remove('resizing');
  });
})();

// ─── INIT ────────────────────────────────────────────────────
// ─── DATA LOADING ────────────────────────────────────────────
async function loadAndRender(){
  const cy=CURRENT_FISCAL_YEAR, YEARS=[cy-2,cy-1,cy];
  try{
    RAW_DATA=await fetchOdooFinanceData();
    if(RAW_DATA){
      console.log('%c[BI Finance] Données Odoo chargées (v'+(RAW_DATA._version||1)+')','color:#0d9488;font-weight:bold');
      // Render company selector (pills) from response metadata
      if(RAW_DATA._companies) renderCompanySelector(RAW_DATA._companies);
      // Pre-build raw data for all years available
      YEARS.forEach(y=>{
        const bal=RAW_DATA['balance'+y];
        if(bal && bal.length){
          CACHE.acctData[y]=buildAccountBalances(bal);
          const info=computeYearStatus(CACHE.acctData[y],y);
          CACHE.yearStatus[y]=info.status;
          CACHE.lastMonth[y]=info.lastMonth;
          // Build raw PL then mask months without data (n/d for partial year)
          let rawPL=buildPLData(CACHE.acctData[y]);
          if(info.status==='open'){
            // For open fiscal year, null out future months
            rawPL=maskEmptyMonths(rawPL, CACHE.acctData[y].__monthFlag);
          }
          CACHE.rawPL[y]=rawPL;
          console.log('  → '+y+' : '+bal.length+' lignes | status='+info.status+' | lastMonth='+MO[info.lastMonth]+' ('+info.activeMonths+' mois actifs)');
        }
      });
      // Build per-year Bilan — MONTHLY SERIES when possible.
      // Rule : if we have bsEnd{y-1} (opening) AND balance{y} (movements), we build a
      // 12-month snapshot series by rolling forward. Otherwise we fall back to the
      // legacy flat snapshot (single val, no m[]).
      const buildYearBilan=(y)=>{
        const opening=RAW_DATA['bsEnd'+(y-1)];
        const monthly=CACHE.acctData[y];
        const monthFlag=monthly?monthly.__monthFlag:null;
        if(opening && monthly){
          CACHE.bilan[y]=buildBilanSeriesFromOdoo(opening,monthly,monthFlag);
          console.log('  [Bilan '+y+'] série mensuelle (opening '+(y-1)+' + mouvements '+y+')');
        } else if(RAW_DATA['bsEnd'+y]){
          CACHE.bilan[y]=buildBilanFromOdoo(RAW_DATA['bsEnd'+y]);
          console.log('  [Bilan '+y+'] snapshot unique');
        } else if(y===cy && RAW_DATA.bsCurrent){
          CACHE.bilan[y]=buildBilanFromOdoo(RAW_DATA.bsCurrent);
          console.log('  [Bilan '+y+'] snapshot courant');
        }
      };
      YEARS.forEach(buildYearBilan);
      // Last-resort fallback : if no bilan at all, use any flat snapshot available.
      if(YEARS.every(y=>!CACHE.bilan[y])&&RAW_DATA.bsBalances){
        const bilan=buildBilanFromOdoo(RAW_DATA.bsBalances);
        YEARS.forEach(y=>{if(!CACHE.bilan[y]) CACHE.bilan[y]=bilan});
      }
    }
  }catch(e){
    console.error('[BI Finance] Chargement données échoué:',e.message);
    // Afficher banniere d'erreur dans le dashboard
    const hdr=document.querySelector('.header');
    if(hdr){
      const banner=document.createElement('div');
      banner.style.cssText='background:#fef2f2;color:#991b1b;padding:12px 20px;font-size:14px;font-weight:500;border-bottom:2px solid #fca5a5;text-align:center;';
      banner.textContent='⚠ Impossible de charger les données : '+e.message;
      hdr.parentNode.insertBefore(banner,hdr.nextSibling);
    }
  }

  // If STATE.year has no data, fallback to most recent year with data
  if(!CACHE.rawPL[STATE.year]){
    for(const y of [cy,cy-1,cy-2]){
      if(CACHE.rawPL[y]){STATE.year=y;currentYear=y;break}
    }
    document.getElementById('yearLabel').textContent=STATE.year;
  }

  // Initial refresh applies current state (year, mode) to data
  refreshAll();
  // Build the initial tab
  if(!tabBuilt[currentTab]){tabBuilt[currentTab]=true;TAB_BUILDERS[currentTab]()}
}
loadAndRender();
