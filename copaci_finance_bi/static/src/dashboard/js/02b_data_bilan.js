// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Bilan & CFS Data Builders
// ═══════════════════════════════════════════════════════════════
// Split from 02_data.js — contains: buildBilanFromOdoo,
// buildBilanSeriesFromOdoo, buildCfsFromRaw.

// ─── BILAN FROM ODOO ─────────────────────────────────────────
function buildBilanFromOdoo(bsBalances){
  // bsBalances: array of { account_id: [id, "code name"], balance: X }
  const byCode={};
  const cFilter=Array.isArray(STATE.companyIds)&&STATE.companyIds.length>0;
  if(bsBalances){
    bsBalances.forEach(row=>{
      const aid=row.account_id?.[0];
      const lbl=row.account_id?.[1]||'';
      const code=resolveAccountCode(aid,lbl);
      if(!code)return;
      if(cFilter){const comp=resolveAccountCompany(aid);if(!STATE.companyIds.includes(comp?comp.id:1))return;}
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
  const cFilter=Array.isArray(STATE.companyIds)&&STATE.companyIds.length>0;
  if(openingRows){
    openingRows.forEach(row=>{
      const aid=row.account_id?.[0];
      const lbl=row.account_id?.[1]||'';
      const code=resolveAccountCode(aid,lbl);
      if(!code)return;
      if(cFilter){const comp=resolveAccountCompany(aid);if(!STATE.companyIds.includes(comp?comp.id:1))return;}
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
