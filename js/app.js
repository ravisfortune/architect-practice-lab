/* ---------- CONFIG ---------- */
// Set SHOW_HINGLISH to false to hide the Hinglish toggle entirely (English-only mode
// for users/deployments where Hinglish isn't wanted). Live AI translate/simplify calls
// still fall back automatically to the Claude API when a pre-generated cache entry is
// missing (e.g. after adding new questions) — add your API key/proxy URL in getHinglish()
// and doSimplify() below when ready to wire that up for a public deployment.

/* ---------- DATA ---------- */
// Base questions embedded here:

const LS_EXTRA = 'cca_extra_v1';
const LS_PROG  = 'cca_progress_v1';
const LS_HI    = 'cca_hinglish_cache_v1';

function loadExtra(){ try{return JSON.parse(localStorage.getItem(LS_EXTRA))||[]}catch(e){return[]} }
function saveExtra(a){ localStorage.setItem(LS_EXTRA, JSON.stringify(a)); }
function loadProg(){ try{return JSON.parse(localStorage.getItem(LS_PROG))||{}}catch(e){return{}} }
function saveProg(p){ localStorage.setItem(LS_PROG, JSON.stringify(p)); }
function loadHiCache(){ try{return JSON.parse(localStorage.getItem(LS_HI))||{}}catch(e){return{}} }
function saveHiCache(c){ localStorage.setItem(LS_HI, JSON.stringify(c)); }

let ALL = [];          // combined questions
let progress = loadProg();
let hiCache = Object.assign({}, PREGEN_HI, PREGEN_HI_CCARF, loadHiCache());
let lang = 'en';       // 'en' | 'hi'

function rebuild(){
  const extra = loadExtra();
  const src = (activeBank==='ccarf') ? CCARF_QUESTIONS : BASE_QUESTIONS;
  const prefix = (activeBank==='ccarf') ? 'c' : 'q';
  // assign stable ids: pre-generated questions keep their numeric id; imported ones get a prefixed key
  ALL = src.concat(activeBank==='guide' ? extra : []).map((x,i)=>({...x, _k: x.id!=null ? (prefix+x.id) : ('x'+x.sc+'|'+(x.q||'').slice(0,40)+'|'+i)}));
}
let activeBank = (localStorage.getItem('cca_active_bank_v1') || 'guide'); // 'guide' | 'ccarf'
rebuild();

/* ---------- STATE ---------- */
let session = null; // {list:[q...], idx, answers:{qk:letter}, name}

/* ---------- HELPERS ---------- */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function scenarios(){
  const m={};
  ALL.forEach(q=>{ (m[q.sc]=m[q.sc]||[]).push(q); });
  return m;
}
function scIcon(name){
  const n=name.toLowerCase();
  if(n.includes('support'))return'🎧';
  if(n.includes('code gen')||n.includes('generation'))return'⚡';
  if(n.includes('research')||n.includes('multi-agent'))return'🔬';
  if(n.includes('continuous')||n.includes(' ci'))return'🔁';
  if(n.includes('conversation'))return'💬';
  if(n.includes('architecture')||n.includes('orchestration'))return'🏗️';
  if(n.includes('tool design')||n.includes('mcp'))return'🔧';
  if(n.includes('claude code'))return'💻';
  if(n.includes('prompt')||n.includes('structured output'))return'✍️';
  if(n.includes('context management')||n.includes('reliability'))return'🧠';
  return'📘';
}
function switchBank(bank){
  activeBank = bank;
  localStorage.setItem('cca_active_bank_v1', bank);
  rebuild();
  renderHome();
}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return a;}
function fmt(s){ // basic markdown-ish -> html for `code`
  if(!s)return'';
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  return s;
}
// split situation vs the bold question prompt
function splitQ(text){
  // last bold segment ending with ? treated as prompt
  const m=text.match(/^(.*?)(\*\*[^*]*\?\*\*)\s*$/s);
  if(m){ return {sit:m[1].trim(), prompt:m[2].replace(/\*\*/g,'').trim()}; }
  return {sit:text, prompt:''};
}

