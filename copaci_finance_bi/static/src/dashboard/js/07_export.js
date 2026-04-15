// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Export Engine (PowerPoint pptxgenjs 4.0.1)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// EXPORT ENGINE — PowerPoint (pptxgenjs 4.0.1)
// Design System "Horizon" — Charts éditables OOXML natifs
// ═══════════════════════════════════════════════════════════════

const COLORS={
  plum:'5D285F',plumDeep:'2E1430',plumPale:'EEE6EF',
  rose:'E7A6B5',rosePale:'F9F0F3',cream:'F7F5F0',
  warmBg:'FAF8F5',white:'FFFFFF',noir:'1A1A1A',
  gris70:'4D4D4D',gris50:'808080',gris30:'B3B3B3',
  gris15:'D9D9D9',gris05:'F2F0ED'
};
const CHART_SERIES=['5D285F','E7A6B5','F4CBB2','A8B29D','BDA2C1','A7BBC7'];
const FONTS={heading:'Georgia',body:'Calibri'};
const GRID={slideW:13.333,slideH:7.5,marginLeft:1.2,barX:0.8,barW:0.025,
  logoX:11.53,logoY:0.35,logoW:1.3,logoH:0.33,titleY:0.6,
  accentLineY:1.15,accentLineW:1.5,contentY:1.6,footerY:6.85,sourceY:6.55};

// ─── Pre-load logo as base64 for reliable PPTX embedding ────
let _logoB64=null;
(function preloadLogo(){
  const c=document.createElement('canvas');const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);
    _logoB64=c.toDataURL('image/png');console.log('[Export] Logo pre-loaded ('+_logoB64.length+' chars)');};
  img.onerror=()=>console.warn('[Export] Logo pre-load failed');
  img.src='/copaci_finance_bi/static/src/assets/logo_copaci_solid.png';
})();
const TAB_LABELS={synthese:'Synth\u00e8se',pl:'Compte de R\u00e9sultat',bilan:'Bilan',
  tresorerie:'Tr\u00e9sorerie & BFR',kpis:'KPIs & Ratios',dettes:'Dettes Financi\u00e8res',cfs:'Flux de Tr\u00e9sorerie'};
const TAB_DESCRIPTIONS={synthese:'Vue d\u2019ensemble des indicateurs cl\u00e9s',pl:'Analyse du compte de r\u00e9sultat',
  bilan:'Structure patrimoniale',tresorerie:'Cycle de conversion et besoin en fonds de roulement',
  kpis:'Ratios de performance et sant\u00e9 financi\u00e8re',dettes:'Structure et \u00e9volution de l\u2019endettement',
  cfs:'G\u00e9n\u00e9ration et utilisation de la tr\u00e9sorerie'};

// ─── Helpers ─────────────────────────────────────────────────
function rgbaToHex(c){
  if(!c)return COLORS.plum;if(c.charAt(0)==='#')return c.replace('#','').slice(0,6).toUpperCase();
  const m=c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if(!m)return COLORS.plum;return[m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('').toUpperCase();
}

// ─── LAYOUT HELPERS — Design System "Horizon" ──────────────
let _slidePageNum=0;

function addMasterElements(slide){
  _slidePageNum++;
  slide.addShape('rect',{x:GRID.barX,y:0,w:GRID.barW,h:GRID.slideH,fill:{color:COLORS.plum},line:{type:'none'}});
  if(_logoB64)slide.addImage({data:_logoB64,x:GRID.logoX,y:GRID.logoY,w:GRID.logoW,h:GRID.logoH});
  slide.addText(String(_slidePageNum),{x:GRID.slideW-1.5,y:GRID.footerY,w:1,h:0.3,fontFace:FONTS.body,fontSize:8,color:COLORS.gris30,align:'right'});
}

function addContentTitle(slide,title,sub,periodStr){
  slide.addText(title,{x:GRID.marginLeft,y:GRID.titleY,w:9,h:0.45,fontFace:FONTS.heading,fontSize:24,color:COLORS.noir});
  slide.addShape('rect',{x:GRID.marginLeft,y:GRID.accentLineY,w:GRID.accentLineW,h:0.012,fill:{color:COLORS.plum}});
  if(sub)slide.addText(sub,{x:GRID.marginLeft,y:GRID.accentLineY+0.08,w:9,h:0.3,fontFace:FONTS.body,fontSize:14,italic:true,color:COLORS.gris50});
  if(periodStr)slide.addText(periodStr,{x:GRID.slideW-3.5,y:GRID.titleY+0.1,w:3,h:0.3,fontFace:FONTS.body,fontSize:10,color:COLORS.gris50,align:'right'});
}

function addCommentary(slide,opts){
  opts=opts||{};
  const x=opts.x||GRID.marginLeft;
  const y=opts.y||5.3;
  const w=opts.w||(GRID.slideW-2.4);
  const h=opts.h||1.2;
  const insights=(opts.insights||[]).slice(0,3);
  // Plum left accent bar (decorative, no text)
  slide.addShape('rect',{x:x+0.01,y:y+0.06,w:0.04,h:h-0.12,fill:{color:COLORS.plum}});
  // All text inside one shape
  const lines=[{text:'Commentaire CFO / Contr\u00f4le de gestion\n',options:{fontSize:9,fontFace:FONTS.body,bold:true,color:COLORS.gris50,italic:true}}];
  if(!insights.length){
    lines.push({text:'\n\u2014 [Zone de saisie libre]',options:{fontSize:12,fontFace:FONTS.body,italic:true,color:COLORS.gris30}});
  } else {
    insights.forEach(ins=>{
      const t='\n\u2014 '+(typeof ins==='string'?ins:(ins.title||'')+'\n'+((ins.body||'').slice(0,140)));
      lines.push({text:t,options:{fontSize:11,fontFace:FONTS.body,color:COLORS.gris70}});
    });
  }
  slide.addText(lines,{shape:'roundRect',x,y,w,h,
    fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.5},rectRadius:0.06,
    valign:'top',margin:[8,15,8,18]});
}

function addSource(slide,text){/* removed per design review — no source text on content slides */}

// ─── 6 LAYOUT BUILDERS ────────────────────────────────────────

// LAYOUT 1 — COUVERTURE
function buildCoverSlide(pptx,title,subtitle,date){
  const s=pptx.addSlide();
  s.background={fill:COLORS.cream};
  // Vertical plum bar
  s.addShape('rect',{x:GRID.barX,y:0,w:GRID.barW,h:GRID.slideH,fill:{color:COLORS.plum},line:{type:'none'}});
  // Plum pale block right
  s.addShape('rect',{x:GRID.slideW-4.5,y:0,w:4.5,h:GRID.slideH,fill:{color:COLORS.plumPale},line:{type:'none'}});
  // Rose accent line
  s.addShape('rect',{x:GRID.marginLeft,y:3.3,w:5,h:0.015,fill:{color:COLORS.rose}});
  // Logo top-left
  if(_logoB64)s.addImage({data:_logoB64,x:GRID.marginLeft,y:0.45,w:1.3,h:0.33});
  // Title
  s.addText(title||'Rapport Financier',{x:GRID.marginLeft,y:3.5,w:7,h:1.0,fontFace:FONTS.heading,fontSize:54,color:COLORS.noir,valign:'top'});
  // Subtitle
  if(subtitle)s.addText(subtitle,{x:GRID.marginLeft,y:4.6,w:7,h:0.4,fontFace:FONTS.body,fontSize:15,italic:true,color:COLORS.gris50});
  // Date
  if(date)s.addText(date,{x:GRID.marginLeft,y:6.3,w:4,h:0.3,fontFace:FONTS.body,fontSize:10,color:COLORS.gris30});
  return s;
}

// LAYOUT 2 — SÉPARATEUR DE SECTION
function buildSectionSlide(pptx,number,title,description,periodStr){
  const s=pptx.addSlide();
  s.background={fill:COLORS.warmBg};
  addMasterElements(s);
  // Watermark section number
  s.addText(String(number).padStart(2,'0'),{x:GRID.slideW-4.5,y:1.2,w:4,h:2.5,fontFace:FONTS.heading,fontSize:200,color:COLORS.plumPale,align:'right'});
  // Title
  s.addText(title,{x:GRID.marginLeft,y:2.8,w:8,h:0.7,fontFace:FONTS.heading,fontSize:36,color:COLORS.noir});
  // Accent line
  s.addShape('rect',{x:GRID.marginLeft,y:3.55,w:2,h:0.02,fill:{color:COLORS.plum}});
  // Description
  if(description)s.addText(description,{x:GRID.marginLeft,y:3.8,w:8,h:0.4,fontFace:FONTS.body,fontSize:14,italic:true,color:COLORS.gris50});
  if(periodStr)s.addText(periodStr,{x:GRID.marginLeft,y:4.4,w:4,h:0.3,fontFace:FONTS.body,fontSize:10,color:COLORS.gris30});
  return s;
}

