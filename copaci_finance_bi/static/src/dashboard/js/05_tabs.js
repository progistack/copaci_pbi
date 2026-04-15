// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Tab Builders (Synthese, Bilan, Tresorerie, KPIs, Dettes, CFS)
// ═══════════════════════════════════════════════════════════════

// ─── TAB 1: SYNTHESE ─────────────────────────────────────────
function buildSynthese(){
  // All P&L aggregates pass through aggOn() so Mensuel / YTD / LTM + selectedMonth
  // are honored identically for N / N-1 / Budget.
  const mSel=STATE.selectedMonth;
  const isMonth=mSel!=='all';
  const year=STATE.year;
  const lastMo=CACHE.lastMonth[year];
  const lastIdx=(lastMo!=null&&lastMo>=0)?lastMo:11;
  const yearStatus=CACHE.yearStatus[year]||'monthly-ok';
  // Seasonality guard : treat N-1 as available for comparisons ONLY when it is
  // real mensualized data. A 'closed-lumped' N-1 would produce spurious ±100 %
  // swings in monthly or YTD views (the missing months are posted as 0).
  const n1StY=n1StatusYoY();
  const hasN1=PL_N1_DATA&&PL_N1_DATA.length>0 && n1StY==='monthly-ok';
  const hasBud=BUDGET_DATA&&BUDGET_DATA.length>0;
  const budPlaceholder=isBudgetPlaceholder();

  // Period label reflects mode + selection
  let periodLabel;
  if(isMonth){
    periodLabel=MO[+mSel]+' '+year;
  } else if(STATE.mode==='mensuel'){
    periodLabel=yearStatus==='open'?('YTD '+MO[lastIdx]+' '+year):(year+' annuel');
  } else if(STATE.mode==='ytd'){
    periodLabel='YTD '+MO[lastIdx]+' '+year;
  } else {// ltm
    periodLabel='LTM '+MO[lastIdx]+' '+year;
  }

  // N and N-1 aggregates (mode-aware)
  const ca=plAgg('ca_net');
  const mb=plAgg('marge_brute');
  const ebitda=plAgg('ebitda');
  const ebitVal=plAgg('ebit');
  const rn=plAgg('resultat_net');
  // Dette nette \u2014 live from balBy() (same source as insights + health gauge),
  // pas RATIOS.dette_nette.val qui peut être un closed-snap périmé (recomputeRatios
  // utilise lastClosedMonth pour stabiliser les ratios DSO/DPO en mois partiel).
  const detteNette = +((balBy('dettes_fin_b')||0) - (balBy('tresorerie_a')||0)).toFixed(1);

  // N-1 uses n1AggMatched so "Jan→Apr 2026" compares to "Jan→Apr 2025",
  // not to the full 12 months of 2025 (period-mismatch guard).
  const caN1=hasN1?n1AggMatched('ca_net'):0;
  const mbN1=hasN1?n1AggMatched('marge_brute'):0;
  const ebitdaN1=hasN1?n1AggMatched('ebitda'):0;
  const ebitN1=hasN1?n1AggMatched('ebit'):0;
  const rnN1=hasN1?n1AggMatched('resultat_net'):0;

  const caBud=hasBud?budgetAgg('ca_net'):0;
  const mbBud=hasBud?budgetAgg('marge_brute'):0;
  const ebitdaBud=hasBud?budgetAgg('ebitda'):0;
  const ebitBud=hasBud?budgetAgg('ebit'):0;
  const rnBud=hasBud?budgetAgg('resultat_net'):0;

  const caLine=PL_DATA.find(l=>l.id==='ca_net');
  const mbLine=PL_DATA.find(l=>l.id==='marge_brute');
  const ebitdaLine=PL_DATA.find(l=>l.id==='ebitda');
  const ebitLine=PL_DATA.find(l=>l.id==='ebit');
  const rnLine=PL_DATA.find(l=>l.id==='resultat_net');

  const pct=(curr,prev)=>prev?((curr-prev)/Math.abs(prev)*100):null;
  const trendStr=(curr,prev)=>{const d=pct(curr,prev);if(d==null)return'n/d';return(d>=0?'+':'')+d.toFixed(1).replace('.',',')+'%'};
  // Secondary trend line (vs Budget or vs N-1, respecting toggle state)
  const bud=budPlaceholder?'&nbsp;<span class="bud-flag" title="Placeholder = GL actual">*</span>':'';
  const trend2=(curr,n1v,budv,sign)=>{
    // Returns an {html,up} object for the secondary trend line
    // sign : +1 if higher = better, -1 if lower = better
    const s=sign||1;
    if(STATE.compareBudget&&hasBud){
      const d=pct(curr,budv);if(d==null)return null;
      const arrow=(s*d>=0)?'&#9650;':'&#9660;';
      const cls=(s*d>=0)?'up':'down';
      return{html:`<div class="kpi-trend2 ${cls}">${arrow} ${trendStr(curr,budv)} vs Bud${bud}</div>`};
    }
    if(STATE.compareN1&&hasN1){
      const d=pct(curr,n1v);if(d==null)return null;
      const arrow=(s*d>=0)?'&#9650;':'&#9660;';
      const cls=(s*d>=0)?'up':'down';
      return{html:`<div class="kpi-trend2 ${cls}">${arrow} ${trendStr(curr,n1v)} vs N-1</div>`};
    }
    return null;
  };

  // Arrow points in the direction the VALUE moved; good/bad color is semantic-aware.
  // sign=+1 : higher = better (CA, marges, EBITDA...). sign=-1 : lower = better (dette nette).
  const mkKpi=(label,val,sub,curr,prev,sign,trend2,data,noCompare)=>{
    const s=sign||1;
    const trendStrVal=(prev!=null&&hasN1)?trendStr(curr,prev)+' vs N-1':(noCompare||'\u2014');
    let arrowUp=null, isGood=null;
    if(prev!=null&&hasN1){
      arrowUp = curr>=prev;
      isGood  = (s*(curr-prev))>=0;
    }
    return {label,val,sub,trend:trendStrVal,arrowUp,isGood,trend2,data};
  };
  const kpis=[
    mkKpi('Chiffre d\'affaires',fmt(ca),'M FCFA \u00b7 '+periodLabel,
      ca, hasN1?caN1:null, +1, trend2(ca,caN1,caBud,+1), caLine?.m),
    mkKpi('Marge brute',fmtPct(ca?mb/ca*100:0),fmt(mb)+' M',
      mb, hasN1?mbN1:null, +1, trend2(mb,mbN1,mbBud,+1), mbLine?.m),
    mkKpi('EBITDA',fmt(ebitda),'M FCFA \u00b7 '+fmtPct(ca?ebitda/ca*100:0)+' marge',
      ebitda, hasN1?ebitdaN1:null, +1, trend2(ebitda,ebitdaN1,ebitdaBud,+1), ebitdaLine?.m),
    mkKpi('EBIT',fmt(ebitVal),'M FCFA \u00b7 '+fmtPct(ca?ebitVal/ca*100:0)+' marge',
      ebitVal, hasN1?ebitN1:null, +1, trend2(ebitVal,ebitN1,ebitBud,+1), ebitLine?.m,
      ebitVal>0?'positif':'n\u00e9gatif'),
    mkKpi('R\u00e9sultat net',fmt(rn),'M FCFA \u00b7 '+fmtPct(ca?rn/ca*100:0)+' marge',
      rn, hasN1?rnN1:null, +1, trend2(rn,rnN1,rnBud,+1), rnLine?.m),
    (()=>{
      // Dette nette : compare contre le bilan N-1 au m\u00eame cutoff month via
      // balN1By() (helper partag\u00e9 avec insights \u2014 garantit la m\u00eame source
      // de v\u00e9rit\u00e9). Semantic invers\u00e9 (lower debt = good).
      const hasBilanN1=!!CACHE.bilan[year-1];
      let detteN1=null;
      if(hasBilanN1){
        const dfN1=balN1By('dettes_fin_b');
        const trN1=balN1By('tresorerie_a');
        if(isFinite(dfN1) && isFinite(trN1)) detteN1=dfN1-trN1;
      }
      // Levier live \u2014 m\u00eame calcul que la jauge Sant\u00e9 financi\u00e8re (annualized EBITDA).
      // \u00c9vite l'incoh\u00e9rence avec RATIOS.levier.val qui peut \u00eatre un closed-snap p\u00e9rim\u00e9.
      const ebitdaAnnLive=annualizedAgg('ebitda');
      const levier=(ebitdaAnnLive>0)?+(detteNette/ebitdaAnnLive).toFixed(1):null;
      const subStr='M FCFA \u00b7 '+(levier!=null?levier.toFixed(1).replace('.',',')+'x EBITDA':'levier n/d');
      return mkKpi('Dette nette',fmt(detteNette),subStr,
        detteNette, detteN1, -1, null, null);
    })(),
  ];

  let html='';
  kpis.forEach((k,i)=>{
    // Arrow reflects value direction (up = higher), cls reflects goodness (green = good).
    const hasCmp = k.arrowUp!=null;
    const arrow = !hasCmp ? '' : (k.arrowUp?'&#9650;':'&#9660;');
    const cls = !hasCmp ? '' : (k.isGood?'up':'down');
    html+=`<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.val}</div><div class="kpi-sub">${esc(k.sub)}</div>
    <div class="kpi-trend ${cls}">${arrow} ${esc(k.trend)}</div>
    ${k.trend2?k.trend2.html:''}
    ${k.data?`<div class="kpi-spark"><canvas id="kpiSpark${i}" width="200" height="40"></canvas></div>`:''}
    </div>`;
  });
  document.getElementById('synthKpis').innerHTML=html;
  // Draw sparklines
  kpis.forEach((k,i)=>{if(k.data)drawSparkline(document.getElementById('kpiSpark'+i),k.data.filter(v=>v!=null),k.isGood!==false?'#10b981':'#ef4444',40)});

  // Dynamic chart titles based on mode + selection
  const modeLabel={mensuel:'Mensuel',ytd:'YTD cumulatif',ltm:'LTM glissant'}[STATE.mode]||'Mensuel';
  const perfTitle=document.getElementById('synthPerfTitle');
  if(perfTitle)perfTitle.innerHTML=`Performance ${modeLabel.toLowerCase()} <span>CA &amp; EBITDA \u00b7 ${periodLabel}</span>`;
  const wfTitle=document.getElementById('synthWaterfallTitle');
  if(wfTitle)wfTitle.innerHTML=`Waterfall CA \u2192 R\u00e9sultat Net <span>${periodLabel}</span>`;
  const mgTitle=document.getElementById('synthMarginsTitle');
  if(mgTitle)mgTitle.innerHTML=`\u00c9volution des marges <span>% CA \u00b7 ${periodLabel}</span>`;
  const chTitle=document.getElementById('synthChargesTitle');
  if(chTitle)chTitle.innerHTML=`Structure des charges <span>${periodLabel}</span>`;
  const hcTitle=document.getElementById('synthHealthTitle');
  if(hcTitle)hcTitle.innerHTML=`Sant\u00e9 financi\u00e8re <span>Indicateurs cl\u00e9s \u00b7 ${periodLabel}</span>`;
  const ccvTitle=document.getElementById('synthCashConvTitle');
  if(ccvTitle)ccvTitle.innerHTML=`Cash conversion <span>EBITDA \u2192 Free Cash Flow \u00b7 ${periodLabel}</span>`;
  const mbrTitle=document.getElementById('synthMarginBridgeTitle');
  if(mbrTitle)mbrTitle.innerHTML=`Pont de marge EBITDA <span>D\u00e9composition N-1 \u2192 N \u00b7 ${periodLabel}</span>`;
  const insTitle=document.getElementById('synthInsightsTitle');
  if(insTitle)insTitle.innerHTML=`Signaux &amp; alertes CFO <span>Analyse automatique \u00b7 ${periodLabel}</span>`;

  // Charts (existing)
  buildSynthPerfChart();
  buildSynthWaterfallChart();
  buildSynthMarginsChart();
  buildSynthChargesChart();
  // New sections (V3 enrichment)
  buildSynthHealth();
  buildSynthCashConversion();
  buildSynthMarginBridge();
  buildSynthInsights();
}

