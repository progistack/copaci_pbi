// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Data Core: P&L Processing & Transformations
// ═══════════════════════════════════════════════════════════════
// Split from 02_data.js — contains: computeYearStatus, parseMonth,
// parseAccountCode, resolveAccountCode, resolveAccountCompany,
// buildAccountBalances, maskEmptyMonths, sumPrefixes, buildPLData,
// PCT_MAP, deriveMode.

// ─── Compute year status: monthly-ok | closed-lumped | open | no-data ──
// 'closed-lumped' = revenue recognized only in 1-2 months (fiscal year closed)
// 'monthly-ok' = revenue spread across many months (normal operation)
// 'open' = current fiscal year, partial data
function computeYearStatus(acctData, year){
  const keys=Object.keys(acctData).filter(k=>k!=='__monthFlag');
  if(!keys.length) return {status:'no-data',lastMonth:-1,activeMonths:0};

  // Look specifically at revenue (class 70) distribution to detect lumping
  const caMonth=new Array(12).fill(0);
  keys.forEach(code=>{
    if(code.startsWith('70')){
      const d=acctData[code];
      (d.months||[]).forEach((v,i)=>{ caMonth[i]+=v; });
    }
  });
  const caActiveMonths=caMonth.filter(v=>v!==0).length;

  // Overall activity (all accounts) for lastMonth detection
  const monthFlag=acctData.__monthFlag||new Array(12).fill(false);
  let lastMonth=-1;
  for(let i=11;i>=0;i--){ if(monthFlag[i]){ lastMonth=i; break; } }

  let status;
  if(caActiveMonths===0) status='no-data';
  else if(caActiveMonths<=2) status='closed-lumped';
  else if(lastMonth<11 && year>=new Date().getFullYear()-1) status='open';
  else status='monthly-ok';

  return {status, lastMonth, activeMonths:caActiveMonths};
}

function parseMonth(s){
  if(!s)return -1;
  const lo=s.toLowerCase();
  for(let i=0;i<MO_FR.length;i++){if(lo.indexOf(MO_FR[i])>=0)return i}
  const m=s.match(/(\d{2})\/(\d{4})/);
  if(m)return parseInt(m[1])-1;
  return -1;
}

function parseAccountCode(label){
  if(!label)return '';
  const m=label.match(/^(\d+)/);
  return m?m[1]:'';
}

// Resolve the SYSCOHADA code for an account.
// Priority : _accountMap (controller v11+) → parse from display_name (fallback).
// _accountMap contains the real `code` field from account.account, which handles
// COPACI DG accounts whose display_name doesn't start with a numeric code.
function resolveAccountCode(accountId, label){
  const map=RAW_DATA&&RAW_DATA._accountMap;
  if(map){
    const entry=map[String(accountId)];
    if(entry&&entry.code)return entry.code;
  }
  return parseAccountCode(label);
}

// Resolve company info for an account (for split COPACI / COPACI DG).
function resolveAccountCompany(accountId){
  const map=RAW_DATA&&RAW_DATA._accountMap;
  if(!map)return null;
  const entry=map[String(accountId)];
  return entry?{id:entry.company_id,name:entry.company_name}:null;
}

// Group raw balance data by account prefix → months array
// Returns acctData + monthFlag (which months had any activity at all)
function buildAccountBalances(balanceRows){
  const acctData={};
  const monthFlag=new Array(12).fill(false);
  if(!balanceRows)return Object.assign(acctData,{__monthFlag:monthFlag});
  // Company filter — when user selects a specific company via the selector,
  // only include rows from that company. Accounts not in _accountMap default
  // to company 1 (COPACI) since their display_name carries the code prefix.
  const cFilter=Array.isArray(STATE.companyIds)&&STATE.companyIds.length>0;
  balanceRows.forEach(row=>{
    const accountId=row.account_id?.[0];
    const label=row.account_id?.[1]||'';
    const fullCode=resolveAccountCode(accountId,label);
    if(!fullCode)return;
    if(cFilter){
      const comp=resolveAccountCompany(accountId);
      if(!STATE.companyIds.includes(comp?comp.id:1))return;
    }
    const mi=parseMonth(row['date:month']||'');
    if(mi<0)return;
    if(!acctData[fullCode]){acctData[fullCode]={months:new Array(12).fill(0),total:0,name:label,id:accountId}}
    // If same code exists (multi-company: both COPACI and COPACI DG use 70211250),
    // we AGGREGATE into the same bucket — SYSCOHADA codes are the grouping key.
    acctData[fullCode].months[mi]+=row.balance||0;
    acctData[fullCode].total+=row.balance||0;
    if((row.balance||0)!==0)monthFlag[mi]=true;
  });
  acctData.__monthFlag=monthFlag;
  return acctData;
}

