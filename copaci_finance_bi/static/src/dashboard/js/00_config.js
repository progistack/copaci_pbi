// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Configuration & Constants
// ═══════════════════════════════════════════════════════════════
'use strict';

/* ═══════════════════════════════════════════════════════════════
   COPACI Finance BI — JavaScript
   ═══════════════════════════════════════════════════════════════ */

// ─── DATA FETCH — Un seul appel au controller Python ────────
// Le controller /copaci_finance_bi/data :
// - Respecte les droits d'acces Odoo (groupes comptables)
// - Filtre automatiquement par societes autorisees (multi-company)
// - Retourne un JSON unique avec GL + Bilan (1 requete au lieu de 6)
async function fetchOdooFinanceData(){
  console.log('%c[BI Finance] Chargement données Odoo...','color:#0d9488;font-weight:bold');
  // Construire l'URL avec le filtre societe si actif
  let url='/copaci_finance_bi/data';
  if(Array.isArray(STATE.companyIds)&&STATE.companyIds.length){
    url+='?company_ids='+STATE.companyIds.join(',');
  }
  const resp=await fetch(url);
  if(!resp.ok){
    const status=resp.status;
    if(status===403) throw new Error('Accès refusé — vérifiez vos droits comptables');
    if(status===404) throw new Error('Endpoint non disponible — module non installé ?');
    throw new Error('Erreur serveur (HTTP '+status+')');
  }
  let data;
  try{data=await resp.json()}catch(parseErr){throw new Error('Réponse serveur invalide (JSON corrompu)')}
  const cNames=(data._companies||[]).map(c=>typeof c==='object'?c.name:c);
  console.log('%c[BI Finance] Données reçues','color:#0d9488;font-weight:bold',
    '| Sociétés:',cNames.join(', ')||'?',
    '| Filtre:',STATE.companyIds||'toutes',
    '| Années:',data._years?.join(', ')||'?');
  return data;
}

// ─── DATA MODEL — Odoo RPC + SYSCOHADA mapping ──────────────
const MO = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
const MO_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const COL = ['#0d9488','#0284c7','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#8b5cf6','#14b8a6','#f97316','#e11d48','#6366f1'];

// ─── SYSCOHADA MAPPING : prefix → P&L line ───────────────────
// Rule: P&L display value = -balance (Odoo credits are negative)
// IMPORTANT: prefixes must be mutually exclusive to avoid double counting
const ACCT_MAP = {
  // CA — COPACI et DG utilisent le MEME plan comptable 8 chiffres.
  // DG accounts have different display_names but identical SYSCOHADA codes.
  // resolveAccountCode() via _accountMap resolves DG display_names to the
  // same 8-digit codes → the prefixes below capture both companies.
  ca_local:['70211230','70211250','70211280'],
  ca_local_exo:['70211230'],
  ca_local_sans_asdi:['70211250'],
  ca_local_avec_asdi:['70211280'],
  ca_export:['70211200','70220000'],
  ca_export_uemoa:['70211200'],
  ca_export_hors_uemoa:['70220000'],
  escompte:['70000000'],

  // COGS — achats consommés (prefixes mutually exclusive)
  achats_mp:['6011','6012','6013','6014','6015','6016','6017','6018','6019','602'],// 601x + 602x
  var_stock_mp:['6032'],      // 60320xxx variation stock MP only
  achats_ns:['604'],          // 604x achats non stockés
  achats_emb:['608'],         // 608x achats emballages
  var_stock_emb:['6033'],     // 60330xxx variation stock emballages
  var_stock_pf:['736'],       // 736 variation stock produits finis
  ristournes:['673'],
  // Couts directs — 5-digit prefixes to distinguish direct vs indirect
  elec_direct:['60511','60521','60531','60532'],// eau direct, élec direct, carburant, gaz
  transport_direct:['611','612'],// transport sur achats + ventes
  prest_ext:['637'],
  // G&A — 6054-6058 = fournitures/outils/équipement (pas énergie)
  ga_autres_achats:['6054','6055','6056','6057','6058','626','634','635'],
  ga_elec_ind:['60512','60522'],// eau indirect, élec indirect (logements)
  ga_assurances:['625'],
  ga_autres:['650','651','658'],
  ga_charges_pers:['633','638'],
  ga_personnel:['661','662','663'],
  ga_charges_soc:['664','668'],
  ga_impots:['641','645','646','647','648'],
  ga_loyers:['622'],
  ga_pub:['627'],
  ga_conseil:['632'],
  ga_reparat:['624'],
  ga_telecom:['628'],
  ga_transport:['614','616','618'],
  ga_banque:['631'],
  // Below EBITDA
  dotations:['681'],
  reprises_prov:['791'],
  charges_fin:['671','672','674','675','676'],
  produits_fin:['773','776'],
  charges_exc:['836','831','839'],
  produits_exc:['846','841'],
  autres_prod:['758','781'],
  is:['891','695','697'],
};