// LAYOUT 3 — KPI (4 cards)
function buildKpiSlide(pptx,title,periodStr,kpis){
  const s=pptx.addSlide();s.background={fill:COLORS.warmBg};
  addMasterElements(s);
  addContentTitle(s,title,null,periodStr);
  const items=kpis.slice(0,4);const cardW=2.7;const gap=0.15;
  const totalW=items.length*cardW+(items.length-1)*gap;
  const startX=GRID.marginLeft+(GRID.slideW-GRID.marginLeft-1.0-totalW)/2;
  items.forEach((k,i)=>{
    const cx=startX+i*(cardW+gap),cy=GRID.contentY+0.3;
    // Top plum accent
    s.addShape('rect',{x:cx,y:cy,w:cardW,h:0.025,fill:{color:COLORS.plum}});
    // Auto-scale value font: shorter text → bigger
    const vLen=(k.value||'').length;
    const vFontSz=vLen>8?28:vLen>5?34:42;
    // Card: all text inside one shape
    s.addText([
      {text:k.label||'',options:{fontSize:11,fontFace:FONTS.body,color:COLORS.gris50,breakType:'none'}},
      {text:'\n\n',options:{fontSize:8}},
      {text:(k.value||'')+'\n',options:{fontSize:vFontSz,fontFace:FONTS.heading,color:COLORS.noir,bold:true,align:'center'}},
      {text:'\n',options:{fontSize:4}},
      {text:(k.sub||'')+'\n',options:{fontSize:11,fontFace:FONTS.body,color:COLORS.gris50,align:'center'}},
      ...(k.trend?[{text:k.trend,options:{fontSize:10,fontFace:FONTS.body,color:COLORS.gris30,align:'center'}}]:[])
    ],{shape:'roundRect',x:cx,y:cy,w:cardW,h:3.2,
      fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.5},rectRadius:0.06,
      valign:'top',margin:[20,12,12,12]});
  });
  return s;
}

// LAYOUT 4 — GRAPHIQUE (content slide with chart)
function buildChartSlide(pptx,title,periodStr,sub){
  const s=pptx.addSlide();s.background={fill:COLORS.warmBg};
  addMasterElements(s);
  addContentTitle(s,title,sub,periodStr);
  return s;
}

// LAYOUT 5 — TABLEAU
function buildTableSlide(pptx,title,periodStr){
  const s=pptx.addSlide();s.background={fill:COLORS.warmBg};
  addMasterElements(s);
  addContentTitle(s,title,null,periodStr);
  return s;
}

// LAYOUT 6 — CLOSING
function buildClosingSlide(pptx,dateStr){
  const s=pptx.addSlide();
  s.background={fill:COLORS.cream};
  // Vertical plum bar
  s.addShape('rect',{x:GRID.barX,y:0,w:GRID.barW,h:GRID.slideH,fill:{color:COLORS.plum},line:{type:'none'}});
  // Plum pale block right
  s.addShape('rect',{x:GRID.slideW-4.5,y:0,w:4.5,h:GRID.slideH,fill:{color:COLORS.plumPale},line:{type:'none'}});
  // COPACI
  s.addText('C O P A C I',{x:0,y:2.2,w:GRID.slideW-4.5,h:0.8,fontFace:FONTS.heading,fontSize:40,color:COLORS.noir,align:'center'});
  // Accent line
  s.addShape('rect',{x:(GRID.slideW-4.5)/2-1,y:3.1,w:2,h:0.015,fill:{color:COLORS.plum}});
  // Merci
  s.addText('Merci',{x:0,y:3.4,w:GRID.slideW-4.5,h:0.5,fontFace:FONTS.heading,fontSize:24,italic:true,color:COLORS.gris50,align:'center'});
  // Date
  if(dateStr)s.addText('Rapport g\u00e9n\u00e9r\u00e9 le '+dateStr,{x:0,y:5.2,w:GRID.slideW-4.5,h:0.3,fontFace:FONTS.body,fontSize:10,color:COLORS.gris30,align:'center'});
  // Confidentiel
  s.addText('Confidentiel \u2014 Usage interne uniquement',{x:0,y:5.6,w:GRID.slideW-4.5,h:0.25,fontFace:FONTS.body,fontSize:8,color:COLORS.gris50,align:'center'});
  return s;
}

// ─── Native OOXML Chart Export — pptxgenjs addChart() ─────────
// Reads Chart.js instances and creates native editable OOXML charts.
// Design System "Horizon" — plum, cream, Calibri.
function _san(v){return(v==null||!isFinite(v))?0:Math.round(v*100)/100}
function _hex(c){
  if(!c||c==='transparent')return'FFFFFF';
  if(typeof c==='string'&&/^[0-9A-Fa-f]{6}$/.test(c))return c.toUpperCase();
  return rgbaToHex(c);
}
function _pad(series,len){series.forEach(s=>{while(s.values.length<len)s.values.push(0)})}

function chartToPptx(pptx,slide,key,x,y,w,h,extraOpts){
  const chart=CI[key];if(!chart)return false;
  try{
    const type=chart.config.type;
    const labels=(chart.data.labels||[]).map(l=>(l!=null&&l!=='')?String(l):' ');
    const datasets=chart.data.datasets||[];
    if(!labels.length||!datasets.length)return false;

    // Waterfall: stacked bar with transparent first dataset
    const isWF=type==='bar'&&datasets.length===2
      &&(datasets[0].backgroundColor==='transparent'||String(datasets[0].backgroundColor||'').includes('0,0,0,0'));
    if(isWF)return _wfChart(pptx,slide,labels,datasets,x,y,w,h);

    // Combo: bar chart with some datasets overriding type to 'line'
    const hasCombo=type==='bar'&&datasets.some(ds=>ds.type==='line');
    if(hasCombo)return _comboChart(pptx,slide,labels,datasets,x,y,w,h);

    // ── BAR ──
    if(type==='bar'){
      const stacked=datasets.some(ds=>ds.stack);
      const horiz=chart.options?.indexAxis==='y';
      const series=datasets.map((ds,i)=>({
        name:ds.label||' ',labels,
        values:(ds.data||[]).slice(0,labels.length).map(_san),
        color:CHART_SERIES[i%CHART_SERIES.length]
      }));
      _pad(series,labels.length);
      slide.addChart('bar',series,{
        x,y,w,h,showTitle:false,
        chartColors:series.map(s=>s.color),
        showLegend:datasets.length>1,legendPos:'b',legendFontSize:9,legendFontFace:FONTS.body,legendColor:COLORS.gris50,
        barGrouping:stacked?'stacked':'clustered',barDir:horiz?'bar':'col',
        showValue:true,dataLabelFontSize:8,dataLabelFontFace:FONTS.body,dataLabelColor:COLORS.noir,
        dataLabelPosition:stacked?'ctr':'outEnd',dataLabelFormatCode:'#,##0.0',
        catAxisLabelFontSize:9,catAxisLabelFontFace:FONTS.body,catAxisLabelColor:COLORS.gris50,
        valAxisLabelFontSize:9,valAxisLabelFontFace:FONTS.body,valAxisLabelColor:COLORS.gris50,
        catGridLine:{color:'FFFFFF',size:1},valGridLine:{color:'E8E8E8',size:1},
        plotArea:{fill:{color:'FFFFFF'}}
      });
    }
    // ── LINE ──
    else if(type==='line'){
      // Skip N-1 dashed overlays for cleaner export
      const solidDS=datasets.filter(ds=>!ds.borderDash||!ds.borderDash.length);
      const series=solidDS.map((ds,i)=>({
        name:ds.label||' ',labels,
        values:(ds.data||[]).slice(0,labels.length).map(_san),
        color:CHART_SERIES[i%CHART_SERIES.length]
      }));
      _pad(series,labels.length);
      slide.addChart('line',series,{
        x,y,w,h,showTitle:false,
        chartColors:series.map(s=>s.color),
        showLegend:solidDS.length>1,legendPos:'b',legendFontSize:9,legendFontFace:FONTS.body,legendColor:COLORS.gris50,
        showValue:true,dataLabelFontSize:8,dataLabelFontFace:FONTS.body,dataLabelColor:COLORS.noir,
        dataLabelPosition:'t',dataLabelFormatCode:'#,##0.0',
        lineSmooth:true,lineSize:2,
        catAxisLabelFontSize:9,catAxisLabelFontFace:FONTS.body,catAxisLabelColor:COLORS.gris50,
        valAxisLabelFontSize:9,valAxisLabelFontFace:FONTS.body,valAxisLabelColor:COLORS.gris50,
        catGridLine:{color:'FFFFFF',size:1},valGridLine:{color:'E8E8E8',size:1},
        plotArea:{fill:{color:'FFFFFF'}}
      });
    }
    // ── DOUGHNUT / PIE ──
    else if(type==='doughnut'||type==='pie'){
      const ds=datasets[0];
      const vals=(ds.data||[]).slice(0,labels.length).map(_san);
      const nSeg=vals.length;
      const SERIES_EXT=[...CHART_SERIES,'808080','C4A8C6','D4B896'];
      const colors=SERIES_EXT.slice(0,nSeg);
      while(colors.length<nSeg)colors.push(SERIES_EXT[colors.length%SERIES_EXT.length]);
      slide.addChart('doughnut',[{name:ds.label||' ',labels,values:vals}],{
        x,y,w,h,showTitle:false,
        chartColors:colors,
        showLegend:true,legendPos:'r',legendFontSize:9,legendFontFace:FONTS.body,legendColor:COLORS.gris50,
        holeSize:70,showValue:true,showPercent:false,
        dataLabelFontSize:9,dataLabelFontFace:FONTS.body,dataLabelColor:COLORS.noir,
        dataLabelPosition:'outEnd',dataLabelFormatCode:'#,##0.0',
        plotArea:{fill:{color:'FFFFFF'}}
      });
    }
    // ── RADAR ──
    else if(type==='radar'){
      const series=datasets.map((ds,i)=>({
        name:ds.label||' ',labels,
        values:(ds.data||[]).slice(0,labels.length).map(_san),
        color:CHART_SERIES[i%CHART_SERIES.length]
      }));
      _pad(series,labels.length);
      slide.addChart('radar',series,{
        x,y,w,h,showTitle:false,
        chartColors:series.map(s=>s.color),
        showLegend:true,legendPos:'b',legendFontSize:9,legendFontFace:FONTS.body,legendColor:COLORS.gris50,
        radarStyle:'filled',showValue:false,
        plotArea:{fill:{color:'FFFFFF'}}
      });
    }
    else return false;
    return true;
  }catch(e){console.warn('[Export] Native OOXML chart failed:',key,e);return false}
}