/* ---------- TOAST ---------- */
let toastT;
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ---------- HOME ---------- */
function renderHome(){
  const map=scenarios();
  $('#stTotal').textContent=ALL.length;
  const attempted=ALL.filter(q=>progress[q._k]).length;
  $('#stDone').textContent=attempted;
  const rights=ALL.filter(q=>progress[q._k]&&progress[q._k].correct).length;
  $('#stAcc').textContent=attempted? Math.round(rights/attempted*100)+'%':'—';

  $('#allCnt').textContent=ALL.length;
  const allDone=ALL.filter(q=>progress[q._k]).length;
  $('#allBar').style.width=(ALL.length?allDone/ALL.length*100:0)+'%';

  // bank switcher tabs
  $$('#bankTabs button').forEach(b=>b.classList.toggle('on', b.dataset.bank===activeBank));
  $('#allBtnLabel').textContent = activeBank==='ccarf' ? 'Full Practice — All 162 Questions' : 'Full Mock — All Questions';
  $('#allBtnSub').textContent = activeBank==='ccarf' ? 'Untimed, instant feedback, shuffle mode' : 'Saare scenarios, shuffle mode';
  $('#mockExamCard').style.display = activeBank==='ccarf' ? 'flex' : 'none';

  const scenarioCount = Object.keys(map).length;
  $('#scenarioSub').textContent = `${scenarioCount} topics available`;
}

function renderScenarios(){
  const map=scenarios();
  $('#scenariosSub').textContent = activeBank==='ccarf' ? 'CCAR-F Bank' : 'Official Guide';
  const box=$('#scenarioCards'); box.innerHTML='';
  Object.entries(map).forEach(([name,qs])=>{
    const done=qs.filter(q=>progress[q._k]).length;
    const b=document.createElement('button');
    b.className='scard';
    b.innerHTML=`<div class="ic">${scIcon(name)}</div>
      <div class="meta"><b>${name}</b><small>${done} of ${qs.length} attempted</small>
      <div class="barmini"><i style="width:${qs.length?done/qs.length*100:0}%"></i></div></div>
      <div class="cnt">${qs.length}</div>`;
    b.onclick=()=>startSession(qs, name);
    box.appendChild(b);
  });
}

/* ---------- SESSION ---------- */
function startSession(list, name, doShuffle, examOpts){
  session={ list: doShuffle!==false?shuffle(list):list.slice(), idx:0, name,
    isExam: !!examOpts, examAnswers: examOpts?{}:null,
    examEndsAt: examOpts ? (Date.now()+examOpts.minutes*60*1000) : null,
    examMinutes: examOpts ? examOpts.minutes : null };
  go('quiz'); renderQ();
  if(session.isExam) startExamTimer();
}

function startMockExam(){
  const pool = CCARF_QUESTIONS.map((x,i)=>({...x, _k:'c'+x.id}));
  const chosen = shuffle(pool).slice(0, Math.min(60, pool.length));
  startSession(chosen, 'Mock Exam — CCAR-F', true, {minutes:90});
}

let examTimerInt=null;
function startExamTimer(){
  clearInterval(examTimerInt);
  updateExamTimerUI();
  examTimerInt=setInterval(()=>{
    if(!session || !session.isExam){ clearInterval(examTimerInt); return; }
    const msLeft = session.examEndsAt - Date.now();
    if(msLeft<=0){
      clearInterval(examTimerInt);
      toast('Time up! Exam auto-submit ho raha hai...');
      finishExam();
      return;
    }
    updateExamTimerUI();
  }, 1000);
}
function updateExamTimerUI(){
  const el=$('#examTimer');
  if(!el || !session || !session.isExam) return;
  const msLeft=Math.max(0, session.examEndsAt-Date.now());
  const totalSec=Math.floor(msLeft/1000);
  const m=Math.floor(totalSec/60), s=totalSec%60;
  el.textContent=`⏱️ ${m}:${s.toString().padStart(2,'0')}`;
  el.classList.toggle('low', totalSec<300);
}
function go(id){
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#'+id).classList.add('active');
  if(id!=='quiz'){ $('#jumpBackdrop').classList.remove('show'); $('#jumpSheet').classList.remove('show'); }
  window.scrollTo({top:0,behavior:'smooth'});
}

function curQ(){ return session.list[session.idx]; }