// ─── STATE MANAGEMENT ────────────────────────────────────────
const CURRENT_FISCAL_YEAR = new Date().getFullYear();
const SCALE = 1e6; // Diviseur FCFA → M FCFA
const STATE = {
  year: CURRENT_FISCAL_YEAR,
  mode: 'mensuel',   // 'mensuel' | 'ytd' | 'ltm'
  compareN1: false,
  compareBudget: false,
  selectedMonth: 'all',  // 'all' | 0..11
  // Bilan multi-period comparison.
  // null = auto-sync (default : current + N-1 mirror). Array = custom periods, up to 4.
  // Each entry : {year, monthIdx}. Rendered left-to-right, leftmost = baseline.
  bilanPeriods: null,
  // Multi-societe : IDs des societes selectionnees dans le dashboard.
  // null = toutes les societes autorisees (defaut).
  // Array<int> = sous-ensemble choisi par l'utilisateur via les pills.
  companyIds: null,
};

// Cached processed data per year
const CACHE = {
  acctData: {},        // year → acctData
  rawPL: {},           // year → raw PL_DATA (before mode transform)
  rawBudget: {},       // year → raw Budget PL (placeholder = deep-clone rawPL until real budget loaded)
  bilan: {},           // year → BILAN_DATA
  lastMonth: {},       // year → last available month index (0..11) or -1 if none
  yearStatus: {},      // year → 'closed' | 'open' | 'monthly-ok' | 'closed-lumped'
};

let RAW_DATA = null;  // loaded from controller

// Tab navigation state — declared early so 02_data.js refreshAll() can reference them.
// TAB_BUILDERS (mapping tab→build function) is set later in 06_ui.js after
// the builder functions are defined (05_tabs.js).
let currentYear = CURRENT_FISCAL_YEAR;
let currentTab  = 'synthese';
const tabBuilt  = {synthese:false,pl:false,bilan:false,tresorerie:false,kpis:false,dettes:false,cfs:false};

// ─── COMPANY SELECTOR ───────────────────────────────────────
// Lit _companies depuis la reponse controller et genere les pills.
// L'utilisateur ne voit que les societes autorisees par son profil Odoo.
// Quand il en a plusieurs, il peut choisir l'une, l'autre, ou toutes.
function renderCompanySelector(companies){
  const wrap=document.getElementById('companyWrap');
  if(!wrap)return;
  // companies = [{id:1,name:'COPACI'},{id:3,name:'COPACI DG'}] (depuis controller v10+)
  // ou ['COPACI','COPACI DG'] (compatibilite v9)
  const parsed=companies.map(c=>typeof c==='object'?c:{id:0,name:String(c)});
  if(parsed.length<=1){
    wrap.classList.add('single');// cache le selecteur si une seule societe
    return;
  }
  wrap.classList.remove('single');
  // Construire les pills : "Toutes" + une par societe
  const allIds=parsed.map(c=>c.id);
  const isAll=!Array.isArray(STATE.companyIds)||STATE.companyIds.length===0
    ||STATE.companyIds.length===allIds.length;
  let html='<span class="cw-label">Société</span>';
  // Pill "Toutes"
  html+=`<button type="button" class="company-pill${isAll?' all-active':''}" data-cid="all">Toutes</button>`;
  // Pill par societe
  parsed.forEach(c=>{
    const active=!isAll&&STATE.companyIds&&STATE.companyIds.includes(c.id);
    html+=`<button type="button" class="company-pill${active?' active':''}" data-cid="${c.id}">${esc(c.name)}</button>`;
  });
  wrap.innerHTML=html;
  // Wiring
  wrap.querySelectorAll('.company-pill').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const cid=btn.dataset.cid;
      if(cid==='all'){
        STATE.companyIds=null;// toutes
      } else {
        STATE.companyIds=[parseInt(cid)];
      }
      // Re-fetch complet avec le nouveau filtre
      reloadWithCompanyFilter();
    });
  });
}
async function reloadWithCompanyFilter(){
  // Vider le cache et re-charger les donnees
  CACHE.acctData={};CACHE.rawPL={};CACHE.rawBudget={};
  CACHE.bilan={};CACHE.lastMonth={};CACHE.yearStatus={};
  Object.keys(tabBuilt).forEach(k=>tabBuilt[k]=false);
  await loadAndRender();
}
