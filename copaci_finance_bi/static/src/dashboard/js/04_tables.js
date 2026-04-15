// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Table Rendering, Drill-down & Tooltips
// ═══════════════════════════════════════════════════════════════

// ─── TOOLTIP SYSTEM ──────────────────────────────────────────
const tooltip=document.getElementById('finTooltip');
let ttTimeout=null;
function showTooltip(e,line,monthIdx){
  clearTimeout(ttTimeout);
  const val=line.m[monthIdx];const caLine=PL_DATA.find(l=>l.id==='ca_net');
  const caVal=caLine?caLine.m[monthIdx]:1;const pctCa=caVal?(val/caVal*100):0;
  document.getElementById('ttTitle').textContent=`${line.label} — ${MO[monthIdx]} ${STATE.year}`;
  document.getElementById('ttVal').textContent=fmt(val)+' M FCFA';
  document.getElementById('ttPct').textContent=caVal?fmtPct(pctCa)+' du CA':'';
  document.getElementById('ttDelta').innerHTML=`<span class="${val>=0?'up':'down'}">YTD: ${fmt(sum(line.m.slice(0,monthIdx+1)))} M</span>`;
  // Sparkline
  drawSparkline(document.getElementById('ttSparkCanvas'),line.m,val>=0?'#10b981':'#ef4444');
  const tt=tooltip;tt.style.left=Math.min(e.clientX+15,window.innerWidth-340)+'px';
  tt.style.top=Math.min(e.clientY-10,window.innerHeight-200)+'px';
  tt.classList.add('show');
}
function hideTooltip(){ttTimeout=setTimeout(()=>tooltip.classList.remove('show'),150)}

// ─── DRILL-DOWN PANEL ────────────────────────────────────────
let drillStack=[];
function openDrill(line,monthIdx){
  drillStack=[{line,monthIdx}];renderDrill();
  document.getElementById('drillOverlay').classList.add('open');
  document.getElementById('drillPanel').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDrill(){
  document.getElementById('drillOverlay').classList.remove('open');
  document.getElementById('drillPanel').classList.remove('open');
  document.body.style.overflow='';
  drillStack=[];
  drillLinesState=null;
}
function drillGoBack(){
  if(drillStack.length>1){
    const popped=drillStack.pop();
    if(popped.type==='account')drillLinesState=null;
    const top=drillStack[drillStack.length-1];
    if(top.type==='account'){renderDrillAccount()}else{renderDrill()}
  }
}
// Keyboard: Escape closes drill
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drillStack.length)closeDrill()});