async function renderQ(){
  const q=curQ();
  $('#qSetName').textContent=session.name;
  $('#qCounter').innerHTML=`Question ${session.idx+1} of ${session.list.length} <span class="jchev">▾</span>`;
  if(session.isExam){
    $('#qScore').style.display='none';
    $('#examTimer').style.display='inline-flex';
    updateExamTimerUI();
  } else {
    $('#qScore').style.display='';
    $('#examTimer').style.display='none';
    const right=session.list.filter(x=>progress[x._k]&&progress[x._k].correct).length;
    $('#qScore').textContent=right+' ✓';
  }
  $('#pbar').style.width=((session.idx+1)/session.list.length*100)+'%';
  $('#qScenario').textContent=q.sc;
  if($('#jumpSheet').classList.contains('show')) renderJumpGrid();

  // reset UI
  $('#qExplain').className='explain';
  $('#checkBtn').disabled=true;
  $('#checkBtn').textContent = session.isExam ? (session.idx===session.list.length-1?'Submit Exam':'Next Question →') : 'Check Answer';
  $('#checkBtn').onclick = session.isExam ? examAdvance : doCheck;
  $('#qLoad').classList.remove('show');
  $('#prevBtn').disabled=session.idx===0;

  // content (lang aware) — force English during exam (real exam is English-only)
  await paintContent(q, session.isExam);

  // options
  const optBox=$('#qOpts'); optBox.innerHTML='';
  const saved = session.isExam ? null : progress[q._k];
  q._display.o.forEach(o=>{
    const el=document.createElement('button');
    el.className='opt'; el.dataset.l=o.l;
    el.innerHTML=`<div class="badge">${o.l}</div><div class="otext">${fmt(o.t)}</div><div class="mark"></div>`;
    el.onclick=()=>selectOpt(el);
    optBox.appendChild(el);
  });

  if(session.isExam){
    // restore prior selection in this exam session without revealing correctness
    const prevPick = session.examAnswers[q._k];
    if(prevPick){
      const el=$$('#qOpts .opt').find(o=>o.dataset.l===prevPick);
      if(el){ el.classList.add('sel'); selected=prevPick; $('#checkBtn').disabled=false; }
    }
  } else if(saved){ // already answered -> show locked review
    lockAndReveal(saved.picked);
  }
}

let selected=null;
function selectOpt(el){
  if(el.classList.contains('locked'))return;
  $$('#qOpts .opt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel'); selected=el.dataset.l;
  $('#checkBtn').disabled=false;
  if(session.isExam){
    session.examAnswers[curQ()._k]=selected;
  }
}

function renderJumpGrid(){
  const box=$('#jumpGrid'); box.innerHTML='';
  session.list.forEach((q,i)=>{
    const b=document.createElement('button');
    b.className='jump-num';
    b.textContent=i+1;
    let isAnswered=false, isWrong=false;
    if(session.isExam){
      const picked=session.examAnswers[q._k];
      isAnswered=!!picked;
    } else {
      const p=progress[q._k];
      isAnswered=!!p;
      isWrong = p && !p.correct;
    }
    if(i===session.idx) b.classList.add('current');
    else if(isAnswered) b.classList.add('answered');
    if(isAnswered && isWrong && !session.isExam) b.classList.add('wrong-mark');
    b.onclick=()=>{
      session.idx=i; selected=null; renderQ(); closeJumpSheet();
    };
    box.appendChild(b);
  });
}
function openJumpSheet(){
  renderJumpGrid();
  $('#jumpBackdrop').classList.add('show');
  $('#jumpSheet').classList.add('show');
}
function closeJumpSheet(){
  $('#jumpBackdrop').classList.remove('show');
  $('#jumpSheet').classList.remove('show');
}

function examAdvance(){
  const last=session.idx===session.list.length-1;
  if(last){ finishExam(); return; }
  session.idx++; selected=null; renderQ();
}

