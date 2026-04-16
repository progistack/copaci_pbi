// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Refresh, Ratios & Fallback Data
// ═══════════════════════════════════════════════════════════════
// Split from 02_data.js — contains: renderWarnings, deepCloneLine,
// loadBudgetForYear, refreshAll, recomputeRatios, ytdRawCumul,
// recomputeRnReconciliation, and fallback PL/BILAN/CFS/RATIOS data.

// ─── CONTEXTUAL WARNING BANNERS ──────────────────────────────
function renderWarnings(){
  const el=document.getElementById('warnBanner');
  if(!el)return;
  const year=STATE.year;
  const mode=STATE.mode;
  const status=CACHE.yearStatus[year]||'no-data';
  const n1Status=CACHE.yearStatus[year-1];
  const warnings=[];
  const iconWarn='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const iconInfo='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  if(status==='closed-lumped'){
    warnings.push({cls:'red',icon:iconWarn,title:`Exercice ${year} cl\u00f4tur\u00e9 \u2014 donn\u00e9es non mensualis\u00e9es`,body:'Les \u00e9critures de cet exercice sont concentr\u00e9es sur la date de cl\u00f4ture. Les vues mensuelles, YTD et LTM ne sont pas repr\u00e9sentatives. Seul le total annuel est exploitable.'});
  }
  if(mode==='ltm'&&n1Status==='closed-lumped'){
    warnings.push({cls:'',icon:iconWarn,title:`Mode LTM approximatif`,body:`L'exercice ${year-1} est cl\u00f4tur\u00e9 (donn\u00e9es lump\u00e9es sur Dec). Le LTM ${year} utilise une base N-1 non mensualis\u00e9e et ne doit pas \u00eatre utilis\u00e9 pour un reporting bancaire.`});
  }
  if(mode==='ltm'&&!n1Status){
    warnings.push({cls:'',icon:iconWarn,title:`Mode LTM indisponible`,body:`Aucune donn\u00e9e N-1 (${year-1}) disponible pour calculer le rolling 12 mois.`});
  }
  if(status==='open'){
    const lastMo=CACHE.lastMonth[year];
    warnings.push({cls:'',icon:iconInfo,title:`Exercice ${year} en cours \u2014 donn\u00e9es jusqu'\u00e0 ${MO[lastMo]}`,body:'Les mois post\u00e9rieurs sont marqu\u00e9s "\u2013" (non disponibles). Les graphiques sont tronqu\u00e9s \u00e0 la p\u00e9riode active. Le total "Tous" repr\u00e9sente le YTD \u00e0 la derni\u00e8re date disponible.'});
  }

  el.innerHTML=warnings.map(w=>`<div class="warn-banner ${w.cls}">${w.icon}<div><div class="warn-title">${esc(w.title)}</div><div class="warn-body">${esc(w.body)}</div></div></div>`).join('');
}

// ─── BUDGET LOADER ───────────────────────────────────────────
// Priority 1 : real budget from RAW_DATA['budget'+year] (future — not yet in Odoo)
// Priority 2 : placeholder = deep-clone of the GL actual for `year` (so comparators are wired
//              and the UI is functional today; flipping to real budget is a no-op elsewhere)
function deepCloneLine(l){
  const o={...l};
  if(Array.isArray(l.m))o.m=l.m.slice();
  if(Array.isArray(l.children))o.children=l.children.slice();
  if(Array.isArray(l.accounts))o.accounts=l.accounts.map(a=>({...a}));
  return o;
}
function loadBudgetForYear(year){
  if(CACHE.rawBudget[year])return CACHE.rawBudget[year];
  // Priority 1 : real budget (future)
  if(RAW_DATA&&RAW_DATA['budget'+year]){
    const acct=buildAccountBalances(RAW_DATA['budget'+year]);
    CACHE.rawBudget[year]=buildPLData(acct);
    return CACHE.rawBudget[year];
  }
  // Priority 2 : GL actual clone
  const rawPL=CACHE.rawPL[year];
  if(rawPL){
    CACHE.rawBudget[year]=rawPL.map(deepCloneLine);
    return CACHE.rawBudget[year];
  }
  return null;
}

// ─── REFRESH ALL — invalidate tabs and rebuild active ────────
function refreshAll(){
  const year=STATE.year;
  // Ensure raw data is built for the target year
  if(!CACHE.rawPL[year]&&RAW_DATA){
    const balKey='balance'+year;
    const balData=RAW_DATA[balKey];
    if(balData){
      CACHE.acctData[year]=buildAccountBalances(balData);
      CACHE.rawPL[year]=buildPLData(CACHE.acctData[year]);
    }
  }
  // Also build N-1 raw PL if available (needed for LTM and for vs N-1 comparisons)
  if(!CACHE.rawPL[year-1]&&RAW_DATA){
    const balKeyN1='balance'+(year-1);
    const balDataN1=RAW_DATA[balKeyN1];
    if(balDataN1){
      CACHE.acctData[year-1]=buildAccountBalances(balDataN1);
      CACHE.rawPL[year-1]=buildPLData(CACHE.acctData[year-1]);
    }
  }
  const rawPL=CACHE.rawPL[year];
  const rawN1=CACHE.rawPL[year-1];
  const lastMo=CACHE.lastMonth[year];
  const lastMoN1=CACHE.lastMonth[year-1];
  // Load / refresh budget (placeholder if no real budget available)
  const rawBudget=loadBudgetForYear(year);
  if(rawPL){
    PL_DATA=deriveMode(rawPL,STATE.mode,rawN1,lastMo);
    // N-1 mode-transformed : use N-2 as the "N-1" of N-1 for LTM chaining (if available)
    const rawN2=CACHE.rawPL[year-2]||null;
    PL_N1_DATA=rawN1?deriveMode(rawN1,STATE.mode,rawN2,(lastMoN1!=null?lastMoN1:11)):[];
    // Budget mode-transformed (uses same N-1 tail for LTM rolling)
    BUDGET_DATA=rawBudget?deriveMode(rawBudget,STATE.mode,rawN1,lastMo):[];
  }
  if(CACHE.bilan[year]){BILAN_DATA=CACHE.bilan[year]}
  // Rebuild CFS dynamically from rawPL + bilan variations. Falls back to the
  // seed CFS_DATA array if the bilan is a legacy flat snapshot (no m[] series).
  const cfsBuilt = buildCfsFromRaw(year);
  if(cfsBuilt){
    CFS_DATA = cfsBuilt;
    const q = CFS_DATA._quality;
    if(q) console.log('[CFS '+year+'] rebuilt — gross flux '+q.grossFlux.toFixed(1)+' M, residual '+q.absResidual.toFixed(1)+' M ('+q.residualPct+'%)');
  }
  // Recompute all ratios (DSO/DIO/DPO/ROE/ROA/BFR/levier/current + RN reconciliation).
  // Must run AFTER PL_DATA and BILAN_DATA are in place.
  recomputeRatios();
  // Reset all tabs and rebuild active
  Object.keys(tabBuilt).forEach(k=>tabBuilt[k]=false);
  destroyChartsFor('');
  tabBuilt[currentTab]=true;
  if(typeof TAB_BUILDERS!=='undefined'&&TAB_BUILDERS[currentTab])TAB_BUILDERS[currentTab]();
  renderWarnings();
  if(typeof applyMonthHighlight==='function')applyMonthHighlight();
}