function renderDrill(){
  const state=drillStack[drillStack.length-1];const {line,monthIdx}=state;
  const isAll=monthIdx==null;
  const yr=STATE.year;
  const lm=CACHE.lastMonth[yr];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  const yearStatus=CACHE.yearStatus[yr]||'monthly-ok';
  // Mode-aware period label — toujours afficher le préfixe du mode (YTD/LTM)
  // pour que l'utilisateur sache si la valeur est mensuelle, cumulée ou rolling.
  let period;
  if(isAll){
    if(STATE.mode==='mensuel')period=(yearStatus==='open'?('YTD '+MO[lastIdx]):'Annuel')+' '+yr;
    else if(STATE.mode==='ytd')period='YTD '+MO[lastIdx]+' '+yr;
    else period='LTM '+MO[lastIdx]+' '+yr;
  } else {
    if(STATE.mode==='mensuel')period=MO[monthIdx]+' '+yr;
    else if(STATE.mode==='ytd')period='YTD '+MO[monthIdx]+' '+yr;
    else period='LTM '+MO[monthIdx]+' '+yr;
  }

  // Précise date range (to display AND to let Victor paste into Odoo GL date picker).
  // - dateLabel : DD/MM/YYYY → DD/MM/YYYY (affiché dans le subtitle)
  // - dateFrom/dateTo : YYYY-MM-DD (gardés prets pour migration future vers
  //   actionService.doAction() quand ce fichier deviendra un module Odoo natif)
  const lastDayOf=(y,m)=>new Date(y,m+1,0).getDate();
  const iso=(y,m,d)=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const fr =(y,m,d)=>String(d).padStart(2,'0')+'/'+String(m+1).padStart(2,'0')+'/'+y;
  let dateFrom,dateTo,dateLabel; /* eslint-disable-line no-unused-vars */
  if(isAll){
    if(STATE.mode==='ltm'){
      if(lastIdx>=11){dateFrom=iso(yr,0,1);dateLabel=fr(yr,0,1);}
      else{dateFrom=iso(yr-1,lastIdx+1,1);dateLabel=fr(yr-1,lastIdx+1,1);}
    } else {
      dateFrom=iso(yr,0,1);dateLabel=fr(yr,0,1);
    }
    const lastD=lastDayOf(yr,lastIdx);
    dateTo=iso(yr,lastIdx,lastD);
    dateLabel+=' → '+fr(yr,lastIdx,lastD);
  } else {
    if(STATE.mode==='mensuel'){
      const lastD=lastDayOf(yr,monthIdx);
      dateFrom=iso(yr,monthIdx,1);dateTo=iso(yr,monthIdx,lastD);
      dateLabel=fr(yr,monthIdx,1)+' → '+fr(yr,monthIdx,lastD);
    } else if(STATE.mode==='ytd'){
      const lastD=lastDayOf(yr,monthIdx);
      dateFrom=iso(yr,0,1);dateTo=iso(yr,monthIdx,lastD);
      dateLabel=fr(yr,0,1)+' → '+fr(yr,monthIdx,lastD);
    } else { // ltm
      const lastD=lastDayOf(yr,monthIdx);
      if(monthIdx>=11){dateFrom=iso(yr,0,1);dateLabel=fr(yr,0,1);}
      else{dateFrom=iso(yr-1,monthIdx+1,1);dateLabel=fr(yr-1,monthIdx+1,1);}
      dateTo=iso(yr,monthIdx,lastD);
      dateLabel+=' → '+fr(yr,monthIdx,lastD);
    }
  }

  // Mode-aware aggregate value
  const val=isAll?plAgg(line.id):line.m[monthIdx];

  document.getElementById('drillTitleText').textContent=line.label;
  document.getElementById('drillSubText').textContent=period+' ('+dateLabel+') · '+fmt(val)+' M FCFA';
  document.getElementById('drillBack').style.display=drillStack.length>1?'block':'none';

  const body=document.getElementById('drillBody');
  let html=`<div class="drill-total">${fmt(val)} M FCFA</div>`;

  // Mini chart — all months for this line
  html+=`<div class="drill-chart"><canvas id="drillChart"></canvas></div>`;

  // Accounts breakdown (real amounts, mode-aware)
  // Helper : valeur d'un compte à la position idx selon le mode courant
  // - mensuel : acct.m[idx]
  // - ytd     : cumul Jan..idx sur l'année courante
  // - ltm     : rolling 12M = cumul Jan..idx (année N) + (idx+1..Dec) (année N-1)
  function acctValAt(acct,idx){
    const m=acct.m||[];
    if(STATE.mode==='mensuel')return m[idx]!=null?m[idx]:0;
    if(STATE.mode==='ytd'){
      let s=0;for(let j=0;j<=idx;j++)s+=m[j]||0;return s;
    }
    // LTM : besoin des mois N-1 pour le même compte
    const n1AcctData=CACHE.acctData[yr-1];
    const n1Row=n1AcctData&&n1AcctData[acct.code];
    const n1m=n1Row?n1Row.months.map(v=>-v/SCALE):new Array(12).fill(0);
    let s=0;
    for(let j=0;j<=idx;j++)s+=m[j]||0;
    for(let j=idx+1;j<12;j++)s+=n1m[j]||0;
    return s;
  }
  function acctValAll(acct){
    if(STATE.mode==='mensuel')return sum(acct.m||[]);
    return acctValAt(acct,lastIdx);
  }

  const accounts=line.accounts||[];
  if(accounts.length){
    html+=`<div class="drill-accounts"><table><thead><tr><th>Compte</th><th>Libellé</th><th style="text-align:right">Montant</th></tr></thead><tbody>`;
    accounts.forEach((acct,i)=>{
      const acctVal=isAll?acctValAll(acct):acctValAt(acct,monthIdx);
      const cls=acctVal<0?'neg':(acctVal>0?'':'');
      html+=`<tr data-drill-acct="${esc(acct.code)}" data-drill-id="${acct.id||''}" data-drill-mo="${monthIdx==null?'':monthIdx}" style="cursor:pointer">
        <td><span class="acct-code">${esc(acct.code)}</span></td>
        <td>${esc(acct.name)}</td>
        <td class="${cls}" style="text-align:right">${fmt(acctVal)}</td></tr>`;
    });
    html+=`</tbody></table></div>`;
  }

  // Children lines if any
  if(line.expandable&&line.children){
    const childLines=PL_DATA.filter(l=>line.children.includes(l.id));
    if(childLines.length){
      html+=`<div style="margin-top:20px"><div class="section-title">Lignes composantes</div>`;
      html+=`<div class="drill-accounts"><table><thead><tr><th>Libellé</th><th style="text-align:right">Montant</th></tr></thead><tbody>`;
      childLines.forEach(cl=>{
        const cv=isAll?plAgg(cl.id):cl.m[monthIdx];
        html+=`<tr data-drill-child="${esc(cl.id)}" data-drill-mo="${monthIdx==null?'':monthIdx}" style="cursor:pointer"><td>${esc(cl.label)}</td><td class="${cv<0?'neg':''}" style="text-align:right">${fmt(cv)}</td></tr>`;
      });
      html+=`</tbody></table></div></div>`;
    }
  }

  html+=`<div class="drill-gl-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Cliquez sur un compte pour ouvrir le Grand Livre Odoo sur la période <strong>${dateLabel}</strong></div>`;
  body.innerHTML=html;

  // Event delegation : drill account row + drill child line (remplace les onclick inline)
  // Bind à chaque renderDrill car body.innerHTML est remplacé
  body.querySelectorAll('tr[data-drill-acct]').forEach(tr=>{
    tr.addEventListener('click',()=>{
      const code=tr.dataset.drillAcct;
      const id=tr.dataset.drillId||null;
      const mo=tr.dataset.drillMo===''?null:parseInt(tr.dataset.drillMo);
      drillToAccount(code,id,mo);
    });
  });
  body.querySelectorAll('tr[data-drill-child]').forEach(tr=>{
    tr.addEventListener('click',()=>{
      const childId=tr.dataset.drillChild;
      const mo=tr.dataset.drillMo===''?null:parseInt(tr.dataset.drillMo);
      drillToChild(childId,mo);
    });
  });

  // Draw drill chart — use cc() to auto-destroy previous instance
  requestAnimationFrame(()=>{
    const dc=document.getElementById('drillChart');
    if(!dc)return;
    cc('drill',dc,{type:'bar',data:{labels:MO,datasets:[{label:line.label,data:line.m,backgroundColor:line.m.map(v=>v>=0?'rgba(13,148,136,0.7)':'rgba(239,68,68,0.6)'),borderRadius:4}]},
      options:(()=>{const base=chartOpts('bar',{legend:false});return{...base,plugins:{...base.plugins,datalabels:dlBar({fontSize:9})},scales:{x:{grid:{display:false},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10}}},y:{grid:{color:isDark()?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)'},ticks:{color:isDark()?'#94a3b8':'#64748b',font:{size:10},callback:v=>fmt(v)}}}}})()});
  });
}

function drillToChild(childId,monthIdx){
  const line=PL_DATA.find(l=>l.id===childId);
  if(line){drillStack.push({line,monthIdx});renderDrill()}
}
// ─── DRILL LEVEL 2 : Ecritures comptables d'un compte ──────
// Au lieu de sauter directement dans Odoo, on affiche les écritures
// DANS le dashboard (paginé). Un bouton "Ouvrir dans Odoo" permet
// ensuite d'aller dans le Grand Livre natif si besoin.
const DRILL_PAGE_SIZE=50;
let drillLinesState=null; // {accountId,code,name,dateFrom,dateTo,offset,total,lines,loading}
let _drillAbort=null; // AbortController — cancels in-flight drill fetch on new request

function drillToAccount(code,id,monthIdx){
  if(!id){return}
  // Compute date range from current drill context (reuse renderDrill's logic)
  const yr=STATE.year;
  const lm=CACHE.lastMonth[yr];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  const isAll=monthIdx==null;
  const lastDayOf=(y,m)=>new Date(y,m+1,0).getDate();
  const iso=(y,m,d)=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  let dateFrom,dateTo;
  if(isAll){
    if(STATE.mode==='ltm'&&lastIdx<11){dateFrom=iso(yr-1,lastIdx+1,1)}
    else{dateFrom=iso(yr,0,1)}
    dateTo=iso(yr,lastIdx,lastDayOf(yr,lastIdx));
  } else {
    if(STATE.mode==='mensuel'){
      dateFrom=iso(yr,monthIdx,1);dateTo=iso(yr,monthIdx,lastDayOf(yr,monthIdx));
    } else if(STATE.mode==='ytd'){
      dateFrom=iso(yr,0,1);dateTo=iso(yr,monthIdx,lastDayOf(yr,monthIdx));
    } else { // ltm
      if(monthIdx>=11){dateFrom=iso(yr,0,1)}
      else{dateFrom=iso(yr-1,monthIdx+1,1)}
      dateTo=iso(yr,monthIdx,lastDayOf(yr,monthIdx));
    }
  }
  // Init state and push drill level
  drillLinesState={accountId:id,code,name:'',dateFrom,dateTo,offset:0,total:0,lines:[],loading:true};
  drillStack.push({type:'account',accountId:id,code,dateFrom,dateTo,monthIdx});
  renderDrillAccount();
  fetchDrillLines(id,dateFrom,dateTo,0);
}

async function fetchDrillLines(accountId,dateFrom,dateTo,offset){
  // Cancel any in-flight request to prevent race conditions on rapid pagination
  if(_drillAbort){_drillAbort.abort();_drillAbort=null}
  const ctrl=new AbortController();
  _drillAbort=ctrl;
  try{
    let url=`/copaci_finance_bi/drill?account_id=${accountId}&date_from=${dateFrom}&date_to=${dateTo}&offset=${offset}&limit=${DRILL_PAGE_SIZE}`;
    if(Array.isArray(STATE.companyIds)&&STATE.companyIds.length){
      url+='&company_ids='+STATE.companyIds.join(',');
    }
    const resp=await fetch(url,{signal:ctrl.signal});
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const data=await resp.json();
    if(ctrl.signal.aborted)return;// superseded by newer request
    drillLinesState.name=data.account?.name||'';
    drillLinesState.code=data.account?.code||drillLinesState.code;
    drillLinesState.total=data.total||0;
    drillLinesState.offset=data.offset||0;
    drillLinesState.lines=data.lines||[];
    drillLinesState.loading=false;
    renderDrillAccount();
  }catch(err){
    if(err.name==='AbortError')return;// request was cancelled, ignore
    drillLinesState.loading=false;
    drillLinesState.error=err.message;
    renderDrillAccount();
  }
}

function renderDrillAccount(){
  const s=drillLinesState;if(!s)return;
  const body=document.getElementById('drillBody');
  const frDate=(d)=>{if(!d)return'';const p=d.split('-');return p[2]+'/'+p[1]+'/'+p[0]};

  // Header
  document.getElementById('drillTitleText').textContent=
    (s.code||'')+' — '+(s.name||'Chargement...');
  document.getElementById('drillSubText').textContent=
    frDate(s.dateFrom)+' → '+frDate(s.dateTo)+' · '+s.total+' écritures';
  document.getElementById('drillBack').style.display='block';

  if(s.loading){
    body.innerHTML='<div class="drill-loading">Chargement des écritures...</div>';
    return;
  }
  if(s.error){
    body.innerHTML='<div class="drill-empty" style="color:var(--red)">Erreur : '+esc(s.error)+'</div>';
    return;
  }

  let html='';
  // ── Header bar: count + Odoo button ──
  html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">`;
  html+=`<span style="font-size:12px;color:var(--t3)">${s.total} écriture${s.total>1?'s':''} trouvée${s.total>1?'s':''}</span>`;
  html+=`<button class="drill-odoo-btn" id="drillOpenOdoo">`;
  html+=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  html+=`Ouvrir dans Odoo</button></div>`;

  // ── Table écritures — semantic CSS classes ──
  if(s.lines.length){
    html+=`<div class="drill-entries"><table><thead><tr>`;
    html+=`<th>Date</th><th>Pièce</th><th>Journal</th><th>Partenaire</th><th>Libellé</th>`;
    html+=`<th style="text-align:right">Débit</th><th style="text-align:right">Crédit</th><th style="text-align:right">Solde</th></tr></thead><tbody>`;
    let runBal=0;
    s.lines.forEach(l=>{
      runBal+=l.balance;
      html+=`<tr data-move-id="${l.move_id}" title="Ouvrir la pièce dans Odoo">`;
      html+=`<td style="white-space:nowrap">${esc(frDate(l.date))}</td>`;
      html+=`<td class="move-ref">${esc(l.move_name)}</td>`;
      html+=`<td>${esc(l.journal)}</td>`;
      html+=`<td>${esc(l.partner)}</td>`;
      html+=`<td>${esc(l.label)}</td>`;
      html+=`<td class="de">${l.debit?fmtInt(l.debit):''}</td>`;
      html+=`<td class="cr">${l.credit?fmtInt(l.credit):''}</td>`;
      html+=`<td class="bal${runBal<0?' neg':''}">${fmtInt(runBal)}</td>`;
      html+=`</tr>`;
    });
    html+=`</tbody></table></div>`;
  } else {
    html+=`<div class="drill-empty">Aucune écriture sur cette période</div>`;
  }

  // ── Pagination — semantic CSS ──
  if(s.total>DRILL_PAGE_SIZE){
    const page=Math.floor(s.offset/DRILL_PAGE_SIZE)+1;
    const pages=Math.ceil(s.total/DRILL_PAGE_SIZE);
    html+=`<div class="drill-pager">`;
    html+=`<button id="drillPrev" ${s.offset===0?'disabled':''}>← Précédent</button>`;
    html+=`<span class="drill-pager-info">Page ${page} / ${pages}</span>`;
    html+=`<button id="drillNext" ${s.offset+DRILL_PAGE_SIZE>=s.total?'disabled':''}>Suivant →</button>`;
    html+=`</div>`;
  }

  body.innerHTML=html;

  // ── Event bindings ──
  const odooBtn=document.getElementById('drillOpenOdoo');
  if(odooBtn){
    odooBtn.addEventListener('click',()=>{
      const base=window.location.origin;
      const accId=String(Number(s.accountId));
      // Build Odoo GL URL with date range and company filter in context
      const ctx={
        date:{date_from:s.dateFrom,date_to:s.dateTo,filter:'custom',mode:'range'},
        active_id:Number(accId),
        active_model:'account.account',
        search_default_account_id:Number(accId),
      };
      // Add company filter if specific company selected
      if(Array.isArray(STATE.companyIds)&&STATE.companyIds.length===1){
        ctx.allowed_company_ids=STATE.companyIds;
      }
      const qs=new URLSearchParams();
      qs.set('active_id',accId);
      qs.set('active_model','account.account');
      qs.set('search_default_account_id',accId);
      qs.set('context',JSON.stringify(ctx));
      const url=base+'/odoo/action-account_reports.action_account_report_general_ledger?'+qs.toString();
      window.open(url,'_blank','noopener,noreferrer');
    });
  }

  // Pagination prev/next
  const prevBtn=document.getElementById('drillPrev');
  const nextBtn=document.getElementById('drillNext');
  if(prevBtn&&s.offset>0){
    prevBtn.addEventListener('click',()=>{
      drillLinesState.loading=true;renderDrillAccount();
      fetchDrillLines(s.accountId,s.dateFrom,s.dateTo,s.offset-DRILL_PAGE_SIZE);
    });
  }
  if(nextBtn&&s.offset+DRILL_PAGE_SIZE<s.total){
    nextBtn.addEventListener('click',()=>{
      drillLinesState.loading=true;renderDrillAccount();
      fetchDrillLines(s.accountId,s.dateFrom,s.dateTo,s.offset+DRILL_PAGE_SIZE);
    });
  }

  // Click sur une ligne → ouvrir la pièce comptable dans Odoo
  body.querySelectorAll('tr[data-move-id]').forEach(tr=>{
    tr.addEventListener('click',()=>{
      const moveId=tr.dataset.moveId;
      if(moveId){
        const base=window.location.origin;
        window.open(base+'/odoo/accounting/journal-entries/'+moveId,'_blank','noopener,noreferrer');
      }
    });
  });
}

// ─── FINANCIAL TABLE BUILDER ─────────────────────────────────
function buildFinTable(tableId,headId,bodyId,data,opts={}){
  const isMonthly=opts.monthly!==false;
  const modeAware=opts.modeAware!==false; // P&L=true ; CFS=false (data non transformée par mode)
  // Header
  const compareOn=STATE.compareN1&&CACHE.rawPL[STATE.year-1];
  const rawN1=compareOn?CACHE.rawPL[STATE.year-1]:null;
  let hhtml='<tr><th>Libellé</th>';
  if(isMonthly)MO.forEach((m,mi)=>hhtml+=`<th data-col="${mi}">${m}</th>`);
  hhtml+='<th>YTD</th><th>%&nbsp;CA</th>';
  if(compareOn)hhtml+='<th>YTD N-1</th><th>&Delta; %</th>';
  hhtml+='<th class="spark-cell">Trend</th></tr>';
  document.getElementById(headId).innerHTML=hhtml;

  // Helpers YTD mode-aware
  // - Mensuel : YTD = somme des mois (line.m = valeurs mensuelles brutes)
  // - YTD     : YTD = dernière valeur cumulée non nulle (line.m déjà cumulé)
  // - LTM     : YTD = dernière valeur glissante non nulle (line.m déjà rolling 12M)
  const lmCur=CACHE.lastMonth[STATE.year];
  const lastIdxCur=(lmCur!=null&&lmCur>=0)?lmCur:11;
  function ytdOf(line){
    if(!line||!line.m)return 0;
    if(!modeAware||STATE.mode==='mensuel')return sum(line.m);
    for(let i=lastIdxCur;i>=0;i--){
      if(line.m[i]!=null)return line.m[i];
    }
    return 0;
  }
  // N-1 : rawN1 est toujours en mensuel brut → on somme jusqu'au même mois cutoff
  function ytdOfN1(line){
    if(!line||!line.m)return 0;
    if(!modeAware||STATE.mode==='mensuel')return sum(line.m);
    let s=0;
    for(let i=0;i<=lastIdxCur;i++){
      const v=line.m[i];
      if(v!=null)s+=v;
    }
    return s;
  }

  // Body
  const caYtd=ytdOf(PL_DATA.find(l=>l.id==='ca_net'));
  // Depth map : computed from parent chain so the view-mode controller can hide
  // rows by drill level (reduit = depth 0 only, standard = up to depth 1, detaille = all).
  const depthMap=buildRowDepthMap(data);
  let bhtml='';
  data.forEach(line=>{
    const totalCols=isMonthly?(compareOn?18:16):(compareOn?5:3);
    if(line.type==='spacer'){bhtml+=`<tr class="row-spacer"><td colspan="${totalCols}"></td></tr>`;return}
    if(line.type==='section'){bhtml+=`<tr class="row-l0"><td colspan="${totalCols}" style="padding:12px 16px;font-size:13px;font-weight:700;border-bottom:2px solid var(--brd)">${esc(line.label)}</td></tr>`;return}

    const depth=depthMap.get(line.id)||0;
    const isHidden=depth>0;// initial : everything below the top level starts hidden
    const rowClass=['row-l'+line.level];
    if(line.type==='total')rowClass.push('row-l0');
    if(line.type==='subtotal')rowClass.push('row-subtotal');
    if(line.type==='pct')rowClass.push('row-pct');
    if(line.type==='grandtotal')rowClass.push('row-l0');
    if(line.expandable)rowClass.push('row-expandable');
    if(isHidden)rowClass.push('row-hidden');

    const ytd=ytdOf(line);
    const pctCa=caYtd&&line.type!=='pct'?(ytd/caYtd*100):null;

    bhtml+=`<tr class="${rowClass.join(' ')}" data-id="${esc(line.id)}" data-parent="${esc(line.parent||'')}" data-depth="${depth}">`;
    // Label cell
    bhtml+=`<td>`;
    if(line.expandable)bhtml+=`<span class="row-expand-icon" data-target="${esc(line.id)}">&#9654;</span>`;
    bhtml+=`${esc(line.label)}</td>`;

    // Conditional coloring for result/total rows
    const isResult=line.type==='total'&&['marge_brute','ebitda','ebit','rcai','resultat_net','resultat_fin','resultat_exc','marge_cd'].includes(line.id);

    // Heatmap: compute min/max for this line to determine intensity
    const vals=line.m?line.m.filter(v=>v!=null):[];
    const vMin=vals.length?Math.min(...vals):0;
    const vMax=vals.length?Math.max(...vals):0;
    const vRange=Math.max(Math.abs(vMin),Math.abs(vMax))||1;

    // Monthly cells
    if(isMonthly&&line.m){
      line.m.forEach((v,mi)=>{
        let cls=line.type==='pct'?'':(v!=null&&v<0?'neg':(isResult&&v>0?'pos':''));
        // Heatmap class for non-pct, non-total rows
        if(line.type!=='pct'&&line.type!=='total'&&line.type!=='subtotal'&&v!=null&&v!==0){
          const intensity=Math.abs(v)/vRange;
          if(v>0&&intensity>0.6)cls+=' heat-pos-strong';
          else if(v>0&&intensity>0.2)cls+=' heat-pos';
          else if(v<0&&intensity>0.6)cls+=' heat-neg-strong';
          else if(v<0&&intensity>0.2)cls+=' heat-neg';
        }
        const display=line.type==='pct'?fmtPct(v):fmt(v);
        bhtml+=`<td class="clickable ${cls}" data-line="${esc(line.id)}" data-month="${mi}" data-col="${mi}">${display}</td>`;
      });
    }

    // YTD
    if(line.type==='pct'){
      const nonZero=line.m?line.m.filter(v=>v!=null&&v!==0):[];
      const avg=nonZero.length?sum(nonZero)/nonZero.length:0;
      bhtml+=`<td>${fmtPct(avg)}</td><td></td>`;
      if(compareOn)bhtml+=`<td></td><td></td>`;
      bhtml+=`<td class="spark-cell"></td>`;
    } else {
      const ytdCls=isResult?(ytd<0?'neg':(ytd>0?'pos':'')):(ytd<0?'neg':'');
      bhtml+=`<td class="clickable ytd-cell ${ytdCls}" data-line="${esc(line.id)}" data-month="-1">${fmt(ytd)}</td>`;
      bhtml+=`<td>${pctCa!=null?fmtPct(pctCa):''}</td>`;
      // N-1 comparison cells
      if(compareOn){
        const n1Line=rawN1.find(l=>l.id===line.id);
        const ytdN1=ytdOfN1(n1Line);
        const delta=ytdN1?((ytd-ytdN1)/Math.abs(ytdN1)*100):null;
        const deltaCls=delta==null?'':(delta>0?'pos':'neg');
        bhtml+=`<td class="${ytdN1<0?'neg':''}" style="color:var(--t3)">${fmt(ytdN1)}</td>`;
        bhtml+=`<td class="${deltaCls}">${delta==null?'—':((delta>=0?'+':'')+delta.toFixed(1).replace('.',',')+'%')}</td>`;
      }
      // Sparkline cell
      if(line.m&&line.type!=='spacer'){
        const sparkId='spark_'+line.id;
        bhtml+=`<td class="spark-cell"><canvas id="${sparkId}" width="80" height="22"></canvas></td>`;
      } else {
        bhtml+=`<td class="spark-cell"></td>`;
      }
    }
    bhtml+=`</tr>`;
  });
  document.getElementById(bodyId).innerHTML=bhtml;

  // Draw inline sparklines
  data.forEach(line=>{
    if(!line.m||line.type==='pct'||line.type==='spacer'||line.type==='section')return;
    const canvas=document.getElementById('spark_'+line.id);
    if(!canvas)return;
    const filtered=line.m.filter(v=>v!=null);
    const color=sum(filtered)>=0?'#10b981':'#ef4444';
    drawSparkline(canvas,filtered,color,22);
  });

  // Event delegation — attach ONCE per tbody lifetime (buildFinTable peut être rappelé plusieurs fois)
  // Bug fix: sans ce flag, chaque rebuild ajoutait un listener supplémentaire → le toggle expand/collapse
  // s'annulait en nombre pair de listeners (donc invisible en YTD/LTM après 1-2 switches de mode).
  const tbody=document.getElementById(bodyId);
  if(!tbody.dataset.finBound){
    tbody.dataset.finBound='1';
    // Source data resolver : lit la variable globale courante (pas un closure stale)
    const srcFor=tb=>tb.id==='cfsBody'?CFS_DATA:PL_DATA;
    tbody.addEventListener('click',function(e){
      const td=e.target.closest('td.clickable');
      const icon=e.target.closest('.row-expand-icon');
      if(icon){
        e.stopPropagation();
        const targetId=icon.dataset.target;
        const willOpen=!icon.classList.contains('open');
        icon.classList.toggle('open',willOpen);
        if(willOpen){
          // Ouvrir : afficher uniquement les enfants directs (pas en cascade)
          tbody.querySelectorAll(`tr[data-parent="${targetId}"]`).forEach(row=>row.classList.remove('row-hidden'));
        } else {
          // Fermer : cascade vers tous les descendants + reset des chevrons
          cascadeHide(tbody,targetId);
        }
        return;
      }
      if(td){
        const lineId=td.dataset.line;const mi=parseInt(td.dataset.month);
        const line=srcFor(tbody).find(l=>l.id===lineId);
        if(line)openDrill(line,mi===-1?null:mi);
      }
    });
    tbody.addEventListener('mouseenter',function(e){
      const td=e.target.closest('td.clickable');
      if(td){
        const lineId=td.dataset.line;const mi=parseInt(td.dataset.month);
        if(!isNaN(mi)&&mi>=0)handleCellHover(e,lineId,mi);
      }
    },true);
    tbody.addEventListener('mouseleave',function(e){
      if(e.target.closest('td.clickable'))hideTooltip();
    },true);
  }
  // Re-apply the user's expand mode after rebuilding the body (P&L / CFS)
  refreshTableExpandMode(tableId);
}

function handleCellHover(e,lineId,monthIdx){
  const line=PL_DATA.find(l=>l.id===lineId)||CFS_DATA.find(l=>l.id===lineId);
  if(line&&line.m&&line.type!=='pct')showTooltip(e,line,monthIdx);
}

// ─── BILAN TABLE ─────────────────────────────────────────────
// Period-aware rendering: each line is read at the selected month (or latest
// available) and compared against the same month of the previous year when
// a N-1 bilan series is loaded.
function buildBilanTable(){
  const periods=getBilanPeriods();
  const baseline=periods[0];// leftmost period = reference for % and deltas
  const year=baseline.year;// baseline year used for structure/evo chart titles
  const mainBilan=CACHE.bilan[year]||BILAN_DATA;
  // Dynamic title : one period → full label, multi → "N périodes"
  const titleEl=document.getElementById('bilanTableTitle');
  if(titleEl){
    const warn=!Array.isArray(mainBilan?.actif?.[0]?.m)?' <span class="bud-flag" title="Snapshot unique — pas de série mensuelle disponible pour cet exercice">*</span>':'';
    const periodLbl=periods.length===1?esc(baseline.label):(periods.length+' périodes comparées');
    titleEl.innerHTML=`Bilan détaillé <span>${periodLbl} · M FCFA · Cliquer pour explorer${warn}</span>`;
  }
  const structEl=document.getElementById('bilanStructTitle');
  if(structEl)structEl.innerHTML=`Structure du bilan <span>${esc(baseline.label)} · Actif vs Passif</span>`;
  const evoEl=document.getElementById('bilanEvoTitle');
  if(evoEl)evoEl.innerHTML=`Évolution mensuelle <span>Actif, CP, Dettes, Trésorerie · ${year}</span>`;
  // Header : one column per period + delta column vs baseline for each non-baseline period
  let hhtml=`<tr><th>Libellé</th>`;
  periods.forEach((p,i)=>{
    hhtml+=`<th style="text-align:right">${esc(p.label)}<br><span style="font-size:10px;font-weight:500;color:var(--t3)">M FCFA</span></th>`;
    if(i>0){
      hhtml+=`<th style="text-align:right">Δ vs ${esc(baseline.label)}</th>`;
    }
  });
  hhtml+=`<th style="text-align:right">% Total</th></tr>`;
  document.getElementById('bilanHead').innerHTML=hhtml;
  // Helpers : resolve a line's value at a given (year, monthIdx)
  const snapAt=(item,y,mi)=>pickBalFromLine(item,y,mi);
  const resolveLine=(itemId,y)=>{
    // Baseline year can fall back to BILAN_DATA for legacy flat years
    const src=CACHE.bilan[y]||(y===year?BILAN_DATA:null);
    return balLine(src,itemId);
  };
  // Totals at the baseline (used for % column)
  const totalActifBase=Math.abs(snapAt(resolveLine('total_actif',baseline.year),baseline.year,baseline.monthIdx))||1;
  const totalPassifBase=Math.abs(snapAt(resolveLine('total_passif',baseline.year),baseline.year,baseline.monthIdx))||1;

  function renderSide(items,totalVal){
    let html='';
    // Depth map for this side : every row knows its drill level so the view-mode
    // controller can hide it without needing per-row CSS exceptions.
    const depthMap=buildRowDepthMap(items);
    items.forEach(item=>{
      const depth=depthMap.get(item.id)||0;
      const isHidden=depth>0;
      const rowClass=['row-l'+item.level];
      if(item.type==='total')rowClass.push('row-l0');
      if(item.type==='grandtotal')rowClass.push('row-l0');
      if(item.expandable)rowClass.push('row-expandable');
      if(isHidden)rowClass.push('row-hidden');
      // Values for each period
      const vals=periods.map(p=>{
        const line=(p.year===year)?item:resolveLine(item.id,p.year);
        return line==null?null:snapAt(line,p.year,p.monthIdx);
      });
      const vBase=vals[0];
      const pct=totalVal?(Math.abs(vBase||0)/totalVal*100):0;

      html+=`<tr class="${rowClass.join(' ')}" data-id="${esc(item.id)}" data-parent="${esc(item.parent||'')}" data-depth="${depth}">`;
      html+=`<td>`;
      if(item.expandable)html+=`<span class="row-expand-icon" data-target="${esc(item.id)}">&#9654;</span>`;
      html+=`${esc(item.label)}</td>`;
      // Baseline cell — clickable for drill
      const baseCell=(vBase==null)
        ?`<td class="clickable" style="text-align:right;font-weight:${item.type?'700':'500'};color:var(--t3)" data-bilan-id="${esc(item.id)}">n/d</td>`
        :`<td class="clickable ${vBase<0?'neg':''}" style="text-align:right;font-weight:${item.type?'700':'500'}" data-bilan-id="${esc(item.id)}">${fmt(vBase)}</td>`;
      html+=baseCell;
      // Compare periods — delta measures how the BASE (focal period, periods[0])
      // grew or shrunk vs each historical comparison. Positive = base > compared.
      for(let i=1;i<periods.length;i++){
        const v=vals[i];
        if(v==null){
          html+=`<td style="text-align:right;color:var(--t3)">n/d</td>`;
          html+=`<td style="text-align:right;color:var(--t3);font-size:11px">—</td>`;
          continue;
        }
        html+=`<td style="text-align:right;color:var(--t2);font-weight:${item.type?'600':'400'}">${fmt(v)}</td>`;
        // Delta = base - compared → positive means base grew vs the historical period.
        if(vBase==null||!isFinite(vBase)){
          html+=`<td style="text-align:right;color:var(--t3);font-size:11px">—</td>`;
        } else {
          const d=vBase-v;
          const pctD=(v!==0)?(d/Math.abs(v)*100):null;
          const cls=d>=0?'pos':'neg';
          const arrow=d>=0?'▲':'▼';
          html+=`<td class="${cls}" style="text-align:right;font-weight:${item.type?'600':'500'};font-size:11.5px">${arrow} ${fmt(d)}${pctD!=null?` <span style="color:var(--t3);font-weight:400">(${(pctD>=0?'+':'')}${pctD.toFixed(0)}%)</span>`:''}</td>`;
        }
      }
      html+=`<td style="text-align:right">${item.type==='grandtotal'?'100,0 %':fmtPct(pct)}</td>`;
      html+=`</tr>`;
    });
    return html;
  }

  // colspan = label + N periods + (N-1) deltas + %
  const colspan=1+periods.length+(periods.length-1)+1;
  let bhtml=`<tr class="row-spacer"><td colspan="${colspan}" style="padding:8px 16px;font-weight:800;font-size:13px;color:var(--accent);border-bottom:2px solid var(--brd)">ACTIF</td></tr>`;
  bhtml+=renderSide(mainBilan.actif||BILAN_DATA.actif,totalActifBase);
  bhtml+=`<tr class="row-spacer"><td colspan="${colspan}" style="padding:12px 16px;font-weight:800;font-size:13px;color:var(--accent);border-bottom:2px solid var(--brd)">PASSIF</td></tr>`;
  bhtml+=renderSide(mainBilan.passif||BILAN_DATA.passif,totalPassifBase);
  document.getElementById('bilanBody').innerHTML=bhtml;

  // Event delegation on bilanBody — single listener, bound once (same pattern as buildFinTable)
  const bilanBody=document.getElementById('bilanBody');
  if(!bilanBody.dataset.bilanBound){
    bilanBody.dataset.bilanBound='1';
    bilanBody.addEventListener('click',function(e){
      const icon=e.target.closest('.row-expand-icon');
      if(icon){
        e.stopPropagation();
        const tid=icon.dataset.target;
        const willOpen=!icon.classList.contains('open');
        icon.classList.toggle('open',willOpen);
        if(willOpen){
          bilanBody.querySelectorAll(`tr[data-parent="${tid}"]`).forEach(r=>r.classList.remove('row-hidden'));
        } else {
          cascadeHide(bilanBody,tid);
        }
        return;
      }
      const td=e.target.closest('td[data-bilan-id]');
      if(td){openBilanDrill(td.dataset.bilanId)}
    });
  }
  // Render the period picker chips (kept in sync with getBilanPeriods)
  renderBilanPicker();
  // Re-apply the user's expand mode after rebuilding the body
  refreshTableExpandMode('bilanTable');
}

// ─── BILAN PERIOD PICKER ─────────────────────────────────────
// Renders the chip bar above the table and wires add/remove/reset interactions.
// Chips use a "base" indicator instead of raw styling to make the baseline obvious.
// The popover is mounted as a direct child of <body> to escape any parent clipping
// or stacking context (the table card has a border-radius + overflow).
function renderBilanPicker(){
  const el=document.getElementById('bilanPicker');
  if(!el)return;
  const periods=getBilanPeriods();
  const isCustom=Array.isArray(STATE.bilanPeriods)&&STATE.bilanPeriods.length>0;
  let html='<span class="picker-label">Périodes</span>';
  periods.forEach((p,i)=>{
    const cls=i===0?'period-chip baseline':'period-chip';
    const tip=i===0
      ?'Période de référence — toutes les analyses se font vs ce mois'
      :'Comparaison historique vs la base';
    const removeBtn=(periods.length>1)
      ?`<span class="chip-remove" data-chip-remove="${i}" title="Retirer cette période">×</span>`
      :'';
    html+=`<span class="${cls}" title="${tip}"><span class="chip-dot"></span>${esc(p.label)}${removeBtn}</span>`;
  });
  if(periods.length<4){
    html+=`<span class="period-chip period-add" id="bilanPeriodAdd" title="Ajouter une période de comparaison"><span class="chip-plus">+</span>Ajouter</span>`;
  }
  if(isCustom){
    html+=`<span class="period-chip period-reset" id="bilanPeriodReset" title="Revenir à la progression automatique de l'année en cours">Réinitialiser</span>`;
  }
  el.innerHTML=html;
  // Event wiring
  el.querySelectorAll('[data-chip-remove]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const idx=+btn.dataset.chipRemove;
      const list=getBilanPeriods().map(p=>({year:p.year,monthIdx:p.monthIdx}));
      if(list.length<=1)return;
      list.splice(idx,1);
      STATE.bilanPeriods=list;
      buildBilanTable();
    });
  });
  const addBtn=document.getElementById('bilanPeriodAdd');
  if(addBtn){
    addBtn.addEventListener('click',e=>{
      e.stopPropagation();
      openBilanPeriodPopover(addBtn);
    });
  }
  const resetBtn=document.getElementById('bilanPeriodReset');
  if(resetBtn){
    resetBtn.addEventListener('click',e=>{
      e.stopPropagation();
      STATE.bilanPeriods=null;
      buildBilanTable();
    });
  }
  // Mount the expand control on the right side of the picker
  mountExpandControl(el,'bilanTable');
}

// ─── EXPAND CONTROL ──────────────────────────────────────────
// Three-state segmented control to switch a financial table between drill levels.
// The depth of each row is precomputed at render time (data-depth attribute) by
// walking the parent chain ; the controller then toggles row-hidden + expand-icon
// state purely from depth, no special CSS overrides.
//   - 'reduit'    : only depth 0 (top totals + free L1 lines without parent)
//   - 'standard'  : depth 0 + 1 (drill 1 niveau, default)
//   - 'detaille'  : every nested row visible — but the user can still collapse
//                   individual branches manually (cascading hide on close)
const TABLE_EXPAND_MODE={};

// Walk the parent chain on a list of {id, parent?} items to compute the depth
// of each row. Cached as a Map for cheap lookups during rendering.
function buildRowDepthMap(items){
  const byId=new Map();
  items.forEach(it=>{if(it&&it.id)byId.set(it.id,it)});
  const depth=new Map();
  function depthOf(id,seen){
    if(depth.has(id))return depth.get(id);
    const it=byId.get(id);
    if(!it||!it.parent){depth.set(id,0);return 0}
    if(seen&&seen.has(id)){depth.set(id,0);return 0}// safety vs cycles
    const next=new Set(seen||[]);next.add(id);
    const d=depthOf(it.parent,next)+1;
    depth.set(id,d);
    return d;
  }
  items.forEach(it=>{if(it&&it.id)depthOf(it.id)});
  return depth;
}

// Recursive collapse : hide every descendant of `parentId` and reset their
// expand icons. Used when the user closes a branch — without this, only the
// direct children disappeared and grandchildren stayed dangling.
function cascadeHide(tbody,parentId){
  tbody.querySelectorAll(`tr[data-parent="${parentId}"]`).forEach(row=>{
    row.classList.add('row-hidden');
    const ico=row.querySelector('.row-expand-icon');
    if(ico)ico.classList.remove('open');
    const childId=row.dataset.id;
    if(childId)cascadeHide(tbody,childId);
  });
}

function setTableExpandMode(tableId,mode){
  TABLE_EXPAND_MODE[tableId]=mode;
  applyTableExpandMode(tableId);
  // Refresh button highlights for every control bound to this table
  document.querySelectorAll(`.expand-ctrl[data-target="${tableId}"] .ec-btn`).forEach(b=>{
    b.classList.toggle('active',b.dataset.mode===mode);
  });
}
function applyTableExpandMode(tableId){
  const table=document.getElementById(tableId);
  if(!table)return;
  const mode=TABLE_EXPAND_MODE[tableId]||'reduit';
  // Visibility is fully driven by JS (row-hidden class on each <tr>) and depth.
  // No more mode-* CSS overrides → manual collapse stays available even in detaille.
  const rows=table.querySelectorAll('tbody tr[data-depth]');
  rows.forEach(r=>{
    const d=parseInt(r.dataset.depth||'0',10);
    let hide=false;
    if(mode==='reduit')   hide=d>=1;
    if(mode==='standard') hide=d>=2;
    if(mode==='detaille') hide=false;
    r.classList.toggle('row-hidden',hide);
  });
  // Sync expand icons so the chevron state matches what's visible.
  table.querySelectorAll('.row-expand-icon').forEach(ico=>{
    const tr=ico.closest('tr');
    const d=tr?parseInt(tr.dataset.depth||'0',10):0;
    let open=false;
    if(mode==='reduit')   open=false;
    if(mode==='standard') open=d===0;// L0 totals look "open" since L1 children show
    if(mode==='detaille') open=true;
    ico.classList.toggle('open',open);
  });
}
function refreshTableExpandMode(tableId){
  // Called by table builders after re-rendering rows so the user's mode persists.
  applyTableExpandMode(tableId);
}
function mountExpandControl(host,tableId){
  if(!host)return;
  // Avoid duplicating if the host already contains a control for this table
  if(host.querySelector(`.expand-ctrl[data-target="${tableId}"]`))return;
  const mode=TABLE_EXPAND_MODE[tableId]||'reduit';
  const wrap=document.createElement('div');
  wrap.className='expand-ctrl';
  wrap.dataset.target=tableId;
  wrap.innerHTML=
    '<span class="ec-label">Affichage</span>'+
    `<button type="button" class="ec-btn${mode==='reduit'?' active':''}" data-mode="reduit" title="N'afficher que les totaux principaux">Réduit</button>`+
    `<button type="button" class="ec-btn${mode==='standard'?' active':''}" data-mode="standard" title="Dérouler le premier niveau de détail">Standard</button>`+
    `<button type="button" class="ec-btn${mode==='detaille'?' active':''}" data-mode="detaille" title="Dérouler tous les niveaux — chaque ligne reste repliable">Détaillé</button>`;
  // Push to the right inside the bilan picker (the picker uses flex-wrap)
  wrap.style.marginLeft='auto';
  host.appendChild(wrap);
  wrap.querySelectorAll('.ec-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      setTableExpandMode(tableId,btn.dataset.mode);
    });
  });
}