// Nullify months where no data exists (n/d display instead of 0)
function maskEmptyMonths(pl, monthFlag){
  if(!monthFlag)return pl;
  return pl.map(line=>{
    if(!line.m)return line;
    const newM=line.m.map((v,i)=>monthFlag[i]?v:null);
    return {...line, m:newM};
  });
}

// Sum accounts matching prefixes, return months array in M FCFA, sign-inverted for P&L
// Each matched account also carries its own mensuel m[] array (M FCFA, sign-inverted)
// and its Odoo id so that drill-down can link to the right record.
function sumPrefixes(acctData,prefixes){
  const months=new Array(12).fill(0);
  const matchedAccounts=[];
  Object.entries(acctData).forEach(([code,data])=>{
    if(code==='__monthFlag')return;
    if(prefixes.some(p=>code.startsWith(p))){
      const acctM=new Array(12).fill(0);
      data.months.forEach((v,i)=>{acctM[i]=-v/SCALE;months[i]+=acctM[i]});
      matchedAccounts.push({code,id:data.id,name:data.name.replace(/^\d+\s*/,''),balance:data.total,m:acctM});
    }
  });
  return {months,accounts:matchedAccounts};
}

function buildPLData(acctData){
  // Helper to create a line
  function line(id,label,level,type,opts={}){
    const mapped=ACCT_MAP[id];
    let m,accounts=[];
    if(mapped){
      const result=sumPrefixes(acctData,mapped);
      m=result.months;
      // Preserve per-account m[] + id so drill-down can show real amounts and link to Odoo
      accounts=result.accounts.map(a=>({code:a.code,id:a.id,name:a.name,m:a.m}));
    } else {
      m=opts.m||new Array(12).fill(0);
    }
    return {id,label,level,type,...opts,m,accounts:accounts.length?accounts:(opts.accounts||[])};
  }

  // CA — ventes locales et export (sans escompte/ristournes)
  const ca_local=line('ca_local','CA local',1);
  const ca_local_exo=line('ca_local_exo','  \u25E6 Ventes locales exon\u00e9r\u00e9es',2);
  const ca_local_sans_asdi=line('ca_local_sans_asdi','  \u25E6 Ventes locales sans ASDI',2);
  const ca_local_avec_asdi=line('ca_local_avec_asdi','  \u25E6 Ventes locales avec ASDI',2);
  const ca_export=line('ca_export','CA export',1);
  const ca_export_uemoa=line('ca_export_uemoa','  \u25E6 Export UEMOA',2);
  const ca_export_hors_uemoa=line('ca_export_hors_uemoa','  \u25E6 Export hors UEMOA',2);
  ca_local.expandable=true;
  ca_local.children=['ca_local_exo','ca_local_sans_asdi','ca_local_avec_asdi'];
  ca_export.expandable=true;
  ca_export.children=['ca_export_uemoa','ca_export_hors_uemoa'];
  ca_local_exo.parent='ca_local';ca_local_sans_asdi.parent='ca_local';ca_local_avec_asdi.parent='ca_local';
  ca_export_uemoa.parent='ca_export';ca_export_hors_uemoa.parent='ca_export';
  // CA net = local + export (structure Excel COPACI)
  const ca_net_m=ca_local.m.map((v,i)=>v+ca_export.m[i]);

  // Consommations et d\u00e9ductions (entre CA net et Marge brute)
  const achats_emb=line('achats_emb','Achats emballages & \u00e9tiquettes',2);
  const var_stock_emb=line('var_stock_emb','Variation stock emballages',2);
  const achats_mp=line('achats_mp','Achats mati\u00e8res premi\u00e8res',2);
  const var_stock_mp=line('var_stock_mp','Variation de stock MP',2);
  const var_stock_pf=line('var_stock_pf','Variation de stock produits finis',1);
  const achats_ns=line('achats_ns','Achats non stock\u00e9s',1);
  const ristournes=line('ristournes','Ristournes accord\u00e9es',1);
  const escompte=line('escompte','Escompte accord\u00e9',1);

  // Conso emballages = achats 608 + variation 60330
  const conso_emb_m=achats_emb.m.map((v,i)=>v+var_stock_emb.m[i]);
  // Conso MP = achats 601+602 + variation 60320
  const conso_mp_m=achats_mp.m.map((v,i)=>v+var_stock_mp.m[i]);

  // Marge brute = CA net + toutes les lignes de d\u00e9duction (toutes n\u00e9gatives en display)
  const marge_brute_m=ca_net_m.map((v,i)=>v+conso_emb_m[i]+conso_mp_m[i]+ristournes.m[i]+escompte.m[i]+var_stock_pf.m[i]+achats_ns.m[i]);

  // Couts directs
  const elec_direct=line('elec_direct','Electricit\u00e9 & eau direct',2);
  const transport_direct=line('transport_direct','Transport direct',2);
  const prest_ext=line('prest_ext','Prestations services externes',2);
  const couts_dir_m=elec_direct.m.map((v,i)=>v+transport_direct.m[i]+prest_ext.m[i]);

  const marge_cd_m=marge_brute_m.map((v,i)=>v+couts_dir_m[i]);

  // G&A
  const ga_lines=['ga_personnel','ga_charges_soc','ga_impots','ga_autres_achats','ga_banque','ga_assurances','ga_loyers','ga_reparat','ga_pub','ga_conseil','ga_telecom','ga_transport','ga_elec_ind','ga_charges_pers','ga_autres'];
  const ga_items=ga_lines.map(id=>line(id,id.replace('ga_','').replace(/_/g,' '),1));
  const ga_m=new Array(12).fill(0);
  ga_items.forEach(item=>item.m.forEach((v,i)=>ga_m[i]+=v));

  // Labels
  const GA_LABELS={ga_personnel:'Charges de personnel',ga_charges_soc:'Charges sociales (employeur)',ga_impots:'Imp\u00f4ts & taxes',ga_autres_achats:'Autres achats',ga_banque:'Frais bancaires',ga_assurances:'Assurances',ga_loyers:'Loyers',ga_reparat:'R\u00e9parations & maintenance',ga_pub:'Publicit\u00e9 & communication',ga_conseil:'R\u00e9mun\u00e9rations interm\u00e9diaires & conseils',ga_telecom:'T\u00e9l\u00e9phonie & Internet',ga_transport:'Transport / D\u00e9placements',ga_elec_ind:'Electricit\u00e9 & eau indirect',ga_charges_pers:'Autres charges de personnel',ga_autres:'Autres charges'};
  ga_items.forEach(item=>{item.label=GA_LABELS[item.id]||item.id;item.parent='ga'});

  const autres_prod=line('autres_prod','Autres produits d\'exploitation',1);
  const ebitda_m=marge_cd_m.map((v,i)=>v+ga_m[i]+autres_prod.m[i]);

  // D&A
  const dotations=line('dotations','Dotations aux amortissements',2);
  const reprises_prov=line('reprises_prov','Reprises sur provisions',2);
  const da_m=dotations.m.map((v,i)=>v+reprises_prov.m[i]);
  const ebit_m=ebitda_m.map((v,i)=>v+da_m[i]);

  // Financial
  const charges_fin=line('charges_fin','Charges financi\u00e8res',1);
  const produits_fin=line('produits_fin','Produits financiers',1);
  const res_fin_m=charges_fin.m.map((v,i)=>v+produits_fin.m[i]);

  // Exceptional
  const charges_exc=line('charges_exc','Charges exceptionnelles',1);
  const produits_exc=line('produits_exc','Produits exceptionnels',1);
  const res_exc_m=charges_exc.m.map((v,i)=>v+produits_exc.m[i]);

  // RCAI, IS, RN
  const rcai_m=ebit_m.map((v,i)=>v+res_fin_m[i]+res_exc_m[i]);
  const is_line=line('is','Imp\u00f4t sur les b\u00e9n\u00e9fices',1);
  const rn_m=rcai_m.map((v,i)=>v+is_line.m[i]);

  // Percentage lines
  function pctLine(id,label,num_m,denom_m){return {id,label,level:0,type:'pct',m:num_m.map((v,i)=>denom_m[i]?v/denom_m[i]*100:0)}}

  // Assemble PL_DATA
  return [
    {id:'ca_net',label:'Chiffre d\'affaires net',level:0,type:'total',expandable:true,m:ca_net_m,children:['ca_local','ca_export']},
    {...ca_local,parent:'ca_net'},
    {...ca_local_exo},{...ca_local_sans_asdi},{...ca_local_avec_asdi},
    {...ca_export,parent:'ca_net'},
    {...ca_export_uemoa},{...ca_export_hors_uemoa},
    {id:'spacer1',type:'spacer'},
    {id:'conso_emb',label:'Consommation Emballages',level:1,type:'subtotal',expandable:true,m:conso_emb_m,children:['achats_emb','var_stock_emb']},
    {...achats_emb,parent:'conso_emb'},{...var_stock_emb,parent:'conso_emb'},
    {id:'conso_mp',label:'Consommation Mati\u00e8res Premi\u00e8res',level:1,type:'subtotal',expandable:true,m:conso_mp_m,children:['achats_mp','var_stock_mp']},
    {...achats_mp,parent:'conso_mp'},{...var_stock_mp,parent:'conso_mp'},
    {...ristournes},
    {...escompte},
    {...var_stock_pf},
    {...achats_ns},
    {id:'marge_brute',label:'Marge brute',level:0,type:'total',m:marge_brute_m},
    pctLine('pct_mb','% Marge brute',marge_brute_m,ca_net_m),
    {id:'spacer2',type:'spacer'},
    {id:'couts_directs',label:'Co\u00fbts directs',level:1,type:'subtotal',expandable:true,m:couts_dir_m,children:['elec_direct','transport_direct','prest_ext']},
    {...elec_direct,parent:'couts_directs'},{...transport_direct,parent:'couts_directs'},{...prest_ext,parent:'couts_directs'},
    {id:'marge_cd',label:'Marge sur co\u00fbts directs',level:0,type:'total',m:marge_cd_m},
    pctLine('pct_mcd','% Marge sur co\u00fbts directs',marge_cd_m,ca_net_m),
    {id:'spacer3',type:'spacer'},
    {id:'ga',label:'Frais g\u00e9n\u00e9raux',level:0,type:'total',expandable:true,m:ga_m,children:ga_lines},
    ...ga_items,
    pctLine('pct_ga','% Frais g\u00e9n\u00e9raux',ga_m,ca_net_m),
    {id:'spacer4',type:'spacer'},
    {...autres_prod},
    {id:'ebitda',label:'EBITDA',level:0,type:'total',m:ebitda_m},
    pctLine('pct_ebitda','% EBITDA',ebitda_m,ca_net_m),
    {id:'spacer5',type:'spacer'},
    {id:'da',label:'D&A',level:1,type:'subtotal',expandable:true,m:da_m,children:['dotations','reprises_prov']},
    {...dotations,parent:'da'},{...reprises_prov,parent:'da'},
    {id:'ebit',label:'EBIT',level:0,type:'total',m:ebit_m},
    pctLine('pct_ebit','% EBIT',ebit_m,ca_net_m),
    {id:'spacer6',type:'spacer'},
    {...charges_fin},{...produits_fin},
    {id:'resultat_fin',label:'R\u00e9sultat financier',level:0,type:'total',m:res_fin_m},
    {id:'spacer7',type:'spacer'},
    {...charges_exc},{...produits_exc},
    {id:'resultat_exc',label:'R\u00e9sultat exceptionnel',level:0,type:'total',m:res_exc_m},
    {id:'spacer8',type:'spacer'},
    {id:'rcai',label:'RCAI',level:0,type:'total',m:rcai_m},
    pctLine('pct_rcai','% RCAI',rcai_m,ca_net_m),
    {id:'spacer9',type:'spacer'},
    {...is_line},
    {id:'resultat_net',label:'R\u00e9sultat net',level:0,type:'total',m:rn_m},
    pctLine('pct_rn','% Marge nette',rn_m,ca_net_m),
  ];
}