function finishExam(){
  clearInterval(examTimerInt);
  go('results');
  const list=session.list;
  let right=0;
  list.forEach(q=>{
    const picked=session.examAnswers[q._k];
    const correctL=q.o.find(o=>o.c).l;
    if(picked===correctL) right++;
  });
  const total=list.length, wrong=total-right, pct=total?Math.round(right/total*100):0;
  const PASS_PCT=80;
  $('#resSet').textContent=session.name;
  $('#resPct').textContent=pct+'%';
  $('#resRight').textContent=right;$('#resWrong').textContent=wrong;$('#resTotal').textContent=total;
  const circ=414.7, fill=$('#ringFill');
  fill.style.strokeDashoffset=circ-(circ*pct/100);
  fill.style.stroke = pct>=PASS_PCT?'var(--good)':'var(--bad)';
  let grade,msg;
  if(pct>=PASS_PCT){grade='🎉 PASS!';msg=`Tumne ${PASS_PCT}% pass threshold cross kar liya (${right}/${total} correct). Real exam ke liye ready ho!`;}
  else{grade='📚 Not yet — Retry';msg=`Pass ke liye ${PASS_PCT}% chahiye (tumhe mila ${pct}%). Explanations review karo aur dobara try karo.`;}
  $('#resGrade').textContent=grade;$('#resMsg').textContent=msg;
  $('#retryBtn').onclick=()=>startMockExam();
  $('#reviewBtn').onclick=()=>{
    // build a review-mode list: mark progress-like state from exam answers for review display
    session.idx=0; session.isExam=false; // switch to review mode: reveals answers, no timer
    list.forEach(q=>{
      const picked=session.examAnswers[q._k];
      const correctL=q.o.find(o=>o.c).l;
      progress[q._k]={correct:picked===correctL, picked: picked||null};
    });
    saveProg(progress);
    go('quiz'); renderQ();
  };
}

function doCheck(){
  if(!selected)return;
  lockAndReveal(selected);
  const q=curQ();
  const correctL=q.o.find(o=>o.c).l;
  const ok=selected===correctL;
  progress[q._k]={correct:ok,picked:selected}; saveProg(progress);
  $('#qScore').textContent=session.list.filter(x=>progress[x._k]&&progress[x._k].correct).length+' ✓';
}

function lockAndReveal(picked){
  const q=curQ();
  const correctL=q.o.find(o=>o.c).l;
  $$('#qOpts .opt').forEach(el=>{
    el.classList.add('locked'); el.classList.remove('sel');
    const l=el.dataset.l;
    if(l===correctL){ el.classList.add('correct'); el.querySelector('.mark').textContent='✓'; }
    if(l===picked && picked!==correctL){ el.classList.add('wrong'); el.querySelector('.mark').textContent='✕'; }
  });
  const ok=picked===correctL;
  const ex=$('#qExplain');
  ex.className='explain show '+(ok?'ok':'no');
  $('#eTitle').innerHTML=ok? '✓ Sahi jawab! (Correct)' : '✕ Galat — dekho sahi answer';
  const corrText=q._display.o.find(o=>o.l===correctL).t;
  $('#eAns').innerHTML=`Correct: <b>${correctL})</b> ${fmt(corrText)}`;
  $('#eBody').innerHTML=fmt(q._display.e);

  const btn=$('#checkBtn');
  const last=session.idx===session.list.length-1;
  btn.disabled=false; btn.textContent=last?'See Results →':'Next Question →';
  btn.onclick=()=>{ if(last){showResults();} else {session.idx++; selected=null; renderQ();} };
}

/* ---------- LANG / HINGLISH ---------- */
async function paintContent(q, forceEnglish){
  let src=q; // {q, o, e}
  if(lang==='hi' && !forceEnglish){
    const hi=await getHinglish(q);
    if(hi) src={q:hi.q,o:hi.o,e:hi.e};
    else src=q;
  }
  q._display={o:src.o,e:src.e};
  const parts=splitQ(src.q);
  $('#qText').innerHTML=fmt(parts.sit)+(parts.prompt?`<span class="prompt">${fmt(parts.prompt)}</span>`:'');
}

async function getHinglish(q){
  const key=q._k;
  if(hiCache[key]) return hiCache[key];
  // show loader
  $('#qLoad').classList.add('show');
  try{
    const payload={
      q:q.q, o:q.o.map(o=>({l:o.l,t:o.t})), e:q.e
    };
    const sys="You are a translator that converts technical exam questions into natural Hinglish (Hindi written in Roman/Latin script, mixed with English). Keep ALL technical terms, code, tool names, file paths, and product names in English exactly as-is (e.g. get_customer, CLAUDE.md, MCP, few-shot, planning mode, Message Batches API). Translate only the connecting/explanatory language into casual Hinglish that an Indian developer would speak. Do NOT translate option identity or change meaning. Output STRICT JSON only, no markdown, no backticks, with this exact shape: {\"q\":\"...\",\"o\":[{\"l\":\"A\",\"t\":\"...\"}],\"e\":\"...\"}. Preserve **bold** markers and `code` backticks.";
    const res=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6",max_tokens:1500,system:sys,
        messages:[{role:"user",content:"Convert to Hinglish. Return JSON only:\n"+JSON.stringify(payload)}]
      })
    });
    const data=await res.json();
    let txt=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
    txt=txt.replace(/```json/g,'').replace(/```/g,'').trim();
    const parsed=JSON.parse(txt);
    // merge correctness back onto options by letter
    const merged={q:parsed.q, e:parsed.e,
      o:q.o.map(orig=>{const t=(parsed.o||[]).find(x=>x.l===orig.l);return{l:orig.l,t:t?t.t:orig.t,c:orig.c};})};
    hiCache[key]=merged; saveHiCache(hiCache);
    $('#qLoad').classList.remove('show');
    return merged;
  }catch(e){
    $('#qLoad').classList.remove('show');
    apiUnavailable();
    return null;
  }
}