// ── Waterfall → single-series bar with per-bar coloring via chartColors
// Plum for positive, muted red for negative, sage for subtotals.
function _wfChart(pptx,slide,labels,datasets,x,y,w,h){
  const bases=(datasets[0].data||[]).map(_san);
  const deltas=(datasets[1].data||[]).map(_san);
  const bgArr=datasets[1].backgroundColor;
  // Reconstruct signed values
  const vals=labels.map((_,i)=>{
    const b=bases[i],d=deltas[i];
    if(b===0)return d;
    const c=Array.isArray(bgArr)?String(bgArr[i]||''):'';
    return(c.includes('239')||c.includes('ef4444')||c.includes('EF4444'))?-Math.abs(d):Math.abs(d);
  });
  // Per-bar coloring: subtotals→sage, négatif→rouge muted, positif→plum
  const SUBTOTAL_LABELS=['Marge brute','EBITDA','EBIT','RN','BFR exploit.','BFR total','FCF','Var. nette','EBITDA N'];
  const barColors=vals.map((v,i)=>{
    if(SUBTOTAL_LABELS.some(s=>labels[i].includes(s)))return'A8B29D';
    return v<0?'C94C4C':COLORS.plum;
  });
  slide.addChart('bar',[{name:' ',labels,values:vals.map(_san)}],{
    x,y,w,h,showTitle:false,showLegend:false,
    chartColors:barColors,
    showValue:true,dataLabelFontSize:9,dataLabelFontFace:FONTS.body,dataLabelColor:COLORS.noir,
    dataLabelPosition:'outEnd',dataLabelFormatCode:'#,##0.0',
    catAxisLabelFontSize:9,catAxisLabelFontFace:FONTS.body,catAxisLabelColor:COLORS.gris50,
    valAxisLabelFontSize:9,valAxisLabelFontFace:FONTS.body,valAxisLabelColor:COLORS.gris50,
    catGridLine:{color:'FFFFFF',size:1},valGridLine:{color:'E8E8E8',size:1},
    plotArea:{fill:{color:'FFFFFF'}}
  });
  return true;
}

// ── Combo chart (bar + line overlay, e.g. stacked debt + trend line) ──
function _comboChart(pptx,slide,labels,datasets,x,y,w,h){
  const barDS=datasets.filter(ds=>ds.type!=='line');
  const lineDS=datasets.filter(ds=>ds.type==='line');
  const stacked=barDS.some(ds=>ds.stack);
  const barData=barDS.map((ds,i)=>({
    name:ds.label||' ',labels,
    values:(ds.data||[]).slice(0,labels.length).map(_san),
    color:CHART_SERIES[i%CHART_SERIES.length]
  }));
  _pad(barData,labels.length);
  const lineData=lineDS.map((ds,i)=>({
    name:ds.label||' ',labels,
    values:(ds.data||[]).slice(0,labels.length).map(_san),
    color:CHART_SERIES[(barDS.length+i)%CHART_SERIES.length]
  }));
  _pad(lineData,labels.length);
  const types=[{type:'bar',data:barData,options:{
    ...(stacked?{barGrouping:'stacked'}:{}),
    chartColors:barData.map(s=>s.color)
  }}];
  if(lineData.length)types.push({type:'line',data:lineData,options:{
    chartColors:lineData.map(s=>s.color)
  }});
  slide.addChart(types,{
    x,y,w,h,showTitle:false,
    showLegend:true,legendPos:'b',legendFontSize:9,legendFontFace:FONTS.body,legendColor:COLORS.gris50,
    showValue:true,dataLabelFontSize:8,dataLabelFontFace:FONTS.body,dataLabelColor:COLORS.noir,
    dataLabelFormatCode:'#,##0.0',lineSmooth:true,lineSize:2,
    catAxisLabelFontSize:9,catAxisLabelFontFace:FONTS.body,catAxisLabelColor:COLORS.gris50,
    valAxisLabelFontSize:9,valAxisLabelFontFace:FONTS.body,valAxisLabelColor:COLORS.gris50,
    catGridLine:{color:'FFFFFF',size:1},valGridLine:{color:'E8E8E8',size:1},
    plotArea:{fill:{color:'FFFFFF'}}
  });
  return true;
}

