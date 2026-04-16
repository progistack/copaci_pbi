// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Utility Functions & Helpers
// ═══════════════════════════════════════════════════════════════

// ─── UTILITY FUNCTIONS ───────────────────────────────────────
function fmt(n){if(n===null||n===undefined)return'-';if(isNaN(n))return'-';const s=n.toFixed(1);const[i,d]=s.split('.');const ip=i.replace(/\B(?=(\d{3})+(?!\d))/g,' ');return ip+','+d}
function fmtPct(n){if(n==null||isNaN(n))return'-';return n.toFixed(1).replace('.',',')+'\u202f%'}
function fmtInt(n){if(n==null||isNaN(n))return'-';return Math.round(n).toLocaleString('fr-FR')}
function sum(arr){return (arr||[]).reduce((a,b)=>a+(b==null?0:b),0)}
// Generic mode/month-aware aggregator — works on any mode-transformed P&L-shaped dataset
// - Specific month selected : value at that month (mensuel = ce mois, YTD = cumul au mois, LTM = rolling au mois)
// - "Tous" + Mensuel : sum of monthly values (annual total up to last active month)
// - "Tous" + YTD/LTM : latest non-null value (already cumulative / rolling 12M)
function aggOn(dataset,id){
  if(!dataset)return 0;
  const line=dataset.find(l=>l.id===id);
  if(!line||!line.m)return 0;
  if(STATE.selectedMonth!=='all'){
    const v=line.m[+STATE.selectedMonth];
    return v==null?0:v;
  }
  if(STATE.mode==='mensuel')return sum(line.m);
  const lm=CACHE.lastMonth[STATE.year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  for(let i=lastIdx;i>=0;i--){
    if(line.m[i]!=null)return line.m[i];
  }
  return 0;
}
// Current-year P&L aggregate (already mode-transformed in PL_DATA)
function plAgg(id){return aggOn(PL_DATA,id)}
// N-1 P&L aggregate — PL_N1_DATA is mode-transformed using N-1 as the base year
function n1Agg(id){return aggOn(PL_N1_DATA,id)}
// N-1 aggregate MATCHED to the current year's active range.
//
// Guard against the seasonality trap : comparing "Jan→Apr 2026" directly to
// n1Agg('ca_net') returns the FULL 12 months of 2025 (9 240 M) whereas plAgg
// only sees 4 months (2 099 M). The resulting "−77 % CA drop" is a period
// mismatch, not reality. This helper mirrors N's lastMonth on N-1 so YoY
// comparisons stay apples-to-apples in every mode :
//  - mensuel + 'all'    → sum PL_N1.m[0..lastMonth_N]
//  - ytd/ltm + 'all'    → pick PL_N1.m[lastMonth_N] (already cum/rolling)
//  - specific month     → aggOn's default path (same month on both)
function n1AggMatched(id){
  if(!PL_N1_DATA)return 0;
  const line=PL_N1_DATA.find(l=>l.id===id);
  if(!line||!line.m)return 0;
  if(STATE.selectedMonth!=='all'){
    const v=line.m[+STATE.selectedMonth];
    return v==null?0:v;
  }
  const lm=CACHE.lastMonth[STATE.year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  if(STATE.mode==='mensuel'){
    let s=0;
    for(let i=0;i<=lastIdx;i++)s+=(line.m[i]||0);
    return s;
  }
  // YTD/LTM : values are already cumulative / rolling at each index. Pick at
  // the matched month (walk backwards only if null, to stay robust).
  for(let i=lastIdx;i>=0;i--){
    if(line.m[i]!=null)return line.m[i];
  }
  return 0;
}
// Is year N-1 usable for YoY comparisons ?
//   'monthly-ok'  → real mensualized data, comparisons are meaningful
//   'closed-lumped' → year closed as a lump (1-2 months), comparisons are
//                    mathematically valid but semantically misleading for
//                    YTD/mensuel views (the rest of the year is 0)
//   'open'        → N-1 is the running year (shouldn't happen but guarded)
//   undefined     → no data
function n1StatusYoY(){
  return CACHE.yearStatus[STATE.year-1]||null;
}
// Budget aggregate — BUDGET_DATA is mode-transformed using GL actual as placeholder
function budgetAgg(id){return aggOn(BUDGET_DATA,id)}
// True if the loaded budget is a placeholder (GL actual clone) rather than a real budget
function isBudgetPlaceholder(){
  return !(RAW_DATA&&RAW_DATA['budget'+STATE.year]);
}
// ─── Bilan lookups ─────────────────────────────────────────────
// The balance sheet is a SNAPSHOT at a specific point in time. There is no
// mode (Mensuel/YTD/LTM) semantics for a stock, only a SELECTED DATE. The
// rules:
//  • selectedMonth === 'all'          → latest available month of the year
//  • selectedMonth is a month index   → balance AT END of that month
// If the loaded BILAN has no m[] series (legacy flat snapshot), the scalar
// `val` is returned regardless of selectedMonth.
function balLine(bilan,id){
  if(!bilan)return null;
  const find=(arr)=>{if(!arr)return null;for(const r of arr){if(r.id===id)return r}return null};
  return find(bilan.actif)||find(bilan.passif)||null;
}
function pickBalFromLine(line,year,monthIdx){
  if(!line)return 0;
  // Legacy flat snapshot : only `val` exists, no month series.
  if(!Array.isArray(line.m)||line.m.length!==12){
    return line.val||0;
  }
  // monthIdx can be:
  //  - a number 0..11 (explicit month)
  //  - 'all' or null (fallback to STATE — matches gauges default path)
  const lm=CACHE.lastMonth[year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  let idx;
  if(monthIdx==null||monthIdx==='all'){
    idx=lastIdx;
  } else {
    idx=Math.min(+monthIdx,11);
    if(idx>lastIdx)idx=lastIdx;
  }
  const v=line.m[idx];
  if(v==null){
    // Walk backwards to find the most recent non-null snapshot
    for(let i=idx;i>=0;i--){if(line.m[i]!=null)return line.m[i]}
    return line.val||0;
  }
  return v;
}
// Current year / current selectedMonth — used by gauges, insights, KPIs.
// Uses bilanMonthIdx() to pick the right month (respects STATE.year's last
// available month when selectedMonth='all').
function balBy(id){
  const line=balLine(CACHE.bilan[STATE.year]||BILAN_DATA,id);
  return pickBalFromLine(line,STATE.year,bilanMonthIdx(STATE.year));
}
// N-1 comparison : SAME calendar month of the previous year. We deliberately
// use year N's selected month (mirrored to year-1) so comparisons stay
// apples-to-apples : "fin Avr 2026" compares to "fin Avr 2025", not to the
// closing bilan of 2025.
function balN1By(id){
  const line=balLine(CACHE.bilan[STATE.year-1],id);
  return pickBalFromLine(line,STATE.year-1,bilanMonthIdx(STATE.year-1));
}
// Explicit year/month picker — used by waterfall and Bilan tab rendering
function balByAt(id,year,monthIdx){
  const line=balLine(CACHE.bilan[year]||BILAN_DATA,id);
  return pickBalFromLine(line,year,monthIdx);
}
// Effective bilan month descriptor.
//
// Rule : the comparison year always mirrors the CURRENT year's selected month.
// If the user looks at "fin Avr 2026" (selectedMonth='all' in 2026, which
// implicitly targets the last available month = Apr), the N-1 snapshot used
// for comparison is "fin Avr 2025" — NOT the closing Dec 2025 balance.
// Fall back to year's own lastMonth only if no N position is defined (edge case).
function bilanMonthIdx(year){
  const lmN=CACHE.lastMonth[STATE.year];
  const lastIdxN=(lmN!=null&&lmN>=0)?lmN:11;
  const lmY=CACHE.lastMonth[year];
  const lastIdxY=(lmY!=null&&lmY>=0)?lmY:11;
  let target;
  if(STATE.selectedMonth==='all'){
    // "Tous" → use year N's last available month; for year-1, mirror the same index.
    target=lastIdxN;
  } else {
    target=+STATE.selectedMonth;
  }
  // Cap to the year's own data range so we never read beyond available snapshots
  return Math.min(target,lastIdxY);
}
function bilanDateLabel(year,monthIdxOverride){
  const mi=(monthIdxOverride!=null)?monthIdxOverride:bilanMonthIdx(year);
  return 'fin '+MO[mi]+' '+year;
}
// Resolve the list of periods to display in the bilan table.
// The BASE (= focal period) is always the most recent period in the list.
// In auto-mode it follows STATE.selectedMonth from the top filter (current/selected
// month), with the 3 prior months as historical comparisons. The list is returned
// chronological DESC : [base, base-1, base-2, base-3] so periods[0] is always the base.
function getBilanPeriods(){
  const mkPeriod=(y,mi)=>({year:y,monthIdx:mi,label:bilanDateLabel(y,mi),key:y+'-'+mi});
  let raw;
  if(Array.isArray(STATE.bilanPeriods)&&STATE.bilanPeriods.length){
    raw=STATE.bilanPeriods.slice(0,4);
  } else {
    // Default : current/selected month (from top filter) + 3 previous months.
    // Base = bilanMonthIdx(year) which respects STATE.selectedMonth.
    const year=STATE.year;
    const baseMi=bilanMonthIdx(year);
    const count=Math.min(4,baseMi+1);
    raw=[];
    for(let i=0;i<count;i++){
      raw.push({year,monthIdx:baseMi-i});
    }
    // Edge case : single-month year — fall back to N-1 mirror for context.
    if(raw.length<2&&CACHE.bilan[year-1]){
      raw.push({year:year-1,monthIdx:bilanMonthIdx(year-1)});
    }
  }
  // Sort DESC : the most recent date sits first → it becomes the BASE.
  // Comparisons trail off into the past in reverse chronological order.
  const sorted=raw.slice().sort((a,b)=>(b.year-a.year)||(b.monthIdx-a.monthIdx));
  return sorted.map(p=>mkPeriod(p.year,p.monthIdx));
}
// Years that have a bilan (mensualized or flat) loaded — used by the period picker.
function availableBilanYears(){
  return Object.keys(CACHE.bilan||{}).map(Number).filter(y=>!!CACHE.bilan[y]).sort((a,b)=>b-a);
}
// Variance computation helpers
function variance(a,b){
  if(b==null||b===0)return null;
  return ((a-b)/Math.abs(b))*100;
}
function varianceAbs(a,b){if(b==null)return null;return a-b}
// Number of months represented by the current aggregate, given the mode/selectedMonth.
// Used to annualize P&L metrics (EBITDA, OPEX, charges fin) for gauges/ratios that
// need a 12-month denominator regardless of the view mode.
function monthsInCurrent(isN1){
  const year=isN1?STATE.year-1:STATE.year;
  const lm=CACHE.lastMonth[year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  if(STATE.mode==='ltm')return 12;
  if(STATE.mode==='ytd'){
    const mIdx=STATE.selectedMonth==='all'?lastIdx:Math.min(+STATE.selectedMonth,11);
    return mIdx+1;
  }
  // mensuel
  if(STATE.selectedMonth!=='all')return 1;
  return lastIdx+1;
}
function annualize(v,months){
  if(v==null||!isFinite(v)||!months||months<=0)return 0;
  if(months===12)return v;
  return v*12/months;
}
// Annualized P&L aggregate — scales the current-mode aggregate to a 12-month run rate.
// Useful for balance-sheet ratios (Leverage, Interest coverage) that need EBITDA and
// financial charges expressed on a full-year basis whatever the view.
function annualizedAgg(id){return annualize(plAgg(id),monthsInCurrent(false))}
function annualizedN1Agg(id){return annualize(n1Agg(id),monthsInCurrent(true))}

// ─── Closed-month variant ─────────────────────────────────────
// True if (year, monthIdx) is the calendar month currently in progress on the user's
// machine. Used to detect "partial" months whose data is incomplete (we are still
// living in them, so the GL has only the first N days).
function isPartialMonth(year, monthIdx){
  const today = new Date();
  return year === today.getFullYear() && monthIdx === today.getMonth();
}
// Last fully-closed month index for `year` — i.e. the last month that has data,
// minus 1 if that last month is the calendar month currently in progress.
// Returns -1 if no closed month is available (e.g. very early in January).
function lastClosedMonth(year){
  const lm = CACHE.lastMonth[year];
  if(lm==null || lm<0) return -1;
  return isPartialMonth(year, lm) ? lm-1 : lm;
}
// Aggregate of a P&L line excluding the partial in-progress month. Mode-aware:
//   • YTD / LTM : pick line.m at the closed-target month (already cumulative/rolling)
//   • Mensuel + 'all' : sum line.m[0..target]
//   • Mensuel + specific month : value at that month (downgraded if partial)
// If the user explicitly selects the partial month, it is silently downgraded to the
// last closed month so ratios remain meaningful instead of collapsing to 0.
function plAggClosedOn(dataset,id){
  if(!dataset)return 0;
  const line = dataset.find(l=>l.id===id);
  if(!line || !line.m) return 0;
  const year = STATE.year;
  const lc = lastClosedMonth(year);
  if(lc<0) return 0;
  let target;
  if(STATE.selectedMonth==='all'){
    target = lc;
  } else {
    const mIdx = Math.min(+STATE.selectedMonth, 11);
    target = isPartialMonth(year, mIdx) ? lc : mIdx;
  }
  if(target<0) return 0;
  if(STATE.mode==='ytd' || STATE.mode==='ltm') return line.m[target] || 0;
  // mensuel
  if(STATE.selectedMonth!=='all') return line.m[target] || 0;
  let s = 0;
  for(let i=0;i<=target;i++) s += (line.m[i]||0);
  return s;
}
function plAggClosed(id){return plAggClosedOn(PL_DATA,id)}
function n1AggClosed(id){return plAggClosedOn(PL_N1_DATA,id)}
// Months count of the current view EXCLUDING the partial in-progress month.
function monthsClosed(isN1){
  const year = isN1 ? STATE.year-1 : STATE.year;
  const lc = lastClosedMonth(year);
  if(lc<0) return 0;
  if(STATE.mode==='ltm') return 12;
  let target;
  if(STATE.selectedMonth==='all'){
    target = lc;
  } else {
    const mIdx = Math.min(+STATE.selectedMonth, 11);
    target = isPartialMonth(year, mIdx) ? lc : mIdx;
  }
  if(target<0) return 0;
  if(STATE.mode==='ytd') return target+1;
  // mensuel
  return STATE.selectedMonth==='all' ? target+1 : 1;
}
// Annualized P&L aggregate using ONLY fully-closed months. Right denominator for
// run-rate ratios (DSO, DIO, DPO, BFR/CA, ROE, ROA, leverage) when the current
// calendar month is partial — otherwise the partial month underweights the numerator
// and inflates working-capital days (e.g. DIO=386 instead of ~310 on Apr 11 when
// April only has 35% of typical monthly revenue).
function annualizedAggClosed(id){
  const m = monthsClosed(false);
  if(!m) return 0;
  return annualize(plAggClosed(id), m);
}
function annualizedN1AggClosed(id){
  const m = monthsClosed(true);
  if(!m) return 0;
  return annualize(n1AggClosed(id), m);
}
// ─── LTM-locked aggregate (used by working-capital ratios) ────
// Returns the LAST-TWELVE-MONTHS rolling value of a P&L line, ALWAYS, regardless
// of STATE.mode. Working-capital days (DSO/DIO/DPO/BFR jours/CCC) and the
// associated charts must always be computed on a 12-month rolling denominator
// even when the user is viewing the dashboard in YTD or Mensuel mode — because
// "70 days of receivables" only makes sense against a stable 12-month sales
// base. Otherwise YTD-annualized COGS in March (annualized 3-month COGS × 4)
// gives a wildly different DIO than the true rolling-12M COGS.
//
// Behavior :
//   • Pulls directly from CACHE.rawPL[year] / [year-1] (NOT from PL_DATA, which
//     may have been mode-transformed). The rawPL arrays are always month-by-month.
//   • Picks the target month : 'all' or partial → last closed month, otherwise
//     the user-selected month (downgraded if it is the partial in-progress one).
//   • Sums monthsCurrent[0..target] + monthsPriorYear[target+1..11] = exactly
//     12 calendar months ending at `target`.
//   • Returns 0 if rawPL is missing for the year (e.g. very early refresh).
function ltmTargetMonth(){
  const year = STATE.year;
  const lc = lastClosedMonth(year);
  if(lc<0) return -1;
  if(STATE.selectedMonth==='all') return lc;
  const mIdx = Math.min(+STATE.selectedMonth, 11);
  return isPartialMonth(year, mIdx) ? lc : mIdx;
}
function ltmAggClosed(id){
  const target = ltmTargetMonth();
  if(target<0) return 0;
  const year = STATE.year;
  const raw   = CACHE.rawPL && CACHE.rawPL[year];
  const rawN1 = CACHE.rawPL && CACHE.rawPL[year-1];
  if(!raw) return 0;
  const line = raw.find(l=>l.id===id);
  if(!line || !line.m) return 0;
  const n1Line = rawN1 ? rawN1.find(l=>l.id===id) : null;
  const n1m = (n1Line && n1Line.m) || new Array(12).fill(0);
  let total = 0;
  for(let j=0; j<=target; j++) total += line.m[j]||0;
  for(let j=target+1; j<12; j++) total += n1m[j]||0;
  return total;
}
// Mode-aware CFS aggregator. CFS_DATA has no N-1 series so LTM falls back to YTD
// (rolling 12M would be truncated by the data window anyway). Respects selectedMonth
// and skips null months (data gaps).
function cfsAgg(id){
  const line=CFS_DATA.find(l=>l.id===id);
  if(!line||!line.m)return 0;
  const m=line.m;
  const lm=CACHE.lastMonth[STATE.year];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  if(STATE.selectedMonth!=='all'){
    const idx=Math.min(+STATE.selectedMonth,11);
    if(STATE.mode==='mensuel'){const v=m[idx];return v==null?0:v}
    // ytd / ltm → cumulative Jan→idx
    let s=0;for(let i=0;i<=idx;i++)if(m[i]!=null)s+=m[i];
    return s;
  }
  // selectedMonth === 'all'
  let s=0;for(let i=0;i<=lastIdx;i++)if(m[i]!=null)s+=m[i];
  return s;
}
// Human-readable descriptor of the current view ("LTM Avr 2026", "YTD Mar 2026"...)
function periodDescriptor(){
  const y=STATE.year;
  const lm=CACHE.lastMonth[y];
  const lastIdx=(lm!=null&&lm>=0)?lm:11;
  if(STATE.selectedMonth!=='all'){
    const i=+STATE.selectedMonth;
    if(STATE.mode==='mensuel')return MO[i]+' '+y;
    if(STATE.mode==='ytd')return 'YTD '+MO[i]+' '+y;
    return 'LTM '+MO[i]+' '+y;
  }
  if(STATE.mode==='mensuel')return 'Cumul Jan-'+MO[lastIdx]+' '+y;
  if(STATE.mode==='ytd')return 'YTD '+MO[lastIdx]+' '+y;
  return 'LTM '+MO[lastIdx]+' '+y;
}
// Truncate monthly arrays to data window (removes trailing null months)
function trimToDataRange(arr){
  if(!arr||!arr.length)return arr;
  let last=-1;
  for(let i=arr.length-1;i>=0;i--){if(arr[i]!=null){last=i;break}}
  return last<0?[]:arr.slice(0,last+1);
}
// Get labels for current year's active range — truncated to selected month if any
function activeLabels(){
  const lm=CACHE.lastMonth[STATE.year];
  let end=(lm!=null&&lm>=0)?lm+1:12;
  if(STATE.selectedMonth!=='all')end=Math.min(end,+STATE.selectedMonth+1);
  return MO.slice(0,end);
}
function activeRange(arr){
  const lm=CACHE.lastMonth[STATE.year];
  let end=(lm!=null&&lm>=0)?lm+1:12;
  if(STATE.selectedMonth!=='all')end=Math.min(end,+STATE.selectedMonth+1);
  return (arr||[]).slice(0,end);
}
// Cached dark-mode flag — updated by toggleTheme() in 06_ui.js.
// Avoids ~30 DOM attribute reads per tab rebuild.
let _darkCache=document.documentElement.getAttribute('data-theme')==='dark';
function isDark(){return _darkCache}
function _refreshDarkCache(){_darkCache=document.documentElement.getAttribute('data-theme')==='dark'}
// Safe color conversion — handles #hex, rgb(), rgba()
function toRgba(c,a){if(!c)return'rgba(0,0,0,'+a+')';if(c.startsWith('#')){const h=c.replace('#','');const r=parseInt(h.substring(0,2),16),g=parseInt(h.substring(2,4),16),b=parseInt(h.substring(4,6),16);return'rgba('+r+','+g+','+b+','+a+')'}if(c.startsWith('rgba'))return c.replace(/,\s*[\d.]+\)/,','+a+')');if(c.startsWith('rgb'))return c.replace('rgb','rgba').replace(')',','+a+')');return c}
// Sanitize text for safe DOM insertion
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