// ─── RATIO RECOMPUTE — central, mode-aware ──────────────────
// Computes all ratios that depend on (i) the current P&L mode-aware aggregate
// and (ii) the bilan snapshot at the selected month. Called by refreshAll() and
// by the month-pill handler so working-capital KPIs (DSO/DIO/DPO/ROE/ROA/BFR/
// levier/current ratio) and the RN reconciliation always reflect the live state.
function recomputeRatios(){
  // Flow inputs.
  // — Margins use the regular annualizedAgg : margin % is scale-invariant, the
  //   12/N annualization cancels mathematically, AND we want the displayed ratio
  //   to match the literal "Marge brute" card on the KPI tab (mb_full/ca_full).
  // — ROE/ROA & levier use the CLOSED annualized variant : the partial month
  //   under-counts the bottom line, so closed-month annualization is the right
  //   denominator on the bilan side.
  // — Working-capital days (DSO/DIO/DPO/BFR jours) use the LTM-locked variant
  //   ltmAggClosed : Victor wants these always on a true rolling-12-month base
  //   regardless of the global view, otherwise YTD-annualized flows in early
  //   months produce wildly volatile values that don't represent the business
  //   cycle.
  //
  // METHODOLOGIE DES RATIOS DE ROULEMENT (Victor, Avr 2026) :
  // Les trois DSO/DIO/DPO sont rapportés au CA (pas au COGS proxy comme le
  // textbook). Trois raisons :
  //   1. Cohérence interne : DIO + DSO − DPO = BFR/CA × 365, strictement.
  //      L'approche textbook (DIO/DPO /COGS) n'a PAS cette propriété, donc son
  //      CCC est une somme hétéroclite sans interprétation directe.
  //   2. Le "COGS proxy" = CA − marge brute inclut des éléments qui ne sont
  //      ni dans les stocks (escompte, ristournes, var PF) ni dans les
  //      fournisseurs (commissions, escompte). C'est donc un compromis faux
  //      dans les deux sens : sous-estime DIO, sur-estime DPO.
  //   3. Lisibilité DAF : tous les ratios s'expriment en "jours de CA", unité
  //      unique et intuitive pour un pilotage de trésorerie.
  // Trade-off assumé : perte de comparabilité directe avec les benchmarks
  // industriels qui utilisent le textbook. Les seuils benchmarks affichés
  // sur la tuile CCC ont été recalibrés en conséquence.
  const caFull     = annualizedAgg('ca_net');
  const mbFull     = annualizedAgg('marge_brute');
  const ebitdaFull = annualizedAgg('ebitda');
  const rnFull     = annualizedAgg('resultat_net');
  const ca     = annualizedAggClosed('ca_net');
  const mb     = annualizedAggClosed('marge_brute');
  const ebitda = annualizedAggClosed('ebitda');
  const rn     = annualizedAggClosed('resultat_net');
  // LTM-locked working-capital denominator (always rolling 12M, mode-agnostic).
  // Un seul dénominateur — le CA LTM — pour les 3 ratios de roulement.
  const caLtm = ltmAggClosed('ca_net');

  // Snapshot inputs — period-matched to the LTM target month for working-capital
  // numerators (clients/stocks/frs) and to the closed month for the rest.
  // The LTM target = user-selected month (or last closed if 'all'/partial), so
  // working-capital ratios always read end-of-period stocks against the rolling
  // 12-month flow ending at that same month.
  const lc = lastClosedMonth(STATE.year);
  const ltmTgt = ltmTargetMonth();
  const useClosedSnap = (lc>=0) && (STATE.selectedMonth==='all' || isPartialMonth(STATE.year, +STATE.selectedMonth));
  const _bal = useClosedSnap ? (id => balByAt(id, STATE.year, lc)) : balBy;
  // Working-capital numerators are ALWAYS read at the LTM target month.
  const _balLtm = (ltmTgt>=0)
    ? (id => balByAt(id, STATE.year, ltmTgt))
    : _bal;
  const clientsLtm = _balLtm('clients_grp');
  const stocksLtm  = _balLtm('stocks');
  const frsLtm     = _balLtm('frs_grp');
  // Other bilan inputs (ROE/ROA/levier/current ratio) keep mode-aware behavior.
  const cp        = _bal('cp');
  const totalActif= _bal('total_actif');
  const dettesFin = _bal('dettes_fin_b');
  const treso     = _bal('tresorerie_a');
  const actifCirc = _bal('actif_circ');
  const passifCirc= _bal('passif_circ');

  // Margins (mode-aware — uses FULL aggregate so the gauge value matches the
  // literal Marge brute card on the KPI tab; closed/full only differ if the
  // partial month has a structurally different margin from the closed average).
  if(caFull){
    RATIOS.marge_brute.val  = +(mbFull/caFull*100).toFixed(1);
    RATIOS.marge_ebitda.val = +(ebitdaFull/caFull*100).toFixed(1);
    RATIOS.marge_nette.val  = +(rnFull/caFull*100).toFixed(1);
  }

  // Working capital — LTM-locked, tous rapportés au CA (cf. méthodologie ci-dessus)
  RATIOS.dso.val = (caLtm>0 && clientsLtm>0) ? Math.round(clientsLtm/caLtm*365) : 0;
  RATIOS.dio.val = (caLtm>0 && stocksLtm>0)  ? Math.round(stocksLtm/caLtm*365)  : 0;
  RATIOS.dpo.val = (caLtm>0 && frsLtm>0)     ? Math.round(frsLtm/caLtm*365)     : 0;
  if(caLtm>0){
    const bfr = clientsLtm + stocksLtm - frsLtm;
    RATIOS.bfr_ca.val = Math.round(bfr/caLtm*365);
  }

  // Profitability — clamp near-zero denominators to avoid astronomical ratios
  RATIOS.roe.val = Math.abs(cp)>0.01         ? +Math.max(-999,Math.min(999,(rn/cp*100))).toFixed(1)         : 0;
  RATIOS.roa.val = Math.abs(totalActif)>0.01 ? +Math.max(-999,Math.min(999,(rn/totalActif*100))).toFixed(1) : 0;

  // Leverage & liquidity \u2014 dynamic (so the KPI tab no longer shows stale values
  // when the user lands there without first visiting Synth\u00e8se).
  //
  // Dette nette et Levier : on utilise les valeurs LIVE balBy() (pas le closed-snap),
  // car ce sont des valeurs instantan\u00e9es, pas des ratios p\u00e9riode-align\u00e9s. Garantit
  // la coh\u00e9rence avec la jauge Sant\u00e9 financi\u00e8re, le KPI Synth\u00e8se et l'insight.
  const detteNetteLive = (balBy('dettes_fin_b')||0) - (balBy('tresorerie_a')||0);
  const ebitdaAnnLive  = annualizedAgg('ebitda');// same denominator as the health gauge
  RATIOS.dette_nette.val   = +detteNetteLive.toFixed(1);
  // Levier null quand EBITDA \u2264 0 (ratio ind\u00e9termin\u00e9) \u2192 affichage n/d sur tous les onglets.
  RATIOS.levier.val        = ebitdaAnnLive>0 ? +(detteNetteLive/ebitdaAnnLive).toFixed(1) : null;
  RATIOS.current_ratio.val = passifCirc>0? +(actifCirc/passifCirc).toFixed(2): null;

  // RN Bilan \u2194 P&L reconciliation \u2014 separate function so the rule
  // can be re-evaluated independently if ever needed.
  recomputeRnReconciliation();
}

