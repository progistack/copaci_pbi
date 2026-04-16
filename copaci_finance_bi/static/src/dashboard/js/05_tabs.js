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
  buildSynthCompanyContrib();
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
  // EBITDA − IS − ΔBFR − Capex = FCF
  // IS=0 en exercice ouvert → on l'omet du bridge et on flag la conversion
  const ebitda=plAgg('ebitda');
  const is=plAgg('is');
  let deltaBfr=0;
  ['cfs_var_stocks','cfs_var_clients','cfs_var_autres_cr','cfs_var_frs','cfs_var_fisc'].forEach(id=>{
    deltaBfr+=cfsAgg(id);
  });
  const capex=cfsAgg('cfs_flux_inv');
  const fcf=ebitda+is+deltaBfr+capex;
  const conv=ebitda>0?(fcf/ebitda*100):null;
  const isBooked=(Math.abs(is)>0.5);
  const titleEl=document.getElementById('synthCashConvTitle');
  if(titleEl){
    const warn=STATE.mode==='ltm'?' <span class="bud-flag" title="En vue LTM, le CFS retombe sur le cumul YTD">*</span>':'';
    titleEl.innerHTML=`Cash conversion EBITDA \u2192 FCF <span>${periodDescriptor()}${warn}</span>`;
  }
  // Build bridge — skip IS bar when not yet booked to avoid confusing zero bar
  const labels=['EBITDA'];const vals=[ebitda];
  if(isBooked){labels.push('Imp\u00f4ts');vals.push(is)}
  labels.push('\u0394 BFR','Capex','FCF');
  vals.push(deltaBfr,capex,fcf);
  cc('s5',document.getElementById('synthCashConvChart'),{type:'bar',
    data:buildWaterfallData(labels,vals),
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:22}},plugins:{...base.plugins,datalabels:dlWaterfall(vals)},scales:{x:{stacked:true,grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  const kpiEl=document.getElementById('synthCashConvKpi');
  if(kpiEl){
    const isNote=isBooked?'':'*';
    const convCls=conv==null?'warn':(conv>=80?'good':(conv>=50?'warn':'bad'));
    const fcfCls=fcf>=0?'good':'bad';
    kpiEl.innerHTML=`
      <div class="kpi-mini"><div class="kpi-mini-label">EBITDA</div><div class="kpi-mini-val">${fmt(ebitda)}</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">FCF</div><div class="kpi-mini-val ${fcfCls}">${fmt(fcf)}</div></div>
      <div class="kpi-mini"><div class="kpi-mini-label">Conversion${isNote}</div><div class="kpi-mini-val ${convCls}">${conv==null?'n/d':conv.toFixed(0)+'%'}</div></div>
      ${isNote?'<div class="kpi-mini"><div class="kpi-mini-label" style="font-style:italic">* IS non comptabilis\u00e9</div></div>':''}
    `;
  }
}

// ─── V3 : PONT DE MARGE EBITDA (N-1 → N) ─────────────────────
function buildSynthMarginBridge(){
  // Simple absolute-delta bridge — clearer than volume/mix decomposition:
  //   EBITDA N-1 + ΔMarge brute + ΔCoûts directs + ΔG&A + ΔAutres = EBITDA N
  // Each bar shows how much that P&L line changed vs N-1 (in M FCFA).
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
  // N-1 uses n1AggMatched for period-aligned comparison (Jan-Apr N vs Jan-Apr N-1)
  const ca=plAgg('ca_net'),caN1=n1AggMatched('ca_net');
  const mb=plAgg('marge_brute'),mbN1=n1AggMatched('marge_brute');
  const cd=plAgg('couts_directs'),cdN1=n1AggMatched('couts_directs');
  const ga=plAgg('ga'),gaN1=n1AggMatched('ga');
  const ebitda=plAgg('ebitda'),ebitdaN1=n1AggMatched('ebitda');
  // Absolute deltas — what actually changed, line by line
  const dMb=mb-mbN1;
  const dCd=cd-cdN1;
  const dGa=ga-gaN1;
  const dAutres=(ebitda-ebitdaN1)-(dMb+dCd+dGa);

  const labels=['EBITDA N-1','\u0394 Marge brute','\u0394 Co\u00fbts dir.','\u0394 G&A','\u0394 Autres','EBITDA N'];
  const vals=[ebitdaN1,dMb,dCd,dGa,dAutres,ebitda];
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

// ─── COMPANY CONTRIBUTION (multi-societe only) ──────────────
// Two doughnuts showing each company's share of CA and EBITDA.
// Only visible for users with access to 2+ companies.
// Uses COL palette from 00_config.js — teal(0), blue(1), green(2), amber(3)...
function buildSynthCompanyContrib(){
  const row=document.getElementById('synthContribRow');
  if(!row)return;
  const contrib=buildCompanyContrib(STATE.year);
  if(!contrib){row.style.display='none';return}
  row.style.display='';
  const companies=STATE._companies||[];
  const lastMo=CACHE.lastMonth[STATE.year];
  const lastIdx=(lastMo!=null&&lastMo>=0)?lastMo:11;
  const mSel=STATE.selectedMonth;
  const isMonth=mSel!=='all';
  let periodLabel;
  if(isMonth){periodLabel=MO[+mSel]+' '+STATE.year}
  else if(STATE.mode==='ytd'){periodLabel='YTD '+MO[lastIdx]+' '+STATE.year}
  else if(STATE.mode==='ltm'){periodLabel='LTM '+MO[lastIdx]+' '+STATE.year}
  else{periodLabel=(CACHE.yearStatus[STATE.year]==='open'?'YTD '+MO[lastIdx]:'')+' '+STATE.year}
  const caTitle=document.getElementById('synthContribCaTitle');
  if(caTitle)caTitle.innerHTML=`Contribution au CA <span>${esc(periodLabel)}</span>`;
  const ebTitle=document.getElementById('synthContribEbitdaTitle');
  if(ebTitle)ebTitle.innerHTML=`Contribution \u00e0 l'EBITDA <span>${esc(periodLabel)}</span>`;
  const dk=isDark();

  function buildDoughnut(canvasId,chartKey,field){
    const vals=[],labels=[],colors=[];
    companies.forEach((c,ci)=>{
      const d=contrib[c.id];if(!d)return;
      vals.push(Math.abs(d[field]));
      labels.push(c.name);
      colors.push(COL[ci%COL.length]);
    });
    const total=vals.reduce((a,b)=>a+b,0);
    const bgCol=dk?'#0c1222':'#ffffff';
    cc(chartKey,document.getElementById(canvasId),{type:'doughnut',
      data:{labels,datasets:[{data:vals,backgroundColor:colors,
        borderColor:bgCol,borderWidth:3,hoverOffset:6,borderRadius:2}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'74%',
        layout:{padding:{top:4,bottom:4}},
        plugins:{
          legend:{display:false},
          biCenterText:{text:fmt(total),sub:'M FCFA',textSize:20,subSize:11},
          tooltip:{backgroundColor:dk?'rgba(15,23,42,.92)':'rgba(255,255,255,.95)',
            titleColor:dk?'#e2e8f0':'#0f172a',bodyColor:dk?'#94a3b8':'#475569',
            borderColor:dk?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)',borderWidth:1,
            cornerRadius:8,padding:10,
            callbacks:{label:function(ctx){
              const v=ctx.parsed;const pct=total?(v/total*100).toFixed(1):'0';
              return ' '+ctx.label+' : '+fmt(v)+' M ('+pct.replace('.',',')+' %)';
            }}}
        }
      }
    });
  }
  buildDoughnut('synthContribCaChart','sc1','ca');
  buildDoughnut('synthContribEbitdaChart','sc2','ebitda');

  // Legend with proportional bars — Stripe/Linear style
  function renderLegend(elId,field){
    const el=document.getElementById(elId);if(!el)return;
    const vals=companies.map(c=>{const d=contrib[c.id];return d?Math.abs(d[field]):0});
    const total=vals.reduce((a,b)=>a+b,0);
    el.innerHTML=companies.map((c,ci)=>{
      const d=contrib[c.id];if(!d)return'';
      const v=d[field];const absV=Math.abs(v);
      const pct=total?(absV/total*100):0;
      const pctStr=pct.toFixed(1).replace('.',',');
      const col=COL[ci%COL.length];
      return `<div class="contrib-item"><div class="contrib-header"><span class="contrib-dot" style="background:${col}"></span><span class="contrib-name">${esc(c.name)}</span><span class="contrib-pct">${pctStr}%</span></div><div class="contrib-bar"><div class="contrib-fill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div><div class="contrib-val">${fmt(absV)} M FCFA</div></div>`;
    }).join('');
  }
  renderLegend('synthContribCaKpi','ca');
  renderLegend('synthContribEbitdaKpi','ebitda');
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
// Bank name extraction from SYSCOHADA account labels
const BANK_MAP=[
  {pattern:/SGCI|SGBCI/i,name:'SGBCI'},
  {pattern:/BBG|BRIDGE/i,name:'Bridge Bank'},
  {pattern:/BOA|BOACI|BANK OF AFRICA/i,name:'BOA'},
  {pattern:/ECOBANK/i,name:'Ecobank'},
  {pattern:/BGFI/i,name:'BGFI'},
  {pattern:/NSIA/i,name:'NSIA'},
  {pattern:/BICICI/i,name:'BICICI'},
  {pattern:/WAVE/i,name:'Wave'},
];
function extractBank(name){
  for(const b of BANK_MAP){if(b.pattern.test(name))return b.name}
  if(/LOYER CB|CR.DIT.BAIL/i.test(name))return 'Cr\u00e9dit-bail';
  if(/CAISSE|VIREMENT/i.test(name))return 'Caisse';
  return 'Autre';
}
// Palette for banks — uses COL theme colors
const BANK_COL={'SGBCI':COL[0],'Bridge Bank':COL[1],'BOA':COL[2],'Ecobank':COL[3],'BGFI':COL[7],'NSIA':COL[6],'BICICI':COL[4],'Cr\u00e9dit-bail':COL[5],'Wave':COL[8],'Caisse':COL[9],'Autre':'#94a3b8'};
// Nature colors
const NAT_COL={'emprunt_mt':COL[0],'credit_bail':COL[7],'credit_ct':COL[1]};
const NAT_LABEL={'emprunt_mt':'Emprunt MT','credit_bail':'Cr\u00e9dit-bail','credit_ct':'Cr\u00e9dits CT'};

function buildDettes(){
  const year=STATE.year;
  const bilan=CACHE.bilan[year]||BILAN_DATA;
  const lm=CACHE.lastMonth[year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  const bLine=(id)=>balLine(bilan,id);
  const pick=(id)=>pickBalFromLine(bLine(id),year,bilanMonthIdx(year));
  const ser=(id)=>{const line=bLine(id);if(!line)return new Array(12).fill(null);if(Array.isArray(line.m)&&line.m.length===12)return line.m.slice();const flat=new Array(12).fill(null);flat[lastIdx]=line.val||0;return flat};
  const dk=isDark();

  // ── Build bank-level data from individual accounts ──
  function buildBankData(){
    const banks={};
    ['emprunt_mt','credit_bail','credit_ct'].forEach(natId=>{
      const line=bLine(natId);
      if(!line||!line.accounts)return;
      line.accounts.forEach(acct=>{
        const bank=extractBank(acct.name);
        if(!banks[bank])banks[bank]={name:bank,m:new Array(12).fill(0),total:0,byNature:{},accounts:[]};
        if(!banks[bank].byNature[natId])banks[bank].byNature[natId]={m:new Array(12).fill(0),total:0,accounts:[]};
        banks[bank].byNature[natId].accounts.push(acct);
        banks[bank].accounts.push({...acct,nature:natId});
        for(let i=0;i<12;i++){const v=acct.m?acct.m[i]:null;if(v!=null){banks[bank].m[i]+=v;banks[bank].byNature[natId].m[i]+=v}}
        const snap=acct.m?acct.m[lastIdx]||0:0;
        banks[bank].total+=snap;
        banks[bank].byNature[natId].total+=snap;
      });
    });
    return banks;
  }
  const bankData=buildBankData();
  const bankList=Object.values(bankData).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total));
  const selBank=STATE._selectedBank||null;

  // ── Filtered series (respects bank selection) ──
  function filteredNatureSeries(natId){
    if(!selBank){return ser(natId)}
    const bd=bankData[selBank];
    if(!bd||!bd.byNature[natId])return new Array(12).fill(0);
    return bd.byNature[natId].m.slice();
  }
  const empruntM=filteredNatureSeries('emprunt_mt');
  const cbailM=filteredNatureSeries('credit_bail');
  const cctM=filteredNatureSeries('credit_ct');
  // Total debt = sum of 3 natures (no provisions)
  const dettesFinM=new Array(12).fill(null);
  for(let i=0;i<12;i++){
    const mt=empruntM[i]||0,cb=cbailM[i]||0,ct=cctM[i]||0;
    if(ser('emprunt_mt')[i]!=null)dettesFinM[i]=+(mt+cb+ct).toFixed(1);
  }
  const tresoM=ser('tresorerie_a');
  const detteNetteM=new Array(12).fill(null);
  for(let i=0;i<12;i++){if(dettesFinM[i]==null)continue;detteNetteM[i]=+(dettesFinM[i]-(tresoM[i]||0)).toFixed(1)}
  const tresoNegM=tresoM.map(v=>v==null?null:-v);

  // ── KPI cards (no provisions) ──
  const miSnap=bilanMonthIdx(year);
  const empruntSnap=selBank?(bankData[selBank]?.byNature.emprunt_mt?.m[miSnap]||0):pick('emprunt_mt');
  const cbailSnap=selBank?(bankData[selBank]?.byNature.credit_bail?.m[miSnap]||0):pick('credit_bail');
  const cctSnap=selBank?(bankData[selBank]?.byNature.credit_ct?.m[miSnap]||0):pick('credit_ct');
  const detteTot=empruntSnap+cbailSnap+cctSnap;
  const tresoSnap=pick('tresorerie_a');
  const detteNette=detteTot-tresoSnap;
  const ebitdaAnn=annualizedAgg('ebitda');
  const leverage=(ebitdaAnn>0)?+(detteNette/ebitdaAnn).toFixed(1):null;
  const levStr=(leverage!=null&&isFinite(leverage))?(leverage.toFixed(1).replace('.',',')+'\u00d7'):'\u2013';
  const bankLabel=selBank?(' \u00b7 '+selBank):'';
  const kpis=[
    {label:'Emprunt MT',val:fmt(empruntSnap),sub:'M FCFA'+bankLabel},
    {label:'Cr\u00e9dit-bail',val:fmt(cbailSnap),sub:'M FCFA'+bankLabel},
    {label:'Cr\u00e9dits CT',val:fmt(cctSnap),sub:'M FCFA'+bankLabel},
    {label:'Dette nette',val:fmt(detteNette),sub:levStr+' EBITDA'},
  ];
  let khtml='';kpis.forEach(k=>{khtml+=`<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.val}</div><div class="kpi-sub">${esc(k.sub)}</div></div>`});
  document.getElementById('dettesKpis').innerHTML=khtml;

  // ── Bank filter pills ──
  const fw=document.getElementById('bankFilterWrap');
  if(fw&&bankList.length>1){
    fw.style.display='';
    let fhtml='<span class="cw-label">Banque</span>';
    fhtml+=`<button class="company-pill${!selBank?' all-active':''}" data-bank="all">Toutes</button>`;
    bankList.forEach(b=>{
      const active=selBank===b.name?' active':'';
      fhtml+=`<button class="company-pill${active}" data-bank="${esc(b.name)}">${esc(b.name)}</button>`;
    });
    fw.innerHTML=fhtml;
    fw.querySelectorAll('.company-pill').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const bk=btn.dataset.bank;
        STATE._selectedBank=(bk==='all')?null:bk;
        buildDettes();
      });
    });
  }

  const dLabels=activeLabels();

  // ── Chart 1: Exposition bancaire (horizontal bar) ──
  const bankLabels=[],bankVals=[],bankColors=[];
  bankList.forEach(b=>{
    if(Math.abs(b.total)<0.5)return;
    bankLabels.push(b.name);
    bankVals.push(Math.abs(b.total));
    bankColors.push(BANK_COL[b.name]||'#94a3b8');
  });
  cc('d1',document.getElementById('detteBankChart'),{type:'bar',
    data:{labels:bankLabels,datasets:[{data:bankVals,backgroundColor:bankColors.map((c,i)=>selBank&&bankLabels[i]!==selBank?toRgba(c,0.25):toRgba(c,0.8)),borderRadius:4,borderWidth:0,barPercentage:.7}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},datalabels:{display:true,anchor:'end',align:'end',offset:4,clip:false,color:dk?'#e2e8f0':'#334155',font:{size:10,weight:'600'},formatter:v=>fmt(v)}},
      scales:{x:{grid:{color:dk?'rgba(148,163,184,0.12)':'rgba(15,23,42,0.06)'},ticks:{color:dk?'#94a3b8':'#64748b',font:{size:9},callback:v=>fmt(v)}},y:{grid:{display:false},ticks:{color:dk?'#e2e8f0':'#334155',font:{size:10,weight:'500'}}}},
      onClick(evt,elems){if(!elems.length)return;const idx=elems[0].index;const clicked=bankLabels[idx];STATE._selectedBank=(STATE._selectedBank===clicked)?null:clicked;buildDettes()}
    }
  });

  // ── Chart 2: Évolution (stacked + net debt line) ──
  const lineCol=dk?'#e2e8f0':'#0f172a';
  cc('d2',document.getElementById('detteStackedChart'),{type:'bar',
    data:{labels:dLabels,datasets:[
      {label:'Dette brute',data:activeRange(dettesFinM),backgroundColor:toRgba(COL[4],0.5),borderRadius:4,stack:'s',order:3},
      {label:'Tr\u00e9sorerie',data:activeRange(tresoNegM),backgroundColor:toRgba(COL[2],0.5),borderRadius:4,stack:'s',order:3},
      {label:'Dette nette',data:activeRange(detteNetteM),type:'line',borderColor:lineCol,borderWidth:2.5,backgroundColor:toRgba(lineCol,0.06),tension:.35,pointRadius:3,pointBackgroundColor:lineCol,order:1,spanGaps:true}
    ]},
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,layout:{padding:{top:18}},plugins:{...base.plugins,datalabels:{display:(ctx)=>ctx.datasetIndex===2&&ctx.dataset.data[ctx.dataIndex]!=null,anchor:'end',align:'top',offset:4,clip:false,color:lineCol,font:{size:9,weight:'700'},formatter:v=>v==null?'':fmt(v)}},scales:{x:{stacked:true,grid:{display:false},ticks:{color:dk?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:dk?'rgba(148,163,184,0.12)':'rgba(15,23,42,0.06)'},ticks:{color:dk?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  mountSeriesFilter('d2','detteStackedChart');

  // ── Chart 3: Par nature (stacked, no provisions) ──
  cc('d3',document.getElementById('detteByNatureChart'),{type:'bar',
    data:{labels:dLabels,datasets:[
      {label:'Emprunt MT',data:activeRange(empruntM),backgroundColor:toRgba(NAT_COL.emprunt_mt,0.7),borderRadius:3,stack:'n'},
      {label:'Cr\u00e9dit-bail',data:activeRange(cbailM),backgroundColor:toRgba(NAT_COL.credit_bail,0.7),borderRadius:3,stack:'n'},
      {label:'Cr\u00e9dits CT',data:activeRange(cctM),backgroundColor:toRgba(NAT_COL.credit_ct,0.7),borderRadius:3,stack:'n'}
    ]},
    options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,plugins:{...base.plugins,datalabels:dlStacked({fontSize:9})},scales:{x:{stacked:true,grid:{display:false},ticks:{color:dk?'#94a3b8':'#64748b',font:{size:10}}},y:{stacked:true,grid:{color:dk?'rgba(148,163,184,0.12)':'rgba(15,23,42,0.06)'},ticks:{color:dk?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  mountSeriesFilter('d3','detteByNatureChart');

  // ── Detail table with Nature/Banque toggle ──
  const headHtml='<tr><th style="text-align:left">Libell\u00e9</th>'+dLabels.map((m,mi)=>`<th data-col="${mi}">${m}</th>`).join('')+'<th style="text-align:right">Dernier</th></tr>';
  const headEl=document.getElementById('dettesHead');
  if(headEl)headEl.innerHTML=headHtml;

  // View toggle wiring
  const view=STATE._dettesView||'nature';
  const toggle=document.getElementById('dettesViewToggle');
  if(toggle){
    toggle.querySelectorAll('.vtog').forEach(b=>{
      b.classList.toggle('active',b.dataset.view===view);
      b.onclick=()=>{STATE._dettesView=b.dataset.view;buildDettes()};
    });
  }

  // Build table rows based on current view
  const items=[];
  if(view==='nature'){
    // Nature view: natures → individual accounts (with bank name)
    items.push({id:'dettes_fin_b',label:'Dettes financi\u00e8res',level:0,type:'total',expandable:true,m:dettesFinM,bold:true});
    ['emprunt_mt','credit_bail','credit_ct'].forEach(natId=>{
      const natM=natId==='emprunt_mt'?empruntM:natId==='credit_bail'?cbailM:cctM;
      const line=bLine(natId);
      const hasChildren=line&&line.accounts&&line.accounts.length>0;
      items.push({id:natId,label:NAT_LABEL[natId],level:1,parent:'dettes_fin_b',expandable:hasChildren,m:natM});
      if(hasChildren){
        line.accounts.forEach((acct,ai)=>{
          const bank=extractBank(acct.name);
          const lbl=acct.name+(bank!=='Autre'&&bank!=='Cr\u00e9dit-bail'?' \u00b7 '+bank:'');
          items.push({id:natId+'_a'+ai,label:lbl,level:2,parent:natId,m:acct.m||new Array(12).fill(null)});
        });
      }
    });
    // Trésorerie section with bank accounts
    items.push({id:'tresorerie_a',label:'Tr\u00e9sorerie',level:0,type:'total',expandable:true,m:tresoM,bold:true});
    ['effets_enc','banque','caisse'].forEach(subId=>{
      const subLine=bLine(subId);
      const subM=ser(subId);
      const hasChildren=subLine&&subLine.accounts&&subLine.accounts.length>0;
      const subLabel=subId==='effets_enc'?'Effets \u00e0 encaisser':subId==='banque'?'Comptes bancaires':'Caisse';
      items.push({id:subId,label:subLabel,level:1,parent:'tresorerie_a',expandable:hasChildren,m:subM});
      if(hasChildren){
        subLine.accounts.forEach((acct,ai)=>{
          items.push({id:subId+'_a'+ai,label:acct.name,level:2,parent:subId,m:acct.m||new Array(12).fill(null)});
        });
      }
    });
    items.push({id:'dette_nette',label:'Dette nette',level:0,type:'total',m:detteNetteM,bold:true});
  } else {
    // Banque view: banks → facilities
    items.push({id:'dettes_fin_b',label:'Dettes financi\u00e8res',level:0,type:'total',expandable:true,m:dettesFinM,bold:true});
    bankList.forEach(b=>{
      items.push({id:'bank_'+b.name,label:b.name,level:1,parent:'dettes_fin_b',expandable:b.accounts.length>0,m:b.m});
      b.accounts.forEach((acct,ai)=>{
        const natLabel=NAT_LABEL[acct.nature]||acct.nature;
        items.push({id:'bank_'+b.name+'_a'+ai,label:natLabel+' \u2014 '+acct.name,level:2,parent:'bank_'+b.name,m:acct.m||new Array(12).fill(null)});
      });
    });
    // Trésorerie section grouped by bank
    items.push({id:'tresorerie_a',label:'Tr\u00e9sorerie',level:0,type:'total',expandable:true,m:tresoM,bold:true});
    const tresoByBank={};
    ['banque','caisse'].forEach(subId=>{
      const subLine=bLine(subId);
      if(!subLine||!subLine.accounts)return;
      subLine.accounts.forEach(acct=>{
        const bank=extractBank(acct.name);
        if(!tresoByBank[bank])tresoByBank[bank]={m:new Array(12).fill(0),accounts:[]};
        tresoByBank[bank].accounts.push(acct);
        for(let i=0;i<12;i++){const v=acct.m?acct.m[i]:null;if(v!=null)tresoByBank[bank].m[i]+=v}
      });
    });
    Object.entries(tresoByBank).sort((a,b)=>Math.abs(b[1].m[lastIdx])-Math.abs(a[1].m[lastIdx])).forEach(([bank,d])=>{
      items.push({id:'tbank_'+bank,label:bank,level:1,parent:'tresorerie_a',expandable:d.accounts.length>1,m:d.m});
      if(d.accounts.length>1){
        d.accounts.forEach((acct,ai)=>{
          items.push({id:'tbank_'+bank+'_a'+ai,label:acct.name,level:2,parent:'tbank_'+bank,m:acct.m||new Array(12).fill(null)});
        });
      }
    });
    items.push({id:'dette_nette',label:'Dette nette',level:0,type:'total',m:detteNetteM,bold:true});
  }

  // Render table body
  const depthMap=buildRowDepthMap(items);
  let tbody='';
  items.forEach(it=>{
    const depth=depthMap.get(it.id)||0;
    const isHidden=depth>=2;// Standard mode: L0+L1 visible, L2 hidden
    const slice=activeRange(it.m);
    const last=slice[slice.length-1];
    const cls=['row-depth-'+depth];
    if(it.bold||it.type==='total')cls.push('row-l0');
    if(it.expandable)cls.push('row-expandable');
    if(isHidden)cls.push('row-hidden');
    tbody+=`<tr class="${cls.join(' ')}" data-id="${esc(it.id)}" data-parent="${esc(it.parent||'')}" data-depth="${depth}">`;
    tbody+=`<td>`;
    if(it.expandable)tbody+=`<span class="row-expand-icon" data-target="${esc(it.id)}">&#9654;</span>`;
    tbody+=`${esc(it.label)}</td>`;
    slice.forEach((v,mi)=>{
      const display=(v==null)?'\u2013':fmt(v);
      const cellCls=(v!=null&&v<0)?'neg':'';
      const weight=(it.type==='total')?'700':(depth===0?'600':'400');
      tbody+=`<td class="${cellCls}" data-col="${mi}" style="text-align:right;font-weight:${weight}">${display}</td>`;
    });
    const lastDisplay=(last==null)?'\u2013':fmt(last);
    const lastWeight=(it.type==='total')?'700':'600';
    tbody+=`<td style="text-align:right;font-weight:${lastWeight}">${lastDisplay}</td></tr>`;
  });
  const bodyEl=document.getElementById('dettesBody');
  bodyEl.innerHTML=tbody;

  // Wire expand icons
  bodyEl.querySelectorAll('.row-expand-icon').forEach(icon=>{
    icon.addEventListener('click',function(e){
      e.stopPropagation();
      const tid=this.dataset.target;
      const willOpen=!this.classList.contains('open');
      this.classList.toggle('open',willOpen);
      if(willOpen){bodyEl.querySelectorAll(`tr[data-parent="${tid}"]`).forEach(r=>r.classList.remove('row-hidden'))}
      else{cascadeHide(bodyEl,tid)}
    });
  });

  // Mount expand control + default to "standard" (L0+L1 visible) per Victor
  if(!TABLE_EXPAND_MODE['dettesTable'])TABLE_EXPAND_MODE['dettesTable']='standard';
  const toolbar=document.getElementById('dettesToolbar');
  if(toolbar)mountExpandControl(toolbar,'dettesTable');
  refreshTableExpandMode('dettesTable');
  if(typeof applyMonthHighlight==='function')applyMonthHighlight();
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