// Shown once when the AI API isn't reachable (e.g. static GitHub Pages hosting)
let _apiWarned=false;
function apiUnavailable(){
  if(_apiWarned){ toast('Ye AI feature Claude app me chalta hai'); return; }
  _apiWarned=true;
  toast('AI features (Hinglish + Simple) sirf Claude app me chalte hain');
}

/* ---------- RESULTS ---------- */
function showResults(){
  go('results');
  const list=session.list;
  const right=list.filter(q=>progress[q._k]&&progress[q._k].correct).length;
  const total=list.length, wrong=total-right;
  const pct=total?Math.round(right/total*100):0;
  $('#resSet').textContent=session.name;
  $('#resPct').textContent=pct+'%';
  $('#resRight').textContent=right;$('#resWrong').textContent=wrong;$('#resTotal').textContent=total;
  const circ=414.7, fill=$('#ringFill');
  fill.style.strokeDashoffset=circ-(circ*pct/100);
  fill.style.stroke = pct>=72?'var(--good)':pct>=50?'var(--acc)':'var(--bad)';
  let grade,msg;
  if(pct>=72){grade='🎉 Pass Zone!';msg='Real exam ka passing score 720/1000 hai. Tum us range me ho — keep going!';}
  else if(pct>=50){grade='💪 Almost there';msg='Thoda aur practice, phir passing zone (72%) me aa jaoge.';}
  else{grade='📚 Keep practicing';msg='Explanations dobara review karo, concepts clear ho jaayenge.';}
  $('#resGrade').textContent=grade;$('#resMsg').textContent=msg;
  $('#retryBtn').onclick=()=>startSession(session.list.map(x=>x), session.name);
  $('#reviewBtn').onclick=()=>{session.idx=0;go('quiz');renderQ();};
}

/* ---------- IMPORT ---------- */
function normalizeImport(raw){
  // accept our format OR the guide format with options[].letter/correct
  return raw.map(x=>{
    if(x.o) return {sc:x.sc||x.scenario||'Custom',q:x.q||x.situation||'',o:x.o.map(o=>({l:o.l||o.letter,t:o.t||o.text,c:!!(o.c||o.correct)})),e:x.e||x.explanation||''};
    if(x.options) return {sc:x.scenario||x.sc||'Custom',q:x.situation||x.q||'',o:x.options.map(o=>({l:o.letter,t:o.text,c:!!o.correct})),e:x.explanation||x.e||''};
    return null;
  }).filter(Boolean).filter(x=>x.o && x.o.length>=2 && x.o.some(o=>o.c));
}

/* ---------- EVENTS ---------- */
$('#allBtn').onclick=()=>startSession(ALL, activeBank==='ccarf' ? 'Full Practice — All 162 Questions' : 'Full Mock — All Questions');
$$('#bankTabs button').forEach(b=>{ b.onclick=()=>switchBank(b.dataset.bank); });
$('#mockExamCard').onclick=()=>startMockExam();
$('#scenarioBtn').onclick=()=>{ renderScenarios(); go('scenarios'); };
$('#scenariosBack').onclick=()=>{ go('home'); renderHome(); };
$('#quizBack').onclick=()=>{go('home');renderHome();$('#pbar').style.width='0';};
$('#qJumpBtn').onclick=()=>openJumpSheet();
$('#jumpClose').onclick=()=>closeJumpSheet();
$('#jumpBackdrop').onclick=()=>closeJumpSheet();
$('#resBack').onclick=()=>{go('home');renderHome();};
$('#prevBtn').onclick=()=>{if(session.idx>0){session.idx--;selected=null;renderQ();}};
$('#nextBtn').onclick=()=>{if(session.idx<session.list.length-1){session.idx++;selected=null;renderQ();}else{showResults();}};