// YTD cumul of a raw P&L line up to the current target month, regardless of mode.
// Used for the RN reconciliation : the bilan rn_ex is a snapshot at month M, so
// the comparable P&L value is the cumul Jan\u2192M (not annualized, not LTM).
function ytdRawCumul(id){
  const raw = CACHE.rawPL[STATE.year];
  if(!raw)return null;
  const line = raw.find(l=>l.id===id);
  if(!line || !line.m)return null;
  const lm = CACHE.lastMonth[STATE.year];
  const lastIdx = (lm!=null && lm>=0) ? lm : 11;
  const target = STATE.selectedMonth==='all' ? lastIdx : Math.min(+STATE.selectedMonth, 11);
  let s = 0; let any = false;
  for(let i=0;i<=target;i++){if(line.m[i]!=null){s+=line.m[i]; any=true}}
  return any ? s : null;
}

function recomputeRnReconciliation(){
  // SYSCOHADA : exercice clôturé → RN dans compte 13 (rn_ex). Exercice en cours → solde
  // classes 6/7 dans `result_encours`. On somme les deux pour être robuste aux deux cas.
  const rnEx       = balBy('rn_ex');
  const rnEncours  = balBy('result_encours');
  const rnBilan    = (rnEx||0) + (rnEncours||0);
  const rnPL       = ytdRawCumul('resultat_net');
  if(rnPL==null){RATIOS._rnReco=null; return}
  const delta = rnBilan - rnPL;
  // Floor by max(|bilan|,|pl|,1) to avoid % instability when both are tiny (early year)
  const base  = Math.max(Math.abs(rnBilan), Math.abs(rnPL), 1);
  const deltaPct = Math.abs(delta)/base*100;
  RATIOS._rnReco = {bilan:rnBilan, pl:rnPL, delta, deltaPct, rnEx, rnEncours};
}

