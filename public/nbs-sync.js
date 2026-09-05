/* ============================================================
 * EC NBS 全站共享播放引擎
 * - 真实 Minecraft 音盒采样 + WebAudio HiFi 合成
 * - 开屏手势触发播放（浏览器自动播放策略要求）
 * - 跨页面记住曲目/进度/音量，切页近乎无缝续播
 * 暴露 window.EC_NBS = { play, pause, toggle, next, prev, isPlaying, currentTitle, openPanel }
 * ============================================================ */
(function(){
"use strict";
if(window.EC_NBS) return;

var BASE = window.EC_NBS_BASE || "./music/";   // 共享资源目录（跨域页面可用 EC_NBS_BASE 指向主站）
var SAMPLE_NAMES = ["harp","bass","bassattack","basedrum","snare","hat","guitar","flute",
  "bell","chime","xylophone","iron_xylophone","cow_bell","didgeridoo","bit","banjo","pling","harp2"];
var INST = {0:"harp",1:"bass",2:"basedrum",3:"snare",4:"hat",5:"guitar",
  6:"flute",7:"bell",8:"chime",9:"xylophone",10:"iron_xylophone",
  11:"cow_bell",12:"didgeridoo",13:"bit",14:"banjo",15:"pling"};
var LEVEL = {harp:0.85,harp2:0.85,bass:0.38,bassattack:0.38,guitar:0.72,flute:0.72,
  bell:0.66,chime:0.66,xylophone:0.68,iron_xylophone:0.66,pling:0.75,bit:0.66,banjo:0.72,
  cow_bell:0.6,didgeridoo:0.5,basedrum:0.55,snare:0.45,hat:0.38};

var AC = window.AudioContext || window.webkitAudioContext;
var ctx=null, master=null;
var samples={}, samplesReady=false, ctxStarted=false;
var playlist=[], song=null, curIdx=0;
var playing=false, startCtxTime=0, offsetTick=0, notePtr=0, schedTimer=null, activeSrcs=[];
var vol=1.0, muted=false, loopMode=0, bgPlay=true;   // bgPlay：切页后是否后台续播
var BOOST = 1.35;   // 整体响度补偿（略收，避免低频过载）
var styleMode = "hifi";   // "hifi" = HiFi 增强 | "raw" = 原版 NBS 干声
/* 原版 NBS：所有音色统一音量直出，零配比零处理，和游戏里完全一致 */
var RAW_LEVEL = 1.0;
var BASE_F=87.31;
var listeners=[];

/* ---------- 持久化（跨子域共享） ----------
   状态写 cookie（domain=.ec-crystal-war.com）：主站 / 服务广场（market 子域）/ 任意子域读写同一份；
   localStorage 同步写一份作兜底（旧版本只有 localStorage，首次读时自动迁移） */
var COOKIE_DOM = "";
try{
  var _h = location.hostname;
  if(/(^|\.)ec-crystal-war\.com$/.test(_h)) COOKIE_DOM = ";domain=.ec-crystal-war.com";
}catch(e){}
var _forceWrite = false;   // 主动暂停/操作时强制写共享状态（v:2 里 play:false ⟺ 用户明确暂停）
function save(){
  var playIntent = playing;
  /* 没在播时的顺带保存（切页/调音量/切歌前的快照等）：不得把"没在播"当成"已暂停"写进去——
     否则①从未开播的新访客被打上假暂停指纹（开屏首播无声的根因）；
         ②会覆盖掉别处正在播放的实例/下个页面的续播意图。
     此处一律保留现有意图；全站唯一的 play:false 来源是 _forceWrite（用户明确暂停） */
  if(!playing && !_forceWrite){
    var cur = null;
    try{
      var m = document.cookie.match(/(?:^|;\s*)EC_NBS=([^;]*)/);
      if(m) cur = JSON.parse(decodeURIComponent(m[1]));
    }catch(e){}
    if(!cur){ try{ cur = JSON.parse(localStorage.getItem("EC_NBS")||"null"); }catch(e2){} }
    if(!cur) playIntent = true;                 /* 全新访客：默认意图=播（真开播由开屏/手势触发） */
    else if(intendPlay(cur)) playIntent = true; /* 在播意图或旧版不可信状态：保持/迁移为播 */
    else playIntent = false;                    /* v:2 明确暂停：原样保留 */
  }
  var s = JSON.stringify({
    v:2, i:curIdx, t:curTick(), play:playIntent, vol:vol, muted:muted, loop:loopMode, style:styleMode, bg:bgPlay, ts:Date.now()
  });
  try{ localStorage.setItem("EC_NBS", s); }catch(e){}
  try{ document.cookie = "EC_NBS=" + encodeURIComponent(s) + ";path=/;max-age=31536000;SameSite=Lax" + COOKIE_DOM; }catch(e){}
}
function load(){
  try{
    var m = document.cookie.match(/(?:^|;\s*)EC_NBS=([^;]*)/);
    if(m) return JSON.parse(decodeURIComponent(m[1]));
  }catch(e){}
  try{ return JSON.parse(localStorage.getItem("EC_NBS")||"null"); }catch(e){ return null; }
}
/* 播放意图判定（含旧版状态迁移）：
   v:2 起 play 字段只由"真实播放行为 / 用户明确暂停"写出，可信；
   旧版状态（无 v 字段）的 play:false 不可信——老引擎曾在启动加载谱面时无差别写入，
   大批老访客的 cookie 里因此留着假的"已暂停"。对这些遗留状态一律按默认开播处理，
   自 v:2 起用户的明确暂停才被记住。 */
function intendPlay(st){
  if(!st) return true;         /* 全新访客：默认开 */
  if(st.v !== 2) return true;  /* 旧版遗留：play:false 不可信，按默认开 */
  return !!st.play;
}

/* ---------- 音频上下文 ---------- */
var comp=null, verbGain=null, analyser=null;
function ensureCtx(){
  if(ctx) return Promise.resolve();
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = (muted?0:vol)*BOOST;
  /* 动态范围保护：压缩限幅器，杜绝叠音爆音，同时保留音质细节 */
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;    // dB，接近峰值才介入
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;
  /* 轻空气感混响（仅 HiFi 模式启用） */
  var verb = ctx.createConvolver(); verb.buffer = makeIR(1.6, 2.6);
  verbGain = ctx.createGain();
  var dry = ctx.createGain(); dry.gain.value = 1.0;
  master.connect(dry); dry.connect(comp);
  master.connect(verb); verb.connect(verbGain); verbGain.connect(comp);
  comp.connect(ctx.destination);
  /* 频谱分析旁路：只读数据供可视化，不接 destination（避免声音加倍），不影响播放链路 */
  analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .82;
  comp.connect(analyser);
  applyStyleRouting();
  /* 采样后台加载、不阻塞开播：切页续播立即出声，个别未就绪的音符先跳过（playNote 有保护），
     采样陆续就绪后自动补齐——把跨页间断从秒级压到百毫秒级 */
  loadSamples();
  return Promise.resolve();
}
/* 根据风格调整路由与混响量 */
function applyStyleRouting(){
  if(!verbGain) return;
  if(styleMode === "raw"){
    /* 原版：真·零处理。关混响、限幅器不介入、整体增益归一 → 采样原样直出 */
    verbGain.gain.value = 0;
    if(comp){ comp.threshold.value = 0; comp.ratio.value = 1; }   // ratio 1:1 = 不压缩
    if(master) master.gain.value = (muted?0:vol);                  // 不加 BOOST
  } else {
    verbGain.gain.value = 0.16;
    if(comp){ comp.threshold.value = -6; comp.ratio.value = 12; }
    if(master) master.gain.value = (muted?0:vol)*BOOST;
  }
}
function makeIR(dur, decay){
  var rate=ctx.sampleRate, len=Math.floor(rate*dur);
  var buf=ctx.createBuffer(2,len,rate);
  for(var c=0;c<2;c++){ var d=buf.getChannelData(c);
    for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay)*0.5;
  }
  return buf;
}
function loadSamples(){
  if(samplesReady) return Promise.resolve();
  var jobs = SAMPLE_NAMES.map(function(n){
    return fetch(BASE+"samples/"+n+".ogg")
      .then(function(r){return r.arrayBuffer();})
      .then(function(ab){return ctx.decodeAudioData(ab);})
      .then(function(b){samples[n]=b;})
      .catch(function(){});
  });
  return Promise.all(jobs).then(function(){ samplesReady=true; });
}

/* ---------- 调度 ---------- */
function midiRatio(k){ return Math.pow(2,(k-45)/12); }
function curTick(){ return playing ? offsetTick+(ctx.currentTime-startCtxTime)*song.tempo : offsetTick; }
function findPtr(t){ var lo=0,hi=song.notes.length; while(lo<hi){var m=(lo+hi)>>1; if(song.notes[m][0]<t)lo=m+1; else hi=m;} return lo; }

function schedule(){
  if(!playing||!song) return;
  var horizon = curTick()+song.tempo*0.6, notes=song.notes, layers=song.layers||[];
  while(notePtr<notes.length && notes[notePtr][0]<=horizon){
    var n=notes[notePtr++];
    var when=startCtxTime+(n[0]-offsetTick)/song.tempo;
    if(when<ctx.currentTime-0.05) continue;
    playNote(n[2],n[3],n[1],when,layers);
  }
  if(notePtr>=notes.length && curTick()>=song.length) onEnd();
}
function playNote(inst,key,layer,when,layers){
  var name=INST[inst]||"harp", buf=samples[name]||samples.harp;
  if(!buf) return;
  var src=ctx.createBufferSource(); src.buffer=buf; src.playbackRate.value=midiRatio(key);
  var g=ctx.createGain();
  var lvl;
  if(styleMode === "raw"){
    /* 原版：平坦音量 × 层音量，不做美化 */
    lvl = RAW_LEVEL;
    if(layers[layer]) lvl *= (layers[layer][0]/100);
    g.gain.value = lvl;
    src.connect(g); g.connect(master);   // 直出，不加声像
  } else {
    lvl = LEVEL[name]!=null?LEVEL[name]:0.55;
    if(layers[layer]) lvl *= (layers[layer][0]/100);
    g.gain.value = lvl;
    var pan=0; if(layers[layer]) pan=(layers[layer][1]-100)/100;
    pan+=((key-45)/24)*0.12; pan=Math.max(-1,Math.min(1,pan));
    if(ctx.createStereoPanner){
      var sp=ctx.createStereoPanner(); sp.pan.value=pan;
      src.connect(g); g.connect(sp); sp.connect(master);
    } else { src.connect(g); g.connect(master); }
  }
  src.start(when);
  activeSrcs.push(src);
  src.onended=function(){ var i=activeSrcs.indexOf(src); if(i>=0)activeSrcs.splice(i,1); };
}
function stopSrcs(){ activeSrcs.forEach(function(s){try{s.stop();}catch(e){}}); activeSrcs=[]; }

/* ---------- 控制 ---------- */
function loadTrack(idx, autoplay){
  stopSrcs();
  curIdx=(idx+playlist.length)%playlist.length;
  offsetTick=0; notePtr=0;
  var item=playlist[curIdx];
  emit();
  return fetch(BASE+item.file)
    .then(function(r){return r.json();})
    .then(function(j){
      song=j;
      /* 此处不得无条件 save()：启动加载时 playing=false，会把"未在播"写进共享状态，
         制造出一个假的"用户已暂停"指纹，导致开屏/续播时 playUnlessPaused() 静默拒播。
         真正需要持久化的路径各自负责：doPlay() 开播后 save()，用户主动操作各自 save() */
      if(autoplay||_pendingPlay){ _pendingPlay=false; doPlay(); }
      emit();
    });
}
/* 跨页面/重复实例防护：同源多页或 bfcache 重载时，避免两个引擎同时出声 */
var _bc = null, _myId = Math.random().toString(36).slice(2) + Date.now();
try{
  if(window.BroadcastChannel){
    _bc = new BroadcastChannel("ec_nbs_lock");
    _bc.onmessage = function(e){
      var m = e.data || {};
      /* 别的实例声明开始播放且比我新：我若在播就停掉，杜绝双声叠加 */
      if(m.type === "playing" && m.id !== _myId && playing && m.ts > _playStartedAt){
        doPause();
      }
    };
  }
}catch(e){}
var _playStartedAt = 0;
function announcePlay(){
  _playStartedAt = Date.now();
  try{ if(_bc) _bc.postMessage({type:"playing", id:_myId, ts:_playStartedAt}); }catch(e){}
  writeLock();
}
/* ---------- 跨子域播放锁（cookie 心跳） ----------
   BroadcastChannel 只在同源有效；主站与 market 子域之间用 cookie 锁：
   播放中的实例每 1.5s 刷新锁；其他实例发现锁被更新的实例持有 → 安静退出，杜绝跨标签双声叠加 */
function writeLock(){
  try{ document.cookie = "ec_nbs_lock=" + _myId + "_" + Date.now() + ";path=/;max-age=120;SameSite=Lax" + COOKIE_DOM; }catch(e){}
}
function lockHolder(){
  try{
    var m = document.cookie.match(/(?:^|;\s*)ec_nbs_lock=([^;]*)/);
    if(m){ var p = m[1].split("_"); return { id:p[0], ts:Number(p[1])||0 }; }
  }catch(e){}
  return null;
}
function lockHeldByOther(){
  var l = lockHolder();
  return !!(l && l.id !== _myId && Date.now() - l.ts < 5000);
}
setInterval(function(){
  /* 全站暂停同步：我在播，但共享状态被别的页面在我开始播放之后写成了"暂停"
     → 用户明确关了音乐，本实例也停（pause 是全站意图，不是单页面的） */
  if(playing){
    var st0 = load();
    /* 只认 v:2 的明确暂停；旧版引擎的遗留/误写状态不能叫停正在播放的实例 */
    if(st0 && st0.v===2 && !st0.play && st0.ts > _playStartedAt){
      playing=false; clearInterval(schedTimer); stopSrcs(); save(); emit();
      return;
    }
    writeLock();
  }
  var l = lockHolder();
  /* 别的实例握着新锁：我安静退出（不写共享状态，共享进度由对方维护） */
  if(l && l.id !== _myId && Date.now() - l.ts < 5000 && playing && l.ts > _playStartedAt){
    playing=false; clearInterval(schedTimer); stopSrcs(); emit();
    return;
  }
  /* 锁已过期但共享意图是"在播"（原播放标签已关闭/冻结）：本页面接管续播 */
  if(!playing && bgPlay && !lockHeldByOther()){
    var st = load();
    if(st && intendPlay(st)){
      if(ctx && ctx.state === "running"){ doPlay(); }
      else{ bindGestureResume(); }
    }
  }
}, 1500);

var _pendingPlay=false;   // 谱面未就绪时的待播意图（采样后台加载后 doPlay 可能早于 loadTrack 完成）
function doPlay(){
  if(!song){ _pendingPlay=true; ensureCtx(); return; }   // 先在手势上下文里建好/唤醒 ctx，谱面就绪后自动开播
  if(playing) return;
  ensureCtx().then(function(){
    if(ctx.state==="suspended") ctx.resume();
    if(offsetTick>=song.length){ offsetTick=0; notePtr=0; }
    playing=true; startCtxTime=ctx.currentTime;
    schedTimer=setInterval(schedule,40);
    announcePlay();
    save(); emit();
  });
}
function doPause(){
  if(!playing) return;
  offsetTick=curTick(); playing=false;
  clearInterval(schedTimer); stopSrcs();
  _forceWrite=true; save(); _forceWrite=false;   // 主动暂停 = 全站意图，强制写入共享状态
  emit();
}
function onEnd(){
  var nx = loopMode===1 ? curIdx : (loopMode===2 ? Math.floor(Math.random()*playlist.length) : curIdx+1);
  playing=false; clearInterval(schedTimer); stopSrcs();
  loadTrack(nx,true);
}
function emit(){ listeners.forEach(function(f){ try{f(api);}catch(e){} }); }

/* ---------- 启动：读歌单 + 恢复状态 ---------- */
fetch(BASE+"manifest.json")
  .then(function(r){return r.json();})
  .then(function(list){
    playlist=list;
    var st=load();
    var idx=st&&typeof st.i==="number"?st.i:0;
    if(st){
      vol=st.vol!=null?st.vol:1.0; muted=!!st.muted; loopMode=st.loop||0;
      if(typeof st.bg==="boolean") bgPlay=st.bg;
      if(st.style==="raw"||st.style==="hifi") styleMode=st.style;
    }
    loadTrack(idx,false).then(function(){
      if(st&&st.t){ offsetTick=Math.min(st.t,song.length); notePtr=findPtr(offsetTick); }
      /* 若上次在播放且本次无需手势（部分浏览器允许），尝试直接续播；否则等待手势 */
      if(intendPlay(st)){ tryResume(); }
      emit();
    });
  }).catch(function(){});

/* 启动即武装手势续播：不等谱面/清单加载、不等旧页面的锁过期——
   落到本页后的第一次交互（点链接、点空白、触摸）就按当时状态判定是否开播，
   消除旧版"锁等待 5.5s 期间的首触被漏接"死窗 */
try{ var _st0 = load(); if(intendPlay(_st0)){ bindGestureResume(); } }catch(e){}

/* 尝试无手势续播（多数桌面浏览器允许；QQ/微信会被拒，转由首次手势触发） */
function tryResume(){
  if(!bgPlay) return;   // 关闭后台播放：不自动续播
  if(lockHeldByOther()){
    /* 旧实例（如跳走前的 bfcache 页面）可能还握着锁：等它过期后重试接管，而不是永久放弃。
       正常跳页时旧页面 pagehide 会主动放锁，这里通常一次就过 */
    setTimeout(function(){ if(!playing && bgPlay && !lockHeldByOther()){ var st=load(); if(intendPlay(st)) tryResume(); } }, 5500);
    return;
  }
  ensureCtx().then(function(){
    if(ctx.state==="running"){ doPlay(); }
    else{ bindGestureResume(); }
  });
}
/* 供其他页面调用：本页"上次在播放"时恢复（供 trends 等页 onload 调用，替代开屏手势） */
function resumeIfPlayed(){
  if(!bgPlay) return;   // 关闭后台播放：跨页不续播
  if(lockHeldByOther()){
    setTimeout(function(){ if(!playing && bgPlay && !lockHeldByOther()){ resumeIfPlayed(); } }, 5500);
    return;
  }
  var st=load();
  if(intendPlay(st) && !playing){
    ensureCtx().then(function(){
      if(ctx.state==="running"){ doPlay(); }
      else{ bindGestureResume(); }
    });
  }
}
/* QQ/微信：首次任意触摸/点击即恢复播放。
   注意：handler 里重新读状态再判定——武装时和触发时之间，用户可能在别的页面明确暂停过 */
var gestureBound=false;
function bindGestureResume(){
  if(gestureBound) return; gestureBound=true;
  var unbind=function(){
    document.removeEventListener("pointerdown",h,true);
    document.removeEventListener("touchstart",h,true);
    document.removeEventListener("keydown",h,true);
  };
  var h=function(){
    if(playing){ unbind(); return; }
    var st=load();
    if(!intendPlay(st)){ unbind(); return; }   /* 用户明确暂停过：手势不再自动开播 */
    if(lockHeldByOther()) return;              /* 别的页面正在播：保持待命，等锁释放 */
    ensureCtx().then(function(){ if(ctx.resume)ctx.resume(); doPlay(); unbind(); });
  };
  document.addEventListener("pointerdown",h,true);
  document.addEventListener("touchstart",h,true);
  document.addEventListener("keydown",h,true);
}

/* 切页/隐藏前保存；关闭后台播放时：切后台（切App/锁屏/切标签）自动暂停，回前台自动恢复 */
var bgAutoPaused=false;
window.addEventListener("pagehide",function(){
  save();
  /* 本页即将卸载或进 bfcache：主动释放播放锁，让下一个页面零延迟接管续播，
     不再等 5 秒锁过期（旧版跨页续播的等待空窗就是这么来的） */
  try{ var l=lockHolder(); if(l && l.id===_myId){ document.cookie="ec_nbs_lock=;path=/;max-age=0;SameSite=Lax"+COOKIE_DOM; } }catch(e){}
});
document.addEventListener("visibilitychange",function(){
  if(document.hidden){
    save();
    if(!bgPlay && playing){ doPause(); bgAutoPaused=true; }
  }else if(bgAutoPaused){
    bgAutoPaused=false;
    ensureCtx().then(function(){ if(ctx.resume)ctx.resume(); doPlay(); });
  }
});
/* bfcache 恢复：页面被浏览器整个冻结后带回来，引擎其实还活着；
   先读共享状态——若在别的页面已把音乐关了（全站暂停），本实例也停，不再自响 */
window.addEventListener("pageshow",function(e){
  if(e.persisted){
    var st = load();
    if(playing && st && st.v===2 && !st.play){ doPause(); return; }
    if(playing){ emit(); }
  }
});

/* ---------- 对外 API ---------- */
var api = {
  play:function(){ ensureCtx().then(function(){ if(ctx.resume)ctx.resume(); doPlay(); }); },
  pause:function(){ doPause(); },
  toggle:function(){ playing?doPause():api.play(); },
  next:function(){ doPause(); loadTrack(curIdx+1,true); },
  prev:function(){ if(song&&curTick()/song.tempo>3){offsetTick=0;notePtr=0;if(playing){var p=true;doPause();doPlay();}else{save();emit();}} else {doPause();loadTrack(curIdx-1,true);} },
  seek:function(pct){ if(!song)return; var t=Math.max(0,Math.min(song.length,pct*song.length)); var w=playing; if(playing)doPause(); offsetTick=t; notePtr=findPtr(t); if(w)doPlay(); save(); emit(); },
  setVol:function(v){ vol=Math.max(0,Math.min(1,v)); muted=false; if(master)master.gain.value=(styleMode==="raw"?vol:vol*BOOST); save(); },
  isPlaying:function(){ return playing; },
  /* 全站视角的"正在播"：本页在播，或共享状态在播且锁在别的页面手里（那个页面正在出声） */
  isPlayingAnywhere:function(){
    if(playing) return true;
    var st=load();
    return !!(st && st.play && lockHeldByOther());
  },
  /* 全站暂停：本页在播则本页停；别页在播则写入暂停意图，那个页面心跳 1.5s 内同步停 */
  pauseEverywhere:function(){
    if(playing){ doPause(); }
    else { _forceWrite=true; save(); _forceWrite=false; }
  },
  title:function(){ return playlist[curIdx]?playlist[curIdx].title:""; },
  progress:function(){ return song?Math.min(1,curTick()/song.length):0; },
  cur:function(){ return song?curTick()/song.tempo:0; },
  dur:function(){ return song?song.length/song.tempo:0; },
  playlist:function(){ return playlist.map(function(p,i){return{title:p.title,dur:p.dur,on:i===curIdx};}); },
  select:function(i){ doPause(); loadTrack(i,true); },
  onChange:function(f){ if(typeof f==="function") listeners.push(f); },
  resumeIfPlayed: resumeIfPlayed,
  /* 开屏手势用：首次访问（无状态）/旧版不可信状态/上次在播 → 开播；仅 v:2 的明确暂停才不自动播 */
  playUnlessPaused:function(){ var st=load(); if(intendPlay(st)){ api.play(); } },
  setStyle:function(m){ if(m!=="hifi"&&m!=="raw")return; styleMode=m; applyStyleRouting(); save(); emit(); },
  getStyle:function(){ return styleMode; },
  getAnalyser:function(){ return analyser; },
  setBg:function(v){ bgPlay=!!v; save(); emit(); },
  getBg:function(){ return bgPlay; },
  setLoop:function(m){ m=Number(m); if(![0,1,2].includes(m))return; loopMode=m; save(); emit(); },
  getLoop:function(){ return loopMode; },
  cycleLoop:function(){ loopMode=(loopMode+1)%3; save(); emit(); return loopMode; }
};
window.EC_NBS = api;
})();