// ─── DOM extraction helpers ─────────────────────────────────
function extractKpis(containerId){
  const el=document.getElementById(containerId);if(!el)return[];
  return Array.from(el.querySelectorAll('.kpi-card')).map(c=>({
    label:c.querySelector('.kpi-label')?.textContent||'',
    value:c.querySelector('.kpi-value')?.textContent||'',
    sub:c.querySelector('.kpi-sub')?.textContent||'',
    trend:c.querySelector('.kpi-trend')?.textContent?.trim()||''
  }));
}
function extractGauges(containerId){
  const el=document.getElementById(containerId);if(!el)return[];
  return Array.from(el.querySelectorAll('.gauge-tile')).map(g=>{
    const pill=g.querySelector('.gauge-pill');
    const cls=pill?['good','warn','bad'].find(c=>pill.classList.contains(c))||'':'';
    return{
      label:g.querySelector('.gauge-label')?.textContent||'',
      value:g.querySelector('.gauge-svg text')?.textContent||'',
      status:cls,pill:pill?.textContent||'',
      sub:g.querySelector('.gauge-sub')?.textContent||''
    };
  });
}
function extractInsights(containerId){
  const el=document.getElementById(containerId);if(!el)return[];
  return Array.from(el.querySelectorAll('.insight-row')).map(r=>{
    const sig=['good','warn','bad','info'].find(c=>r.classList.contains('sig-'+c))||'info';
    return{
      title:r.querySelector('.insight-title')?.textContent||'',
      body:r.querySelector('.insight-body')?.textContent||'',
      sig
    };
  });
}
function extractTable(tableEl){
  if(!tableEl)return null;
  const ths=Array.from(tableEl.querySelectorAll('thead th')).map(th=>th.textContent.trim());
  const rows=Array.from(tableEl.querySelectorAll('tbody tr')).filter(tr=>tr.offsetParent!==null).map(tr=>{
    const tds=Array.from(tr.querySelectorAll('td'));
    const isTotal=tr.classList.contains('row-total')||tr.classList.contains('row-subtotal');
    return{cells:tds.map(td=>td.textContent.trim()),isTotal};
  });
  return{headers:ths,rows};
}
function getChartTitle(canvasId){
  const cv=document.getElementById(canvasId);if(!cv)return'';
  const card=cv.closest('.chart-card');if(!card)return'';
  const h2=card.querySelector('h2');return h2?h2.textContent.replace(/\s+/g,' ').trim():'';
}
// Extract table in a specific expand mode (reduit/standard/detaille), then restore
function extractTableInMode(tableEl,tableId,mode){
  const prev=TABLE_EXPAND_MODE[tableId]||'reduit';
  setTableExpandMode(tableId,mode);
  const tbl=extractTable(tableEl);
  setTableExpandMode(tableId,prev);
  return tbl;
}
// Build a custom table from PL_DATA for a section (e.g., 'ga' for Frais G\u00e9n\u00e9raux)
function buildSectionTable(parentId,ca_net_m){
  if(!PL_DATA||!PL_DATA.length)return null;
  const parent=PL_DATA.find(l=>l.id===parentId);
  if(!parent)return null;
  const children=PL_DATA.filter(l=>l.parent===parentId);
  if(!children.length)return null;
  const sm=STATE.selectedMonth;
  // Determine active months (same logic as prepareTableForPPT)
  const activeMo=MO.map((_,i)=>parent.m[i]!==0||children.some(c=>c.m[i]!==0));
  const headers=['Libell\u00e9'];
  const moIdx=[];
  activeMo.forEach((a,i)=>{if(a){headers.push(MO[i]);moIdx.push(i);}});
  headers.push('YTD','% Total');
  const fmt=v=>{if(v===null||v===undefined)return'-';const a=Math.abs(v);return(v<0?'-':'')+a.toFixed(1).replace(/\.0$/,'').replace(/\B(?=(\d{3})+(?!\d))/g,' ');};
  const pct=v=>v!=null?(v*100).toFixed(1).replace('.',',')+' %':'';
  const rows=[];
  children.forEach(c=>{
    const ytd=c.m.reduce((s,v)=>s+(v||0),0);
    const totalGA=parent.m.reduce((s,v)=>s+(v||0),0);
    const cells=[c.label,...moIdx.map(i=>fmt(c.m[i])),fmt(ytd),pct(totalGA?ytd/totalGA:0)];
    rows.push({cells,isTotal:false});
  });
  // Total row
  const ytdT=parent.m.reduce((s,v)=>s+(v||0),0);
  const totalCells=[parent.label,...moIdx.map(i=>fmt(parent.m[i])),fmt(ytdT),'100,0 %'];
  rows.push({cells:totalCells,isTotal:true});
  // % CA row
  if(ca_net_m){
    const ytdCA=ca_net_m.reduce((s,v)=>s+(v||0),0);
    const pctCells=['% CA',...moIdx.map(i=>{const ca=ca_net_m[i];return ca?pct(parent.m[i]/ca):'-';}),pct(ytdCA?ytdT/ytdCA:0),''];
    rows.push({cells:pctCells,isTotal:false});
  }
  return{headers,rows};
}

// ─── KPI grid on slide (Horizon: white cards, plum accent) ──
function addKpiGrid(slide,kpis,startY){
  const cols=Math.min(kpis.length,4);const gap=0.15;const cardW=2.7;
  const startX=GRID.marginLeft;
  kpis.forEach((k,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    const cx=startX+col*(cardW+gap),cy=(startY||GRID.contentY)+row*1.6;
    slide.addShape('rect',{x:cx,y:cy,w:cardW,h:0.025,fill:{color:COLORS.plum}});
    slide.addText([
      {text:k.label||'',options:{fontSize:11,fontFace:FONTS.body,color:COLORS.gris50,breakType:'none'}},
      {text:'\n',options:{fontSize:4}},
      {text:(k.value||'')+'\n',options:{fontSize:24,fontFace:FONTS.heading,color:COLORS.noir,bold:true,align:'center'}},
      {text:(k.sub||''),options:{fontSize:9,fontFace:FONTS.body,color:COLORS.gris50,align:'center'}},
      ...(k.trend?[{text:'\n'+k.trend,options:{fontSize:10,fontFace:FONTS.body,color:COLORS.gris30,align:'center'}}]:[])
    ],{shape:'roundRect',x:cx,y:cy,w:cardW,h:1.4,
      fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.5},rectRadius:0.06,
      valign:'top',margin:[10,10,8,10]});
  });
}

// ─── Gauge grid on slide (Horizon style) ────────────────────
function addGaugeGrid(slide,gauges,startY){
  const cols=Math.min(gauges.length,4);const gap=0.15;const cardW=2.7;
  const startX=GRID.marginLeft;
  gauges.forEach((g,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    const cx=startX+col*(cardW+gap),cy=(startY||GRID.contentY)+row*1.3;
    slide.addShape('rect',{x:cx,y:cy,w:cardW,h:0.025,fill:{color:COLORS.plum}});
    const pillText=(g.pill||'').trim();
    slide.addText([
      {text:(g.label||'')+(pillText?' \u2014 '+pillText:''),options:{fontSize:10,fontFace:FONTS.body,color:COLORS.gris50,bold:true,breakType:'none'}},
      {text:'\n',options:{fontSize:4}},
      {text:(g.value||'')+'\n',options:{fontSize:22,fontFace:FONTS.heading,color:COLORS.noir,bold:true,align:'center'}},
      ...(g.sub?[{text:g.sub,options:{fontSize:8,fontFace:FONTS.body,color:COLORS.gris50,align:'center'}}]:[])
    ],{shape:'roundRect',x:cx,y:cy,w:cardW,h:1.15,
      fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.5},rectRadius:0.06,
      valign:'top',margin:[10,10,8,10]});
  });
}