// lang toggle
$$('#langToggle button').forEach(b=>{
  b.onclick=async()=>{
    if(b.dataset.lang===lang)return;
    $$('#langToggle button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); lang=b.dataset.lang;
    if($('#quiz').classList.contains('active')){
      // re-render current question in new lang, keep answered state
      const q=curQ();
      await paintContent(q);
      // repaint options text
      const saved=progress[q._k];
      $$('#qOpts .opt').forEach(el=>{
        const o=q._display.o.find(x=>x.l===el.dataset.l);
        if(o) el.querySelector('.otext').innerHTML=fmt(o.t);
      });
      if(saved){ // refresh explanation text
        const correctL=q.o.find(o=>o.c).l;
        const corrText=q._display.o.find(o=>o.l===correctL).t;
        $('#eAns').innerHTML=`Correct: <b>${correctL})</b> ${fmt(corrText)}`;
        $('#eBody').innerHTML=fmt(q._display.e);
      }
    }
    if(typeof openChapter==='function' && $('#reader').classList.contains('active')){
      openChapter(curCh); // re-render reader so simplify language + tags update
    }
    if($('#heroSub')) $('#heroSub').textContent = lang==='hi'
      ? 'Har question ko Hinglish me padho, instant answer aur explanation ke saath. Scenario chuno aur practice shuru.'
      : 'Practice questions with instant answers, explanations aur Hinglish support. Ek scenario chuno aur shuru karo.';
    toast(lang==='hi'?'Hinglish mode on — questions auto-translate honge':'English mode on');
  };
});

// import modal
$('#importBtn').onclick=()=>$('#importModal').classList.add('show');
$('#importCancel').onclick=()=>$('#importModal').classList.remove('show');
$('#importModal').onclick=e=>{if(e.target.id==='importModal')$('#importModal').classList.remove('show');};
$('#importSave').onclick=()=>{
  const raw=$('#importArea').value.trim();
  if(!raw){toast('Pehle JSON paste karo');return;}
  try{
    let parsed=JSON.parse(raw);
    if(!Array.isArray(parsed))parsed=[parsed];
    const norm=normalizeImport(parsed);
    if(!norm.length){toast('Valid questions nahi mile — format check karo');return;}
    const extra=loadExtra().concat(norm); saveExtra(extra);
    rebuild(); renderHome();
    $('#importArea').value='';$('#importModal').classList.remove('show');
    toast(norm.length+' questions add ho gaye ✓');
  }catch(e){toast('JSON invalid hai — syntax check karo');}
};

$('#resetBtn').onclick=()=>{
  if(confirm('Sara progress reset kar de? (Added questions safe rahenge)')){
    progress={};saveProg(progress);renderHome();toast('Progress reset ✓');
  }
};

/* ================= LEARN / THEORY ================= */
const LS_SIMP='cca_simplify_cache_v1';
const LS_READ='cca_read_v1';
function loadSimp(){try{return JSON.parse(localStorage.getItem(LS_SIMP))||{}}catch(e){return{}}}
function saveSimp(c){localStorage.setItem(LS_SIMP,JSON.stringify(c));}
function loadRead(){try{return JSON.parse(localStorage.getItem(LS_READ))||{}}catch(e){return{}}}
function saveRead(r){localStorage.setItem(LS_READ,JSON.stringify(r));}
let simpCache=Object.assign({}, PREGEN_SIMP, loadSimp());
let readCh=loadRead();
let curCh=0;

/* ---- markdown -> html renderer ---- */
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderInline(s){
  // code first (protect), then bold
  const codes=[];
  s=s.replace(/`([^`]+)`/g,(m,p1)=>{codes.push(p1);return '\u0000'+(codes.length-1)+'\u0000';});
  s=esc(s);
  s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
  s=s.replace(/\u0000(\d+)\u0000/g,(m,i)=>'<code>'+esc(codes[+i])+'</code>');
  return s;
}
function renderMD(md){
  const lines=md.split('\n');
  let html='',i=0;
  while(i<lines.length){
    let line=lines[i];
    // code block
    if(/^```/.test(line.trim())){
      const lang=line.trim().slice(3);
      let code=[];i++;
      while(i<lines.length && !/^```/.test(lines[i].trim())){code.push(lines[i]);i++;}
      i++; // skip closing
      html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';
      continue;
    }
    // table
    if(line.includes('|') && i+1<lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[i+1])){
      const rows=[];
      const header=line;
      i+=2; // skip header + separator
      const body=[];
      while(i<lines.length && lines[i].includes('|')){body.push(lines[i]);i++;}
      const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      let t='<div class="tbl-wrap"><table><thead><tr>';
      cells(header).forEach(c=>t+='<th>'+renderInline(c)+'</th>');
      t+='</tr></thead><tbody>';
      body.forEach(r=>{t+='<tr>';cells(r).forEach(c=>t+='<td>'+renderInline(c)+'</td>');t+='</tr>';});
      t+='</tbody></table></div>';
      html+=t;continue;
    }
    // blockquote
    if(/^>\s?/.test(line)){
      let bq=[];
      while(i<lines.length && /^>\s?/.test(lines[i])){bq.push(lines[i].replace(/^>\s?/,''));i++;}
      html+='<blockquote>'+renderInline(bq.join(' '))+'</blockquote>';continue;
    }
    // list
    if(/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)){
      const ordered=/^\s*\d+\.\s+/.test(line);
      let items=[];
      while(i<lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))){
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/,''));i++;
      }
      html+=(ordered?'<ol>':'<ul>')+items.map(it=>'<li>'+renderInline(it)+'</li>').join('')+(ordered?'</ol>':'</ul>');
      continue;
    }
    // heading (#### style bold line) - treat **X:** standalone as h4
    if(/^\s*$/.test(line)){i++;continue;}
    // paragraph: gather until blank
    let para=[line];i++;
    while(i<lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i].trim())
      && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])
      && !(lines[i].includes('|') && i+1<lines.length && /^[\s:|-]+$/.test((lines[i+1]||'').replace(/\|/g,'')))
      && !/^>\s?/.test(lines[i])){
      para.push(lines[i]);i++;
    }
    let ptext=para.join(' ');
    // full-line bold as subheading
    const hm=ptext.match(/^\*\*(.+?):\*\*\s*$/);
    if(hm){html+='<h4>'+renderInline(hm[1])+'</h4>';}
    else html+='<p>'+renderInline(ptext)+'</p>';
  }
  return html;
}

/* ---- chapter list ---- */
function renderChapters(){
  const box=$('#chapList');box.innerHTML='';
  THEORY.forEach((ch,idx)=>{
    const done=readCh[idx];
    const b=document.createElement('button');
    b.className='chap'+(done?' read':'');
    b.innerHTML=`<div class="num">${done?'✓':idx+1}</div>
      <div class="meta"><b>${renderInline(ch.title)}</b><small>${ch.sections.length} topics</small></div>
      <div class="chev">›</div>`;
    b.onclick=()=>openChapter(idx);
    box.appendChild(b);
  });
}

/* ---- reader ---- */
function openChapter(idx){
  curCh=idx;
  const ch=THEORY[idx];
  go('reader');
  $('#rChTitle').textContent=(idx+1)+'. '+ch.title.replace(/`/g,'');
  $('#rChSub').textContent='Chapter '+(idx+1)+' of '+THEORY.length;
  $('#rIntro').innerHTML='<b>Ek line me:</b> '+renderInline(ch.intro);
  const list=$('#secList');list.innerHTML='';
  ch.sections.forEach((sec,si)=>{
    const secEl=document.createElement('div');
    secEl.className='sec';
    const numMatch=sec.h.match(/^([\d.]+)\s*(.*)$/);
    const snum=numMatch?numMatch[1]:'';
    const stitle=numMatch?numMatch[2]:sec.h;
    secEl.innerHTML=`
      <div class="sec-head"><span class="sn">${snum}</span><span class="st">${renderInline(stitle)}</span><span class="ex">›</span></div>
      <div class="sec-body">
        <div class="simplify-bar">
          <button class="simp-btn" data-act="simplify">✨ Simple me samjhao</button>
          <span class="simp-tag">beginner-friendly ${lang==='hi'?'Hinglish':'English'}</span>
        </div>
        <div class="simp-slot"></div>
        <div class="md">${renderMD(sec.c)}</div>
      </div>`;
    const head=secEl.querySelector('.sec-head');
    head.onclick=()=>secEl.classList.toggle('open');
    const simpBtn=secEl.querySelector('.simp-btn');
    simpBtn.onclick=(e)=>{e.stopPropagation();doSimplify(idx,si,sec,secEl);};
    list.appendChild(secEl);
  });
  // open first section by default
  const first=list.querySelector('.sec');if(first)first.classList.add('open');
  // mark read
  readCh[idx]=true;saveRead(readCh);
  $('#rPrevCh').disabled=idx===0;
  $('#rPrevCh').style.opacity=idx===0?'.4':'1';
  $('#rNextCh').textContent=idx===THEORY.length-1?'Done — back to list':'Next Chapter ›';
  window.scrollTo({top:0,behavior:'smooth'});
}