// P&L data — will be populated from Odoo JSON
// PL_N1_DATA : N-1 mode-transformed (for variance vs. previous year)
// BUDGET_DATA : Budget mode-transformed (placeholder = GL actual clone until real budget loaded)
let PL_N1_DATA = [];
let BUDGET_DATA = [];
let PL_DATA = [
  {id:'ca_net',label:'Chiffre d\'affaires net',level:0,type:'total',expandable:true,
   m:[579.1,637.9,709.4,843.8,711.5,692.2,856.6,503.6,686.8,917.4,997.1,1124.1],
   children:['ca_local','ca_export']},
  {id:'ca_local',label:'CA local',level:1,parent:'ca_net',
   m:[547.0,637.9,510.0,517.7,548.6,481.1,609.0,474.3,541.3,554.3,702.2,655.8],
   accounts:[{code:'701',name:'Ventes de produits finis'},{code:'706',name:'Services vendus'},{code:'707',name:'Ventes de marchandises'}]},
  {id:'ca_export',label:'CA export',level:1,parent:'ca_net',
   m:[32.1,0,199.4,326.1,163.0,211.0,247.6,29.3,145.5,363.1,294.9,468.3],
   accounts:[{code:'702',name:'Ventes export'}]},

  {id:'spacer1',type:'spacer'},

  {id:'conso_emb',label:'Consommation Emballages & Etiquettes',level:1,type:'subtotal',expandable:true,
   m:[-169.0,-107.5,-53.6,-160.2,-82.1,-88.7,-86.1,-132.8,-92.7,-225.5,3.6,-213.4],
   children:['achats_emb','var_stock_emb']},
  {id:'achats_emb',label:'Achats emballages & etiquettes',level:2,parent:'conso_emb',
   m:[-100.1,-129.4,-70.3,-38.6,-91.8,-62.6,-91.3,-80.5,-180.4,-113.5,-95.9,-121.6],
   accounts:[{code:'608',name:'Achats emballages & etiquettes'}]},
  {id:'var_stock_emb',label:'Variation de stock Emballages',level:2,parent:'conso_emb',
   m:[-68.9,21.9,16.6,-121.6,9.7,-26.1,5.2,-52.3,87.7,-112.0,99.5,-91.8],
   accounts:[{code:'6032',name:'Variation stock emballages'}]},

  {id:'conso_mp',label:'Consommation Matieres Premieres',level:1,type:'subtotal',expandable:true,
   m:[-179.2,-372.9,-290.6,-301.6,-290.9,-240.9,-260.3,-206.0,-320.6,-361.3,-445.5,-371.8],
   children:['achats_mp','var_stock_mp']},
  {id:'achats_mp',label:'Achats matieres premieres',level:2,parent:'conso_mp',
   m:[-249.2,-261.2,-115.5,-281.7,-356.3,-286.1,-241.0,-291.3,-558.6,-655.2,-493.3,-239.7],
   accounts:[{code:'601',name:'Achats matieres premieres'},{code:'602',name:'Achats matieres consommables'}]},
  {id:'var_stock_mp',label:'Variation de stock Matieres Premieres',level:2,parent:'conso_mp',
   m:[70.0,-111.7,-175.1,-19.8,65.4,45.2,-19.3,85.3,238.0,293.9,47.7,-132.0],
   accounts:[{code:'6031',name:'Variation stock MP'}]},

  {id:'ristournes',label:'Ristournes accordees',level:1,
   m:[-9.8,-11.2,-9.4,-11.1,-11.2,-11.1,-11.6,-19.9,-10.7,-13.7,-10.9,-6.7],
   accounts:[{code:'673',name:'Ristournes accordees'}]},
  {id:'escompte',label:'Escompte accorde',level:1,
   m:[-14.8,-16.0,-14.2,-13.1,-15.8,-12.9,-17.1,-13.0,-14.7,-12.5,-21.4,-18.1],
   accounts:[{code:'700',name:'Escompte accorde'}]},
  {id:'var_stock_pf',label:'Variation de stock de produits finis',level:1,
   m:[-47.8,93.6,-67.7,-35.6,-15.3,-128.1,-184.5,11.0,58.4,154.0,-61.6,-54.5],
   accounts:[{code:'736',name:'Variation stock produits finis'}]},
  {id:'achats_ns',label:'Achats non stockes',level:1,
   m:[-1.9,-3.7,-1.5,-1.2,-6.0,-0.2,-2.6,-0.5,-3.9,-2.9,-3.3,-3.0],
   accounts:[{code:'604',name:'Achats non stockes de matieres'}]},

  {id:'marge_brute',label:'Marge brute',level:0,type:'total',
   m:[156.7,220.2,272.5,321.0,290.2,210.3,294.4,142.5,302.5,455.5,458.0,456.6]},
  {id:'pct_mb',label:'% Marge brute',level:0,type:'pct',
   m:[27.1,34.5,38.4,38.0,40.8,30.4,34.4,28.3,44.0,49.6,45.9,40.6]},

  {id:'spacer2',type:'spacer'},

  {id:'couts_directs',label:'Couts directs',level:1,type:'subtotal',expandable:true,
   m:[-21.6,-24.1,-21.2,-20.9,-27.7,-26.0,-12.3,-20.1,-16.7,-28.2,-49.8,-50.5],
   children:['elec_direct','energie_direct','transport_direct','prest_ext']},
  {id:'elec_direct',label:'Electricite & eau direct',level:2,parent:'couts_directs',
   m:[-14.3,-15.1,-15.0,-8.4,-9.1,-10.4,-6.3,-7.2,-7.4,-20.1,-20.9,-19.0],
   accounts:[{code:'6051',name:'Electricite directe'},{code:'6052',name:'Eau directe'}]},
  {id:'energie_direct',label:'Autres energies direct',level:2,parent:'couts_directs',
   m:[-6.8,-8.4,-6.1,-9.3,-9.1,-9.6,-4.6,-10.7,-6.0,-4.8,-10.1,-7.6],
   accounts:[{code:'6053',name:'Autres energies'}]},
  {id:'transport_direct',label:'Transport direct',level:2,parent:'couts_directs',
   m:[-0.5,-0.6,-0.2,-3.2,-9.4,-6.0,-1.3,-2.3,-3.3,-3.2,-1.9,-3.7],
   accounts:[{code:'612',name:'Transport direct'}]},
  {id:'prest_ext',label:'Prestations de services externes',level:2,parent:'couts_directs',
   m:[0,0,0,0,0,0,0,0,0,0,-16.9,-20.3],
   accounts:[{code:'637',name:'Prestations services externes'}]},

  {id:'marge_cd',label:'Marge sur couts directs',level:0,type:'total',
   m:[135.1,196.1,251.3,300.1,262.5,184.3,282.2,122.3,285.8,427.3,408.2,406.0]},
  {id:'pct_mcd',label:'% Marge sur couts directs',level:0,type:'pct',
   m:[23.3,30.7,35.4,35.6,36.9,26.6,32.9,24.3,41.6,46.6,40.9,36.1]},

  {id:'spacer3',type:'spacer'},

  {id:'ga',label:'Frais generaux',level:0,type:'total',expandable:true,
   m:[-209.9,-230.1,-175.4,-213.1,-227.7,-251.3,-234.3,-200.8,-229.3,-258.9,-211.9,-270.7],
   children:['ga_personnel','ga_impots','ga_autres_achats','ga_assurances','ga_loyers','ga_banque','ga_reparat','ga_pub','ga_conseil','ga_transport','ga_telecom','ga_elec_ind','ga_charges_pers','ga_charges_soc','ga_autres']},
  {id:'ga_personnel',label:'Charges de personnel',level:1,parent:'ga',
   m:[-111.0,-121.1,-109.7,-122.3,-113.9,-130.3,-121.0,-116.0,-132.7,-146.9,-109.9,-170.5],
   accounts:[{code:'661',name:'Remunerations directes'},{code:'662',name:'Primes'},{code:'663',name:'Indemnites'}]},
  {id:'ga_charges_soc',label:'Charges sociales (employeur)',level:1,parent:'ga',
   m:[-11.0,-14.6,-10.0,-10.8,-10.4,-11.0,-10.7,-10.4,-12.4,-12.6,-12.0,-15.4],
   accounts:[{code:'664',name:'Charges sociales'},{code:'668',name:'Autres charges sociales'}]},
  {id:'ga_impots',label:'Impots & taxes',level:1,parent:'ga',
   m:[-27.6,-42.0,-22.9,-32.7,-28.3,-32.8,-30.9,-21.5,-28.5,-25.4,-25.7,-22.5],
   accounts:[{code:'641',name:'Impots & taxes'},{code:'645',name:'Patentes'},{code:'646',name:'Droits enregistrement'}]},
  {id:'ga_autres_achats',label:'Autres achats',level:1,parent:'ga',
   m:[-17.4,-8.7,-6.0,-16.9,-7.8,-17.3,-11.8,-8.9,-5.3,-7.1,-10.9,-14.5],
   accounts:[{code:'626',name:'Autres achats'},{code:'634',name:'Fournitures bureau'},{code:'635',name:'Fournitures diverses'}]},
  {id:'ga_banque',label:'Frais bancaires',level:1,parent:'ga',
   m:[-10.4,-8.5,-7.1,-7.1,-15.2,-11.5,-18.8,-19.1,-19.0,-23.1,-9.6,-18.0],
   accounts:[{code:'631',name:'Frais bancaires'}]},
  {id:'ga_assurances',label:'Assurances',level:1,parent:'ga',
   m:[-4.6,-6.7,-2.0,-7.4,-2.5,-8.3,-12.0,-2.9,-3.1,-7.5,-8.5,-4.7],
   accounts:[{code:'625',name:'Assurances'}]},
  {id:'ga_loyers',label:'Loyers',level:1,parent:'ga',
   m:[-5.9,-5.9,-5.9,-5.9,-6.5,-6.5,-6.5,-6.7,-6.5,-6.5,-6.5,-6.5],
   accounts:[{code:'622',name:'Loyers'}]},
  {id:'ga_reparat',label:'Reparations & maintenance',level:1,parent:'ga',
   m:[-10.4,-3.4,-4.4,-3.7,-6.3,-10.3,-4.8,-7.1,-6.0,-7.0,-8.3,-4.4],
   accounts:[{code:'624',name:'Reparations & maintenance'}]},
  {id:'ga_pub',label:'Publicite & communication',level:1,parent:'ga',
   m:[-1.9,-8.6,-1.1,-1.3,-22.9,-4.6,-5.1,-0.6,-4.0,-1.6,-6.2,-2.5],
   accounts:[{code:'627',name:'Publicite & communication'}]},
  {id:'ga_conseil',label:'Remunerations intermediaires & conseils',level:1,parent:'ga',
   m:[-3.5,-6.6,-3.5,-3.7,-5.8,-11.9,-5.6,-3.4,-8.9,-16.7,-7.3,-3.7],
   accounts:[{code:'632',name:'Honoraires'}]},
  {id:'ga_telecom',label:'Telephonie & Internet',level:1,parent:'ga',
   m:[-0.6,-1.1,-1.1,-1.3,-1.3,-4.2,-2.5,-2.4,-2.3,-2.3,-1.3,-4.4],
   accounts:[{code:'628',name:'Telephonie & Internet'}]},
  {id:'ga_transport',label:'Transport / Deplacements',level:1,parent:'ga',
   m:[-2.3,-1.2,-0.2,0.2,-1.1,-0.8,-3.1,-1.5,-0.4,-0.8,-3.3,-1.5],
   accounts:[{code:'614',name:'Transport deplacement'},{code:'616',name:'Transports divers'}]},
  {id:'ga_elec_ind',label:'Electricite & eau indirect',level:1,parent:'ga',
   m:[-0.4,-0.4,-0.4,-0.1,-0.4,-0.3,-0.3,-0.2,-0.2,-0.4,-0.3,-0.3],
   accounts:[{code:'6055',name:'Electricite indirecte'}]},
  {id:'ga_charges_pers',label:'Autres charges de personnel',level:1,parent:'ga',
   m:[-2.8,-1.2,-1.0,0,-5.0,-1.2,-1.2,-0.4,0,-1.0,-1.9,-1.3],
   accounts:[{code:'633',name:'Autres charges personnel'},{code:'638',name:'Charges personnel diverses'}]},
  {id:'ga_autres',label:'Autres charges',level:1,parent:'ga',
   m:[0,-0.1,0,0,-0.1,-0.2,0,0.4,0,0,-0.1,-0.4],
   accounts:[{code:'650',name:'Autres charges'},{code:'651',name:'Charges diverses'},{code:'658',name:'Charges exceptionnelles'}]},

  {id:'pct_ga',label:'% Frais generaux',level:0,type:'pct',
   m:[-36.2,-36.1,-24.7,-25.3,-32.0,-36.3,-27.4,-39.9,-33.4,-28.2,-21.3,-24.1]},

  {id:'spacer4',type:'spacer'},

  {id:'autres_prod',label:'Autres produits d\'exploitation',level:1,
   m:[0,0,0,0,0,0,0,0,0,0,2.3,0],
   accounts:[{code:'758',name:'Autres produits exploitation'},{code:'781',name:'Reprises amort provisions'}]},

  {id:'ebitda',label:'EBITDA',level:0,type:'total',
   m:[-74.8,-34.0,75.9,87.0,34.8,-67.0,47.9,-78.5,56.5,168.4,198.5,135.4]},
  {id:'pct_ebitda',label:'% EBITDA',level:0,type:'pct',
   m:[-12.9,-5.3,10.7,10.3,4.9,-9.7,5.6,-15.6,8.2,18.4,19.9,12.0]},

  {id:'spacer5',type:'spacer'},

  {id:'da',label:'D&A',level:1,type:'subtotal',expandable:true,
   m:[-21.7,-21.2,-21.1,-21.0,-21.4,-21.9,-21.3,-21.3,-23.9,-24.7,-21.8,-21.7],
   children:['dotations','reprises_prov']},
  {id:'dotations',label:'Dotations aux amortissements',level:2,parent:'da',
   m:[-21.7,-21.2,-21.1,-21.0,-21.4,-21.9,-21.3,-21.3,-23.9,-24.7,-21.8,-21.7],
   accounts:[{code:'681',name:'Dotations amortissements'}]},
  {id:'reprises_prov',label:'Reprises sur provisions',level:2,parent:'da',
   m:[0,0,0,0,0,0,0,0,0,0,0,0],
   accounts:[{code:'791',name:'Reprises provisions'}]},

  {id:'ebit',label:'EBIT',level:0,type:'total',
   m:[-96.5,-55.2,54.8,66.1,13.4,-88.9,26.6,-99.8,32.6,143.7,176.7,113.7]},
  {id:'pct_ebit',label:'% EBIT',level:0,type:'pct',
   m:[-16.7,-8.6,7.7,7.8,1.9,-12.8,3.1,-19.8,4.7,15.7,17.7,10.1]},

  {id:'spacer6',type:'spacer'},

  {id:'charges_fin',label:'Charges financieres',level:1,
   m:[-120.5,-12.5,-12.5,-13.0,-12.0,-11.0,-22.0,-15.0,-13.5,-12.0,-14.0,-13.5],
   accounts:[{code:'671',name:'Interets emprunts'},{code:'672',name:'Interets decouverts'},{code:'674',name:'Agios'},{code:'675',name:'Escomptes bancaires'},{code:'676',name:'Pertes de change'}]},
  {id:'produits_fin',label:'Produits financiers',level:1,
   m:[0.1,0.5,0.5,0.1,0.2,0.1,0.2,0.3,0.1,0.2,0.1,0.1],
   accounts:[{code:'773',name:'Produits financiers'},{code:'776',name:'Gains de change'}]},
  {id:'resultat_fin',label:'Resultat financier',level:0,type:'total',
   m:[-120.4,-12.0,-12.0,-12.9,-11.8,-10.9,-21.8,-14.7,-13.4,-11.8,-13.9,-13.4]},

  {id:'spacer7',type:'spacer'},

  {id:'charges_exc',label:'Charges exceptionnelles',level:1,
   m:[-18.2,-0.1,0,-0.1,-0.2,-0.1,0,0,-0.1,0,-0.2,-0.2],
   accounts:[{code:'836',name:'Charges HAO'}]},
  {id:'produits_exc',label:'Produits exceptionnels',level:1,
   m:[0,0,0,0,0,0,0,0,0,0,0.2,0],
   accounts:[{code:'846',name:'Produits HAO'}]},
  {id:'resultat_exc',label:'Resultat exceptionnel',level:0,type:'total',
   m:[-18.2,-0.1,0,-0.1,-0.2,-0.1,0,0,-0.1,0,0,-0.2]},

  {id:'spacer8',type:'spacer'},

  {id:'rcai',label:'RCAI',level:0,type:'total',
   m:[-235.1,-67.3,42.8,53.1,1.4,-99.9,4.8,-114.5,19.1,131.9,162.8,100.1]},
  {id:'pct_rcai',label:'% RCAI',level:0,type:'pct',
   m:[-40.6,-10.5,6.0,6.3,0.2,-14.4,0.6,-22.7,2.8,14.4,16.3,8.9]},

  {id:'spacer9',type:'spacer'},

  {id:'is',label:'Impot sur les benefices',level:1,
   m:[0,0,-0.7,-6.3,0,5.0,59.1,13.5,7.1,15.1,1.8,64.5],
   accounts:[{code:'891',name:'Impot BIC'}]},

  {id:'resultat_net',label:'Resultat net',level:0,type:'total',
   m:[-235.1,-67.3,42.1,46.8,1.4,-94.9,63.9,-101.0,26.2,147.0,164.6,164.6]},
  {id:'pct_rn',label:'% Marge nette',level:0,type:'pct',
   m:[-40.6,-10.5,5.9,5.5,0.2,-13.7,7.5,-20.1,3.8,16.0,16.5,14.6]},
];

