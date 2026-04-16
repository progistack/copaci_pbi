// ═══════════════════════════════════════════════════════════════
// COPACI Finance BI — Chart Infrastructure (Chart.js)
// ═══════════════════════════════════════════════════════════════

// ─── GLOBAL EVENTS ───────────────────────────────────────────
const CI={};// Chart instance registry

// Safe chart create — destroys previous instance, registers new one
function cc(key,canvas,cfg){if(CI[key]){CI[key].destroy();delete CI[key]}const c=new Chart(canvas,cfg);CI[key]=c;return c}

// Destroy all charts with a given prefix
function destroyChartsFor(prefix){Object.keys(CI).forEach(k=>{if(k.startsWith(prefix)){CI[k].destroy();delete CI[k]}})}

// ─── CHART.JS PLUGINS ────────────────────────────────────────
// biHoverFX — Tableau-style dim + glow
Chart.register({id:'biHoverFX',
  afterEvent(chart,args){if(args.event.type==='mousemove'){const els=chart.getElementsAtEventForMode(args.event,'nearest',{intersect:false},false);chart.canvas.style.cursor=els.length?'pointer':'default'}},
  afterDatasetsDraw(chart){
    const act=chart.getActiveElements();if(!act.length)return;
    const t=chart.config.type;if(t==='doughnut'||t==='pie'||t==='radar')return;
    const ctx=chart.ctx,ar=chart.chartArea;if(!ar)return;
    const dk=isDark();
    ctx.save();ctx.beginPath();ctx.rect(ar.left,ar.top,ar.right-ar.left,ar.bottom-ar.top);ctx.clip();
    ctx.fillStyle=dk?'rgba(12,18,34,0.85)':'rgba(240,244,248,0.78)';
    ctx.fillRect(ar.left,ar.top,ar.right-ar.left,ar.bottom-ar.top);
    const mp=new Map();act.forEach(e=>{if(!mp.has(e.datasetIndex))mp.set(e.datasetIndex,new Set());mp.get(e.datasetIndex).add(e.index)});
    const gc=dk?'rgba(13,148,136,0.95)':'rgba(13,148,136,0.7)';ctx.shadowColor=gc;
    mp.forEach((idxs,di)=>{const meta=chart.getDatasetMeta(di);if(!meta||meta.hidden)return;
      if(meta.type==='line'){ctx.shadowBlur=10;if(meta.dataset)meta.dataset.draw(ctx);ctx.shadowBlur=22;idxs.forEach(i=>{if(meta.data[i])meta.data[i].draw(ctx)})}
      else{ctx.shadowBlur=22;idxs.forEach(i=>{if(meta.data[i])meta.data[i].draw(ctx)})}});
    ctx.restore()}
});
// biCenterText — center text inside doughnut
Chart.register({id:'biCenterText',
  afterDraw(chart){
    const cfg=chart.options.plugins?.biCenterText;if(!cfg)return;
    const{ctx,chartArea:a}=chart;if(!a)return;
    const cx=(a.left+a.right)/2,cy=(a.top+a.bottom)/2;
    const dk=isDark();
    const ts=cfg.textSize||18,ss=cfg.subSize||10,gap=Math.round(ts*0.55);
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='700 '+ts+'px Inter';ctx.fillStyle=dk?'#f0f0f5':'#0f172a';
    ctx.fillText(cfg.text||'',cx,cy-(cfg.sub?gap/2:0));
    if(cfg.sub){ctx.font='500 '+ss+'px Inter';ctx.fillStyle=dk?'rgba(255,255,255,0.4)':'#64748b';ctx.fillText(cfg.sub,cx,cy+gap)}
    ctx.restore()}
});
if(window.ChartDataLabels)Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels={display:false};
Chart.defaults.font.family='Inter';

// Waterfall chart data builder — floating bars with running totals
function buildWaterfallData(labels,values){
  const totals=new Set(['CA net','Marge brute','EBITDA','EBIT','RCAI','RN','BFR exploit.','BFR total',
    'Flux net d\'exploitation','Flux net d\'investissement','Flux net de financement','Var. nette',
    'FCF','EBITDA N-1','EBITDA N']);
  const bases=[],deltas=[],colors=[];
  let running=0;
  for(let i=0;i<values.length;i++){
    const v=values[i];const isTotal=totals.has(labels[i]);
    if(isTotal){bases.push(0);deltas.push(v);running=v;colors.push(v>=0?toRgba('#0d9488',0.85):toRgba('#ef4444',0.7))}
    else{const bottom=running+Math.min(0,v);bases.push(Math.min(running,running+v));deltas.push(Math.abs(v));running+=v;colors.push(v>=0?toRgba('#10b981',0.65):toRgba('#ef4444',0.55))}
  }
  return{labels,datasets:[
    {label:'',data:bases,backgroundColor:'transparent',borderWidth:0,borderSkipped:false,barPercentage:.6},
    {label:'',data:deltas,backgroundColor:colors,borderRadius:4,borderWidth:0,borderSkipped:false,barPercentage:.6}
  ]};
}