// ─── MODE TRANSFORMATION : Mensuel / YTD / LTM ───────────────
const PCT_MAP = {
  pct_mb:'marge_brute',pct_mcd:'marge_cd',pct_ga:'ga',
  pct_ebitda:'ebitda',pct_ebit:'ebit',pct_rcai:'rcai',pct_rn:'resultat_net'
};

function deriveMode(rawPL, mode, rawN1, lastMonth){
  if(!rawPL)return[];
  if(mode==='mensuel')return rawPL.map(l=>({...l}));
  const maxIdx=(lastMonth!=null&&lastMonth>=0)?lastMonth:11;
  // Transform non-pct, non-spacer lines
  const transformed=rawPL.map(line=>{
    if(line.type==='pct'||line.type==='spacer'||line.type==='section'||!line.m)return{...line};
    let newM;
    if(mode==='ytd'){
      newM=[];let cum=0;
      for(let i=0;i<12;i++){
        if(i>maxIdx){newM.push(null);continue}// n/d beyond last month
        cum+=line.m[i]||0;
        newM.push(cum);
      }
    } else if(mode==='ltm'){
      const n1Line=rawN1?rawN1.find(l=>l.id===line.id):null;
      const n1m=(n1Line&&n1Line.m)||new Array(12).fill(0);
      newM=[];
      for(let i=0;i<12;i++){
        if(i>maxIdx){newM.push(null);continue}
        let total=0;
        for(let j=0;j<=i;j++)total+=line.m[j]||0;
        for(let j=i+1;j<12;j++)total+=n1m[j]||0;
        newM.push(total);
      }
    } else { newM=[...line.m]; }
    return{...line,m:newM};
  });
  // Recompute pct lines based on transformed CA
  const caLine=transformed.find(l=>l.id==='ca_net');
  const caM=(caLine&&caLine.m)||new Array(12).fill(0);
  return transformed.map(line=>{
    if(line.type==='pct'&&PCT_MAP[line.id]){
      const tot=transformed.find(l=>l.id===PCT_MAP[line.id]);
      if(tot&&tot.m){
        return{...line,m:tot.m.map((v,i)=>caM[i]?v/caM[i]*100:0)};
      }
    }
    return line;
  });
}