// Bilan data — will be populated from Odoo (fallback sample)
let BILAN_DATA = {
  actif:[
    {id:'immo',label:'Immobilisations',level:0,type:'total',expandable:true,val:987.8,children:['immo_incorp','immo_corp','immo_fin']},
    {id:'immo_incorp',label:'Immobilisations incorporelles nettes',level:1,parent:'immo',val:30.5,accounts:[{code:'213',name:'Logiciels'},{code:'281',name:'Amort immo incorporelles'}]},
    {id:'immo_corp',label:'Immobilisations corporelles nettes',level:1,parent:'immo',val:957.3,expandable:true,children:['immo_corp_brut','amort_corp']},
    {id:'immo_corp_brut',label:'Immobilisations corporelles brutes',level:2,parent:'immo_corp',val:4255.5,accounts:[{code:'232',name:'Batiments'},{code:'234',name:'Installations techniques'},{code:'241',name:'Materiel industriel'},{code:'244',name:'Materiel transport'},{code:'245',name:'Materiel bureau'}]},
    {id:'amort_corp',label:'Amortissements',level:2,parent:'immo_corp',val:-3298.2,accounts:[{code:'283',name:'Amort immo corporelles'},{code:'284',name:'Amort materiel'}]},
    {id:'immo_fin',label:'Immobilisations financieres',level:1,parent:'immo',val:0,accounts:[{code:'275',name:'Depots et cautionnements'}]},

    {id:'actif_circ',label:'Actif circulant',level:0,type:'total',expandable:true,val:4811.1,children:['stocks','clients_grp','autres_creances_grp']},
    {id:'stocks',label:'Stocks',level:1,parent:'actif_circ',val:3070.5,accounts:[{code:'321',name:'Stock MP'},{code:'335',name:'Stock approvisionnements'},{code:'361',name:'Stock produits finis'}]},
    {id:'clients_grp',label:'Clients',level:1,parent:'actif_circ',val:1734.7,expandable:true,children:['creances_cl','acomptes_cl','creances_dout']},
    {id:'creances_cl',label:'Creances clients',level:2,parent:'clients_grp',val:1786.1,accounts:[{code:'411',name:'Clients'},{code:'412',name:'Clients effets a recevoir'}]},
    {id:'acomptes_cl',label:'Acomptes clients',level:2,parent:'clients_grp',val:-60.4,accounts:[{code:'419',name:'Clients avances recues'}]},
    {id:'creances_dout',label:'Creances douteuses',level:2,parent:'clients_grp',val:9.0,accounts:[{code:'416',name:'Clients douteux'}]},
    {id:'autres_creances_grp',label:'Autres creances',level:1,parent:'actif_circ',val:5.8,expandable:true,children:['depots_caut','cca','debiteurs_div','credit_tva']},
    {id:'depots_caut',label:'Depots et cautionnements',level:2,parent:'autres_creances_grp',val:32.9,accounts:[{code:'275',name:'Depots et cautionnements'}]},
    {id:'cca',label:'Charges constatees d\'avance',level:2,parent:'autres_creances_grp',val:99.0,accounts:[{code:'476',name:'Charges constatees avance'}]},
    {id:'debiteurs_div',label:'Debiteurs divers',level:2,parent:'autres_creances_grp',val:-130.0,accounts:[{code:'471',name:'Debiteurs divers'}]},
    {id:'credit_tva',label:'Credit de TVA',level:2,parent:'autres_creances_grp',val:4.0,accounts:[{code:'445',name:'Credit TVA'}]},

    {id:'tresorerie_a',label:'Tresorerie',level:0,type:'total',expandable:true,val:419.9,children:['effets_enc','banque','caisse']},
    {id:'effets_enc',label:'Effets a encaisser',level:1,parent:'tresorerie_a',val:0,accounts:[{code:'511',name:'Effets a encaisser'}]},
    {id:'banque',label:'Banque',level:1,parent:'tresorerie_a',val:395.5,accounts:[{code:'521',name:'Banques'}]},
    {id:'caisse',label:'Caisse',level:1,parent:'tresorerie_a',val:24.4,accounts:[{code:'571',name:'Caisse'}]},

    {id:'total_actif',label:'TOTAL ACTIF',level:0,type:'grandtotal',val:6218.8},
  ],
  passif:[
    {id:'cp',label:'Capitaux propres',level:0,type:'total',expandable:true,val:1561.7,children:['capital','ran','rn_ex']},
    {id:'capital',label:'Capital',level:1,parent:'cp',val:250.0,accounts:[{code:'101',name:'Capital social'}]},
    {id:'ran',label:'Report a nouveau',level:1,parent:'cp',val:1382.4,accounts:[{code:'121',name:'Report a nouveau'}]},
    {id:'rn_ex',label:'Resultat de l\'exercice',level:1,parent:'cp',val:-120.7,accounts:[{code:'131',name:'Resultat exercice'}]},

    {id:'dettes_fin_b',label:'Dettes financieres',level:0,type:'total',expandable:true,val:2057.3,children:['emprunt_mt','credit_bail','credit_ct','provisions']},
    {id:'emprunt_mt',label:'Emprunt bancaire a moyen terme',level:1,parent:'dettes_fin_b',val:424.2,accounts:[{code:'162',name:'Emprunts bancaires'}]},
    {id:'credit_bail',label:'Dettes de credit-bail',level:1,parent:'dettes_fin_b',val:117.6,accounts:[{code:'173',name:'Dettes credit-bail'}]},
    {id:'credit_ct',label:'Credits bancaires a court terme',level:1,parent:'dettes_fin_b',val:1450.4,accounts:[{code:'561',name:'Credits bancaires CT'}]},
    {id:'provisions',label:'Provisions pour risques et charges',level:1,parent:'dettes_fin_b',val:65.1,accounts:[{code:'196',name:'Provisions risques'}]},

    {id:'passif_circ',label:'Passif circulant',level:0,type:'total',expandable:true,val:2599.9,children:['frs_grp','dettes_fisc_soc']},
    {id:'frs_grp',label:'Dettes fournisseurs',level:1,parent:'passif_circ',val:2279.9,expandable:true,children:['frs','frs_fnp','acomptes_frs']},
    {id:'frs',label:'Fournisseurs',level:2,parent:'frs_grp',val:2262.0,accounts:[{code:'401',name:'Fournisseurs'},{code:'402',name:'Fournisseurs effets a payer'}]},
    {id:'frs_fnp',label:'Fournisseurs - Factures non parvenues',level:2,parent:'frs_grp',val:17.9,accounts:[{code:'408',name:'Fournisseurs FNP'}]},
    {id:'acomptes_frs',label:'Acomptes fournisseurs',level:2,parent:'frs_grp',val:0,accounts:[{code:'409',name:'Acomptes fournisseurs'}]},
    {id:'dettes_fisc_soc',label:'Dettes fiscales et sociales',level:1,parent:'passif_circ',val:319.9,expandable:true,children:['imp_taxes','tva_payer','emp_charges']},
    {id:'imp_taxes',label:'Impots & taxes',level:2,parent:'dettes_fisc_soc',val:78.8,accounts:[{code:'441',name:'Etat impots sur benefices'},{code:'442',name:'Autres impots'}]},
    {id:'tva_payer',label:'TVA a payer',level:2,parent:'dettes_fisc_soc',val:50.4,accounts:[{code:'443',name:'TVA facturee'},{code:'444',name:'TVA due'}]},
    {id:'emp_charges',label:'Employes et charges sociales',level:2,parent:'dettes_fisc_soc',val:190.7,accounts:[{code:'421',name:'Personnel remunerations'},{code:'431',name:'Organismes sociaux'}]},

    {id:'total_passif',label:'TOTAL PASSIF',level:0,type:'grandtotal',val:6218.8},
  ]
};