// ─── Smart table preparation for PPT ────────────────────────
// Filters empty month columns, limits rows, computes proportional widths
function prepareTableForPPT(tableData,maxRows){
  if(!tableData||!tableData.headers.length)return null;
  const MO_NAMES=['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
  const h=tableData.headers;
  // Identify column types
  const colInfo=h.map((hdr,ci)=>({idx:ci,hdr,isMo:MO_NAMES.includes(hdr),isLabel:ci===0}));
  // For month columns, check if any row has real data (not "-" or empty)
  const moActive=colInfo.map(c=>{
    if(!c.isMo)return true;
    return tableData.rows.some(r=>{const v=r.cells[c.idx];return v&&v!=='-'&&v!=='0'&&v.trim()!=='';});
  });
  // Keep: label + active months + non-month summary cols (YTD, %CA, Trend, Dernier, % Total, etc.)
  const keepIdx=colInfo.filter((c,i)=>moActive[i]).map(c=>c.idx);
  if(!keepIdx.length)return null;
  // Filter headers and rows
  const newHeaders=keepIdx.map(i=>h[i]);
  const maxR=maxRows||16;
  const newRows=tableData.rows.slice(0,maxR).map(r=>({
    cells:keepIdx.map(i=>r.cells[i]||''),isTotal:r.isTotal
  }));
  return{headers:newHeaders,rows:newRows};
}

// ─── Conditional color for % / delta values ─────────────────
function pptCellColor(text,header){
  if(!text)return COLORS.noir;
  const isPercent=header&&(header.includes('%')||header.includes('Trend')||header.includes('\u0394'));
  const isDelta=text.includes('\u0394')||text.includes('%');
  if(!isPercent&&!isDelta)return COLORS.noir;
  const num=parseFloat(text.replace(/[^\d,.\-]/g,'').replace(',','.'));
  if(isNaN(num)||num===0)return COLORS.noir;
  return num>0?'10B981':'EF4444';
}

// ─── Table on slide (Horizon: no vertical borders, plum header, proportional widths) ─
function addTableToSlide(slide,tableData,x,y,w,opts){
  if(!tableData||!tableData.headers.length)return;
  // Smart prep: filter empty months, limit rows
  const prep=prepareTableForPPT(tableData,opts?.maxRows||16);
  if(!prep||!prep.headers.length)return;
  const nCols=prep.headers.length;
  // Proportional widths: label col = 2.5x data cols
  const labelShare=2.5;const dataShare=1.0;
  const totalShares=labelShare+(nCols-1)*dataShare;
  const colWidths=[w*labelShare/totalShares,...Array(nCols-1).fill(w*dataShare/totalShares)];
  // Font size adapts to column count
  const fontSize=nCols>8?8:nCols>6?9:10;
  const rows=[];
  // Header: Bold Noir on Cream, plum bottom border only
  rows.push(prep.headers.map((h,ci)=>({text:h,options:{bold:true,fontSize,fontFace:FONTS.body,color:COLORS.noir,
    fill:{color:COLORS.cream},align:ci===0?'left':'right',
    border:[{type:'none'},{type:'none'},{type:'solid',pt:1,color:COLORS.plum},{type:'none'}]}})));
  // Body: alternating warmBg/white, conditional color for % / delta
  prep.rows.forEach((r,ri)=>{
    const bgCol=r.isTotal?COLORS.rosePale:(ri%2===0?COLORS.warmBg:COLORS.white);
    rows.push(r.cells.map((c,ci)=>({text:c,options:{fontSize,fontFace:FONTS.body,
      color:pptCellColor(c,prep.headers[ci]),bold:r.isTotal,fill:{color:bgCol},align:ci===0?'left':'right',
      border:[{type:'solid',pt:0.25,color:COLORS.gris15},{type:'none'},{type:'solid',pt:0.25,color:COLORS.gris15},{type:'none'}]}})));
  });
  slide.addTable(rows,{x:x||GRID.marginLeft,y:y||GRID.contentY,w,colW:colWidths,rowH:0.26,
    autoPage:false,...(opts||{})});
}

// ─── Chart subtitle on slide ────────────────────────────────
function addChartTitle(slide,text,x,y,w){
  slide.addText(text,{x,y,w:w||5.5,h:0.3,fontSize:11,fontFace:FONTS.body,bold:true,color:COLORS.noir});
}

// ═══════════════════════════════════════════════════════════════
// PER-TAB SLIDE BUILDERS — Design System "Horizon"
// ═══════════════════════════════════════════════════════════════

// ─── STANDARD CHART GRID DIMENSIONS ─────────────────────────
// 2-chart side-by-side
const CG={lx:1.2,rx:6.8,ty:1.65,cy:1.8,cw:5.2,ch:3.0,cmtY:5.1};
// Full-width single chart
const CF={x:1.2,cy:1.8,w:10.93,ch:3.5,cmtY:5.6};

// ─── SYNTHESE ───────────────────────────────────────────────
function buildSyntheseSlides(pptx,periodStr){
  // Slide 1 : KPIs (Layout 3)
  const kpis=extractKpis('synthKpis');
  const s1=buildKpiSlide(pptx,'Indicateurs cl\u00e9s',periodStr,kpis.slice(0,4));
  if(kpis.length>4)addKpiGrid(s1,kpis.slice(4),GRID.contentY+2.0);

  // Slide 2 : Gauges
  const gauges=extractGauges('synthHealthGauges');
  if(gauges.length){
    const sg=buildChartSlide(pptx,'Sant\u00e9 financi\u00e8re',periodStr,'Indicateurs cl\u00e9s');
    addGaugeGrid(sg,gauges,GRID.contentY);
    addCommentary(sg);
  }

  // Slide 3 : Performance 2\u00d72 grid (4 charts)
  const s2=buildChartSlide(pptx,'Performance',periodStr,'CA, EBITDA & Flux');
  addChartTitle(s2,getChartTitle('synthPerfChart'),CG.lx,1.65,CG.cw);
  chartToPptx(pptx,s2,'s1',CG.lx,1.8,CG.cw,2.4);
  addChartTitle(s2,getChartTitle('synthWaterfallChart'),CG.rx,1.65,CG.cw);
  chartToPptx(pptx,s2,'s2',CG.rx,1.8,CG.cw,2.4);
  addChartTitle(s2,getChartTitle('synthCashConvChart'),CG.lx,4.4,CG.cw);
  chartToPptx(pptx,s2,'s5',CG.lx,4.55,CG.cw,2.0);
  addChartTitle(s2,getChartTitle('synthMarginBridgeChart'),CG.rx,4.4,CG.cw);
  chartToPptx(pptx,s2,'s6',CG.rx,4.55,CG.cw,2.0);

  // Slide 4 : Marges + Charges (2 charts + commentary)
  const s3=buildChartSlide(pptx,'Marges & Structure des charges',periodStr);
  addChartTitle(s3,getChartTitle('synthMarginsChart'),CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s3,'s3',CG.lx,CG.cy,CG.cw,CG.ch);
  addChartTitle(s3,getChartTitle('synthChargesChart'),CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s3,'s4',CG.rx,CG.cy,CG.cw,CG.ch);
  addCommentary(s3,{y:CG.cmtY});

  // Slide 5 : Insights
  const insights=extractInsights('synthInsights');
  if(insights.length){
    const s4=buildChartSlide(pptx,'Signaux & Alertes',periodStr,'Analyse automatique');
    let iy=GRID.contentY;
    insights.slice(0,8).forEach(ins=>{
      const sigCol=ins.sig==='good'?'10B981':ins.sig==='warn'?'F59E0B':ins.sig==='bad'?'EF4444':COLORS.plum;
      // Signal bar (decorative, no text)
      s4.addShape('rect',{x:GRID.marginLeft,y:iy,w:0.05,h:0.62,fill:{color:sigCol}});
      // Card: title + body inside one shape
      s4.addText([
        {text:ins.title||'',options:{fontSize:10,fontFace:FONTS.body,bold:true,color:COLORS.noir,breakType:'none'}},
        {text:'\n'+(ins.body||''),options:{fontSize:9,fontFace:FONTS.body,color:COLORS.gris70}}
      ],{shape:'roundRect',x:GRID.marginLeft,y:iy,w:GRID.slideW-2.4,h:0.62,
        fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.5},rectRadius:0.04,
        valign:'middle',margin:[6,12,6,20]});
      iy+=0.7;
    });
  }
}

// ─── COMPTE DE RESULTAT — 6 SLIDES ─────────────────────────
// Helpers for P&L comparison tables
function _plFind(src,id){return(src||[]).find(l=>l.id===id)}
function _ytd(line,sm){if(!line||!line.m)return 0;let s=0;for(let i=0;i<=sm;i++)s+=(line.m[i]||0);return s}
function _fmtN(v){if(v==null||!isFinite(v))return'-';const a=Math.abs(v);return(v<0?'-':'')+a.toFixed(1).replace(/\.0$/,'').replace(/\B(?=(\d{3})+(?!\d))/g,' ')}
function _fmtPct(v){if(v==null||!isFinite(v))return'-';return(v>0?'+':'')+v.toFixed(1).replace('.',',')+' %'}
function _fmtPctCA(v){if(v==null||!isFinite(v))return'-';return v.toFixed(1).replace('.',',')+' %'}
function _delta(a,b){if(!b||b===0)return null;return((a-b)/Math.abs(b))*100}

// Build comparison table: YTD Réel | Budget | N-1 | Δ% Budget | Δ% N-1 | %CA
function buildComparisonPL(lineIds,sm){
  const hasBudget=!isBudgetPlaceholder();
  const headers=['Libellé','YTD Réel'];
  if(hasBudget)headers.push('Budget','Δ Budget');
  headers.push('YTD N-1','Δ N-1','% CA');
  const caR=_ytd(_plFind(PL_DATA,'ca_net'),sm);
  const rows=lineIds.map(id=>{
    const lr=_plFind(PL_DATA,id);const ln=_plFind(PL_N1_DATA,id);const lb=_plFind(BUDGET_DATA,id);
    const ytdR=_ytd(lr,sm);const ytdN=_ytd(ln,sm);const ytdB=_ytd(lb,sm);
    const cells=[lr?lr.label:id, _fmtN(ytdR)];
    if(hasBudget){cells.push(_fmtN(ytdB),_fmtPct(_delta(ytdR,ytdB)));}
    cells.push(_fmtN(ytdN),_fmtPct(_delta(ytdR,ytdN)),caR?_fmtPctCA(ytdR/caR*100):'-');
    const isT=lr&&(lr.type==='total'||lr.type==='subtotal'||['marge_brute','ebitda','ebit','rcai','resultat_net'].includes(id));
    return{cells,isTotal:!!isT};
  });
  return{headers,rows};
}