// ─── PER-COMPANY CONTRIBUTION ────────────────────────────────
// Builds per-company P&L (CA, EBITDA) from RAW_DATA, bypassing STATE.companyIds.
// Returns null if single-company. Otherwise { companyId: {name,ca,ebitda,caM,ebitdaM} }.
// Used by Synthèse contribution charts — only visible for multi-company users.
function buildCompanyContrib(year){
  const companies=STATE._companies;
  if(!companies||companies.length<=1)return null;
  const bal=RAW_DATA&&RAW_DATA['balance'+year];
  if(!bal)return null;
  const lastMo=CACHE.lastMonth[year];
  const result={};
  companies.forEach(c=>{
    // Build acctData for this company only (inline filter, no STATE mutation)
    const acctData={};
    const monthFlag=new Array(12).fill(false);
    bal.forEach(row=>{
      const accountId=row.account_id?.[0];
      const label=row.account_id?.[1]||'';
      const fullCode=resolveAccountCode(accountId,label);
      if(!fullCode)return;
      const comp=resolveAccountCompany(accountId);
      if((comp?comp.id:1)!==c.id)return;
      const mi=parseMonth(row['date:month']||'');
      if(mi<0)return;
      if(!acctData[fullCode])acctData[fullCode]={months:new Array(12).fill(0),total:0,name:label,id:accountId};
      acctData[fullCode].months[mi]+=row.balance||0;
      acctData[fullCode].total+=row.balance||0;
      if((row.balance||0)!==0)monthFlag[mi]=true;
    });
    acctData.__monthFlag=monthFlag;
    // Build PL then apply mode transform
    let pl=buildPLData(acctData);
    const info=computeYearStatus(acctData,year);
    if(info.status==='open')pl=maskEmptyMonths(pl,monthFlag);
    const transformed=deriveMode(pl,STATE.mode,null,lastMo);
    const caLine=transformed.find(l=>l.id==='ca_net');
    const ebitdaLine=transformed.find(l=>l.id==='ebitda');
    const sumM=(line)=>{if(!line||!line.m)return 0;return line.m.reduce((s,v)=>s+(v||0),0)};
    result[c.id]={
      name:c.name,
      ca:sumM(caLine),
      ebitda:sumM(ebitdaLine),
      caM:caLine?caLine.m.slice():new Array(12).fill(0),
      ebitdaM:ebitdaLine?ebitdaLine.m.slice():new Array(12).fill(0),
    };
  });
  return result;
}