async function doSimplify(chIdx,secIdx,sec,secEl){
  const key=chIdx+'.'+secIdx+'.'+lang;
  const slot=secEl.querySelector('.simp-slot');
  const btn=secEl.querySelector('.simp-btn');
  if(simpCache[key]){ renderSimpBox(slot, simpCache[key]); btn.style.display='none'; return; }
  btn.disabled=true;
  const old=btn.innerHTML;
  btn.innerHTML='<span class="spin" style="border-top-color:#fff"></span> Soch raha hoon…';
  try{
    const langLine = lang==='hi'
      ? "Explain in simple casual Hinglish (Hindi in Roman script mixed with English). Keep ALL technical terms, code, tool names, file names in English exactly (e.g. CLAUDE.md, tool_use, stop_reason, MCP)."
      : "Explain in very simple beginner English. Short sentences.";
    const sys="You are a friendly teacher explaining a Claude/AI-architecture exam concept to a COMPLETE BEGINNER developer. "+langLine+
      " Rules: (1) Start with a one-line real-world analogy. (2) Then explain the core idea in 3-5 short simple sentences. (3) Then '**Yaad rakhne wali baat:**' with 2-3 bullet points of the most exam-important takeaways. Keep it short and punchy, under 180 words. Use simple **bold** for key terms and `backticks` for code/tool names. Do NOT invent facts beyond the source. Output plain text/markdown, no headings with #.";
    const src="TOPIC: "+sec.h+"\n\nSOURCE MATERIAL:\n"+sec.c;
    const res=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:900,system:sys,
        messages:[{role:"user",content:src}]})
    });
    const data=await res.json();
    let txt=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('').trim();
    if(!txt) throw new Error('empty');
    simpCache[key]=txt;saveSimp(simpCache);
    renderSimpBox(slot,txt);
    btn.style.display='none';
  }catch(e){
    btn.disabled=false;btn.innerHTML=old;
    apiUnavailable();
  }
}
function renderSimpBox(slot,txt){
  slot.innerHTML=`<div class="simplebox"><div class="sbh">✨ Simple explanation</div><div class="md">${renderMD(txt)}</div></div>`;
}