// Build marge brute decomposition table
function buildMargeDecompositionTable(sm){
  const ids=['ca_net','conso_emb','conso_mp','ristournes','escompte','var_stock_pf','achats_ns','marge_brute'];
  const moIdx=[];for(let i=0;i<=sm;i++){const l=_plFind(PL_DATA,'ca_net');if(l&&l.m[i]!==0)moIdx.push(i);}
  const headers=['Libellé',...moIdx.map(i=>MO[i]),'YTD','% CA'];
  const caYTD=_ytd(_plFind(PL_DATA,'ca_net'),sm);
  const rows=ids.map(id=>{
    const l=_plFind(PL_DATA,id);if(!l)return null;
    const ytd=_ytd(l,sm);
    const cells=[l.label,...moIdx.map(i=>_fmtN(l.m[i])),_fmtN(ytd),caYTD?_fmtPctCA(ytd/caYTD*100):'-'];
    const isT=['ca_net','marge_brute'].includes(id);
    return{cells,isTotal:isT};
  }).filter(Boolean);
  // Add pct_mb row
  const mbLine=_plFind(PL_DATA,'pct_mb');
  if(mbLine){
    const cells=['% Marge brute',...moIdx.map(i=>_fmtPctCA(mbLine.m[i])),'',''];
    rows.push({cells,isTotal:false});
  }
  return{headers,rows};
}

// Build GA table with budget comparison
function buildGABudgetTable(sm){
  const parent=_plFind(PL_DATA,'ga');if(!parent)return null;
  const children=(PL_DATA||[]).filter(l=>l.parent==='ga');if(!children.length)return null;
  const hasBudget=!isBudgetPlaceholder();
  const caYTD=_ytd(_plFind(PL_DATA,'ca_net'),sm);
  const headers=['Libellé','YTD Réel'];
  if(hasBudget)headers.push('Budget','Δ Budget');
  headers.push('% CA','% Total');
  const gaYTD=_ytd(parent,sm);
  const rows=children.map(c=>{
    const ytdR=_ytd(c,sm);
    const ytdB=hasBudget?_ytd(_plFind(BUDGET_DATA,c.id),sm):0;
    const cells=[c.label,_fmtN(ytdR)];
    if(hasBudget)cells.push(_fmtN(ytdB),_fmtPct(_delta(ytdR,ytdB)));
    cells.push(caYTD?_fmtPctCA(ytdR/caYTD*100):'-',gaYTD?_fmtPctCA(ytdR/gaYTD*100):'-');
    return{cells,isTotal:false};
  });
  // Total row
  const totalCells=[parent.label,_fmtN(gaYTD)];
  if(hasBudget){const gaB=_ytd(_plFind(BUDGET_DATA,'ga'),sm);totalCells.push(_fmtN(gaB),_fmtPct(_delta(gaYTD,gaB)));}
  totalCells.push(caYTD?_fmtPctCA(gaYTD/caYTD*100):'-','100,0 %');
  rows.push({cells:totalCells,isTotal:true});
  return{headers,rows};
}

// Build ventes decomposition table
function buildVentesTable(sm){
  const hasBudget=!isBudgetPlaceholder();
  const caYTD=_ytd(_plFind(PL_DATA,'ca_net'),sm);
  // Dynamically build list: ca_net + its children (ca_local, ca_export) + their children if they exist
  const caNet=_plFind(PL_DATA,'ca_net');
  const ids=['ca_net'];
  if(caNet&&caNet.children)caNet.children.forEach(cid=>{
    ids.push(cid);
    const child=_plFind(PL_DATA,cid);
    if(child&&child.children)child.children.forEach(gcid=>ids.push(gcid));
  });
  const headers=['Canal','YTD Réel'];
  if(hasBudget)headers.push('Budget','Δ Budget');
  headers.push('YTD N-1','Δ N-1','% CA');
  const rows=ids.map(id=>{
    const lr=_plFind(PL_DATA,id);const ln=_plFind(PL_N1_DATA,id);const lb=_plFind(BUDGET_DATA,id);
    if(!lr)return null;
    const ytdR=_ytd(lr,sm);const ytdN=_ytd(ln,sm);const ytdB=_ytd(lb,sm);
    const cells=[lr.label,_fmtN(ytdR)];
    if(hasBudget)cells.push(_fmtN(ytdB),_fmtPct(_delta(ytdR,ytdB)));
    cells.push(_fmtN(ytdN),_fmtPct(_delta(ytdR,ytdN)),caYTD?_fmtPctCA(ytdR/caYTD*100):'-');
    const indent=lr.level&&lr.level>=2;
    const isT=id==='ca_net';
    return{cells:cells.map((c,ci)=>ci===0&&indent?'  \u00B7 '+c:c),isTotal:isT};
  }).filter(Boolean);
  return{headers,rows};
}

function buildPLSlides(pptx,periodStr){
  const plEl=document.getElementById('plTable');
  const sm=STATE.selectedMonth!=null?STATE.selectedMonth:11;

  // ── SLIDE PL-1 : P&L Synthétique + Bridge Waterfall ─────────
  const s1=buildChartSlide(pptx,'Compte de Résultat',periodStr,'Synthèse & Bridge');
  // Left: Comparison table (10 lines)
  const compIds=['ca_net','marge_brute','marge_cd','ga','ebitda','da','ebit','resultat_fin','rcai','is','resultat_net'];
  const compTbl=buildComparisonPL(compIds,sm);
  if(compTbl)addTableToSlide(s1,compTbl,1.2,GRID.contentY,5.5,{maxRows:12});
  // Right: Bridge waterfall CA→RN
  addChartTitle(s1,'Waterfall CA \u2192 RN \u00B7 YTD '+MO[sm]+' '+STATE.year,CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s1,'p1',CG.rx,CG.cy,CG.cw,CG.ch);

  // ── SLIDE PL-2 : Progression mensuelle ──────────────────────
  const tblR=extractTableInMode(plEl,'plTable','reduit');
  if(tblR&&tblR.headers.length){
    const s2=buildChartSlide(pptx,'Compte de Résultat',periodStr,'Progression mensuelle');
    addTableToSlide(s2,tblR,1.2,GRID.contentY,10.93,{maxRows:16});
    addCommentary(s2,{y:6.0,h:0.9});
  }

  // ── SLIDE PL-3 : Détail Ventes ──────────────────────────────
  const s3=buildChartSlide(pptx,'Chiffre d\u2019affaires',periodStr,'Détail par canal & zone');
  // Left: Stacked bar CA mensuel (local/export) — use chart s1 combo if available
  addChartTitle(s3,'CA mensuel par canal',CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s3,'s1',CG.lx,CG.cy,CG.cw,2.4);
  // Right: Table ventes
  const ventesT=buildVentesTable(sm);
  if(ventesT)addTableToSlide(s3,ventesT,CG.rx,CG.cy,5.2,{maxRows:10});
  addCommentary(s3,{y:5.3,h:1.2});

  // ── SLIDE PL-4 : Marge Brute Breakdown ──────────────────────
  const s4=buildChartSlide(pptx,'Marge Brute',periodStr,'Décomposition');
  const margeTbl=buildMargeDecompositionTable(sm);
  if(margeTbl)addTableToSlide(s4,margeTbl,1.2,GRID.contentY,10.93,{maxRows:14});
  // Mini waterfall if chart s2 (CA→RN) exists, reuse it or show margins chart
  addChartTitle(s4,'Évolution marge brute %',CG.lx,5.0,CG.cw);
  chartToPptx(pptx,s4,'p2',1.2,5.2,10.93,1.6);

  // ── SLIDE PL-5 : Frais Généraux ─────────────────────────────
  const gaTbl=buildGABudgetTable(sm);
  if(gaTbl&&gaTbl.rows.length){
    const s5=buildChartSlide(pptx,'Frais Généraux',periodStr,'Détail vs Budget & % CA');
    addTableToSlide(s5,gaTbl,1.2,GRID.contentY,10.93,{maxRows:18});
    addCommentary(s5,{y:6.2,h:0.8});
  }

  // ── SLIDE PL-6 : Résultat Financier ─────────────────────────
  const finLines=['charges_fin','produits_fin','resultat_fin'];
  const finData=PL_DATA.filter(l=>finLines.includes(l.id));
  if(finData.length){
    const s6=buildChartSlide(pptx,'Résultat Financier',periodStr,'Analyse');
    const activeMo=MO.map((_,mi)=>finData.some(l=>l.m[mi]!==0));
    const moIdx=[];activeMo.forEach((a,i)=>{if(a)moIdx.push(i)});
    const finHeaders=['Libellé',...moIdx.map(i=>MO[i]),'YTD'];
    const finRows=finData.map(l=>{
      const ytd=_ytd(l,sm);
      return{cells:[l.label,...moIdx.map(i=>_fmtN(l.m[i])),_fmtN(ytd)],isTotal:l.type==='total'};
    });
    addTableToSlide(s6,{headers:finHeaders,rows:finRows},1.2,GRID.contentY,10.93);
    addCommentary(s6,{y:4.0,h:1.5});
  }
}