function buildSynthPerfChart(){
  const labels=activeLabels();
  const ca=activeRange(PL_DATA.find(l=>l.id==='ca_net').m);
  const ebitda=activeRange(PL_DATA.find(l=>l.id==='ebitda').m);
  const datasets=[
    {label:'CA net '+STATE.year,data:ca,backgroundColor:toRgba('#0d9488',0.7),borderRadius:4,order:2},
    {label:'EBITDA '+STATE.year,data:ebitda,type:'line',borderColor:'#f59e0b',backgroundColor:toRgba('#f59e0b',0.1),borderWidth:2,fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#f59e0b',order:1}
  ];
  // Add N-1 dashed lines if compare is on (trimmed to same range)
  if(STATE.compareN1&&CACHE.rawPL[STATE.year-1]){
    const rawN1=CACHE.rawPL[STATE.year-1];
    const n1PL=deriveMode(rawN1,STATE.mode,null);
    const caN1=(n1PL.find(l=>l.id==='ca_net')?.m||[]).slice(0,labels.length);
    const ebitdaN1=(n1PL.find(l=>l.id==='ebitda')?.m||[]).slice(0,labels.length);
    datasets.push({label:'CA '+(STATE.year-1),data:caN1,type:'line',borderColor:toRgba('#0d9488',0.5),borderDash:[5,5],borderWidth:2,fill:false,tension:.4,pointRadius:0,order:0});
    datasets.push({label:'EBITDA '+(STATE.year-1),data:ebitdaN1,type:'line',borderColor:toRgba('#f59e0b',0.5),borderDash:[5,5],borderWidth:2,fill:false,tension:.4,pointRadius:0,order:0});
  }
  cc('s1',document.getElementById('synthPerfChart'),{type:'bar',data:{labels,datasets},options:(()=>{const base=chartOpts();return{...base,layout:{padding:{top:18}},plugins:{...base.plugins,datalabels:{...dlBar({fontSize:9}),display:(ctx)=>ctx.datasetIndex===0&&ctx.dataset.data[ctx.dataIndex]!=null}}}})()});
}

function buildSynthWaterfallChart(){
  const ca=plAgg('ca_net');
  const cogs=plAgg('marge_brute')-ca;
  const cd=plAgg('couts_directs');
  const ga=plAgg('ga');
  const ebitda=plAgg('ebitda');
  const da=plAgg('da');
  const fin=plAgg('resultat_fin');
  const rn=plAgg('resultat_net');

  const labels=['CA net','COGS','Couts dir.','G&A','EBITDA','D&A','Fin.','RN'];
  const vals=[ca,cogs,cd,ga,ebitda,da,fin,rn];
  const colors=vals.map(v=>v>=0?'rgba(13,148,136,0.7)':'rgba(239,68,68,0.6)');

  cc('s2',document.getElementById('synthWaterfallChart'),{type:'bar',
    data:buildWaterfallData(labels,vals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(vals)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
}

function buildSynthMarginsChart(){
  const labels=activeLabels();
  const ca=activeRange(PL_DATA.find(l=>l.id==='ca_net').m);
  const mb=activeRange(PL_DATA.find(l=>l.id==='marge_brute').m);
  const ebitda=activeRange(PL_DATA.find(l=>l.id==='ebitda').m);
  const rn=activeRange(PL_DATA.find(l=>l.id==='resultat_net').m);
  cc('s3',document.getElementById('synthMarginsChart'),{type:'line',
    data:{labels,datasets:[
      {label:'Marge brute %',data:mb.map((v,i)=>ca[i]?v/ca[i]*100:null),borderColor:'#0d9488',backgroundColor:toRgba('#0d9488',0.1),fill:true,tension:.4,pointRadius:3,spanGaps:true},
      {label:'EBITDA %',data:ebitda.map((v,i)=>ca[i]?v/ca[i]*100:null),borderColor:'#f59e0b',backgroundColor:toRgba('#f59e0b',0.1),fill:true,tension:.4,pointRadius:3,spanGaps:true},
      {label:'Marge nette %',data:rn.map((v,i)=>ca[i]?v/ca[i]*100:null),borderColor:'#8b5cf6',backgroundColor:toRgba('#8b5cf6',0.1),fill:true,tension:.4,pointRadius:3,spanGaps:true},
    ]},options:chartOpts('line',{beginAtZero:false,legend:false})});
  mountSeriesFilter('s3','synthMarginsChart');
}

function buildSynthChargesChart(){
  const labels=['Consommations','Couts directs','Personnel','Impots & taxes','Autres G&A','D&A','Financier'];
  const vals=[
    Math.abs(plAgg('conso_emb')+plAgg('conso_mp')),
    Math.abs(plAgg('couts_directs')),
    Math.abs(plAgg('ga_personnel')+plAgg('ga_charges_soc')),
    Math.abs(plAgg('ga_impots')),
    Math.abs(plAgg('ga_autres_achats')+plAgg('ga_banque')+plAgg('ga_assurances')+plAgg('ga_loyers')+plAgg('ga_reparat')),
    Math.abs(plAgg('da')),
    Math.abs(plAgg('charges_fin')),
  ];
  const total=vals.reduce((a,b)=>a+b,0);
  cc('s4',document.getElementById('synthChargesChart'),{type:'doughnut',
    data:{labels,datasets:[{data:vals,backgroundColor:COL.slice(0,7),borderWidth:0,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'right',labels:{color:isDark()?'#94a3b8':'#475569',font:{size:11},padding:8}},biCenterText:{text:fmt(total),sub:'M FCFA'}}}});
}

// ─── V3 SYNTHESE ENRICHMENT : HEALTH GAUGES ──────────────────
// Renders an SVG semi-circular gauge (180° arc, -180° start → 0° end).
// Input : {val, min, max, thresholds:{warn,good}, higherBetter, unit, decimals}
// Returns a DOM snippet with .gauge-tile wrapper
function renderGauge(opts){
  const {label,val,min=0,max=100,thresholds={},higherBetter=true,unit='',decimals=1,sub='',pillOverride,valOverride}=opts;
  const hasVal=val!=null&&isFinite(val);
  // Normalize position on arc
  const clamp=Math.max(min,Math.min(max,hasVal?val:min));
  const pct=(clamp-min)/(max-min||1);
  // Arc path : semi-circle from (10,80) → (130,80), radius 60, center (70,80)
  // Total arc length approx = π*r = π*60 ≈ 188.50
  const R=60,CX=70,CY=80;
  const arcLen=Math.PI*R;
  // SVG path for background arc
  const bgPath=`M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}`;
  // Health classification
  let healthClass='good',healthLabel='Sain';
  const tw=thresholds.warn,tg=thresholds.good;
  if(hasVal){
    if(higherBetter){
      if(tg!=null&&val>=tg){healthClass='good';healthLabel='Sain'}
      else if(tw!=null&&val>=tw){healthClass='warn';healthLabel='Tendu'}
      else {healthClass='bad';healthLabel='Risque'}
    } else {
      if(tg!=null&&val<=tg){healthClass='good';healthLabel='Sain'}
      else if(tw!=null&&val<=tw){healthClass='warn';healthLabel='Tendu'}
      else {healthClass='bad';healthLabel='Risque'}
    }
  } else {healthClass='warn';healthLabel='n/d'}
  const pillText=pillOverride||healthLabel;
  const col={good:'#10b981',warn:'#f59e0b',bad:'#ef4444'}[healthClass];
  // Dashoffset for stroke animation
  const dash=arcLen;
  const offset=arcLen*(1-pct);
  const valStr=valOverride||(hasVal?val.toFixed(decimals).replace('.',','):'n/d');
  const showUnit=hasVal&&!valOverride;
  const tickMarks=[];
  if(tw!=null){
    const tp=Math.max(0,Math.min(1,(tw-min)/(max-min||1)));
    const ang=Math.PI-tp*Math.PI;
    const x1=CX+(R-10)*Math.cos(ang),y1=CY-(R-10)*Math.sin(ang);
    const x2=CX+(R+10)*Math.cos(ang),y2=CY-(R+10)*Math.sin(ang);
    tickMarks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(245,158,11,0.7)" stroke-width="1.5"/>`);
  }
  if(tg!=null){
    const tp=Math.max(0,Math.min(1,(tg-min)/(max-min||1)));
    const ang=Math.PI-tp*Math.PI;
    const x1=CX+(R-10)*Math.cos(ang),y1=CY-(R-10)*Math.sin(ang);
    const x2=CX+(R+10)*Math.cos(ang),y2=CY-(R+10)*Math.sin(ang);
    tickMarks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(16,185,129,0.7)" stroke-width="1.5"/>`);
  }
  return `<div class="gauge-tile" style="--g-col:${col}">
    <div class="gauge-head"><div class="gauge-label">${esc(label)}</div><div class="gauge-pill ${healthClass}">${esc(pillText)}</div></div>
    <svg class="gauge-svg" viewBox="0 0 140 95" aria-hidden="true">
      <path class="gauge-bg" d="${bgPath}"/>
      <path class="gauge-fg" d="${bgPath}" stroke="${col}" stroke-dasharray="${dash.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      ${tickMarks.join('')}
      <text x="70" y="74" text-anchor="middle" font-size="22" font-weight="800" fill="var(--t1)" font-family="Inter">${valStr}${showUnit?`<tspan font-size="11" font-weight="500" dx="2" fill="var(--t3)">${esc(unit)}</tspan>`:''}</text>
    </svg>
    <div class="gauge-sub">${sub}</div>
    <div class="gauge-footer"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>
  </div>`;
}

function buildSynthHealth(){
  const el=document.getElementById('synthHealthGauges');
  if(!el)return;
  // Seasonality guard : N-1 comparisons are only used for delta badges and
  // they must be hidden when N-1 is closed-lumped or missing (otherwise the
  // badge shows phantom +100 % trends driven by period mismatch).
  const hasN1=PL_N1_DATA&&PL_N1_DATA.length>0 && n1StatusYoY()==='monthly-ok';
  // ─── Data sources + annualization policy ────────────
  // Règle : on annualise uniquement quand on rapporte un flux à un stock.
  //   - Levier  = Dette nette (stock) / EBITDA (flux)    → EBITDA annualisé
  //   - Cash runway = Trésorerie (stock) / Burn (flux)   → Burn annualisé
  //   - Interest coverage = EBITDA / Charges fin.        → pas d'annualisation
  //     (deux flux de la même période, déjà cohérents)
  //   - Current ratio = Actif circ. / Passif circ.       → snapshot bilan
  const ebitdaPeriod=plAgg('ebitda');// mode-aware, non annualisé
  const chFinPeriod=Math.abs(plAgg('charges_fin'));// idem
  const ebitdaAnn=annualizedAgg('ebitda');// annualisé pour le levier
  // Balance-sheet values — now period-aware via balBy(id). Each lookup respects
  // STATE.year + STATE.selectedMonth → picks the snapshot at end of the chosen
  // month (or latest available).
  const dettesFin=balBy('dettes_fin_b');
  const treso=balBy('tresorerie_a');
  const actifCirc=balBy('actif_circ');
  const passifCirc=balBy('passif_circ');
  const detteNette=dettesFin-treso;
  // N-1 snapshots at the same month — for the delta badges on the gauges
  const dettesFinN1=balN1By('dettes_fin_b');
  const tresoN1=balN1By('tresorerie_a');
  const actifCircN1=balN1By('actif_circ');
  const passifCircN1=balN1By('passif_circ');
  const detteNetteN1=dettesFinN1-tresoN1;
  const hasN1Bilan=!!CACHE.bilan[STATE.year-1];
  // Cash runway : treso / (opex annualisé / 12) — burn "normal" indépendant du mois choisi.
  const opexIds=['ga_personnel','ga_charges_soc','ga_autres_achats','ga_banque','ga_assurances','ga_loyers','ga_reparat','ga_impots'];
  let opexAnn=0;opexIds.forEach(id=>{opexAnn+=Math.abs(annualizedAgg(id))});
  const monthlyBurn=opexAnn/12;
  const runway=(treso>0&&monthlyBurn>0)?treso/monthlyBurn:(treso<=0?0:99);
  // ─── Ratios ─────────────────────────────────────────
  // Edge cases handled :
  //  • EBITDA ≤ 0 → interest coverage is meaningless (null → 'n/d')
  //  • Charges fin. ~0 (< 0.05 M) → coverage explodes → display '>50x' (capped)
  //  • negative leverage (net cash position) is real but unusual → pass through
  const NEAR_ZERO=0.05;// M FCFA
  const leverage=ebitdaAnn>0?detteNette/ebitdaAnn:null;
  let interestCov;let intCovCapped=false;
  if(ebitdaPeriod<=0){interestCov=null}
  else if(chFinPeriod<NEAR_ZERO){interestCov=999;intCovCapped=true}
  else {interestCov=ebitdaPeriod/chFinPeriod}
  const currentRatio=passifCirc>0?actifCirc/passifCirc:null;
  // N-1 ratios for delta badges — use the MATCHED aggregate so "Apr 2026 vs
  // Apr 2025" stays apples-to-apples. n1Agg alone would return the full 12
  // months of N-1 and inflate the leverage denominator by 3x in a 4-month view.
  const ebitdaN1Ann=hasN1?annualize(n1AggMatched('ebitda'),monthsInCurrent(true)):null;
  const chFinN1=hasN1?Math.abs(n1AggMatched('charges_fin')):null;
  const ebitdaN1Period=hasN1?n1AggMatched('ebitda'):null;
  const leverageN1=(hasN1Bilan&&ebitdaN1Ann!=null&&ebitdaN1Ann>0)?detteNetteN1/ebitdaN1Ann:null;
  let intCovN1;
  if(!hasN1||ebitdaN1Period==null||chFinN1==null||ebitdaN1Period<=0||chFinN1<NEAR_ZERO){intCovN1=null}
  else{intCovN1=ebitdaN1Period/chFinN1}
  const currentRatioN1=(hasN1Bilan&&passifCircN1>0)?actifCircN1/passifCircN1:null;
  // Update RATIOS live for downstream consumers (e.g. KPI Dette nette card)
  if(leverage!=null){RATIOS.dette_nette.val=+detteNette.toFixed(1);RATIOS.levier.val=+leverage.toFixed(1)}
  if(currentRatio!=null){RATIOS.current_ratio.val=+currentRatio.toFixed(2)}

  const periodLbl=periodDescriptor();
  const annLabel=periodLbl+' \u00b7 annualis\u00e9';
  const bilanLbl='Bilan '+bilanDateLabel(STATE.year);
  // Delta formatter : shows ▲/▼ + signed value for a N/N-1 comparison.
  // Suppresses the badge if either value is null or the delta is nonsensical
  // (e.g. moving from near-zero denominator produces astronomical jumps).
  function deltaBadge(curr,n1,decimals,unit){
    if(n1==null||curr==null||!isFinite(n1)||!isFinite(curr))return '';
    const d=curr-n1;
    if(Math.abs(d)>50)return '';// noise from near-zero denominators
    if(Math.abs(d)<0.005)return ` <span class="kpi-trend2 flat">= vs N-1</span>`;
    const good=d>=0;const arrow=good?'\u25b2':'\u25bc';
    return ` <span class="kpi-trend2 ${good?'up':'down'}">${arrow} ${(d>=0?'+':'')}${d.toFixed(decimals).replace('.',',')}${unit||''} vs N-1</span>`;
  }
  // Custom renderer for Interest coverage (handles cap + negative EBITDA hint)
  let icVal=interestCov,icPill=null,icValOverride=null;
  if(interestCov==null){icVal=null;icPill=ebitdaPeriod<=0?'EBITDA < 0':'n/d'}
  else if(intCovCapped){icVal=15;icValOverride='>50x';icPill='Sain'}
  const gauges=[
    renderGauge({label:'Levier (Dette nette / EBITDA)',val:leverage,min:0,max:6,thresholds:{warn:3.5,good:2.5},higherBetter:false,unit:'x',decimals:1,
      sub:`Dette nette <b>${fmt(detteNette)} M</b> / EBITDA <b>${fmt(ebitdaAnn)} M</b><br><span class="gauge-period">${annLabel} \u00b7 ${bilanLbl}</span>${deltaBadge(leverage,leverageN1,1,'x')}`,
      pillOverride:leverage==null?'n/d':null}),
    renderGauge({label:'Interest coverage',val:icVal,min:0,max:15,thresholds:{warn:2,good:4},higherBetter:true,unit:'x',decimals:1,
      sub:`EBITDA <b>${fmt(ebitdaPeriod)} M</b> / Charges fin. <b>${fmt(chFinPeriod)} M</b><br><span class="gauge-period">${periodLbl}${intCovCapped?' \u00b7 charges fin. \u2248 0':''}</span>${intCovCapped?'':deltaBadge(interestCov,intCovN1,1,'x')}`,
      pillOverride:icPill,valOverride:icValOverride}),
    renderGauge({label:'Current ratio',val:currentRatio,min:0,max:3,thresholds:{warn:1,good:1.5},higherBetter:true,unit:'x',decimals:2,
      sub:`Actif circ. <b>${fmt(actifCirc)} M</b> / Passif circ. <b>${fmt(passifCirc)} M</b><br><span class="gauge-period">${bilanLbl}</span>${deltaBadge(currentRatio,currentRatioN1,2,'x')}`,
      pillOverride:currentRatio==null?'n/d':null}),
    renderGauge({label:'Cash runway',val:runway>12?12:runway,min:0,max:12,thresholds:{warn:3,good:6},higherBetter:true,unit:' mois',decimals:1,
      sub:`Tr\u00e9sorerie <b>${fmt(treso)} M</b> / Burn mensuel <b>${fmt(monthlyBurn)} M</b><br><span class="gauge-period">${bilanLbl} \u00b7 burn annualis\u00e9</span>`,
      pillOverride:treso<=0?'Neg':null}),
  ];
  el.innerHTML=gauges.join('');
}

// ─── V3 : CASH CONVERSION EBITDA → FCF ───────────────────────
function buildSynthCashConversion(){
  // Flow :
  //   EBITDA
  //   − Impôts sur le résultat
  //   − ΔBFR (variations stocks / clients / autres créances / frs / fiscal)
  //   − Capex (cfs_flux_inv)
  //   = FCF
  // Mode + selectedMonth awareness :
  //   - EBITDA & IS : plAgg (déjà mode-transformé dans PL_DATA)
  //   - ΔBFR & Capex : cfsAgg (CFS_DATA n'a pas de série N-1, donc LTM fallback → YTD)
  // Conséquence : en Mensuel, tout porte sur le mois sélectionné (ou le cumul actif).
  //               En YTD, tout est cumulé Jan→mois. En LTM, EBITDA est rolling 12M
  //               et le CFS est cumulé YTD (meilleur proxy disponible).
  const ebitda=plAgg('ebitda');
  const is=plAgg('is');// charges IS (négatives dans notre convention)
  let deltaBfr=0;
  ['cfs_var_stocks','cfs_var_clients','cfs_var_autres_cr','cfs_var_frs','cfs_var_fisc'].forEach(id=>{
    deltaBfr+=cfsAgg(id);
  });
  const capex=cfsAgg('cfs_flux_inv');
  // FCF = EBITDA + IS + ΔBFR + Capex (signes préservés)
  const fcf=ebitda+is+deltaBfr+capex;
  const conv=ebitda>0?(fcf/ebitda*100):null;
  // Titre dynamique avec descriptor de période
  const titleEl=document.getElementById('synthCashConvTitle');
  if(titleEl){
    const warn=STATE.mode==='ltm'?' <span class="bud-flag" title="En vue LTM, le CFS retombe sur le cumul YTD (pas de série N-1 disponible)">*</span>':'';
    titleEl.innerHTML=`Cash conversion EBITDA \u2192 FCF <span>${periodDescriptor()}${warn}</span>`;
  }

  const labels=['EBITDA','Imp\u00f4ts','\u0394 BFR','Capex','FCF'];
  const vals=[ebitda,is,deltaBfr,capex,fcf];
  cc('s5',document.getElementById('synthCashConvChart'),{type:'bar',
    data:buildWaterfallData(labels,vals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(vals)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  const kpiEl=document.getElementById('synthCashConvKpi');
  if(kpiEl){
    const convCls=conv==null?'warn':(conv>=80?'good':(conv>=50?'warn':'bad'));
    const fcfCls=fcf>=0?'good':'bad';
    kpiEl.innerHTML=`
      <div class="kpi-mini"><div class="kpi-mini-label">EBITDA</div><div class="kpi-mini-val">${fmt(ebitda)}</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">FCF</div><div class="kpi-mini-val ${fcfCls}">${fmt(fcf)}</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">Conversion</div><div class="kpi-mini-val ${convCls}">${conv==null?'n/d':conv.toFixed(0)+'%'}</div></div>
    `;
  }
}

// ─── V3 : PONT DE MARGE EBITDA (N-1 → N) ─────────────────────
function buildSynthMarginBridge(){
  // Decompose the EBITDA delta from N-1 to N into:
  //   1. Volume effect (pure revenue growth at constant N-1 margin)
  //   2. Price / product mix on gross margin (% marge brute delta × CA N)
  //   3. Direct costs delta (scaled to % CA)
  //   4. G&A delta (scaled to % CA)
  //   5. Other
  // All values in M FCFA. Starting bar = EBITDA N-1, ending bar = EBITDA N
  // Seasonality guard : the bridge decomposes \u0394EBITDA from N-1 to N, so if
  // N-1 is closed-lumped (exercice cl\u00f4tur\u00e9 sur 1-2 mois) or if the N period is
  // not alignable to N-1, the effets volume/marge become meaningless. Bail out
  // with a clear message rather than ship noise.
  //
  // Placeholder is overlaid on the chart container (position:absolute) so the
  // canvas element is NEVER removed from the DOM \u2014 otherwise a subsequent
  // refreshAll() with valid data would fail to rebuild the chart (can't acquire
  // context from a canvas that was replaced with a <div>).
  const wrap=document.getElementById('synthMarginBridgeWrap');
  const prevPh=wrap?wrap.querySelector('.chart-placeholder'):null;
  if(prevPh)prevPh.remove();
  const n1StBridge=n1StatusYoY();
  const hasN1Bridge=PL_N1_DATA&&PL_N1_DATA.length && n1StBridge==='monthly-ok';
  if(!hasN1Bridge){
    if(CI['s6']){CI['s6'].destroy();delete CI['s6']}
    if(wrap){
      const reason = n1StBridge==='closed-lumped'
        ? `L'exercice ${STATE.year-1} est cl\u00f4tur\u00e9 avec figement comptable (donn\u00e9es non mensualis\u00e9es). Les effets volume/marge vs N-1 ne sont pas calculables.`
        : `Donn\u00e9es N-1 indisponibles ou non mensualis\u00e9es.`;
      const ph=document.createElement('div');
      ph.className='chart-placeholder';
      ph.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:12px;text-align:center;padding:20px;background:var(--bg2);border-radius:8px;pointer-events:none';
      ph.textContent=reason;
      wrap.appendChild(ph);
    }
    const kpiEl=document.getElementById('synthMarginBridgeKpi');
    if(kpiEl)kpiEl.innerHTML='';
    return;
  }
  // N-1 aggregates use n1AggMatched so the decomposition compares matching
  // month ranges (prevents the Jan\u2192Apr 2026 vs 12 mois 2025 mismatch).
  const ca=plAgg('ca_net'),caN1=n1AggMatched('ca_net');
  const mb=plAgg('marge_brute'),mbN1=n1AggMatched('marge_brute');
  const cd=plAgg('couts_directs'),cdN1=n1AggMatched('couts_directs');
  const ga=plAgg('ga'),gaN1=n1AggMatched('ga');
  const ebitda=plAgg('ebitda'),ebitdaN1=n1AggMatched('ebitda');
  // Effets
  // Effet volume : \u0394CA * (marge EBITDA N-1 en %)
  // But EBITDA = MB + CD + GA, et on veut ventiler la variation
  const margeMbN1=caN1?mbN1/caN1:0;
  const margeCdN1=caN1?cdN1/caN1:0;
  const margeGaN1=caN1?gaN1/caN1:0;
  const dCa=ca-caN1;
  // Effet volume : impact de la variation CA \u00e0 marges N-1 constantes
  const effVol=dCa*(margeMbN1+margeCdN1+margeGaN1);
  // Effet marge brute : (marge_brute_N / CA_N - marge_brute_N-1 / CA_N-1) * CA_N
  const effMb=(ca?mb/ca:0)-margeMbN1;
  const effMbVal=effMb*ca;
  // Effet co\u00fbts directs : idem
  const effCd=(ca?cd/ca:0)-margeCdN1;
  const effCdVal=effCd*ca;
  // Effet G&A
  const effGa=(ca?ga/ca:0)-margeGaN1;
  const effGaVal=effGa*ca;
  // Résidu : tout ce qui ne rentre pas dans ces 4 effets (reprises, autres prod, etc.)
  const totalExplained=effVol+effMbVal+effCdVal+effGaVal;
  const residual=(ebitda-ebitdaN1)-totalExplained;

  const labels=['EBITDA N-1','Volume','Marge brute','Co\u00fbts dir.','G&A','Autres','EBITDA N'];
  const vals=[ebitdaN1,effVol,effMbVal,effCdVal,effGaVal,residual,ebitda];
  cc('s6',document.getElementById('synthMarginBridgeChart'),{type:'bar',
    data:buildWaterfallData(labels,vals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(vals)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:9.5}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  // KPI band
  const kpiEl=document.getElementById('synthMarginBridgeKpi');
  if(kpiEl){
    const dEbit=ebitda-ebitdaN1;
    const dCls=dEbit>=0?'good':'bad';
    const mgN=ca?ebitda/ca*100:0,mgN1=caN1?ebitdaN1/caN1*100:0;
    const dMg=mgN-mgN1;
    const dMgCls=dMg>=0?'good':'bad';
    const arrow=(v)=>v>=0?'\u25b2':'\u25bc';
    kpiEl.innerHTML=`
      <div class="kpi-mini"><div class="kpi-mini-label">\u0394 EBITDA</div><div class="kpi-mini-val ${dCls}">${arrow(dEbit)} ${fmt(dEbit)} M</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">Marge N / N-1</div><div class="kpi-mini-val">${mgN.toFixed(1).replace('.',',')}% / ${mgN1.toFixed(1).replace('.',',')}%</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">\u0394 Marge</div><div class="kpi-mini-val ${dMgCls}">${arrow(dMg)} ${Math.abs(dMg*100).toFixed(0)} bps</div></div>
    `;
  }
}

// ─── V3 : AUTO-INSIGHTS (rule engine) ────────────────────────
function buildSynthInsights(){
  const el=document.getElementById('synthInsights');
  if(!el)return;
  const insights=[];
  const year=STATE.year;
  // Seasonality guard : N-1 is usable only when it's real mensualized data.
  // When N-1 is closed-lumped (exercice clôturé sur 1-2 mois), month-range
  // comparisons are mathematically valid but semantically misleading (the
  // "missing" months are 0 on N-1 and drive spurious ±100 % swings).
  const n1St=n1StatusYoY();
  const hasN1Raw=PL_N1_DATA&&PL_N1_DATA.length;
  const hasN1=hasN1Raw && n1St==='monthly-ok';
  const n1Lumped=hasN1Raw && n1St==='closed-lumped';
  const pct=(a,b)=>b?((a-b)/Math.abs(b)*100):null;
  const fmtPctSigned=(v)=>{if(v==null)return'n/d';return(v>=0?'+':'')+v.toFixed(1).replace('.',',')+'%'};

  // Fetch core numbers. N-1 uses n1AggMatched so the comparison range matches
  // year N's active window (avoids the "Jan→Apr 2026 vs 12 mois 2025 = −77 %"
  // period-mismatch trap when selectedMonth='all' and year N is partial).
  const ca=plAgg('ca_net'),caN1=hasN1?n1AggMatched('ca_net'):null;
  const mb=plAgg('marge_brute'),mbN1=hasN1?n1AggMatched('marge_brute'):null;
  const ebitda=plAgg('ebitda'),ebitdaN1=hasN1?n1AggMatched('ebitda'):null;
  const rn=plAgg('resultat_net'),rnN1=hasN1?n1AggMatched('resultat_net'):null;
  const gaPers=Math.abs(plAgg('ga_personnel')+plAgg('ga_charges_soc'));
  const chFin=Math.abs(plAgg('charges_fin'));
  // Balance sheet — period-matched snapshot at the current selectedMonth
  const treso=balBy('tresorerie_a');
  const dettesFin=balBy('dettes_fin_b');
  const actifCirc=balBy('actif_circ');
  const passifCirc=balBy('passif_circ');
  const detteNette=dettesFin-treso;
  // N-1 snapshot at same month (if available) for time-series insights
  const hasN1Bilan=!!CACHE.bilan[year-1];
  const tresoN1=hasN1Bilan?balN1By('tresorerie_a'):null;
  const dettesFinN1=hasN1Bilan?balN1By('dettes_fin_b'):null;
  const detteNetteN1=(tresoN1!=null&&dettesFinN1!=null)?(dettesFinN1-tresoN1):null;

  // ─── Rule 0 : RN Bilan \u2194 P&L reconciliation ───
  // Lit le delta calcul\u00e9 par recomputeRnReconciliation(). Tol\u00e8re un l\u00e9ger
  // bruit d'arrondi (<0,5%) \u2014 au-del\u00e0, signale comme warn ou bad.
  // Test\u00e9 sur des montants > 1 M FCFA pour \u00e9viter le bruit en d\u00e9but d'ann\u00e9e.
  if(RATIOS._rnReco){
    const r=RATIOS._rnReco;
    if(Math.abs(r.bilan)>=1 || Math.abs(r.pl)>=1){
      if(r.deltaPct>5){
        insights.push({sig:'bad',icon:'!',title:'\u00c9cart RN Bilan \u2194 P&L',text:`Le r\u00e9sultat de l'exercice au bilan (<b>${fmt(r.bilan)} M</b>) diverge du cumul P&L Jan\u2192mois (<b>${fmt(r.pl)} M</b>) \u2014 \u00e9cart <b>${r.deltaPct.toFixed(1).replace('.',',')}%</b>. V\u00e9rifier la source des donn\u00e9es : extraction unique ou deux flux Odoo distincts ?`});
      } else if(r.deltaPct>0.5){
        insights.push({sig:'warn',icon:'!',title:'L\u00e9ger \u00e9cart RN Bilan \u2194 P&L',text:`Bilan : <b>${fmt(r.bilan)} M</b> vs P&L : <b>${fmt(r.pl)} M</b> (\u00e9cart <b>${r.deltaPct.toFixed(1).replace('.',',')}%</b>). Bruit d'arrondi vraisemblable mais \u00e0 confirmer.`});
      } else {
        insights.push({sig:'good',icon:'\u2713',title:'Rapprochement RN Bilan \u2194 P&L OK',text:`Le r\u00e9sultat de l'exercice au bilan (<b>${fmt(r.bilan)} M</b>) correspond au P&L (<b>${fmt(r.pl)} M</b>). Coh\u00e9rence confirm\u00e9e.`});
      }
    }
  }

  // ─── Saisonnalit\u00e9 / N-1 comparability guard ────
  // Surface the reader when comparisons are restricted (N partiel) or disabled
  // (N-1 clôturé lump\u00e9). Placed BEFORE the YoY rules so the reader knows
  // exactly what baseline each insight uses.
  if(n1Lumped){
    insights.push({sig:'info',icon:'i',title:'Comparaisons N-1 d\u00e9sactiv\u00e9es',text:`L'exercice <b>${year-1}</b> est cl\u00f4tur\u00e9 avec un figement comptable sur 1-2 mois (statut <i>closed-lumped</i>). Les variations vs N-1 ne sont pas repr\u00e9sentatives et sont masqu\u00e9es des r\u00e8gles CA / marge / EBITDA. La comparaison de r\u00e9sultat net reste exploitable annuellement.`});
  } else if(hasN1 && STATE.selectedMonth==='all' && STATE.mode==='mensuel'){
    const lm=CACHE.lastMonth[year];
    const lastIdx=(lm!=null&&lm>=0)?lm:11;
    if(lastIdx<11){
      insights.push({sig:'info',icon:'i',title:'Comparaisons N-1 \u2014 p\u00e9rim\u00e8tre align\u00e9',text:`Les r\u00e8gles de variation (CA, marge, EBITDA) comparent <b>Jan\u2192${MO[lastIdx]} ${year}</b> \u00e0 <b>Jan\u2192${MO[lastIdx]} ${year-1}</b>, pas \u00e0 l'ann\u00e9e ${year-1} compl\u00e8te \u2014 garant comparabilit\u00e9 des p\u00e9riodes.`});
    }
  }

  // ─── Rule 1 : CA growth ────────────────────────────
  if(hasN1&&caN1){
    const gCa=pct(ca,caN1);
    if(gCa>=15)insights.push({sig:'good',icon:'\u25b2',title:'Croissance CA soutenue',text:`Le chiffre d'affaires progresse de <b>${fmtPctSigned(gCa)}</b> vs N-1, au-dessus d'un seuil de confort (15%).`});
    else if(gCa>=5)insights.push({sig:'info',icon:'i',title:'Croissance CA mod\u00e9r\u00e9e',text:`Le CA progresse de <b>${fmtPctSigned(gCa)}</b> vs N-1. Niveau acceptable.`});
    else if(gCa>=-5)insights.push({sig:'warn',icon:'!',title:'CA stable',text:`Le CA \u00e9volue de <b>${fmtPctSigned(gCa)}</b> vs N-1. Vigilance sur le pipeline commercial.`});
    else insights.push({sig:'bad',icon:'!',title:'Recul du CA',text:`Le CA recule de <b>${fmtPctSigned(gCa)}</b> vs N-1. Risque de perte de parts de march\u00e9 \u2014 revoir la strat\u00e9gie commerciale.`});
  }

  // ─── Rule 2 : Marge brute % ────────────────────────
  if(ca){
    const mgB=mb/ca*100;
    const mgBN1=hasN1&&caN1?mbN1/caN1*100:null;
    if(mgBN1!=null){
      const dMg=mgB-mgBN1;
      if(Math.abs(dMg)>=1){
        const sig=dMg>=0?'good':'warn';
        insights.push({sig,icon:dMg>=0?'\u25b2':'\u25bc',title:'Variation de marge brute',text:`La marge brute s'\u00e9tablit \u00e0 <b>${mgB.toFixed(1).replace('.',',')}%</b> vs ${mgBN1.toFixed(1).replace('.',',')}% l'an dernier (\u0394 <b>${(dMg>=0?'+':'')}${(dMg*100).toFixed(0)} bps</b>). ${dMg>=0?'Am\u00e9lioration de la rentabilit\u00e9 unitaire.':'\u00c0 surveiller (pression co\u00fbts MP / pricing).'}`});
      }
    }
    if(mgB<30)insights.push({sig:'warn',icon:'!',title:'Marge brute sous le seuil cible',text:`\u00c0 <b>${mgB.toFixed(1).replace('.',',')}%</b>, la marge brute est en-dessous de la cible habituelle du secteur cosm\u00e9tique (35-40%).`});
  }

  // ─── Rule 3 : EBITDA positive / negative ──────────
  if(ebitda<0){
    insights.push({sig:'bad',icon:'!',title:'EBITDA n\u00e9gatif',text:`L'EBITDA est n\u00e9gatif \u00e0 <b>${fmt(ebitda)} M</b>. L'activit\u00e9 courante ne couvre pas les charges d'exploitation \u2014 action corrective urgente.`});
  } else if(ca){
    const mgE=ebitda/ca*100;
    if(mgE<5)insights.push({sig:'warn',icon:'!',title:'Marge EBITDA faible',text:`La marge EBITDA s'\u00e9tablit \u00e0 <b>${mgE.toFixed(1).replace('.',',')}%</b>, sous le seuil de robustesse (5-8%).`});
    else if(mgE>=12)insights.push({sig:'good',icon:'\u25b2',title:'Marge EBITDA solide',text:`La marge EBITDA atteint <b>${mgE.toFixed(1).replace('.',',')}%</b>, niveau tr\u00e8s satisfaisant.`});
  }

  // ─── Rule 4 : Leverage ────────────────────────────
  // Uses annualized EBITDA so the ratio is consistent with the view mode
  // (same logic as the Santé financière gauge). Label explicitly says "annualisé"
  // so the reader knows it's scaled to 12 months.
  const ebitdaAnn=annualizedAgg('ebitda');
  if(ebitdaAnn>0){
    const lev=detteNette/ebitdaAnn;
    const modeTag=STATE.mode==='ltm'?'LTM':'annualis\u00e9';
    if(lev>4)insights.push({sig:'bad',icon:'!',title:'Levier financier \u00e9lev\u00e9',text:`Dette nette / EBITDA ${modeTag} \u00e0 <b>${lev.toFixed(1).replace('.',',')}x</b>. Au-dessus de 4x, la capacit\u00e9 de refinancement devient tendue.`});
    else if(lev>3)insights.push({sig:'warn',icon:'!',title:'Levier financier \u00e0 surveiller',text:`Dette nette / EBITDA ${modeTag} \u00e0 <b>${lev.toFixed(1).replace('.',',')}x</b>. Zone de vigilance (3-4x).`});
    else if(lev<=2.5&&lev>=0)insights.push({sig:'good',icon:'\u25b2',title:'Levier financier sain',text:`Dette nette / EBITDA ${modeTag} \u00e0 <b>${lev.toFixed(1).replace('.',',')}x</b>, dans la zone confortable (<2.5x).`});
  }

  // ─── Rule 5 : Interest coverage ──────────────────
  // EBITDA et charges financières sont deux flux de la même période →
  // on utilise directement les agrégats mode-aware, sans annualiser.
  if(chFin>0&&ebitda>0){
    const cov=ebitda/chFin;
    if(cov<2)insights.push({sig:'bad',icon:'!',title:'Couverture des int\u00e9r\u00eats faible',text:`EBITDA / charges fin. \u00e0 <b>${cov.toFixed(1).replace('.',',')}x</b> sur la p\u00e9riode. En-dessous de 2x, signal d'alerte pour les banques.`});
    else if(cov<4)insights.push({sig:'warn',icon:'!',title:'Couverture des int\u00e9r\u00eats \u00e0 renforcer',text:`EBITDA / charges fin. \u00e0 <b>${cov.toFixed(1).replace('.',',')}x</b> sur la p\u00e9riode. Zone d'attention (2-4x).`});
  }

  // ─── Rule 6 : Current ratio / liquidity ──────────
  if(passifCirc>0){
    const cr=actifCirc/passifCirc;
    if(cr<1)insights.push({sig:'bad',icon:'!',title:'Liquidit\u00e9 insuffisante',text:`Current ratio \u00e0 <b>${cr.toFixed(2).replace('.',',')}x</b>. L'actif circulant ne couvre pas le passif circulant \u2014 risque de tension de tr\u00e9sorerie.`});
    else if(cr<1.5)insights.push({sig:'warn',icon:'!',title:'Liquidit\u00e9 tendue',text:`Current ratio \u00e0 <b>${cr.toFixed(2).replace('.',',')}x</b>. Marge de manoeuvre faible, surveiller le BFR.`});
  }

  // ─── Rule 7 : Treasury signal ────────────────────
  if(treso<=0){
    insights.push({sig:'bad',icon:'!',title:'Tr\u00e9sorerie n\u00e9gative',text:`La tr\u00e9sorerie nette est \u00e0 <b>${fmt(treso)} M</b>. Position d\u00e9pendante des lignes court-terme.`});
  } else if(dettesFin>0&&treso/dettesFin<0.15){
    insights.push({sig:'warn',icon:'!',title:'Couverture cash limit\u00e9e',text:`Tr\u00e9sorerie <b>${fmt(treso)} M</b> vs dettes financi\u00e8res <b>${fmt(dettesFin)} M</b> (couverture ${(treso/dettesFin*100).toFixed(0)}%).`});
  }

  // ─── Rule 8 : Personnel weight ───────────────────
  if(ca){
    const pct=gaPers/ca*100;
    if(pct>25)insights.push({sig:'warn',icon:'!',title:'Poids des frais de personnel',text:`Les charges de personnel p\u00e8sent <b>${pct.toFixed(0)}%</b> du CA (${fmt(gaPers)} M). Au-del\u00e0 de 25% le levier op\u00e9rationnel devient rigide.`});
  }

  // ─── Rule 9 : Positive streak (RN) ────────────────
  if(hasN1&&rn>0&&rnN1!=null&&rnN1<0){
    insights.push({sig:'good',icon:'\u25b2',title:'Retour au b\u00e9n\u00e9fice',text:`Le r\u00e9sultat net passe de <b>${fmt(rnN1)} M</b> \u00e0 <b>${fmt(rn)} M</b> \u2014 retour \u00e0 la profitabilit\u00e9.`});
  }

  // ─── Rule 10 : Bilan drift vs N-1 ──────────────────
  // Compare the balance-sheet snapshot at the current selected month vs the same
  // month of the previous year. Only fires when we have a monthly N-1 bilan.
  if(hasN1Bilan&&detteNetteN1!=null&&Math.abs(detteNetteN1)>1){
    const dn=detteNette-detteNetteN1;
    const pctDn=Math.abs(detteNetteN1)>0?(dn/Math.abs(detteNetteN1)*100):null;
    if(pctDn!=null&&Math.abs(pctDn)>=10){
      const sig=dn>0?'warn':'good';
      const arrow=dn>0?'\u25b2':'\u25bc';
      const lbl='au '+bilanDateLabel(year);
      insights.push({sig,icon:arrow,title:'Dette nette \u2014 \u00e9volution N-1',text:`${arrow} <b>${fmtPctSigned(pctDn)}</b> vs m\u00eame mois N-1 (${fmt(detteNette)} M vs ${fmt(detteNetteN1)} M, ${lbl}). ${dn>0?'Alourdissement de la dette \u00e0 surveiller.':'All\u00e9gement \u2014 signal positif sur la structure financi\u00e8re.'}`});
    }
  }

  // Render
  if(!insights.length){
    el.innerHTML=`<div class="insight-row sig-info"><div class="insight-icon">i</div><div class="insight-body"><div class="insight-title">Pas de signal particulier</div><div class="insight-text">Aucune alerte d\u00e9clench\u00e9e sur la p\u00e9riode analys\u00e9e avec les r\u00e8gles en vigueur.</div></div></div>`;
    return;
  }
  // Sort : bad first, then warn, then info, then good
  const sigOrder={bad:0,warn:1,info:2,good:3};
  insights.sort((a,b)=>sigOrder[a.sig]-sigOrder[b.sig]);
  el.innerHTML=insights.map(i=>`<div class="insight-row sig-${i.sig}"><div class="insight-icon">${i.icon}</div><div class="insight-body"><div class="insight-title">${i.title}</div><div class="insight-text">${i.text}</div></div></div>`).join('');
}

// ─── TAB 4: TRESORERIE & BFR ─────────────────────────────────
function buildTresorerie(){
  // ─── CCC (LTM-locked, regardless of STATE.mode) ─────────────
  // Compute the LTM target month for the period tag, then read the LTM
  // working-capital ratios already populated by recomputeRatios().
  const tgt = (typeof ltmTargetMonth==='function') ? ltmTargetMonth() : -1;
  const periodTag = document.getElementById('cccPeriodTag');
  if(periodTag){
    if(tgt>=0) periodTag.textContent = 'LTM ' + MO[tgt] + ' ' + STATE.year;
    else periodTag.textContent = 'LTM';
  }
  const ccc=document.getElementById('cccTimeline');
  const {dio,dso,dpo}=RATIOS;
  const cccVal=dio.val+dso.val-dpo.val;
  ccc.innerHTML=`
    <div class="ccc-box dso"><div class="ccc-label">DSO</div><div class="ccc-value">${dso.val}</div><div class="ccc-days">jours clients</div></div>
    <div class="ccc-op">+</div>
    <div class="ccc-box dio"><div class="ccc-label">DIO</div><div class="ccc-value">${dio.val}</div><div class="ccc-days">jours stocks</div></div>
    <div class="ccc-op">-</div>
    <div class="ccc-box dpo"><div class="ccc-label">DPO</div><div class="ccc-value">${dpo.val}</div><div class="ccc-days">jours fournisseurs</div></div>
    <div class="ccc-op">=</div>
    <div class="ccc-box ccc"><div class="ccc-label">CCC</div><div class="ccc-value">${cccVal}</div><div class="ccc-days">jours</div></div>`;

  // ─── BFR Waterfall (LIVE values, LTM snapshot) ──────────────
  // Stocks / Clients / Fournisseurs are read at the SAME LTM target month so the
  // decomposition is consistent with the CCC ratios above. "Autres" closes the
  // walk to the full BFR (total bilan working capital incl. tax / fisc / debiteurs).
  const balAt = (id) => (tgt>=0 ? balByAt(id, STATE.year, tgt) : balBy(id));
  const stocks    = balAt('stocks')      || 0;
  const clients   = balAt('clients_grp') || 0;
  const frs       = -(balAt('frs_grp')   || 0); // negative bar (uses cash)
  const bfrExpl   = stocks + clients + frs;
  const actifCirc = balAt('actif_circ')  || 0;
  const passifCirc= balAt('passif_circ') || 0;
  // BFR total = actif circulant - passif circulant - tresorerie nette circulant
  // Approximate via (actif circ - stocks - clients) - (passif circ - frs) → autres net
  const otherActif  = actifCirc  - stocks - clients;            // autres créances
  const otherPassif = passifCirc - (balAt('frs_grp') || 0);     // autres dettes ct
  const autres = otherActif - otherPassif;
  const bfrTot = bfrExpl + autres;
  const bfrLabelsW=['Stocks','Clients','Fournisseurs','BFR exploit.','Autres','BFR total'];
  const bfrValsW=[stocks, clients, frs, bfrExpl, autres, bfrTot];
  // Update subtitle with the LTM target month
  const bfrSub = document.getElementById('bfrWaterfallSub');
  if(bfrSub) bfrSub.textContent = 'M FCFA · LTM ' + (tgt>=0 ? (MO[tgt]+' '+STATE.year) : '');
  cc('t1',document.getElementById('bfrWaterfallChart'),{type:'bar',
    data:buildWaterfallData(bfrLabelsW,bfrValsW),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(bfrValsW)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});

  // ─── Rolling-12M trends — Chart 2 (BFR/CA) + Chart 3 (DSO/DIO/DPO) ──
  // Both charts share the SAME 12-month sliding window ending at the LTM target
  // month (`tgt`), so they tell a coherent story alongside the CCC tile and the
  // waterfall above. We compute the four series in a single loop to guarantee
  // exact period alignment (anchor month + LTM denominator are identical).
  //
  // Each anchor (a.y, a.m) reads :
  //  • point-in-time bilan stocks/clients/frs at end-of-month (a.y, a.m)
  //  • rolling 12M CA ending at the same month (caM[a.y][0..a.m] + caM[a.y-1][a.m+1..11])
  //
  // RELIABILITY GATING : if the rawPL feed for a.y or a.y-1 is "lumped" (i.e.
  // monthly cells are 0 instead of real values, as is the case for 2024 in the
  // current Odoo extraction), the LTM denominator is distorted and the day count
  // is meaningless. We detect this and push null so the line breaks visibly
  // instead of trending nowhere — see audit Avr 2026 (problème #1).
  const balRawCross = (id, year, monthIdx) => {
    const b = CACHE.bilan && CACHE.bilan[year];
    if(!b) return null;
    const ln = balLine(b, id);
    if(!ln || !Array.isArray(ln.m) || ln.m.length!==12) return null;
    const v = ln.m[monthIdx];
    return v==null ? null : v;
  };
  const caMonthly = (year) => {
    const r = CACHE.rawPL && CACHE.rawPL[year];
    if(!r) return new Array(12).fill(null);
    const l = r.find(l=>l.id==='ca_net');
    return (l && l.m) || new Array(12).fill(null);
  };
  const caLtmAt = (year, monthIdx) => {
    const cM = caMonthly(year), cN1 = caMonthly(year-1);
    let total = 0;
    for(let j=0;j<=monthIdx;j++) total += cM[j]||0;
    for(let j=monthIdx+1;j<12;j++) total += cN1[j]||0;
    return total;
  };
  // A year is "lumped" if any of its months is exactly 0 (vs null = not yet
  // closed). Lumped years have 11 zeros + 1 annual figure at Dec — they corrupt
  // any LTM that crosses the year boundary.
  const yearIsLumped = (year) => {
    const cM = caMonthly(year);
    for(let j=0;j<12;j++) if(cM[j]===0) return true;
    return false;
  };
  const ltmReliable = (year, monthIdx) => {
    const cM = caMonthly(year), cN1 = caMonthly(year-1);
    for(let j=0;j<=monthIdx;j++) if(!(cM[j]>0)) return false;
    if(monthIdx < 11){
      // Year-1 contributes : reject lumped prior years to avoid 12-month +
      // 1-annual mash-ups (e.g. Nov 2025 dot reading Dec 2024 lumped figure).
      if(yearIsLumped(year-1)) return false;
      for(let j=monthIdx+1;j<12;j++) if(!(cN1[j]>0)) return false;
    }
    return true;
  };

  // Build 12 anchors ending at tgt (cross-year as needed)
  const anchors = [];
  if(tgt>=0){
    for(let off=11; off>=0; off--){
      const abs = tgt - off;
      const y = (abs>=0) ? STATE.year : STATE.year-1;
      const m = (abs>=0) ? abs : 12+abs;
      anchors.push({y, m});
    }
  }
  // Skip the final anchor if it's the partial in-progress month (downgrade
  // already happened via ltmTargetMonth, but defensive in case the user picked
  // explicitly).
  const trendLabels = anchors.map(a => MO[a.m] + " '" + String(a.y).slice(2));
  const dsoSeries = [], dioSeries = [], dpoSeries = [], bfrCaSeries = [];
  for(const a of anchors){
    const stk = balRawCross('stocks',      a.y, a.m);
    const cli = balRawCross('clients_grp', a.y, a.m);
    const fr  = balRawCross('frs_grp',     a.y, a.m);
    const caL = caLtmAt(a.y, a.m);
    const partial = isPartialMonth(a.y, a.m);
    const reliable = !partial && ltmReliable(a.y, a.m)
                  && stk!=null && cli!=null && fr!=null && caL>0;
    if(!reliable){
      dsoSeries.push(null); dioSeries.push(null); dpoSeries.push(null); bfrCaSeries.push(null);
    } else {
      dsoSeries.push(Math.round(cli/caL*365));
      dioSeries.push(Math.round(stk/caL*365));
      dpoSeries.push(Math.round(fr /caL*365));
      bfrCaSeries.push(Math.round((stk+cli-fr)/caL*365));
    }
  }
  // Window descriptor for both subtitles
  const winFirst = anchors.length ? anchors[0] : null;
  const winLast  = anchors.length ? anchors[anchors.length-1] : null;
  const winLabel = (winFirst && winLast)
    ? (MO[winFirst.m]+' '+winFirst.y+' → '+MO[winLast.m]+' '+winLast.y)
    : '12M glissants';

  // ─── Chart 2 : BFR exploit. en jours de CA, rolling 12M ─────
  const bfrEvoSub = document.getElementById('bfrEvoSub');
  if(bfrEvoSub) bfrEvoSub.textContent = 'BFR exploit. en jours de CA · ' + winLabel;
  cc('t2',document.getElementById('bfrEvoChart'),{type:'line',
    data:{labels:trendLabels,datasets:[{
      label:'BFR exploit. (jours CA)',
      data:bfrCaSeries,
      borderColor:'#0d9488',
      backgroundColor:toRgba('#0d9488',0.12),
      fill:true,tension:.4,pointRadius:4,spanGaps:false
    }]},
    options:chartOpts('line',{beginAtZero:false,legend:false})});

  // ─── Chart 3 : Évolution DSO / DIO / DPO, rolling 12M ───────
  // Replaces the static aging placeholder. Uses the SAME 12 anchors as Chart 2
  // so the user can correlate trend movements (e.g. DIO ↑ in Q4 explains the
  // BFR/CA bump on the line above).
  const ratioEvoSub = document.getElementById('ratioEvoSub');
  if(ratioEvoSub) ratioEvoSub.textContent = 'jours · ' + winLabel;
  cc('t3',document.getElementById('ratioEvoChart'),{type:'line',
    data:{labels:trendLabels,datasets:[
      {label:'DSO clients',     data:dsoSeries,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.10)', tension:.4,pointRadius:3,spanGaps:false},
      {label:'DIO stocks',      data:dioSeries,borderColor:'#f59e0b',backgroundColor:'rgba(245,158,11,0.10)', tension:.4,pointRadius:3,spanGaps:false},
      {label:'DPO fournisseurs',data:dpoSeries,borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.10)', tension:.4,pointRadius:3,spanGaps:false}
    ]},
    options:chartOpts('line',{beginAtZero:false})});
}

// ─── TAB 5: KPIs & RATIOS ───────────────────────────────────
function buildKpis(){
  // Radar — profil financier COPACI vs benchmark secteur cosmétique
  // Toutes les dimensions sont dynamiques depuis RATIOS, recalculées à chaque refreshAll
  // Normalisations : current_ratio (x) ×30 pour amener sur échelle %, rotation stocks = 365/DIO ×20
  const r_mb   = RATIOS.marge_brute.val   || 0;
  const r_meb  = RATIOS.marge_ebitda.val  || 0;
  const r_mn   = RATIOS.marge_nette.val   || 0;
  const r_roe  = Math.abs(RATIOS.roe.val  || 0);
  const r_cr   = (RATIOS.current_ratio.val || 0) * 30;
  const r_rot  = RATIOS.dio.val ? (365/RATIOS.dio.val)*20 : 0;
  cc('k1',document.getElementById('radarChart'),{type:'radar',
    data:{labels:['Marge brute','Marge EBITDA','Marge nette','ROE','Liquidité','Rotation stocks'],
      datasets:[{label:'COPACI '+STATE.year,data:[r_mb,r_meb,r_mn,r_roe,r_cr,r_rot],
        borderColor:'#0d9488',backgroundColor:'rgba(13,148,136,0.2)',pointBackgroundColor:'#0d9488',pointRadius:4},
      {label:'Benchmark secteur',data:[40,8,3,12,50,25],borderColor:'#94a3b8',backgroundColor:'rgba(148,163,184,0.1)',borderDash:[5,5],pointRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:isDark()?'#94a3b8':'#475569'}}},
      scales:{r:{grid:{color:isDark()?'rgba(148,163,184,0.2)':'rgba(0,0,0,0.08)'},pointLabels:{color:isDark()?'#e5e7eb':'#334155',font:{size:11}},ticks:{display:false}}}}});

  // Ratio cards — with visual gauge bars
  const grid=document.getElementById('ratioGrid');
  let html='';
  const benchmarks={dio:120,dso:60,dpo:90,bfr_ca:80,dette_nette:2000,levier:3,marge_brute:40,marge_ebitda:10,marge_nette:5,roe:15,roa:5,current_ratio:2};
  Object.entries(RATIOS).forEach(([key,r])=>{
    // Skip internal keys (e.g. _rnReco) — they store reconciliation metadata, not display ratios
    if(key.startsWith('_'))return;
    // Null/undefined \u2192 'n/d' (e.g. levier quand EBITDA \u2264 0, couverture quand charges fin. \u2248 0).
    const naVal=(r.val==null||!isFinite(r.val));
    const isNeg=!naVal && r.val<0;
    const unitStr=r.unit==='%'?'%':r.unit==='x'?'x':r.unit==='jours'?'j':r.unit==='M'?'':''
    const bench=benchmarks[key]||100;
    const pct=naVal?0:Math.min(Math.abs(r.val)/bench*100,100);
    const barColor=isNeg?'var(--red)':(r.unit==='jours'&&!naVal&&r.val>bench?'var(--amber)':'var(--accent)');
    const valDisplay=naVal
      ? '<span style="color:var(--t2);font-size:0.72em;font-weight:500;letter-spacing:0.02em">n/d</span>'
      : (typeof r.val==='number'?r.val.toLocaleString('fr-FR'):r.val)+`<span class="ratio-unit">${unitStr}</span>`;
    html+=`<div class="ratio-card">
      <div class="ratio-label">${esc(r.label)}</div>
      <div class="ratio-value" style="color:${isNeg?'var(--red)':'var(--t1)'}">${valDisplay}</div>
      <div class="ratio-sub">${esc(r.desc)}</div>
      <div class="ratio-bar"><div class="ratio-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
    </div>`;
  });
  grid.innerHTML=html;

  // KPI evolution (truncated to active range)
  const labels=activeLabels();
  cc('k2',document.getElementById('kpiEvoChart'),{type:'line',
    data:{labels,datasets:[
      {label:'Marge brute %',data:activeRange(PL_DATA.find(l=>l.id==='pct_mb')?.m),borderColor:'#0d9488',tension:.4,pointRadius:3,yAxisID:'y',spanGaps:true},
      {label:'EBITDA %',data:activeRange(PL_DATA.find(l=>l.id==='pct_ebitda')?.m),borderColor:'#f59e0b',tension:.4,pointRadius:3,yAxisID:'y',spanGaps:true},
      {label:'Marge nette %',data:activeRange(PL_DATA.find(l=>l.id==='pct_rn')?.m),borderColor:'#8b5cf6',tension:.4,pointRadius:3,yAxisID:'y',spanGaps:true},
    ]},options:chartOpts('line',{beginAtZero:false,legend:false})});
  mountSeriesFilter('k2','kpiEvoChart');
}

// ─── TAB 6: DETTES ───────────────────────────────────────────
function buildDettes(){
  // Live rebuild from BILAN_DATA.m[] + CACHE.rawPL for EBITDA LTM.
  // Falls back gracefully when the bilan is a flat snapshot (pickBalFromLine
  // then serves line.val; monthly tables show the single closing value).
  const year = STATE.year;
  const bilan = CACHE.bilan[year] || BILAN_DATA;
  const lm = CACHE.lastMonth[year];
  const lastIdx = (lm!=null && lm>=0) ? lm : 11;

  const bLine  = (id) => balLine(bilan, id);
  const pick   = (id) => pickBalFromLine(bLine(id), year, bilanMonthIdx(year));
  const series = (id) => {
    const line = bLine(id);
    if(!line) return new Array(12).fill(null);
    if(Array.isArray(line.m) && line.m.length===12) return line.m.slice();
    // Legacy flat snapshot : expose only val at lastIdx, rest null
    const flat = new Array(12).fill(null);
    flat[lastIdx] = line.val||0;
    return flat;
  };

  // KPI cards — value at selected month (respects month filter)
  const empruntMt   = pick('emprunt_mt');
  const creditBail  = pick('credit_bail');
  const creditCt    = pick('credit_ct');
  const provisions  = pick('provisions');
  const dettesFinTot= pick('dettes_fin_b');
  const treso       = pick('tresorerie_a');
  const detteNette  = dettesFinTot - treso;
  // Levier live \u2014 m\u00eame formule que la jauge Sant\u00e9 financi\u00e8re et le KPI Synth\u00e8se
  // (annualized EBITDA). \u00c9vite les incoh\u00e9rences avec RATIOS.levier.val stale.
  const ebitdaAnnLive=annualizedAgg('ebitda');
  const leverageLive=(ebitdaAnnLive>0)?+(detteNette/ebitdaAnnLive).toFixed(1):null;
  const leverageStr = (leverageLive!=null&&isFinite(leverageLive))
                      ? (leverageLive.toFixed(1).replace('.',',')+'x EBITDA')
                      : 'n/a';

  const kpis=[
    {label:'Emprunt MT',  val:fmt(empruntMt),  sub:'M FCFA'},
    {label:'Cr\u00e9dit-bail', val:fmt(creditBail), sub:'M FCFA'},
    {label:'Cr\u00e9dits CT',  val:fmt(creditCt),   sub:'M FCFA'},
    {label:'Dette nette', val:fmt(detteNette), sub:'M FCFA \u00b7 '+leverageStr},
  ];
  let html='';kpis.forEach(k=>{html+=`<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.val}</div><div class="kpi-sub">${esc(k.sub)}</div></div>`});
  document.getElementById('dettesKpis').innerHTML=html;

  // ─── Chart 1 : Composition (doughnut) ────────────────────────
  const totalFin = empruntMt + creditBail + creditCt + provisions;
  cc('d1',document.getElementById('detteTypeChart'),{type:'doughnut',
    data:{labels:['Emprunt MT','Cr\u00e9dit-bail','Cr\u00e9dits CT','Provisions'],
      datasets:[{data:[empruntMt,creditBail,creditCt,provisions],backgroundColor:['#3b82f6','#8b5cf6','#f97316','#94a3b8'],borderWidth:0,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'right',labels:{color:isDark()?'#94a3b8':'#475569',font:{size:10},boxWidth:10,padding:8}},biCenterText:{text:fmt(totalFin),sub:'M FCFA'}}}});

  // ─── Series mensuelles communes ──────────────────────────────
  const dLabels    = activeLabels();
  const dettesFinM = series('dettes_fin_b');
  const tresoM     = series('tresorerie_a');
  const empruntM   = series('emprunt_mt');
  const cbailM     = series('credit_bail');
  const cctM       = series('credit_ct');
  const provM      = series('provisions');
  const detteNetteM = new Array(12).fill(null);
  for(let i=0;i<12;i++){
    if(dettesFinM[i]==null) continue;
    const t = (tresoM[i]!=null) ? tresoM[i] : 0;
    detteNetteM[i] = +(dettesFinM[i] - t).toFixed(1);
  }
  // Trésorerie inversée (négative) pour empilage visuel sous la base 0
  const tresoNegM = tresoM.map(v => v==null ? null : -v);

  // ─── Chart 2 : Évolution dette empilée (Dette + Cash + ligne nette) ──
  // Datalabels : on affiche uniquement la ligne "Dette nette" (dataset idx 2)
  // pour ne pas surcharger les barres empilées de chaque mois.
  cc('d2',document.getElementById('detteStackedChart'),{type:'bar',
    data:{labels:dLabels,datasets:[
      {label:'Dette financi\u00e8re brute',data:activeRange(dettesFinM),backgroundColor:toRgba('#ef4444',0.55),borderRadius:4,stack:'cash',order:3},
      {label:'Tr\u00e9sorerie',data:activeRange(tresoNegM),backgroundColor:toRgba('#10b981',0.55),borderRadius:4,stack:'cash',order:3},
      {label:'Dette nette',data:activeRange(detteNetteM),type:'line',borderColor:'#0f172a',borderWidth:2.5,backgroundColor:toRgba('#0f172a',0.08),tension:.35,pointRadius:3,pointBackgroundColor:'#0f172a',order:1,spanGaps:true}
    ]},
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:18}},plugins:{...base.plugins,datalabels:{display:(ctx)=>ctx.datasetIndex===2&&ctx.dataset.data[ctx.dataIndex]!=null,anchor:'end',align:'top',offset:4,clip:false,color:isDark()?'#f0f0f5':'#0f172a',font:{size:9,weight:'700'},formatter:(v)=>v==null?'':fmt(v)}},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  mountSeriesFilter('d2','detteStackedChart');

  // ─── Chart 3 : Dette par nature (4 datasets stackés) ─────────
  // Datalabels : segment center quand la part dépasse 6 % du max global.
  cc('d3',document.getElementById('detteByNatureChart'),{type:'bar',
    data:{labels:dLabels,datasets:[
      {label:'Emprunt MT',  data:activeRange(empruntM),backgroundColor:toRgba('#3b82f6',0.7),borderRadius:3,stack:'nature'},
      {label:'Cr\u00e9dit-bail',data:activeRange(cbailM),  backgroundColor:toRgba('#8b5cf6',0.7),borderRadius:3,stack:'nature'},
      {label:'Cr\u00e9dits CT', data:activeRange(cctM),    backgroundColor:toRgba('#f97316',0.7),borderRadius:3,stack:'nature'},
      {label:'Provisions',  data:activeRange(provM),   backgroundColor:toRgba('#94a3b8',0.7),borderRadius:3,stack:'nature'}
    ]},
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,plugins:{...base.plugins,datalabels:dlStacked({fontSize:9})},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  mountSeriesFilter('d3','detteByNatureChart');

  // ─── Tableau drill-down ──────────────────────────────────────
  // Header dynamique
  const headHtml = '<tr><th style="text-align:left">Libell\u00e9</th>'+dLabels.map((m,mi)=>`<th data-col="${mi}">${m}</th>`).join('')+'<th style="text-align:right">Dernier</th></tr>';
  const headEl = document.getElementById('dettesHead');
  if(headEl) headEl.innerHTML = headHtml;

  // Structure hi\u00e9rarchique : 3 sections (Dette financi\u00e8re, Tr\u00e9sorerie,
  // Dette nette). Chaque section est une ligne L0 (total) avec ses sous-lignes
  // L1 cliquables/repliables. La ligne "Dette nette" est calcul\u00e9e (pas de
  // sous-niveau). Compatible avec buildRowDepthMap + applyTableExpandMode.
  const items = [
    // Section dette financi\u00e8re
    {id:'dettes_fin_b', label:'Dettes financi\u00e8res',           level:0, type:'total',    expandable:true,  m:dettesFinM, bold:true},
    {id:'emprunt_mt',   label:'Emprunt bancaire MT',               level:1, parent:'dettes_fin_b', m:empruntM},
    {id:'credit_bail',  label:'Dettes de cr\u00e9dit-bail',        level:1, parent:'dettes_fin_b', m:cbailM},
    {id:'credit_ct',    label:'Cr\u00e9dits bancaires CT',         level:1, parent:'dettes_fin_b', m:cctM},
    {id:'provisions',   label:'Provisions R&C',                    level:1, parent:'dettes_fin_b', m:provM},
    // Section tr\u00e9sorerie
    {id:'tresorerie_a', label:'Tr\u00e9sorerie',                   level:0, type:'total',    expandable:true,  m:tresoM, bold:true},
    {id:'effets_enc',   label:'Effets \u00e0 encaisser',           level:1, parent:'tresorerie_a', m:series('effets_enc')},
    {id:'banque',       label:'Banque',                            level:1, parent:'tresorerie_a', m:series('banque')},
    {id:'caisse',       label:'Caisse',                            level:1, parent:'tresorerie_a', m:series('caisse')},
    // Dette nette = calcul
    {id:'dette_nette',  label:'Dette nette',                       level:0, type:'total',    m:detteNetteM, bold:true, isNet:true}
  ];
  const depthMap = buildRowDepthMap(items);

  let tbody='';
  items.forEach(it => {
    const depth = depthMap.get(it.id) || 0;
    const isHidden = depth >= 1; // start in 'reduit' mode (only L0 visible)
    const slice = activeRange(it.m);
    const last = slice[slice.length-1];
    const cls = ['row-depth-'+depth];
    if(it.bold || it.type==='total') cls.push('row-l0');
    if(it.expandable) cls.push('row-expandable');
    if(isHidden) cls.push('row-hidden');
    tbody += `<tr class="${cls.join(' ')}" data-id="${esc(it.id)}" data-parent="${esc(it.parent||'')}" data-depth="${depth}">`;
    tbody += `<td>`;
    if(it.expandable) tbody += `<span class="row-expand-icon" data-target="${esc(it.id)}">&#9654;</span>`;
    tbody += `${esc(it.label)}</td>`;
    slice.forEach((v,mi) => {
      const display = (v==null) ? 'n/d' : fmt(v);
      const cellCls = (v!=null && v<0) ? 'neg' : '';
      const weight = (it.type==='total') ? '700' : '500';
      tbody += `<td class="${cellCls}" data-col="${mi}" style="text-align:right;font-weight:${weight}">${display}</td>`;
    });
    const lastDisplay = (last==null) ? 'n/d' : fmt(last);
    const lastWeight = (it.type==='total') ? '700' : '600';
    tbody += `<td style="text-align:right;font-weight:${lastWeight}">${lastDisplay}</td></tr>`;
  });
  const bodyEl = document.getElementById('dettesBody');
  bodyEl.innerHTML = tbody;

  // Wire expand icons (delegation pattern matching the bilan table)
  bodyEl.querySelectorAll('.row-expand-icon').forEach(icon => {
    icon.addEventListener('click', function(e){
      e.stopPropagation();
      const tid = this.dataset.target;
      const willOpen = !this.classList.contains('open');
      this.classList.toggle('open', willOpen);
      if(willOpen){
        bodyEl.querySelectorAll(`tr[data-parent="${tid}"]`).forEach(r => r.classList.remove('row-hidden'));
      } else {
        cascadeHide(bodyEl, tid);
      }
    });
  });

  // Mount the Réduit/Standard/Détaillé control + persist user choice
  const toolbar = document.getElementById('dettesToolbar');
  if(toolbar) mountExpandControl(toolbar, 'dettesTable');
  refreshTableExpandMode('dettesTable');
  if(typeof applyMonthHighlight==='function') applyMonthHighlight();
}

// ─── TAB 7: CASH FLOW ───────────────────────────────────────
function buildCFS(){
  // Quality banner — surface the residual % from the dynamic rebuild. A residual
  // < 1% is excellent (effectively machine zero). > 5% signals a structural gap
  // (typically class 39 dépréciations stocks or provisions dotations missing).
  const banner=document.getElementById('cfsQualityBanner');
  if(banner){
    const q=CFS_DATA._quality;
    const stocksLine=CFS_DATA.find(l=>l.id==='cfs_var_stocks');
    const stocksAllZero=stocksLine && stocksLine.m && stocksLine.m.every(v=>v==null||v===0);
    const notes=[];
    if(q){
      // Format FR : virgule d\u00e9cimale, espace millier (helper fmt existant).
      const pctFr=q.residualPct.toFixed(1).replace('.',',');
      const resFr=q.absResidual.toFixed(1).replace('.',',');
      const grossFr=fmt(q.grossFlux);// uses fr-FR formatting
      if(q.residualPct<=1){
        notes.push({cls:'ok',title:`Reconstruction dynamique \u2014 \u00e9cart de balance ${pctFr} %`,body:`CFS ind\u00e9pendant du figement Excel : calcul\u00e9 depuis le P&L brut et les variations bilan (opening bsEnd N-1 \u2192 cl\u00f4ture ${bilanDateLabel(STATE.year)}). Total flux reconstitu\u00e9 ${grossFr} M FCFA, r\u00e9siduel technique ${resFr} M.`});
      } else if(q.residualPct<=5){
        notes.push({cls:'warn',title:`Reconstruction dynamique \u2014 \u00e9cart ${pctFr} %`,body:`Le total flux calcul\u00e9 diverge l\u00e9g\u00e8rement de la variation de tr\u00e9sorerie bilan (${resFr} M / ${grossFr} M). \u00c9cart acceptable mais \u00e0 surveiller si progression r\u00e9currente.`});
      } else {
        notes.push({cls:'err',title:`Reconstruction dynamique \u2014 \u00e9cart important ${pctFr} %`,body:`Divergence de ${resFr} M entre flux reconstitu\u00e9s et variation de tr\u00e9sorerie bilan. V\u00e9rifier dotations aux provisions (class 19) et d\u00e9pr\u00e9ciations stocks (class 39) non track\u00e9es.`});
      }
    }
    if(stocksAllZero){
      notes.push({cls:'info',title:`Stocks \u2014 variation nulle sur la p\u00e9riode`,body:`Aucun mouvement comptable sur classes 31-38 en ${STATE.year}. Probable inventaire annuel unique (non mensualis\u00e9). La consommation mati\u00e8res/emballages reste visible au P&L, mais la variation de stocks bilan n'impacte pas le BFR mensuel.`});
    }
    banner.innerHTML=notes.map(n=>{
      const color=n.cls==='ok'?'#10b981':n.cls==='warn'?'#f59e0b':n.cls==='err'?'#ef4444':'#0284c7';
      return `<div style="margin-bottom:12px;padding:12px 14px;border-left:3px solid ${color};background:${toRgba(color,0.06)};border-radius:6px"><div style="font-weight:600;color:${color};font-size:13px;margin-bottom:4px">${esc(n.title)}</div><div style="font-size:12px;color:${isDark()?'#94a3b8':'#64748b'};line-height:1.5">${esc(n.body)}</div></div>`;
    }).join('');
  }

  buildFinTable('cfsTable','cfsHead','cfsBody',CFS_DATA,{modeAware:false});

  // Mount the Réduit/Standard/Détaillé control + persist user choice
  const cfsToolbar=document.getElementById('cfsToolbar');
  if(cfsToolbar) mountExpandControl(cfsToolbar,'cfsTable');
  refreshTableExpandMode('cfsTable');

  // ── Waterfall : sum flux respecting STATE.mode + selectedMonth ─
  // CFS_DATA is NOT mode-transformed (modeAware:false), so we compute the
  // window manually. There's no N-1 series for CFS, so LTM falls back to YTD.
  // - 'all' selected      → cumul Jan→lastClosedMonth (skip partial in-progress)
  // - specific month idx  → mensuel: that month only ; ytd/ltm: cumul Jan→idx
  // Use lastClosedMonth (not lastMonth) so the partial in-progress month
  // doesn't pollute the cumulative period — Victor wants a clean period of
  // analysis indicator on the waterfall.
  const cfsLastIdx = lastClosedMonth(STATE.year);
  function cfsRangeAgg(id){
    const line = CFS_DATA.find(l=>l.id===id);
    if(!line || !line.m || cfsLastIdx<0) return 0;
    if(STATE.selectedMonth!=='all'){
      const mi = Math.min(+STATE.selectedMonth, 11);
      // If user picks the in-progress month explicitly, fall back to last closed
      const effective = isPartialMonth(STATE.year, mi) ? cfsLastIdx : mi;
      if(STATE.mode==='mensuel'){
        return line.m[effective]||0;
      }
      let s=0;
      for(let i=0;i<=Math.min(effective,cfsLastIdx);i++) s += (line.m[i]||0);
      return s;
    }
    let s=0;
    for(let i=0;i<=cfsLastIdx;i++) s += (line.m[i]||0);
    return s;
  }
  const expl=cfsRangeAgg('cfs_flux_expl');
  const inv =cfsRangeAgg('cfs_flux_inv');
  const fin =cfsRangeAgg('cfs_flux_fin');
  const net =cfsRangeAgg('cfs_var_nette');

  // Period descriptor for the waterfall card subtitle
  let cfsPeriodTxt='';
  if(cfsLastIdx<0){
    cfsPeriodTxt='Aucune donn\u00e9e cl\u00f4tur\u00e9e';
  } else if(STATE.selectedMonth!=='all'){
    const miSel=Math.min(+STATE.selectedMonth,11);
    const miEff=isPartialMonth(STATE.year,miSel)?cfsLastIdx:miSel;
    if(STATE.mode==='mensuel'){
      cfsPeriodTxt=MO[miEff]+' '+STATE.year;
    } else {
      cfsPeriodTxt='Jan\u2192'+MO[Math.min(miEff,cfsLastIdx)]+' '+STATE.year;
    }
  } else {
    cfsPeriodTxt=(cfsLastIdx===0?MO[0]:('Jan\u2192'+MO[cfsLastIdx]))+' '+STATE.year;
  }
  if(STATE.mode==='ltm') cfsPeriodTxt='LTM '+cfsPeriodTxt.replace(/^Jan→/,'');
  else if(STATE.mode==='ytd') cfsPeriodTxt='YTD '+cfsPeriodTxt;
  else cfsPeriodTxt='Cumul '+cfsPeriodTxt;
  const cfsSub=document.getElementById('cfsWaterfallSub');
  if(cfsSub) cfsSub.textContent='M FCFA \u00b7 '+cfsPeriodTxt;
  const cfsTresoSub=document.getElementById('cfsTresoSub');
  if(cfsTresoSub) cfsTresoSub.textContent='Cumul mensuel \u00b7 '+STATE.year;

  const cfsLabels=['Exploitation','Investissement','Financement','Var. nette'];
  const cfsVals=[expl,inv,fin,net];
  cc('c1',document.getElementById('cfsWaterfallChart'),{type:'bar',
    data:buildWaterfallData(cfsLabels,cfsVals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(cfsVals)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});

  // Tresorerie evolution (truncated to active range)
  const cLabels=activeLabels();
  const tresoFin=activeRange(CFS_DATA.find(l=>l.id==='cfs_treso_fin').m);
  cc('c2',document.getElementById('cfsTresoChart'),{type:'line',
    data:{labels:cLabels,datasets:[{label:'Tr\u00e9sorerie fin de p\u00e9riode',data:tresoFin,borderColor:'#0d9488',backgroundColor:toRgba('#0d9488',0.1),fill:true,tension:.4,pointRadius:4,spanGaps:true,pointBackgroundColor:tresoFin.map(v=>v==null?'#94a3b8':(v>=0?'#10b981':'#ef4444'))}]},
    options:chartOpts('line',{beginAtZero:false})});

  if(typeof applyMonthHighlight==='function') applyMonthHighlight();
}

// ─── BILAN CHARTS ────────────────────────────────────────────
// Period-aware : structure reflects the snapshot at selectedMonth; evolution
// traces the full monthly series of Total Actif and key components.
function buildBilanCharts(){
  const periods=getBilanPeriods();
  const baseline=periods[0];
  const year=baseline.year;
  // Structure (stacked horizontal bar) — snapshot at the BASELINE period (first chip).
  // Uses the baseline year/month explicitly so the structure chart matches the first column.
  const bAt=(id)=>{
    const line=balLine(CACHE.bilan[year]||BILAN_DATA,id);
    return pickBalFromLine(line,year,baseline.monthIdx);
  };
  const immo=bAt('immo');
  const actifC=bAt('actif_circ');
  const treso=bAt('tresorerie_a');
  const cp=bAt('cp');
  const dettesFinB=bAt('dettes_fin_b');
  const passifC=bAt('passif_circ');
  cc('b1',document.getElementById('bilanStructChart'),{type:'bar',
    data:{labels:['Actif','Passif'],datasets:[
      {label:'Immobilisations / Capitaux propres',data:[immo,cp],backgroundColor:'#0d9488'},
      {label:'Circulant / Dettes financi\u00e8res',data:[actifC,dettesFinB],backgroundColor:'#0284c7'},
      {label:'Tr\u00e9sorerie / Passif circulant',data:[treso,passifC],backgroundColor:'#f59e0b'},
    ]},options:(()=>{const base=chartOpts();return{...base,indexAxis:'y',plugins:{...base.plugins,datalabels:dlHBar({fontSize:10})},scales:{x:{stacked:true,grid:{display:false},ticks:{callback:v=>fmt(v)}},y:{stacked:true,grid:{display:false}}}}})()});
  // Evolution : 4 solid lines for year N + 4 dashed lines for N-1 overlay.
  // Shows Actif total, CP, Dettes fin, Trésorerie (the 4 balance-sheet drivers).
  const cfg=[
    {id:'total_actif',label:'Total Actif',color:'#0d9488'},
    {id:'cp',label:'Capitaux propres',color:'#0284c7'},
    {id:'dettes_fin_b',label:'Dettes financi\u00e8res',color:'#f59e0b'},
    {id:'tresorerie_a',label:'Tr\u00e9sorerie',color:'#8b5cf6'},
  ];
  const lm=CACHE.lastMonth[year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  const evoLabels=MO.slice(0,lastIdx+1);
  const bilanN=CACHE.bilan[year];
  const bilanN1=CACHE.bilan[year-1];
  const datasets=[];
  cfg.forEach(c=>{
    const line=balLine(bilanN,c.id);
    const m=(line&&Array.isArray(line.m))?line.m:new Array(12).fill(line?.val||0);
    datasets.push({
      label:c.label,
      data:m.slice(0,lastIdx+1),
      borderColor:c.color,
      backgroundColor:c.color+'22',
      fill:c.id==='total_actif',
      tension:.4,
      pointRadius:3,
      borderWidth:2,
      spanGaps:true,
    });
    // N-1 overlay (dashed, thinner)
    if(bilanN1){
      const lineN1=balLine(bilanN1,c.id);
      if(lineN1&&Array.isArray(lineN1.m)){
        datasets.push({
          label:c.label+' · N-1',
          data:lineN1.m.slice(0,lastIdx+1),
          borderColor:c.color,
          borderDash:[4,4],
          borderWidth:1.5,
          pointRadius:2,
          pointStyle:'circle',
          tension:.4,
          spanGaps:true,
          fill:false,
        });
      }
    }
  });
  cc('b2',document.getElementById('bilanEvoChart'),{type:'line',
    data:{labels:evoLabels,datasets},
    options:chartOpts('line',{beginAtZero:false,legend:false})});
  mountSeriesFilter('b2','bilanEvoChart');
}

// ─── P&L CHARTS ──────────────────────────────────────────────
function buildPLCharts(){
  // Waterfall (mode-aware : plAgg utilise la valeur finale YTD/LTM en modes cumulatifs)
  const items=[
    {l:'CA net',v:plAgg('ca_net')},
    {l:'Conso.',v:plAgg('conso_emb')+plAgg('conso_mp')+plAgg('ristournes')+plAgg('escompte')+plAgg('var_stock_pf')+plAgg('achats_ns')},
    {l:'Marge brute',v:plAgg('marge_brute')},
    {l:'Couts dir.',v:plAgg('couts_directs')},
    {l:'G&A',v:plAgg('ga')},
    {l:'EBITDA',v:plAgg('ebitda')},
    {l:'D&A',v:plAgg('da')},
    {l:'Financier',v:plAgg('resultat_fin')},
    {l:'IS',v:plAgg('is')},
    {l:'RN',v:plAgg('resultat_net')},
  ];
  const p1Vals=items.map(i=>i.v);
  cc('p1',document.getElementById('plWaterfallChart'),{type:'bar',
    data:buildWaterfallData(items.map(i=>i.l),p1Vals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(p1Vals,{fontSize:10})},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});

  // Margins (truncated to active range)
  const pLabels=activeLabels();
  cc('p2',document.getElementById('plMarginsChart'),{type:'line',
    data:{labels:pLabels,datasets:[
      {label:'Marge brute %',data:activeRange(PL_DATA.find(l=>l.id==='pct_mb')?.m),borderColor:'#0d9488',fill:false,tension:.4,pointRadius:3,spanGaps:true},
      {label:'Marge co\u00fbts dir. %',data:activeRange(PL_DATA.find(l=>l.id==='pct_mcd')?.m),borderColor:'#0284c7',fill:false,tension:.4,pointRadius:3,spanGaps:true},
      {label:'EBITDA %',data:activeRange(PL_DATA.find(l=>l.id==='pct_ebitda')?.m),borderColor:'#f59e0b',fill:false,tension:.4,pointRadius:3,spanGaps:true},
      {label:'EBIT %',data:activeRange(PL_DATA.find(l=>l.id==='pct_ebit')?.m),borderColor:'#8b5cf6',fill:false,tension:.4,pointRadius:3,spanGaps:true},
      {label:'Marge nette %',data:activeRange(PL_DATA.find(l=>l.id==='pct_rn')?.m),borderColor:'#ef4444',fill:false,tension:.4,pointRadius:3,spanGaps:true},
    ]},options:chartOpts('line',{beginAtZero:false,legend:false})});
  mountSeriesFilter('p2','plMarginsChart');
}