function chartOpts(type='bar',extra={}){
  const dk=isDark();const tc=dk?'#94a3b8':'#64748b';const gc=dk?'rgba(148,163,184,0.15)':'rgba(15,23,42,0.08)';
  return{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:extra.legend!==false,position:'bottom',labels:{color:tc,font:{size:11},boxWidth:12,padding:12}},datalabels:{display:false},tooltip:{backgroundColor:dk?'#1e293b':'#fff',titleColor:dk?'#f0f0f5':'#0f172a',bodyColor:dk?'#94a3b8':'#475569',borderColor:dk?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)',borderWidth:1,cornerRadius:8,padding:10,titleFont:{weight:600}}},
    scales:type==='radar'?{}:{x:{grid:{display:false},ticks:{color:tc,font:{size:10}}},y:{beginAtZero:extra.beginAtZero!==false,grid:{color:gc},ticks:{color:tc,font:{size:10},callback:v=>fmt(v)}}},
    ...extra};
}

// ─── DATALABELS HELPERS ──────────────────────────────────────
// Victor's directive : "sur les graph en barre comme ça, rajoute systématiquement
// la valeur en étiquette de données". Three flavours :
//   - dlBar      : single-dataset vertical bars → label above (or below if neg)
//   - dlStacked  : stacked bars → label inside each segment, hidden if too thin
//   - dlWaterfall: floating bars → label only the delta dataset (idx 1), top
//   - dlHBar     : horizontal stacked bars → label inside each segment
//
// All formatters use fmt() so values render as M FCFA in fr-FR style.
function dlBar(opts={}){
  const dk=isDark();
  return{
    display:true,
    anchor:opts.anchor||'end',
    align:opts.align||'top',
    offset:opts.offset!=null?opts.offset:2,
    color:opts.color||(dk?'#f0f0f5':'#0f172a'),
    font:{size:opts.fontSize||10,weight:'700'},
    clip:false,
    formatter:(v)=>v==null||v===0?'':fmt(v)
  };
}
function dlStacked(opts={}){
  const dk=isDark();
  // Hide labels on segments that are too small to fit text comfortably.
  // Uses the chart's max value as scale reference.
  return{
    display:(ctx)=>{
      const v=ctx.dataset.data[ctx.dataIndex];
      if(v==null||v===0)return false;
      const ds=ctx.chart.data.datasets;
      let maxAbs=0;
      ds.forEach(d=>(d.data||[]).forEach(x=>{if(x!=null&&Math.abs(x)>maxAbs)maxAbs=Math.abs(x)}));
      const threshold=opts.threshold!=null?opts.threshold:0.06;
      return Math.abs(v)/(maxAbs||1)>=threshold;
    },
    anchor:'center',
    align:'center',
    color:opts.color||'#fff',
    font:{size:opts.fontSize||10,weight:'700'},
    textShadowBlur:3,
    textShadowColor:'rgba(0,0,0,0.45)',
    formatter:(v)=>v==null||v===0?'':fmt(v)
  };
}
function dlWaterfall(values,opts={}){
  const dk=isDark();
  return{
    display:(ctx)=>ctx.datasetIndex===1,
    anchor:'end',
    align:'top',
    offset:3,
    clip:false,
    color:opts.color||(dk?'#f0f0f5':'#0f172a'),
    font:{size:opts.fontSize||11,weight:'700'},
    formatter:(_v,ctx)=>{const v=values[ctx.dataIndex];return v==null?'':fmt(v)}
  };
}
function dlHBar(opts={}){
  return dlStacked({...opts,threshold:opts.threshold!=null?opts.threshold:0.05});
}

// ─── SPARKLINE RENDERER ──────────────────────────────────────
function drawSparkline(canvas,data,color='#0d9488',h=32){
  if(!canvas)return;const ctx=canvas.getContext('2d');const w=canvas.width;canvas.height=h;
  ctx.clearRect(0,0,w,h);if(!data||!data.length)return;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
  const pts=data.map((v,i)=>({x:i/(data.length-1)*w,y:h-((v-mn)/rng)*(h-4)-2}));
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++){const cp=(pts[i].x+pts[i-1].x)/2;ctx.bezierCurveTo(cp,pts[i-1].y,cp,pts[i].y,pts[i].x,pts[i].y)}
  ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();
  // Fill
  ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fillStyle=toRgba(color,0.1);ctx.fill();
  // Last point dot
  const last=pts[pts.length-1];ctx.beginPath();ctx.arc(last.x,last.y,2.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
}