// Cash Flow data — SEED values remplacées dynamiquement par buildCfsFromRaw(year)
// dans refreshAll(). Conservées ici comme fallback si aucun bilan mensualisé
// n'est disponible (anciens exercices en snapshot flat).
let CFS_DATA = [
  {id:'cfs_title',label:'Flux d\'exploitation',level:0,type:'section'},
  {id:'cfs_rn',label:'Resultat net',level:1,parent:'cfs_flux_expl',m:[null,-235.1,null,-67.3,42.1,46.8,0.1,-94.9,63.9,-101.0,26.2,147.0],accounts:[{code:'131',name:'Resultat net'}]},
  {id:'cfs_da',label:'Dotations aux amortissements',level:1,parent:'cfs_flux_expl',m:[null,21.0,null,22.5,22.4,22.0,22.5,22.9,21.7,21.7,21.5,21.3],accounts:[{code:'681',name:'Dotations amort'}]},
  {id:'cfs_var_stocks',label:'Variation des stocks',level:1,parent:'cfs_flux_expl',m:[null,331.7,null,-38.2,71.1,-16.7,38.3,109.0,198.6,-44.0,-384.1,-335.9],accounts:[{code:'3x',name:'Stocks'}]},
  {id:'cfs_var_clients',label:'Variation des creances clients',level:1,parent:'cfs_flux_expl',m:[null,3275.8,null,-813.3,-1003.2,-847.6,-791.2,-570.7,110.2,42.2,123.5,7.2],accounts:[{code:'41x',name:'Clients'}]},
  {id:'cfs_var_autres_cr',label:'Variation des autres creances',level:1,parent:'cfs_flux_expl',m:[null,212.3,null,-78.6,3.2,-94.5,122.3,-61.4,-28.6,-128.4,78.4,-20.2],accounts:[{code:'47x',name:'Autres creances'}]},
  {id:'cfs_var_frs',label:'Variation des dettes fournisseurs',level:1,parent:'cfs_flux_expl',m:[null,-1421.0,null,338.9,583.1,490.3,205.7,50.4,-361.6,23.4,-207.4,84.8],accounts:[{code:'40x',name:'Fournisseurs'}]},
  {id:'cfs_var_fisc',label:'Variation des dettes fiscales & sociales',level:1,parent:'cfs_flux_expl',m:[null,-687.8,null,235.4,38.7,134.5,166.1,118.3,22.5,-59.1,-5.4,-62.1],accounts:[{code:'4x',name:'Dettes fiscales'}]},
  {id:'cfs_flux_expl',label:'Flux net d\'exploitation',level:0,type:'total',expandable:true,m:[null,1496.9,null,-400.6,-242.6,-265.1,-236.2,-426.4,26.6,-245.2,-347.3,-157.9]},

  {id:'spacer_cfs1',type:'spacer'},
  {id:'cfs_title2',label:'Flux d\'investissement',level:0,type:'section'},
  {id:'cfs_acq_incorp',label:'Acquisitions immo incorporelles',level:1,parent:'cfs_flux_inv',m:[null,0,null,0,0,-30.5,0,0,0,-2.4,0,0]},
  {id:'cfs_acq_corp',label:'Acquisitions immo corporelles',level:1,parent:'cfs_flux_inv',m:[null,-7.3,null,-0.4,-0.4,-1.0,-33.6,-1.3,0,-1.8,-0.5,-1.1]},
  {id:'cfs_var_immo_fin',label:'Variation des immo financieres',level:1,parent:'cfs_flux_inv',m:[null,0,null,0,0,0,0,0,0,0,0,0]},
  {id:'cfs_flux_inv',label:'Flux net d\'investissement',level:0,type:'total',expandable:true,m:[null,-7.3,null,-0.4,-0.4,-31.5,-33.6,-1.3,0,-4.2,-0.5,-1.1]},

  {id:'spacer_cfs2',type:'spacer'},
  {id:'cfs_title3',label:'Flux de financement',level:0,type:'section'},
  {id:'cfs_var_cap',label:'Variation capital et reserves',level:1,parent:'cfs_flux_fin',m:[null,0,null,0,0,0,0,0,0,123.8,0,0]},
  {id:'cfs_var_empr',label:'Variation emprunts bancaires MT',level:1,parent:'cfs_flux_fin',m:[null,-72.7,null,-0.4,-0.9,-0.7,-0.9,-0.9,-15.6,-15.6,-15.7,-30.9]},
  {id:'cfs_var_credit_ct',label:'Variation credits bancaires CT',level:1,parent:'cfs_flux_fin',m:[null,410.1,null,0,0,0,0,286.1,1.6,-79.4,21.5,111.1]},
  {id:'cfs_var_cb',label:'Variation dettes credit-bail',level:1,parent:'cfs_flux_fin',m:[null,-18.1,null,0,0,0,0,-0.3,-3.0,-2.7,-2.7,-3.7]},
  {id:'cfs_flux_fin',label:'Flux net de financement',level:0,type:'total',expandable:true,m:[null,319.3,null,-0.4,-0.9,-0.7,-0.9,284.9,-17.1,26.0,3.1,76.5]},

  {id:'spacer_cfs3',type:'spacer'},
  {id:'cfs_var_nette',label:'Variation nette de tresorerie',level:0,type:'total',m:[null,1808.9,null,-401.4,-243.9,-297.3,-270.7,-142.7,9.5,-223.3,-344.7,-82.5]},
  {id:'cfs_treso_debut',label:'Tresorerie debut de periode',level:1,m:[null,-42.4,null,1766.4,1365.0,1121.1,823.8,553.1,410.4,419.9,196.6,-148.0]},
  {id:'cfs_treso_fin',label:'Tresorerie fin de periode',level:0,type:'total',m:[null,1766.4,null,1365.0,1121.1,823.8,553.1,410.4,419.9,196.6,-148.0,-230.6]},
];

