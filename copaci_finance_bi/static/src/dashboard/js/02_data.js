// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Data Processing & Transformations
// ═══════════════════════════════════════════════════════════════

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

// Group raw balance data by account prefix → months array
// Returns acctData + monthFlag (which months had any activity at all)
function buildAccountBalances(balanceRows){
  const acctData={};
  const monthFlag=new Array(12).fill(false);
  if(!balanceRows)return Object.assign(acctData,{__monthFlag:monthFlag});
  balanceRows.forEach(row=>{
    const fullCode=parseAccountCode(row.account_id?.[1]||'');
    if(!fullCode)return;
    const mi=parseMonth(row['date:month']||'');
    if(mi<0)return;
    if(!acctData[fullCode]){acctData[fullCode]={months:new Array(12).fill(0),total:0,name:row.account_id[1]||'',id:row.account_id[0]}}
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

// ─── BILAN FROM ODOO ─────────────────────────────────────────
function buildBilanFromOdoo(bsBalances){
  // bsBalances: array of { account_id: [id, "code name"], balance: X }
  const byCode={};
  if(bsBalances){
    bsBalances.forEach(row=>{
      const lbl=row.account_id?.[1]||'';
      const code=parseAccountCode(lbl);
      if(!code)return;
      const name=lbl.replace(/^\d+\s*/,'');
      byCode[code]={name,balance:(byCode[code]?.balance||0)+(row.balance||0)};
    });
  }
  function sumBS(prefixes,invert=false){
    let total=0;const accts=[];
    Object.entries(byCode).forEach(([code,d])=>{
      if(prefixes.some(p=>code.startsWith(p))){
        const v=d.balance;total+=v;
        accts.push({code,name:d.name});
      }
    });
    const val=(invert?-total:total)/SCALE;
    return{val,accounts:accts};
  }

  const immo_incorp=sumBS(['21']);
  const amort_incorp=sumBS(['281']);
  const immo_corp_brut=sumBS(['22','23','24']);
  const amort_corp=sumBS(['283','284']);
  const immo_fin=sumBS(['26','270','271','272','273','274','276','277','278','279']);
  const stocks=sumBS(['31','32','33','34','35','36','37','38']);
  const creances_cl=sumBS(['411','412','413','414','415']);
  const acomptes_cl=sumBS(['419']);
  const creances_dout=sumBS(['416']);
  const depots_caut=sumBS(['275']);
  const cca=sumBS(['476']);
  const debiteurs_div=sumBS(['471','472','473','474','475','477','478']);
  const credit_tva=sumBS(['445']);
  const effets_enc=sumBS(['511','513']);
  const banque=sumBS(['52','585']);
  const caisse=sumBS(['57']);

  const immo_incorp_net=immo_incorp.val+amort_incorp.val;
  const immo_corp_net=immo_corp_brut.val+amort_corp.val;
  const immo_total=immo_incorp_net+immo_corp_net+immo_fin.val;
  const clients_total=creances_cl.val+acomptes_cl.val+creances_dout.val;
  const autres_cr_total=depots_caut.val+cca.val+debiteurs_div.val+credit_tva.val;
  const actif_circ=stocks.val+clients_total+autres_cr_total;
  const treso_total=effets_enc.val+banque.val+caisse.val;
  const total_actif=immo_total+actif_circ+treso_total;

  // Passif — inverted (credits are positive for passif)
  const capital=sumBS(['101','102','103','104','105','106','107','108','109'],true);
  const ran=sumBS(['11','12'],true);
  const rn_ex=sumBS(['13'],true);
  const emprunt_mt=sumBS(['16'],true);
  const credit_bail=sumBS(['17'],true);
  const credit_ct=sumBS(['56'],true);
  const provisions=sumBS(['19'],true);
  const frs=sumBS(['401','402','403'],true);
  const frs_fnp=sumBS(['408'],true);
  const acomptes_frs=sumBS(['409']);
  const imp_taxes=sumBS(['441','442','446','447','448','449'],true);
  const tva_payer=sumBS(['443','444'],true);
  const emp_charges=sumBS(['42','43'],true);

  const cp_total=capital.val+ran.val+rn_ex.val;
  const dettes_fin_total=emprunt_mt.val+credit_bail.val+credit_ct.val+provisions.val;
  const frs_total=frs.val+frs_fnp.val+acomptes_frs.val;
  const dfs_total=imp_taxes.val+tva_payer.val+emp_charges.val;
  const passif_circ=frs_total+dfs_total;
  const total_passif=cp_total+dettes_fin_total+passif_circ;

  return {
    actif:[
      {id:'immo',label:'Immobilisations',level:0,type:'total',expandable:true,val:immo_total,children:['immo_incorp','immo_corp','immo_fin']},
      {id:'immo_incorp',label:'Immobilisations incorporelles nettes',level:1,parent:'immo',val:immo_incorp_net,accounts:[...immo_incorp.accounts,...amort_incorp.accounts]},
      {id:'immo_corp',label:'Immobilisations corporelles nettes',level:1,parent:'immo',val:immo_corp_net,expandable:true,children:['immo_corp_brut','amort_corp']},
      {id:'immo_corp_brut',label:'Immobilisations corporelles brutes',level:2,parent:'immo_corp',val:immo_corp_brut.val,accounts:immo_corp_brut.accounts},
      {id:'amort_corp',label:'Amortissements',level:2,parent:'immo_corp',val:amort_corp.val,accounts:amort_corp.accounts},
      {id:'immo_fin',label:'Immobilisations financi\u00e8res',level:1,parent:'immo',val:immo_fin.val,accounts:immo_fin.accounts},
      {id:'actif_circ',label:'Actif circulant',level:0,type:'total',expandable:true,val:actif_circ,children:['stocks','clients_grp','autres_creances_grp']},
      {id:'stocks',label:'Stocks',level:1,parent:'actif_circ',val:stocks.val,accounts:stocks.accounts},
      {id:'clients_grp',label:'Clients',level:1,parent:'actif_circ',val:clients_total,expandable:true,children:['creances_cl','acomptes_cl','creances_dout']},
      {id:'creances_cl',label:'Cr\u00e9ances clients',level:2,parent:'clients_grp',val:creances_cl.val,accounts:creances_cl.accounts},
      {id:'acomptes_cl',label:'Acomptes clients',level:2,parent:'clients_grp',val:acomptes_cl.val,accounts:acomptes_cl.accounts},
      {id:'creances_dout',label:'Cr\u00e9ances douteuses',level:2,parent:'clients_grp',val:creances_dout.val,accounts:creances_dout.accounts},
      {id:'autres_creances_grp',label:'Autres cr\u00e9ances',level:1,parent:'actif_circ',val:autres_cr_total,expandable:true,children:['depots_caut','cca','debiteurs_div','credit_tva']},
      {id:'depots_caut',label:'D\u00e9p\u00f4ts et cautionnements',level:2,parent:'autres_creances_grp',val:depots_caut.val,accounts:depots_caut.accounts},
      {id:'cca',label:'Charges constat\u00e9es d\'avance',level:2,parent:'autres_creances_grp',val:cca.val,accounts:cca.accounts},
      {id:'debiteurs_div',label:'D\u00e9biteurs divers',level:2,parent:'autres_creances_grp',val:debiteurs_div.val,accounts:debiteurs_div.accounts},
      {id:'credit_tva',label:'Cr\u00e9dit de TVA',level:2,parent:'autres_creances_grp',val:credit_tva.val,accounts:credit_tva.accounts},
      {id:'tresorerie_a',label:'Tr\u00e9sorerie',level:0,type:'total',expandable:true,val:treso_total,children:['effets_enc','banque','caisse']},
      {id:'effets_enc',label:'Effets \u00e0 encaisser',level:1,parent:'tresorerie_a',val:effets_enc.val,accounts:effets_enc.accounts},
      {id:'banque',label:'Banque',level:1,parent:'tresorerie_a',val:banque.val,accounts:banque.accounts},
      {id:'caisse',label:'Caisse',level:1,parent:'tresorerie_a',val:caisse.val,accounts:caisse.accounts},
      {id:'total_actif',label:'TOTAL ACTIF',level:0,type:'grandtotal',val:total_actif},
    ],
    passif:[
      {id:'cp',label:'Capitaux propres',level:0,type:'total',expandable:true,val:cp_total,children:['capital','ran','rn_ex']},
      {id:'capital',label:'Capital',level:1,parent:'cp',val:capital.val,accounts:capital.accounts},
      {id:'ran',label:'Report \u00e0 nouveau',level:1,parent:'cp',val:ran.val,accounts:ran.accounts},
      {id:'rn_ex',label:'R\u00e9sultat de l\'exercice',level:1,parent:'cp',val:rn_ex.val,accounts:rn_ex.accounts},
      {id:'dettes_fin_b',label:'Dettes financi\u00e8res',level:0,type:'total',expandable:true,val:dettes_fin_total,children:['emprunt_mt','credit_bail','credit_ct','provisions']},
      {id:'emprunt_mt',label:'Emprunt bancaire \u00e0 moyen terme',level:1,parent:'dettes_fin_b',val:emprunt_mt.val,accounts:emprunt_mt.accounts},
      {id:'credit_bail',label:'Dettes de cr\u00e9dit-bail',level:1,parent:'dettes_fin_b',val:credit_bail.val,accounts:credit_bail.accounts},
      {id:'credit_ct',label:'Cr\u00e9dits bancaires \u00e0 court terme',level:1,parent:'dettes_fin_b',val:credit_ct.val,accounts:credit_ct.accounts},
      {id:'provisions',label:'Provisions pour risques et charges',level:1,parent:'dettes_fin_b',val:provisions.val,accounts:provisions.accounts},
      {id:'passif_circ',label:'Passif circulant',level:0,type:'total',expandable:true,val:passif_circ,children:['frs_grp','dettes_fisc_soc']},
      {id:'frs_grp',label:'Dettes fournisseurs',level:1,parent:'passif_circ',val:frs_total,expandable:true,children:['frs','frs_fnp','acomptes_frs']},
      {id:'frs',label:'Fournisseurs',level:2,parent:'frs_grp',val:frs.val,accounts:frs.accounts},
      {id:'frs_fnp',label:'Fournisseurs — Factures non parvenues',level:2,parent:'frs_grp',val:frs_fnp.val,accounts:frs_fnp.accounts},
      {id:'acomptes_frs',label:'Acomptes fournisseurs',level:2,parent:'frs_grp',val:acomptes_frs.val,accounts:acomptes_frs.accounts},
      {id:'dettes_fisc_soc',label:'Dettes fiscales et sociales',level:1,parent:'passif_circ',val:dfs_total,expandable:true,children:['imp_taxes','tva_payer','emp_charges']},
      {id:'imp_taxes',label:'Imp\u00f4ts & taxes',level:2,parent:'dettes_fisc_soc',val:imp_taxes.val,accounts:imp_taxes.accounts},
      {id:'tva_payer',label:'TVA \u00e0 payer',level:2,parent:'dettes_fisc_soc',val:tva_payer.val,accounts:tva_payer.accounts},
      {id:'emp_charges',label:'Employ\u00e9s et charges sociales',level:2,parent:'dettes_fisc_soc',val:emp_charges.val,accounts:emp_charges.accounts},
      {id:'total_passif',label:'TOTAL PASSIF',level:0,type:'grandtotal',val:total_passif},
    ]
  };
}

// ─── BILAN SERIES : MONTHLY SNAPSHOTS FROM OPENING + MOVEMENTS ─
// Builds a BILAN structure where every line carries m:[v0..v11] — the balance
// AT THE END of each month, computed as (opening balance at 1er janvier)
// + (cumulated movements of the year up to that month).
//
// openingRows : Odoo output of a BS snapshot at end of (year-1), same format
//   as bsEnd{year-1} ({account_id, balance} rows).
// monthlyActs : acctData built by buildAccountBalances(balance{year}) —
//   dict code → {months:[12 net movements], total, name, id}. Contains
//   BOTH balance-sheet and P&L accounts; we filter by SYSCOHADA class prefixes.
// monthFlag : 12-bool array flagging months with any posted activity. Months
//   after the last active one are set to null (not carried forward).
//
// Returns a BILAN object with the same keys as buildBilanFromOdoo but each
// line has BOTH a scalar `val` (latest available month) and `m:[12]` series.
function buildBilanSeriesFromOdoo(openingRows,monthlyActs,monthFlag){
  // Opening balances indexed by full account code
  const openingByCode={};
  if(openingRows){
    openingRows.forEach(row=>{
      const lbl=row.account_id?.[1]||'';
      const code=parseAccountCode(lbl);
      if(!code)return;
      const name=lbl.replace(/^\d+\s*/,'');
      if(!openingByCode[code])openingByCode[code]={name,balance:0};
      openingByCode[code].balance+=(row.balance||0);
    });
  }
  // Last active month : used to mask trailing nulls.
  let lastIdx=-1;
  if(monthFlag){for(let i=11;i>=0;i--){if(monthFlag[i]){lastIdx=i;break}}}
  if(lastIdx<0)lastIdx=11;
  // Aggregator : for a set of SYSCOHADA prefixes, return {m:[12], val, accounts}
  // invert=true flips the sign (used for liabilities / equity which are naturally
  // credit-positive in Odoo).
  function seriesBS(prefixes,invert=false){
    // 1) opening sum in FCFA (scalar, shared across all months)
    let opening=0;
    Object.entries(openingByCode).forEach(([code,d])=>{
      if(prefixes.some(p=>code.startsWith(p)))opening+=d.balance;
    });
    // 2) per-month cumulated movements across matching accounts
    const cumulMoves=new Array(12).fill(0);
    const accounts=[];
    if(monthlyActs){
      Object.entries(monthlyActs).forEach(([code,data])=>{
        if(code==='__monthFlag')return;
        if(!prefixes.some(p=>code.startsWith(p)))return;
        // Per-account monthly snapshot series (FCFA) for drill-down
        const acctOpening=openingByCode[code]?.balance||0;
        const acctCumul=new Array(12).fill(0);
        let running=acctOpening;
        for(let i=0;i<12;i++){
          running+=(data.months[i]||0);
          acctCumul[i]=running;
        }
        // Push monthly movements to the aggregate
        let runAgg=0;
        for(let i=0;i<12;i++){
          runAgg+=(data.months[i]||0);
          cumulMoves[i]+=runAgg;
        }
        accounts.push({code,id:data.id,name:(data.name||'').replace(/^\d+\s*/,''),m:acctCumul.map(v=>(invert?-v:v)/SCALE),balance:(invert?-acctOpening:acctOpening)/SCALE});
      });
    }
    // 3) assemble : balance at end of month i = opening + cumulMoves[i]
    const m=new Array(12).fill(null);
    for(let i=0;i<=lastIdx;i++){
      const raw=(opening+cumulMoves[i])/SCALE;
      m[i]=invert?-raw:raw;
    }
    const val=m[lastIdx]||0;
    // _opening = scalar opening balance in M FCFA, matching the sign of m[] values.
    // Used by buildCfsFromRaw() as the reference for month-0 delta so the CFS
    // stays in sync with the bilan series (avoids bsEnd mismatch with N-1 close).
    const _opening=(invert?-opening:opening)/SCALE;
    return {m,val,accounts,_opening};
  }
  // Same account mapping as buildBilanFromOdoo — kept in sync manually.
  const immo_incorp=seriesBS(['21']);
  const amort_incorp=seriesBS(['281']);
  const immo_corp_brut=seriesBS(['22','23','24']);
  const amort_corp=seriesBS(['283','284']);
  // class 27 sans 275 : le sous-compte 275 (dépôts et cautionnements) est traité séparément
  // comme "autres créances" dans l'actif circulant pour éviter le double comptage.
  const immo_fin=seriesBS(['26','270','271','272','273','274','276','277','278','279']);
  const stocks=seriesBS(['31','32','33','34','35','36','37','38']);
  const creances_cl=seriesBS(['411','412','413','414','415']);
  const acomptes_cl=seriesBS(['419']);
  const creances_dout=seriesBS(['416','491']);// 491 = dépréciations clients (contra-asset)
  const depots_caut=seriesBS(['275']);
  const cca=seriesBS(['476']);
  // Debiteurs divers — class 47 (régularisations) + 46 (associés) + non-clients 4*.
  const debiteurs_div=seriesBS(['461','462','463','464','465','466','467','468','469','471','472','473','474','475','477','478']);
  const credit_tva=seriesBS(['445']);
  const effets_enc=seriesBS(['511','513']);
  // Trésorerie class 5 complete : 52 banque, 53 ets financiers, 54 chèques postaux,
  // 55 mobile money (Wave), 57 caisse, 58 virements internes. 56 reste en dettes CT.
  const banque=seriesBS(['52','53','54','55']);
  const caisse=seriesBS(['57','58']);
  // Helper : element-wise add/sub on 12-arrays. Null means "no data" → propagated.
  function addArr(...arrs){
    const out=new Array(12).fill(0);
    for(let i=0;i<12;i++){
      let anyNull=false,s=0;
      arrs.forEach(a=>{if(a==null||a[i]==null)anyNull=true;else s+=a[i]});
      out[i]=anyNull?null:s;
    }
    return out;
  }
  function derived(components){
    const m=addArr(...components.map(c=>c.m));
    const val=m[lastIdx]!=null?m[lastIdx]:0;
    // Sum of component openings (components without _opening treated as 0).
    const _opening=components.reduce((s,c)=>s+(c._opening||0),0);
    return {m,val,_opening};
  }
  const immo_incorp_net=derived([immo_incorp,amort_incorp]);
  const immo_corp_net=derived([immo_corp_brut,amort_corp]);
  const immo_total=derived([immo_incorp_net,immo_corp_net,immo_fin]);
  const clients_total=derived([creances_cl,acomptes_cl,creances_dout]);
  const autres_cr_total=derived([depots_caut,cca,debiteurs_div,credit_tva]);
  const actif_circ=derived([stocks,clients_total,autres_cr_total]);
  const treso_total=derived([effets_enc,banque,caisse]);
  const total_actif=derived([immo_total,actif_circ,treso_total]);
  // Passif — naturally credit-positive, so we invert the raw balance.
  const capital=seriesBS(['101','102','103','104','105','106','107','108','109'],true);
  const ran_class1=seriesBS(['11','12'],true);
  const rn_ex=seriesBS(['13'],true);
  const emprunt_mt=seriesBS(['16'],true);
  const credit_bail=seriesBS(['17'],true);
  const credit_ct=seriesBS(['56'],true);
  const provisions=seriesBS(['19'],true);
  const frs=seriesBS(['401','402','403'],true);
  const frs_fnp=seriesBS(['408'],true);
  const acomptes_frs=seriesBS(['409']);// debit-positive (prepayment to suppliers)
  const imp_taxes=seriesBS(['441','442','446','447','448','449'],true);
  const tva_payer=seriesBS(['443','444'],true);
  const emp_charges=seriesBS(['42','43'],true);
  // ─ Equity residuals — fold prior-year unposted P&L + classes 8/9 into retained earnings ─
  // Many Odoo setups don't run year-end closing entries, so classes 6/7 at the opening balance
  // still carry the prior year's P&L accumulation. Classes 8/9 may also hold custom equity
  // accounts (e.g. "999 Profits/pertes non distribués"). All of these belong to equity in a
  // SYSCOHADA bilan: `cp = class1 + (-class6) + (-class7) + (-class8) + (-class9)` (flipped
  // because equity is credit-positive). By including them here, the bilan is guaranteed to
  // balance: Actif = Passif + CP (raw sum of all classes is 0 by double-entry).
  let opening6=0,opening7=0,opening89=0;
  Object.entries(openingByCode).forEach(([code,d])=>{
    if(code.startsWith('6'))opening6+=d.balance;
    else if(code.startsWith('7'))opening7+=d.balance;
    else if(code.startsWith('8')||code.startsWith('9'))opening89+=d.balance;
  });
  // Cumulated monthly movements for classes 6 and 7 in the current year.
  const cumul6Mv=new Array(12).fill(0);
  const cumul7Mv=new Array(12).fill(0);
  const cumul89Mv=new Array(12).fill(0);
  if(monthlyActs){
    Object.entries(monthlyActs).forEach(([code,data])=>{
      if(code==='__monthFlag')return;
      if(code.startsWith('6')){
        let run=0;for(let i=0;i<12;i++){run+=(data.months[i]||0);cumul6Mv[i]+=run}
      } else if(code.startsWith('7')){
        let run=0;for(let i=0;i<12;i++){run+=(data.months[i]||0);cumul7Mv[i]+=run}
      } else if(code.startsWith('8')||code.startsWith('9')){
        let run=0;for(let i=0;i<12;i++){run+=(data.months[i]||0);cumul89Mv[i]+=run}
      }
    });
  }
  // Prior-year unposted result + classes 8/9 → folded into "Report à nouveau" for display.
  // Stable across months (no dynamic, set at opening).
  const ranAdjVal=(-(opening6+opening7+opening89))/SCALE;
  const ran={m:new Array(12).fill(null),val:0,accounts:ran_class1.accounts||[],_opening:(ran_class1._opening||0)+ranAdjVal};
  for(let i=0;i<12;i++){
    if(ran_class1.m[i]==null)continue;
    ran.m[i]=(ran_class1.m[i]||0)+ranAdjVal;
  }
  ran.val=ran.m[lastIdx]!=null?ran.m[lastIdx]:(ran_class1.val+ranAdjVal);
  // In-period result — computed from current-year class 6/7 monthly movements.
  // Class 8/9 movements also flow here (rare, usually zero).
  // _opening=0 : by definition, result_encours starts at 0 each year since it
  // only accumulates in-period 6/7 movements (no carry-over from prior year).
  const result_encours={m:new Array(12).fill(null),val:0,accounts:[],_opening:0};
  for(let i=0;i<=lastIdx;i++){
    result_encours.m[i]=(-(cumul6Mv[i]+cumul7Mv[i]+cumul89Mv[i]))/SCALE;
  }
  result_encours.val=result_encours.m[lastIdx]||0;
  const cp_total=derived([capital,ran,rn_ex,result_encours]);
  const dettes_fin_total=derived([emprunt_mt,credit_bail,credit_ct,provisions]);
  const frs_total=derived([frs,frs_fnp,acomptes_frs]);
  const dfs_total=derived([imp_taxes,tva_payer,emp_charges]);
  const passif_circ=derived([frs_total,dfs_total]);
  const total_passif=derived([cp_total,dettes_fin_total,passif_circ]);
  // Build the final structure. Each line gets m:[], val (latest), _opening
  // (scalar opening balance — same sign as m[]), accounts (drill list).
  function L(id,label,level,type,src,extra={}){
    return {id,label,level,type,m:src.m||[],val:src.val||0,accounts:src.accounts||[],_opening:src._opening||0,...extra};
  }
  return {
    actif:[
      L('immo','Immobilisations',0,'total',immo_total,{expandable:true,children:['immo_incorp','immo_corp','immo_fin']}),
      L('immo_incorp','Immobilisations incorporelles nettes',1,null,immo_incorp_net,{parent:'immo',accounts:[...immo_incorp.accounts,...amort_incorp.accounts]}),
      L('immo_corp','Immobilisations corporelles nettes',1,null,immo_corp_net,{parent:'immo',expandable:true,children:['immo_corp_brut','amort_corp']}),
      L('immo_corp_brut','Immobilisations corporelles brutes',2,null,immo_corp_brut,{parent:'immo_corp'}),
      L('amort_corp','Amortissements',2,null,amort_corp,{parent:'immo_corp'}),
      L('immo_fin','Immobilisations financi\u00e8res',1,null,immo_fin,{parent:'immo'}),
      L('actif_circ','Actif circulant',0,'total',actif_circ,{expandable:true,children:['stocks','clients_grp','autres_creances_grp']}),
      L('stocks','Stocks',1,null,stocks,{parent:'actif_circ'}),
      L('clients_grp','Clients',1,null,clients_total,{parent:'actif_circ',expandable:true,children:['creances_cl','acomptes_cl','creances_dout']}),
      L('creances_cl','Cr\u00e9ances clients',2,null,creances_cl,{parent:'clients_grp'}),
      L('acomptes_cl','Acomptes clients',2,null,acomptes_cl,{parent:'clients_grp'}),
      L('creances_dout','Cr\u00e9ances douteuses',2,null,creances_dout,{parent:'clients_grp'}),
      L('autres_creances_grp','Autres cr\u00e9ances',1,null,autres_cr_total,{parent:'actif_circ',expandable:true,children:['depots_caut','cca','debiteurs_div','credit_tva']}),
      L('depots_caut','D\u00e9p\u00f4ts et cautionnements',2,null,depots_caut,{parent:'autres_creances_grp'}),
      L('cca','Charges constat\u00e9es d\'avance',2,null,cca,{parent:'autres_creances_grp'}),
      L('debiteurs_div','D\u00e9biteurs divers',2,null,debiteurs_div,{parent:'autres_creances_grp'}),
      L('credit_tva','Cr\u00e9dit de TVA',2,null,credit_tva,{parent:'autres_creances_grp'}),
      L('tresorerie_a','Tr\u00e9sorerie',0,'total',treso_total,{expandable:true,children:['effets_enc','banque','caisse']}),
      L('effets_enc','Effets \u00e0 encaisser',1,null,effets_enc,{parent:'tresorerie_a'}),
      L('banque','Banque',1,null,banque,{parent:'tresorerie_a'}),
      L('caisse','Caisse',1,null,caisse,{parent:'tresorerie_a'}),
      L('total_actif','TOTAL ACTIF',0,'grandtotal',total_actif),
    ],
    passif:[
      L('cp','Capitaux propres',0,'total',cp_total,{expandable:true,children:['capital','ran','rn_ex','result_encours']}),
      L('capital','Capital',1,null,capital,{parent:'cp'}),
      L('ran','Report \u00e0 nouveau',1,null,ran,{parent:'cp'}),
      L('rn_ex','R\u00e9sultat de l\'exercice ant\u00e9rieur',1,null,rn_ex,{parent:'cp'}),
      L('result_encours','R\u00e9sultat en cours',1,null,result_encours,{parent:'cp'}),
      L('dettes_fin_b','Dettes financi\u00e8res',0,'total',dettes_fin_total,{expandable:true,children:['emprunt_mt','credit_bail','credit_ct','provisions']}),
      L('emprunt_mt','Emprunt bancaire \u00e0 moyen terme',1,null,emprunt_mt,{parent:'dettes_fin_b'}),
      L('credit_bail','Dettes de cr\u00e9dit-bail',1,null,credit_bail,{parent:'dettes_fin_b'}),
      L('credit_ct','Cr\u00e9dits bancaires \u00e0 court terme',1,null,credit_ct,{parent:'dettes_fin_b'}),
      L('provisions','Provisions pour risques et charges',1,null,provisions,{parent:'dettes_fin_b'}),
      L('passif_circ','Passif circulant',0,'total',passif_circ,{expandable:true,children:['frs_grp','dettes_fisc_soc']}),
      L('frs_grp','Dettes fournisseurs',1,null,frs_total,{parent:'passif_circ',expandable:true,children:['frs','frs_fnp','acomptes_frs']}),
      L('frs','Fournisseurs',2,null,frs,{parent:'frs_grp'}),
      L('frs_fnp','Fournisseurs — Factures non parvenues',2,null,frs_fnp,{parent:'frs_grp'}),
      L('acomptes_frs','Acomptes fournisseurs',2,null,acomptes_frs,{parent:'frs_grp'}),
      L('dettes_fisc_soc','Dettes fiscales et sociales',1,null,dfs_total,{parent:'passif_circ',expandable:true,children:['imp_taxes','tva_payer','emp_charges']}),
      L('imp_taxes','Imp\u00f4ts & taxes',2,null,imp_taxes,{parent:'dettes_fisc_soc'}),
      L('tva_payer','TVA \u00e0 payer',2,null,tva_payer,{parent:'dettes_fisc_soc'}),
      L('emp_charges','Employ\u00e9s et charges sociales',2,null,emp_charges,{parent:'dettes_fisc_soc'}),
      L('total_passif','TOTAL PASSIF',0,'grandtotal',total_passif),
    ]
  };
}

// ─── CFS DYNAMIQUE — reconstruit depuis rawPL + bilan ────────
// Méthode indirecte : RN + D&A (non-cash addback) − ΔBFR − Capex + ΔFinancement.
//
// Invariant (par construction) : Σ flux + residuel = Δ trésorerie bilan.
// Le résiduel ("Autres variations") absorbe les écarts techniques :
// — dotations aux provisions (comptées une fois dans D&A, une fois dans Δprov)
// — disposals d'immo au NBV (non trackés séparément des acquisitions)
// — amort immo incorporelles (uniquement exposé en net, pas en brut)
// Un résiduel faible (< 5% du total flux) indique une bonne qualité d'extraction.
//
// Requiert : CACHE.rawPL[year] + CACHE.bilan[year] (mensualisés). bilan[year-1]
// en option pour l'opening — sinon Janvier ressort à null (pas de Δ calculable).
function buildCfsFromRaw(year){
  const rawPL  = CACHE.rawPL[year];
  const bilanN = CACHE.bilan[year];
  const bilanN1= CACHE.bilan[year-1];
  // Guard : need mensualized bilan (m[] series). Legacy flat snapshot → no rebuild.
  if(!rawPL || !bilanN || !Array.isArray(bilanN.actif) || !bilanN.actif[0] || !Array.isArray(bilanN.actif[0].m)) return null;

  // ── Helpers ───────────────────────────────────────────────
  const plM = (id) => {
    const line = rawPL.find(l => l.id === id);
    return (line && Array.isArray(line.m)) ? line.m.slice() : new Array(12).fill(0);
  };
  // Returns the bilan line object itself so we can read both m[] AND _opening.
  // _opening is the scalar opening balance used by buildBilanSeriesFromOdoo to
  // seed the series — by using it directly we avoid any drift between
  // bilanN1.m[11] (closing computed from N-2 opening + N-1 movements) and
  // bilanN.m[0] (seeded from bsEnd_{N-1} snapshot).
  const bLine = (id) => balLine(bilanN, id);
  const bM = (id) => {
    const line = bLine(id);
    return (line && Array.isArray(line.m)) ? line.m.slice() : new Array(12).fill(null);
  };
  // Monthly delta series : [i] = m[i] - m[i-1] (or - _opening for i=0).
  // Uses the SAME reference as the series (line._opening), so Δ[0] captures
  // only the real January movement — not the closing-entry reclassifications.
  const delta = (id) => {
    const line = bLine(id);
    if(!line || !Array.isArray(line.m)) return new Array(12).fill(null);
    const m  = line.m;
    const op = (typeof line._opening === 'number') ? line._opening : 0;
    const out= new Array(12).fill(null);
    let prev = op;
    for(let i=0;i<12;i++){
      if(m[i]==null){ out[i]=null; continue; }
      out[i] = m[i] - prev;
      prev   = m[i];
    }
    return out;
  };
  // Opening value (for treso début display)
  const opening = (id) => {
    const line = bLine(id);
    return (line && typeof line._opening === 'number') ? line._opening : 0;
  };
  // Null-propagating sum : if any component is null at [i], result is null.
  const addAll = (...arrs) => {
    const out = new Array(12).fill(null);
    for(let i=0;i<12;i++){
      let s = 0, anyNull = false;
      for(const a of arrs){
        if(!a) continue;
        if(a[i]==null){ anyNull = true; break; }
        s += a[i];
      }
      out[i] = anyNull ? null : s;
    }
    return out;
  };
  const neg = (arr) => arr.map(v => v==null ? null : -v);

  const lm = CACHE.lastMonth[year];
  const lastIdx = (lm!=null && lm>=0) ? lm : 11;
  const mask = (arr) => arr.map((v,i) => i>lastIdx ? null : v);

  // ── P&L inputs (charge convention : da négatif, rn signé) ─
  const rn_m       = mask(plM('resultat_net'));
  const da_m_raw   = mask(plM('da'));          // negative (charge)
  const addback_da = neg(da_m_raw);             // flip → positive addback

  // ── Working capital deltas (assets : −Δ, liabilities : +Δ) ─
  const var_stocks    = neg(delta('stocks'));
  const var_clients   = neg(delta('clients_grp'));
  const var_autres_cr = neg(delta('autres_creances_grp'));
  const var_frs       = delta('frs_grp');
  const var_fisc      = delta('dettes_fisc_soc');

  const flux_expl = addAll(rn_m, addback_da, var_stocks, var_clients, var_autres_cr, var_frs, var_fisc);

  // ── Investing : acquisitions nettes ───────────────────────
  // Les immobilisations corporelles sont exposées en BRUT (class 22/23/24),
  // donc -Δcorp_brut = cash capex corp pur (sans effet amort).
  //
  // Les incorporelles ne sont exposées qu'en NET (class 21 - amort 281). Sans
  // correction, -Δincorp_net donnerait un flux positif égal à l'amort incorp,
  // double-comptant l'addback D&A déjà appliqué en exploitation.
  //
  // Correction : on soustrait à l'incorp la part de D&A NON attribuable au corp
  // (= da_full − Δamort_corp = amort incorp + provisions + dépréciations).
  // Pour un mois sans acquisition incorp, ça donne exactement 0 (cash neutre).
  // Pour un mois d'acquisition, ça donne le cash réellement décaissé.
  //
  // Dérivation algébrique :
  //   cfs_acq_incorp = -Δincorp_net - (Δamort_corp - da_m)
  //   Σ investing + addback operating = -Δimmo_total_net (identité bilan OK)
  const d_amort_corp = delta('amort_corp');
  const da_incorp_and_other = da_m_raw.map((v,i) => {
    if(v==null||d_amort_corp[i]==null) return null;
    return d_amort_corp[i] - v;  // amort_corp_flow - da_full_flow = -(da - Δamort_corp)
  });
  const d_incorp = delta('immo_incorp');
  const acq_corp     = neg(delta('immo_corp_brut'));
  const acq_incorp   = new Array(12).fill(null);
  for(let i=0;i<12;i++){
    if(d_incorp[i]==null||da_incorp_and_other[i]==null) continue;
    acq_incorp[i] = -d_incorp[i] - da_incorp_and_other[i];
  }
  const var_immo_fin = neg(delta('immo_fin'));
  const flux_inv = addAll(acq_corp, acq_incorp, var_immo_fin);

  // ── Financing : variations CP + dettes financières ───────
  // capital/ran/rn_ex devraient être stables en cours d'année (pas d'écritures
  // de clôture), groupés en "variation capital et réserves".
  const d_cap   = delta('capital');
  const d_ran   = delta('ran');
  const d_rnex  = delta('rn_ex');
  const var_cap = addAll(d_cap, d_ran, d_rnex);

  const d_empr       = delta('emprunt_mt');
  const d_credit_ct  = delta('credit_ct');
  const d_credit_bail= delta('credit_bail');
  const d_prov       = delta('provisions');

  const flux_fin = addAll(var_cap, d_empr, d_credit_ct, d_credit_bail, d_prov);

  // ── Résiduel (force la balance identité) ──────────────────
  // Δtréso bilan = flux_expl + flux_inv + flux_fin + residual
  // Capte les approximations (provisions double-comptées, disposals, amort incorp).
  const d_treso  = delta('tresorerie_a');
  const residual = new Array(12).fill(null);
  for(let i=0;i<12;i++){
    if(d_treso[i]==null||flux_expl[i]==null||flux_inv[i]==null||flux_fin[i]==null) continue;
    residual[i] = d_treso[i] - flux_expl[i] - flux_inv[i] - flux_fin[i];
    // Tiny rounding noise (< 1k FCFA) → snap to zero for cleaner display
    if(Math.abs(residual[i]) < 1e-6) residual[i] = 0;
  }
  const var_nette = d_treso.slice();

  // ── Trésorerie début / fin (snapshots bilan) ──────────────
  const treso_m     = bM('tresorerie_a');
  const treso_open  = opening('tresorerie_a');
  const treso_debut = new Array(12).fill(null);
  const treso_fin   = new Array(12).fill(null);
  let prevT = treso_open;
  for(let i=0;i<12;i++){
    if(treso_m[i]==null) continue;
    treso_debut[i] = prevT;
    treso_fin[i]   = treso_m[i];
    prevT = treso_m[i];
  }

  // ── Quality metric : residual share of total flux ─────────
  // Stored on the array so insights can surface a warning if the rebuild
  // is structurally broken (e.g. > 10% of gross flow is unexplained).
  let grossFlux=0, absResidual=0;
  for(let i=0;i<=lastIdx;i++){
    if(flux_expl[i]!=null) grossFlux += Math.abs(flux_expl[i]);
    if(flux_inv[i]!=null)  grossFlux += Math.abs(flux_inv[i]);
    if(flux_fin[i]!=null)  grossFlux += Math.abs(flux_fin[i]);
    if(residual[i]!=null)  absResidual += Math.abs(residual[i]);
  }
  const qualityPct = grossFlux>0 ? +(absResidual/grossFlux*100).toFixed(1) : 0;

  const out = [
    {id:'cfs_title',label:'Flux d\'exploitation',level:0,type:'section'},
    {id:'cfs_rn',label:'R\u00e9sultat net',level:1,parent:'cfs_flux_expl',m:rn_m,accounts:[{code:'6/7',name:'R\u00e9sultat de p\u00e9riode'}]},
    {id:'cfs_da',label:'+ Dotations aux amortissements (addback)',level:1,parent:'cfs_flux_expl',m:addback_da,accounts:[{code:'681',name:'Dotations'},{code:'781',name:'Reprises'}]},
    {id:'cfs_var_stocks',label:'Variation des stocks',level:1,parent:'cfs_flux_expl',m:var_stocks,accounts:[{code:'3x',name:'Stocks'}]},
    {id:'cfs_var_clients',label:'Variation des cr\u00e9ances clients',level:1,parent:'cfs_flux_expl',m:var_clients,accounts:[{code:'41x/49x',name:'Clients'}]},
    {id:'cfs_var_autres_cr',label:'Variation des autres cr\u00e9ances',level:1,parent:'cfs_flux_expl',m:var_autres_cr,accounts:[{code:'46/47',name:'Autres cr\u00e9ances'}]},
    {id:'cfs_var_frs',label:'Variation des dettes fournisseurs',level:1,parent:'cfs_flux_expl',m:var_frs,accounts:[{code:'40x',name:'Fournisseurs'}]},
    {id:'cfs_var_fisc',label:'Variation des dettes fiscales & sociales',level:1,parent:'cfs_flux_expl',m:var_fisc,accounts:[{code:'42/43/44',name:'Dettes fisc/soc'}]},
    {id:'cfs_flux_expl',label:'Flux net d\'exploitation',level:0,type:'total',expandable:true,m:flux_expl},

    {id:'spacer_cfs1',type:'spacer'},
    {id:'cfs_title2',label:'Flux d\'investissement',level:0,type:'section'},
    {id:'cfs_acq_incorp',label:'Variation immo incorporelles (net)',level:1,parent:'cfs_flux_inv',m:acq_incorp,accounts:[{code:'21/281',name:'Incorp nettes'}]},
    {id:'cfs_acq_corp',label:'Acquisitions immo corporelles (brut)',level:1,parent:'cfs_flux_inv',m:acq_corp,accounts:[{code:'22/23/24',name:'Corp brutes'}]},
    {id:'cfs_var_immo_fin',label:'Variation immo financi\u00e8res',level:1,parent:'cfs_flux_inv',m:var_immo_fin,accounts:[{code:'26/27',name:'Immo fin'}]},
    {id:'cfs_flux_inv',label:'Flux net d\'investissement',level:0,type:'total',expandable:true,m:flux_inv},

    {id:'spacer_cfs2',type:'spacer'},
    {id:'cfs_title3',label:'Flux de financement',level:0,type:'section'},
    {id:'cfs_var_cap',label:'Variation capital et r\u00e9serves',level:1,parent:'cfs_flux_fin',m:var_cap,accounts:[{code:'10/11/12/13',name:'Capital & RAN'}]},
    {id:'cfs_var_empr',label:'Variation emprunts bancaires MT',level:1,parent:'cfs_flux_fin',m:d_empr,accounts:[{code:'16',name:'Emprunts MT'}]},
    {id:'cfs_var_credit_ct',label:'Variation cr\u00e9dits bancaires CT',level:1,parent:'cfs_flux_fin',m:d_credit_ct,accounts:[{code:'56',name:'Cr\u00e9dits CT'}]},
    {id:'cfs_var_cb',label:'Variation dettes cr\u00e9dit-bail',level:1,parent:'cfs_flux_fin',m:d_credit_bail,accounts:[{code:'17',name:'Cr\u00e9dit-bail'}]},
    {id:'cfs_var_prov',label:'Variation provisions',level:1,parent:'cfs_flux_fin',m:d_prov,accounts:[{code:'19',name:'Provisions R&C'}]},
    {id:'cfs_flux_fin',label:'Flux net de financement',level:0,type:'total',expandable:true,m:flux_fin},

    {id:'spacer_cfs3',type:'spacer'},
    {id:'cfs_reste',label:'Autres variations (r\u00e9siduel technique)',level:1,m:residual,accounts:[{code:'\u2014',name:'\u00c9cart de balance'}]},
    {id:'cfs_var_nette',label:'Variation nette de tr\u00e9sorerie',level:0,type:'total',m:var_nette},
    {id:'cfs_treso_debut',label:'Tr\u00e9sorerie d\u00e9but de p\u00e9riode',level:1,m:treso_debut},
    {id:'cfs_treso_fin',label:'Tr\u00e9sorerie fin de p\u00e9riode',level:0,type:'total',m:treso_fin},
  ];
  // Attach quality metadata (non-enumerable so Object.entries loops don't hit it)
  Object.defineProperty(out,'_quality',{value:{residualPct:qualityPct,grossFlux,absResidual},enumerable:false});
  return out;
}

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