// Popover for adding a period : pick a year tab then a month. Months beyond the
// year's last available data point are disabled, already-picked months are shown
// as "picked" so the user can see what's selected without closing the dialog.
// Mounted on <body> + position:fixed so no parent clipping/overlap problem.
let _bilanPopoverYear=null;
let _bilanPopoverAnchor=null;
function ensureBilanPopoverNode(){
  let pop=document.getElementById('bilanPeriodPopover');
  if(!pop){
    pop=document.createElement('div');
    pop.id='bilanPeriodPopover';
    pop.className='period-popover';
    document.body.appendChild(pop);
  }
  return pop;
}
function positionBilanPopover(pop,anchor){
  // Place the popover right-aligned to the anchor, just below it.
  // Clamp inside the viewport with a 10px margin so it's never clipped.
  const r=anchor.getBoundingClientRect();
  const pw=pop.offsetWidth||320;
  const ph=pop.offsetHeight||280;
  const vw=window.innerWidth;
  const vh=window.innerHeight;
  let left=r.left;
  let top=r.bottom+8;
  if(left+pw>vw-10)left=Math.max(10,vw-pw-10);
  if(left<10)left=10;
  // If not enough room below, flip above the anchor
  if(top+ph>vh-10&&r.top-ph-8>10){
    top=r.top-ph-8;
  }
  pop.style.left=left+'px';
  pop.style.top=top+'px';
}
function openBilanPeriodPopover(anchor){
  const pop=ensureBilanPopoverNode();
  _bilanPopoverAnchor=anchor||document.getElementById('bilanPeriodAdd');
  const years=availableBilanYears();
  // Default to the current STATE year so Victor lands directly on months of N.
  if(_bilanPopoverYear==null||!years.includes(_bilanPopoverYear)){
    _bilanPopoverYear=years.includes(STATE.year)?STATE.year:(years[0]||STATE.year);
  }
  const renderPop=()=>{
    const lm=CACHE.lastMonth[_bilanPopoverYear];
    const lastIdx=(lm!=null&&lm>=0)?lm:11;
    const existing=new Set(getBilanPeriods().map(p=>p.year+'-'+p.monthIdx));
    const selCount=getBilanPeriods().length;
    let h='';
    h+='<div class="pp-header">';
    h+='<div class="pp-title">Ajouter une période<small>Choisissez un mois à comparer</small></div>';
    h+='<button class="pp-close" id="bilanPopClose" aria-label="Fermer">×</button>';
    h+='</div>';
    h+='<div class="pp-body">';
    // Year tabs
    h+='<div class="pp-section"><span class="pp-label">Exercice</span><div class="pp-year-tabs">';
    years.forEach(y=>{
      const sel=y===_bilanPopoverYear?'selected':'';
      h+=`<button class="pp-year-tab ${sel}" data-pp-year="${y}">${y}</button>`;
    });
    h+='</div></div>';
    // Month grid
    h+='<div class="pp-section"><span class="pp-label">Mois</span><div class="pp-months">';
    for(let i=0;i<12;i++){
      const outOfRange=i>lastIdx;
      const key=_bilanPopoverYear+'-'+i;
      const picked=existing.has(key);
      const disabled=(outOfRange||picked)?'disabled':'';
      const cls=picked?'pp-month picked':'pp-month';
      const title=picked?'Déjà sélectionné':(outOfRange?'Données non disponibles':'');
      h+=`<button class="${cls}" data-pp-month="${i}" ${disabled} title="${title}">${MO[i]}</button>`;
    }
    h+='</div></div>';
    h+='</div>';
    // Footer hint with current count
    h+=`<div class="pp-footer"><span class="pp-hint">Maximum 4 périodes</span><span>${selCount}/4 sélectionnées</span></div>`;
    pop.innerHTML=h;
    pop.querySelector('#bilanPopClose').addEventListener('click',e=>{
      e.stopPropagation();closeBilanPeriodPopover();
    });
    pop.querySelectorAll('[data-pp-year]').forEach(b=>{
      b.addEventListener('click',e=>{
        e.stopPropagation();
        _bilanPopoverYear=+b.dataset.ppYear;
        renderPop();
        positionBilanPopover(pop,_bilanPopoverAnchor);
      });
    });
    pop.querySelectorAll('[data-pp-month]').forEach(b=>{
      b.addEventListener('click',e=>{
        e.stopPropagation();
        if(b.disabled)return;
        const mi=+b.dataset.ppMonth;
        const current=getBilanPeriods().map(p=>({year:p.year,monthIdx:p.monthIdx}));
        if(current.length>=4){closeBilanPeriodPopover();return}
        current.push({year:_bilanPopoverYear,monthIdx:mi});
        STATE.bilanPeriods=current;
        closeBilanPeriodPopover();
        buildBilanTable();
      });
    });
  };
  renderPop();
  // Open + position (need offsetHeight so display:block before measuring)
  pop.classList.add('open');
  positionBilanPopover(pop,_bilanPopoverAnchor);
  // Click outside + Escape + window resize/scroll handlers
  setTimeout(()=>{
    const onDocClick=(ev)=>{
      if(!pop.contains(ev.target)&&!ev.target.closest('#bilanPeriodAdd')){
        closeBilanPeriodPopover();
      }
    };
    const onKey=(ev)=>{
      if(ev.key==='Escape'){closeBilanPeriodPopover()}
    };
    const onScroll=()=>{closeBilanPeriodPopover()};
    const onResize=()=>{
      if(_bilanPopoverAnchor)positionBilanPopover(pop,_bilanPopoverAnchor);
    };
    document.addEventListener('click',onDocClick);
    document.addEventListener('keydown',onKey);
    window.addEventListener('scroll',onScroll,true);
    window.addEventListener('resize',onResize);
    pop._handlers={onDocClick,onKey,onScroll,onResize};
  },0);
}
function closeBilanPeriodPopover(){
  const pop=document.getElementById('bilanPeriodPopover');
  if(!pop)return;
  pop.classList.remove('open');
  if(pop._handlers){
    document.removeEventListener('click',pop._handlers.onDocClick);
    document.removeEventListener('keydown',pop._handlers.onKey);
    window.removeEventListener('scroll',pop._handlers.onScroll,true);
    window.removeEventListener('resize',pop._handlers.onResize);
    pop._handlers=null;
  }
  _bilanPopoverAnchor=null;
}

function openBilanDrill(itemId){
  const all=[...BILAN_DATA.actif,...BILAN_DATA.passif];
  const item=all.find(i=>i.id===itemId);
  if(!item)return;
  // If the item has a monthly series, use it directly — the drill will show
  // the real month-over-month evolution. Otherwise fall back to a flat line
  // using val (legacy behaviour, no drift info).
  const hasSeries=Array.isArray(item.m)&&item.m.length===12;
  const fakeLine={id:item.id,label:item.label,
    m:hasSeries?item.m.slice():new Array(12).fill(item.val),
    accounts:item.accounts,expandable:item.expandable,children:item.children};
  openDrill(fakeLine,null);
}