// Ratios
const RATIOS = {
  dio:{label:'DIO',val:125,unit:'jours',desc:'Rotation stocks'},
  dso:{label:'DSO',val:71,unit:'jours',desc:'D\u00e9lai clients'},
  dpo:{label:'DPO',val:93,unit:'jours',desc:'D\u00e9lai fournisseurs'},
  bfr_ca:{label:'BFR/CA',val:90,unit:'jours',desc:'Besoin en fonds de roulement'},
  dette_nette:{label:'Dette nette',val:1637.4,unit:'M',desc:'Dettes financi\u00e8res \u2212 Tr\u00e9sorerie'},
  levier:{label:'Levier',val:2.8,unit:'x',desc:'Dette nette / EBITDA LTM'},
  marge_brute:{label:'Marge brute',val:37.1,unit:'%',desc:'Marge brute / CA'},
  marge_ebitda:{label:'Marge EBITDA',val:5.2,unit:'%',desc:'EBITDA / CA'},
  marge_nette:{label:'Marge nette',val:0.7,unit:'%',desc:'RN / CA'},
  roe:{label:'ROE',val:-7.7,unit:'%',desc:'RN / Capitaux propres'},
  roa:{label:'ROA',val:-1.9,unit:'%',desc:'RN / Total actif'},
  current_ratio:{label:'Current ratio',val:1.85,unit:'x',desc:'Actif circ / Passif circ'},
};