/* ---- reader nav ---- */
$('#readerBack').onclick=()=>{go('learn');renderChapters();};
$('#rPrevCh').onclick=()=>{if(curCh>0)openChapter(curCh-1);};
$('#rNextCh').onclick=()=>{if(curCh<THEORY.length-1)openChapter(curCh+1);else{go('learn');renderChapters();}};

/* ================= TAB SWITCHING ================= */
function switchTab(tab){
  $$('#bnav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  if(tab==='practice'){go('home');renderHome();$('#pbar').style.width='0';}
  else{go('learn');renderChapters();$('#pbar').style.width='0';}
}
$$('#bnav button').forEach(b=>{ b.onclick=()=>switchTab(b.dataset.tab); });

// keep bottom-nav highlight synced when navigating between sub-screens
const _origGo=go;
go=function(id){
  _origGo(id);
  const learnScreens=['learn','reader'];
  const practiceScreens=['home','quiz','results'];
  if(learnScreens.includes(id)) $$('#bnav button').forEach(b=>b.classList.toggle('on',b.dataset.tab==='learn'));
  if(practiceScreens.includes(id)) $$('#bnav button').forEach(b=>b.classList.toggle('on',b.dataset.tab==='practice'));
};

/* ---------- INIT ---------- */
if(!CONFIG.SHOW_HINGLISH){
  // English-only deployment: hide the toggle entirely and lock language to English
  lang='en';
  const lt=document.getElementById('langToggle');
  if(lt) lt.style.display='none';
}
renderHome();