// ─── BILAN ──────────────────────────────────────────────────
function buildBilanSlides(pptx,periodStr){
  // Slide 1: Charts (structure + evolution)
  const s1=buildChartSlide(pptx,'Bilan',periodStr,'Structure & \u00e9volution');
  addChartTitle(s1,getChartTitle('bilanStructChart'),CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s1,'b1',CG.lx,CG.cy,CG.cw,CG.ch);
  addChartTitle(s1,getChartTitle('bilanEvoChart'),CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s1,'b2',CG.rx,CG.cy,CG.cw,CG.ch);
  addCommentary(s1,{y:CG.cmtY});

  // Slide 2: Table Standard view — full width
  const bilanEl=document.getElementById('bilanTable');
  const tbl=bilanEl?extractTableInMode(bilanEl,'bilanTable','standard'):null;
  if(tbl&&tbl.headers.length){
    const s2=buildTableSlide(pptx,'Bilan \u2014 Actif & Passif',periodStr);
    addTableToSlide(s2,tbl,1.2,GRID.contentY,10.93,{maxRows:22});
    addCommentary(s2,{y:6.2,h:0.8});
  }
}

// ─── TRESORERIE & BFR ───────────────────────────────────────
function buildTresoSlides(pptx,periodStr){
  // Slide 1 : CCC KPI cards
  const cccKpis=[
    {label:'DSO',value:String(RATIOS.dso.val),sub:'jours clients',trend:''},
    {label:'DIO',value:String(RATIOS.dio.val),sub:'jours stocks',trend:''},
    {label:'DPO',value:String(RATIOS.dpo.val),sub:'jours fournisseurs',trend:''},
    {label:'CCC',value:String(RATIOS.dso.val+RATIOS.dio.val-RATIOS.dpo.val),sub:'jours cycle',trend:''}
  ];
  const s1=buildKpiSlide(pptx,'Cycle de conversion de caisse',periodStr,cccKpis);

  // Slide 2 : Waterfall BFR (full width)
  const s2=buildChartSlide(pptx,'D\u00e9composition du BFR',periodStr);
  chartToPptx(pptx,s2,'t1',CF.x,CF.cy,CF.w,CF.ch);
  addCommentary(s2,{y:CF.cmtY});

  // Slide 3 : Trends (2 charts)
  const s3=buildChartSlide(pptx,'Tendances BFR & Composantes',periodStr,'12 mois glissants');
  addChartTitle(s3,getChartTitle('bfrEvoChart'),CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s3,'t2',CG.lx,CG.cy,CG.cw,CG.ch);
  addChartTitle(s3,getChartTitle('ratioEvoChart'),CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s3,'t3',CG.rx,CG.cy,CG.cw,CG.ch);
  addCommentary(s3,{y:CG.cmtY});
}

// ─── KPIs & RATIOS ──────────────────────────────────────────
function buildKpisSlides(pptx,periodStr){
  const gauges=extractGauges('kpiGauges')||extractGauges('synthHealthGauges');
  if(gauges.length){
    const s1=buildChartSlide(pptx,'Ratios de performance',periodStr,'Sant\u00e9 financi\u00e8re');
    addGaugeGrid(s1,gauges,GRID.contentY);
  }
  const s2=buildChartSlide(pptx,'Radar & Tendances',periodStr);
  addChartTitle(s2,getChartTitle('radarChart'),CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s2,'k1',CG.lx,CG.cy,CG.cw,CG.ch);
  addChartTitle(s2,getChartTitle('kpiEvoChart'),CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s2,'k2',CG.rx,CG.cy,CG.cw,CG.ch);
  addCommentary(s2,{y:CG.cmtY});
}

// ─── DETTES FINANCIERES ─────────────────────────────────────
function buildDettesSlides(pptx,periodStr){
  // Slide 1: 3-chart premium layout (doughnut + stacked + nature)
  const s1=buildChartSlide(pptx,'Dettes Financi\u00e8res',periodStr,'Structure et \u00e9volution');
  // Row 1: doughnut left (compact) + stacked bar right (wider)
  addChartTitle(s1,getChartTitle('detteTypeChart'),1.2,CG.ty,3.8);
  chartToPptx(pptx,s1,'d1',1.2,CG.cy,3.8,2.6);
  addChartTitle(s1,getChartTitle('detteStackedChart'),5.4,CG.ty,6.6);
  chartToPptx(pptx,s1,'d2',5.4,CG.cy,6.6,2.6);
  // Row 2: nature bar full width
  addChartTitle(s1,getChartTitle('detteByNatureChart'),1.2,4.65,10.93);
  chartToPptx(pptx,s1,'d3',1.2,4.8,10.93,1.7);

  // Slide 2: Table Standard view — full width
  const dettesEl=document.querySelector('#dettes .fin-table');
  const dettesTableId=dettesEl?dettesEl.id:'dettesTable';
  const tbl=dettesEl?extractTableInMode(dettesEl,dettesTableId,'standard'):null;
  if(tbl&&tbl.headers.length){
    const s2=buildTableSlide(pptx,'Dettes Financi\u00e8res \u2014 D\u00e9tail',periodStr);
    addTableToSlide(s2,tbl,1.2,GRID.contentY,10.93,{maxRows:20});
    addCommentary(s2,{y:6.2,h:0.8});
  }
}

// ─── FLUX DE TRESORERIE ─────────────────────────────────────
function buildCFSSlides(pptx,periodStr){
  // Slide 1: 2 charts + commentary
  const s1=buildChartSlide(pptx,'Flux de Tr\u00e9sorerie',periodStr,'Exploitation, investissement, financement');
  addChartTitle(s1,getChartTitle('cfsWaterfallChart'),CG.lx,CG.ty,CG.cw);
  chartToPptx(pptx,s1,'c1',CG.lx,CG.cy,CG.cw,CG.ch);
  addChartTitle(s1,getChartTitle('cfsTresoChart'),CG.rx,CG.ty,CG.cw);
  chartToPptx(pptx,s1,'c2',CG.rx,CG.cy,CG.cw,CG.ch);
  addCommentary(s1,{y:CG.cmtY});

  // Slide 2: Table Standard view — full width
  const cfsEl=document.querySelector('#cfs .fin-table');
  const cfsTableId=cfsEl?cfsEl.id:'cfsTable';
  const tbl=cfsEl?extractTableInMode(cfsEl,cfsTableId,'standard'):null;
  if(tbl&&tbl.headers.length){
    const s2=buildTableSlide(pptx,'Flux de Tr\u00e9sorerie \u2014 D\u00e9tail',periodStr);
    addTableToSlide(s2,tbl,1.2,GRID.contentY,10.93,{maxRows:22});
    addCommentary(s2,{y:6.2,h:0.8});
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═══════════════════════════════════════════════════════════════
async function generatePPTX(scope,notes,onProgress){
  _slidePageNum=0;
  const pptx=new PptxGenJS();
  pptx.author='COPACI Finance BI';pptx.company='COPACI';
  pptx.subject='Rapport financier \u2014 Comit\u00e9 de Direction';
  pptx.title='COPACI \u2014 Finance BI \u00b7 '+STATE.year;
  pptx.defineLayout({name:'COPACI_16x9',width:GRID.slideW,height:GRID.slideH});
  pptx.layout='COPACI_16x9';

  const dateStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const periodStr=STATE.year+' \u00b7 '+({mensuel:'Mensuel',ytd:'YTD',ltm:'LTM'}[STATE.mode]||'Mensuel');

  // ── LAYOUT 1 — Couverture ──
  buildCoverSlide(pptx,'Rapport Financier','Comit\u00e9 de Direction \u2014 '+periodStr,dateStr);

  // ── Sommaire (Layout 4 variant) ──
  const sA=buildChartSlide(pptx,'Sommaire',periodStr);
  let agY=GRID.contentY+0.2;
  scope.forEach((id,i)=>{
    sA.addText((i+1)+'.   '+(TAB_LABELS[id]||id),{shape:'roundRect',x:GRID.marginLeft,y:agY-0.02,w:GRID.slideW-2.4,h:0.48,
      fill:{color:i%2===0?COLORS.white:COLORS.warmBg},line:{color:COLORS.gris15,width:0.5},rectRadius:0.04,
      fontSize:15,fontFace:FONTS.body,color:COLORS.noir,margin:[0,0,0,20]});
    agY+=0.58;
  });

  // ── Per-tab content slides ──
  const builders={synthese:buildSyntheseSlides,pl:buildPLSlides,bilan:buildBilanSlides,
    tresorerie:buildTresoSlides,kpis:buildKpisSlides,dettes:buildDettesSlides,cfs:buildCFSSlides};
  for(let ti=0;ti<scope.length;ti++){
    const tabId=scope[ti];
    onProgress?.((ti+1)+'/'+scope.length+' \u2014 '+(TAB_LABELS[tabId]||tabId));
    // LAYOUT 2 — Section separator
    buildSectionSlide(pptx,ti+1,TAB_LABELS[tabId]||tabId,TAB_DESCRIPTIONS[tabId]||'',periodStr);
    // Make tab visible FIRST so Chart.js renders on non-zero canvas
    const tabEl=document.getElementById(tabId);
    const prevDisplay=tabEl?tabEl.style.display:'';
    const prevVis=tabEl?tabEl.style.visibility:'';
    if(tabEl){tabEl.style.display='block';tabEl.style.visibility='visible';}
    // THEN build tab (charts need visible canvas for proper data init)
    if(!tabBuilt[tabId]&&TAB_BUILDERS[tabId]){tabBuilt[tabId]=true;TAB_BUILDERS[tabId]();}
    if(builders[tabId])builders[tabId](pptx,periodStr);
    if(tabEl){tabEl.style.display=prevDisplay;tabEl.style.visibility=prevVis;}
  }

  // ── Notes slide ──
  if(notes){
    const sN=buildChartSlide(pptx,'Notes & Commentaires',periodStr,'CFO / Contr\u00f4le de gestion');
    sN.addText(notes,{x:GRID.marginLeft,y:GRID.contentY,w:GRID.slideW-2.4,h:4.5,fontSize:12,fontFace:FONTS.body,color:COLORS.noir,
      valign:'top',paraSpaceAfter:8,lineSpacingMultiple:1.3,
      shape:'roundRect',fill:{color:COLORS.white},line:{color:COLORS.gris15,width:0.75},rectRadius:0.08});
  }

  // ── LAYOUT 6 — Closing ──
  buildClosingSlide(pptx,dateStr);

  // ── Save ──
  onProgress?.('Enregistrement...');
  const fname='COPACI_Finance_'+STATE.year+'_'+new Date().toISOString().slice(0,10)+'.pptx';
  await pptx.writeFile({fileName:fname});
}

// ─── Export / Config modal wiring ────────────────────────────
(function initExportModal(){
  const ov=document.getElementById('exportOverlay');
  const openBtn=document.getElementById('exportBtn');
  const closeBtn=document.getElementById('exportClose');
  const cancelBtn=document.getElementById('exportCancel');
  const genBtn=document.getElementById('exportGenerate');
  const scopeAll=document.getElementById('scopeAll');
  const scopeTabs=document.querySelectorAll('.scope-tab');
  const fmtBtns=document.querySelectorAll('.fmt-btn');
  const progress=document.getElementById('exportProgress');

  if(!openBtn||!ov)return;

  // ── Sync config pills with current STATE on open ──
  function syncCfgToState(){
    document.querySelectorAll('#cfgYearPills .cfg-pill').forEach(b=>{
      b.classList.toggle('active',+b.dataset.y===STATE.year);
    });
    document.querySelectorAll('#cfgModePills .cfg-pill').forEach(b=>{
      b.classList.toggle('active',b.dataset.mode===STATE.mode);
    });
    document.querySelectorAll('#cfgMonthPills .cfg-pill').forEach(b=>{
      const sm=STATE.selectedMonth;
      b.classList.toggle('active',b.dataset.m==='all'?sm==='all':+b.dataset.m===+sm);
    });
  }

  // ── Apply config changes to dashboard ──
  function applyPeriod(){
    // Sync header controls
    document.getElementById('yearLabel').textContent=STATE.year;
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===STATE.mode));
    document.querySelectorAll('#monthPills .pill').forEach(b=>{
      const sm=STATE.selectedMonth;
      b.classList.toggle('active',b.dataset.m==='all'?sm==='all':+b.dataset.m===+sm);
    });
    // Reset tabBuilt so tabs rebuild with new data
    Object.keys(tabBuilt).forEach(k=>tabBuilt[k]=false);
    refreshAll();
    if(TAB_BUILDERS[currentTab]){tabBuilt[currentTab]=true;TAB_BUILDERS[currentTab]();}
  }

  // ── Year pills (generated dynamically from CURRENT_FISCAL_YEAR) ──
  function initYearPills(){
    const host=document.getElementById('cfgYearPills');
    if(!host)return;
    const cy=CURRENT_FISCAL_YEAR;
    const years=[cy-2,cy-1,cy];
    host.innerHTML=years.map(y=>`<button class="cfg-pill${y===STATE.year?' active':''}" data-y="${y}">${y}</button>`).join('');
    host.querySelectorAll('.cfg-pill').forEach(btn=>{
      btn.addEventListener('click',()=>{
        STATE.year=+btn.dataset.y;currentYear=STATE.year;
        syncCfgToState();applyPeriod();
      });
    });
  }
  initYearPills();
  // ── Mode pills ──
  document.querySelectorAll('#cfgModePills .cfg-pill').forEach(btn=>{
    btn.addEventListener('click',()=>{
      STATE.mode=btn.dataset.mode;
      syncCfgToState();applyPeriod();
    });
  });
  // ── Month pills ──
  document.querySelectorAll('#cfgMonthPills .cfg-pill').forEach(btn=>{
    btn.addEventListener('click',()=>{
      STATE.selectedMonth=btn.dataset.m==='all'?'all':+btn.dataset.m;
      syncCfgToState();applyPeriod();
    });
  });

  openBtn.addEventListener('click',()=>{syncCfgToState();ov.classList.add('open');});
  closeBtn.addEventListener('click',()=>ov.classList.remove('open'));
  cancelBtn.addEventListener('click',()=>ov.classList.remove('open'));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ov.classList.contains('open'))ov.classList.remove('open')});

  scopeAll.addEventListener('change',()=>{scopeTabs.forEach(cb=>cb.checked=scopeAll.checked)});
  scopeTabs.forEach(cb=>{cb.addEventListener('change',()=>{
    scopeAll.checked=[...scopeTabs].every(c=>c.checked);
  })});

  fmtBtns.forEach(btn=>{
    if(!btn.classList.contains('disabled'))btn.addEventListener('click',()=>{
      fmtBtns.forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    });
  });

  genBtn.addEventListener('click',async()=>{
    const scope=[...scopeTabs].filter(cb=>cb.checked).map(cb=>cb.dataset.scope);
    if(!scope.length){progress.textContent='S\u00e9lectionnez au moins un onglet.';return}
    const notes=document.getElementById('exportNotes').value.trim();
    genBtn.disabled=true;progress.textContent='Pr\u00e9paration...';
    try{
      await generatePPTX(scope,notes,msg=>{progress.textContent=msg});
      progress.textContent='Export termin\u00e9 !';
      setTimeout(()=>{ov.classList.remove('open');genBtn.disabled=false;progress.textContent=''},2000);
    }catch(err){
      progress.textContent='Erreur : '+err.message;console.error('[Export]',err);
      // Cooldown 3s avant de réactiver le bouton
      setTimeout(()=>{genBtn.disabled=false},3000);
    }
  });
})();
