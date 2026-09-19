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
var gainBoost=0;    // 音量增益（dB，0~+12，整体响度放大，两种风格均生效）
/* 12 段图形均衡：31Hz~16kHz，两端 shelving、中间 peaking，各段 -12~+12 dB */
var EQ_FREQS = [31,62,125,250,500,1000,2000,4000,6000,8000,12000,16000];
var EQ_TYPES = ["lowshelf","peaking","peaking","peaking","peaking","peaking","peaking","peaking","peaking","peaking","peaking","highshelf"];
var eqMap = {};   // 每首歌独立 EQ：{ 曲目标题: [12段dB] }，互不影响
/* 调音曲线预设（哈曼目标曲线形状）：入耳/头戴/音响三种听音设备的出厂调音；
   用户没手动调过该曲时自动套用当前预设，手动调过后以用户为准 */
var EQ_PRESETS = {
  classic:   [0,0,0,0,0,0,0,0,0,0,0,0],             // HiFi 经典：平直 EQ（BOOST 响度另算）
  harman:    [4,4,3.5,3,1.5,0,1,1.5,1,0,-0.5,-1],    // 哈曼卡顿：低频隆起
  moondrop:  [2,2,2,1.5,1,0,1,1,0.5,0,0,0],            // 水月雨：温润中频
  sony:      [2.5,2.5,2,1.5,0.5,0,0.5,1.5,2,2.5,2,1.5]  // 索尼：低频扎实高频通透
};
var preset = "classic";   // 默认 HiFi 经典
function zeros(){ return [0,0,0,0,0,0,0,0,0,0,0,0]; }
function curTitle(){ return playlist[curIdx] ? playlist[curIdx].title : "_"; }
function curEq(){ var t=curTitle(); if(!eqMap[t]) eqMap[t]=zeros(); return eqMap[t]; }
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
function save(){
  var playIntent = playing;
  /* 自己没在播但别的实例握着播放锁（页面藏后台/跳走时的存档）：
     不得把"没在播"写进共享状态，否则会把正在播放的实例/下个页面的续播意图覆盖掉 */
  if(!playing && typeof lockHeldByOther === "function" && lockHeldByOther()){
    var cur = null;
    try{
      var m = document.cookie.match(/(?:^|;\s*)EC_NBS=([^;]*)/);
      if(m) cur = JSON.parse(decodeURIComponent(m[1]));
    }catch(e){}
    if(cur && cur.play) playIntent = true;
  }
  var s = JSON.stringify({
    i:curIdx, t:curTick(), play:playIntent, vol:vol, muted:muted, loop:loopMode, style:styleMode, bg:bgPlay,
    g:gainBoost, eqm:eqMap, preset:preset, ts:Date.now()
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

/* ---------- 音频上下文 ---------- */
var comp=null, verbGain=null, analyser=null, limiter=null;
var boostGain=null, eqFs=[], exciterGain=null;
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
  /* 音量增益节点：整体响度放大，HiFi 与原版两种风格都生效 */
  boostGain = ctx.createGain(); boostGain.gain.value = Math.pow(10, gainBoost/20);
  /* 12 段图形均衡：串接，置于主链路最前 */
  eqFs = [];
  for(var i=0;i<12;i++){
    var f = ctx.createBiquadFilter();
    f.type = EQ_TYPES[i];
    f.frequency.value = EQ_FREQS[i];
    if(f.type === "peaking") f.Q.value = 1.1;
    f.gain.value = curEq()[i];
    eqFs.push(f);
  }
  master.connect(boostGain);
  var prev = boostGain;
  eqFs.forEach(function(f){ prev.connect(f); prev = f; });
  /* 轻空气感混响（仅 HiFi 模式启用） */
  var verb = ctx.createConvolver(); verb.buffer = makeIR(1.6, 2.6);
  verbGain = ctx.createGain();
  var dry = ctx.createGain(); dry.gain.value = 1.0;
  eqFs[11].connect(dry); dry.connect(comp);
  eqFs[11].connect(verb); verb.connect(verbGain); verbGain.connect(comp);
  /* Aural Exciter 激励器：从 EQ 后并联，提取高频→生成二次谐波→混回主信号（带宽扩展/高频重建） */
  var exciterHP1 = ctx.createBiquadFilter(); exciterHP1.type = "highpass"; exciterHP1.frequency.value = 5000;
  var exciterWS = ctx.createWaveShaper();
  /* 二次谐波曲线：x → x + a·x²（生成偶次谐波，模拟 Aphex Exciter 原理） */
  var curveLen = 1024, curve = new Float32Array(curveLen);
  for(var i=0;i<curveLen;i++){
    var x = (i*2)/(curveLen-1) - 1;
    curve[i] = Math.tanh(x + 0.6*x*x);
  }
  exciterWS.curve = curve; exciterWS.oversample = "4x";
  var exciterHP2 = ctx.createBiquadFilter(); exciterHP2.type = "highpass"; exciterHP2.frequency.value = 6000;
  exciterGain = ctx.createGain(); exciterGain.gain.value = 0;
  eqFs[11].connect(exciterHP1); exciterHP1.connect(exciterWS); exciterWS.connect(exciterHP2); exciterHP2.connect(exciterGain); exciterGain.connect(comp);
  /* 专业峰值限制器：链路末级始终生效（与风格无关），增益/EQ 拉多高都不削波——
     母带响度最大化的标准做法，输出峰值钳在 -1dBFS */
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;  // dBFS，硬限制点
  limiter.knee.value = 0;        // 硬拐点 = 限制器（非压缩器）
  limiter.ratio.value = 20;      // 高压缩比 ≈ 砖墙
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  comp.connect(limiter);
  limiter.connect(ctx.destination);
  /* 空间音频：听者位置（正前方），朝向设置 */
  try {
    var lis = ctx.listener;
    lis.positionX.value = 0; lis.positionY.value = 0; lis.positionZ.value = 0;
    if(lis.forwardX){
      lis.forwardX.value = 0; lis.forwardY.value = 0; lis.forwardZ.value = -1;
      lis.upX.value = 0; lis.upY.value = 1; lis.upZ.value = 0;
    }
  } catch(e){}
  /* 频谱分析旁路：接限制器后 = 看最终输出，只读数据供可视化，不接 destination */
  analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .82;
  limiter.connect(analyser);
  applyStyleRouting();
  applyQuality();
  return loadSamples();
}
/* 音质档位：44=标准 / 48=高 / 96=超高解析（限幅更柔和+混响空间更大） */
var quality = "44";
/* 空间环绕：off / on（PannerNode HRTF 3D 声像定位 + BRIR 房间混响） */
var spatialMode = "off";
/* 乐器舞台摆位（专业混音棚布局）：x=左右，y=上下，z=前后（负=远/后） */
var STAGE = {
  basedrum:[0, -0.3, -2.5], snare:[0.8, 0, -2.2], hat:[-0.8, 0.2, -2.3],
  bass:[0, -0.2, -1.5], harp:[0, 0, 0], harp2:[0, 0, 0],
  guitar:[-1.8, 0.3, -0.5], flute:[1.8, 0.5, -0.5],
  bell:[0.5, 1.2, -2.0], chime:[-0.5, 1.2, -2.0],
  xylophone:[2.0, 0.4, -1.0], iron_xylophone:[2.2, 0.4, -1.2],
  cow_bell:[1.5, 0.6, -1.5], didgeridoo:[-2.0, -0.2, -1.8],
  bit:[1.0, 0.8, -2.0], banjo:[-1.5, 0.2, -0.8], pling:[-1.0, 0.1, -0.3]
};
function setSpatial(s){ if(s!=="on"&&s!=="off")return; spatialMode=s; applyQuality(); save(); emit(); }
function getSpatial(){ return spatialMode; }
function applyQuality(){
  if(!limiter || !verbGain) return;
  var rev = 0.16, exc = 0;
  if(quality === "192"){
    limiter.threshold.value = 0;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.15;
    rev = 0.28; exc = 0.28;
  } else if(quality === "96"){
    limiter.threshold.value = -0.3;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.12;
    rev = 0.22; exc = 0.18;
  } else if(quality === "48"){
    limiter.threshold.value = -0.7;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    rev = 0.20; exc = 0.08;
  } else {
    limiter.threshold.value = -1;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    rev = 0.16; exc = 0;
  }
  /* 空间环绕开时加 BRIR 房间混响量 */
  if(spatialMode === "on") rev = Math.min(0.35, rev + 0.08);
  if(verbGain && styleMode==="hifi") verbGain.gain.value = rev;
  if(exciterGain && styleMode==="hifi") exciterGain.gain.value = exc;
}
/* 音质档已锁 44.1kHz（源文件原生采样率），不再提供上采样档位，避免手机发热 */
function setQuality(q){ /* 固定 44，保留 API 兼容但忽略切换 */ return; }
function getQuality(){ return quality; }
var QUALITY_INFO = {
  "44":  { sr:"44.1 kHz", bit:"16 bit", kbps:"1411 kbps", label:"CD 级" },
  "48":  { sr:"48 kHz",  bit:"16 bit", kbps:"1536 kbps", label:"标准" },
  "96":  { sr:"96 kHz",  bit:"24 bit", kbps:"4608 kbps", label:"高解析" },
  "192": { sr:"192 kHz", bit:"32 bit", kbps:"12288 kbps", label:"母带" }
};
function getQualityInfo(){ return QUALITY_INFO[quality] || QUALITY_INFO["48"]; }
/* 根据风格调整路由与混响量 */
function applyStyleRouting(){
  if(!verbGain) return;
  if(styleMode === "raw"){
    /* 原版：真·零处理。关混响、关激励、限幅器不介入、整体增益归一 → 采样原样直出 */
    verbGain.gain.value = 0;
    if(exciterGain) exciterGain.gain.value = 0;
    if(comp){ comp.threshold.value = 0; comp.ratio.value = 1; }   // ratio 1:1 = 不压缩
    if(master) master.gain.value = (muted?0:vol);                  // 不加 BOOST
  } else {
    applyQuality();
    if(comp){ comp.threshold.value = -6; comp.ratio.value = 12; }
    if(master) master.gain.value = (muted?0:vol)*BOOST;
  }
}
/* 应用音量增益 + 当前曲目 12 段均衡到节点（节点未创建时只存变量，创建后调用即生效） */
function applyEQ(){
  if(boostGain) boostGain.gain.value = Math.pow(10, gainBoost/20);
  var eq = curEq();
  var active = eq;
  if(styleMode === "hifi"){
    var untouched = true;
    for(var i=0;i<12;i++){ if(eq[i]!==0){ untouched=false; break; } }
    if(untouched) active = EQ_PRESETS[preset] || EQ_PRESETS.iem;
  }
  for(var i=0;i<12;i++){ if(eqFs[i]) eqFs[i].gain.value = active[i]; }
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
    if(spatialMode==="on" && ctx.createPanner){
      /* 空间环绕：PannerNode HRTF，按层(声部)在舞台上分布——
         每层声部坐一个位置：左右=层pan，前后=层序号(高音靠前/低音靠后)，上下=音高 */
      var panner=ctx.createPanner();
      panner.panningModel="HRTF";
      panner.distanceModel="inverse";
      /* 左右：用层自带 pan，叠加音高微调 */
      var px = pan * 3.0;
      /* 前后+后方：层序号映射，部分声部跑到正后方(Z>0)——
         低音层在远后，高音层在近前，形成环绕包裹感 */
      var layerZ;
      if(layer < 5){
        layerZ = 1.5 + (5-layer)*0.6;   // 低音层在正后方
      } else {
        layerZ = -3.0 + Math.min(1.0, (layer-5)/15) * 4.0;  // 高音层在前方
      }
      /* 上下：音高映射 */
      var py = ((key-45)/24) * 1.5;
      /* 每个音符加微小随机偏移，避免所有音符钉死一点显机械 */
      var jx = ((Math.sin((key*13.7+layer*7.3+when*0.91)*12.9898)*43758.5453)%1)*0.3 - 0.15;
      panner.positionX.value = px + jx;
      panner.positionY.value = py;
      panner.positionZ.value = layerZ;
      panner.refDistance=1.0;
      panner.rolloffFactor=0.4;
      panner.maxDistance=50;
      panner.coneInnerAngle=360;
      panner.coneOuterAngle=360;
      panner.coneOuterGain=0;
      src.connect(g); g.connect(panner); panner.connect(master);
    } else if(ctx.createStereoPanner){
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
    .then(function(j){ song=j; applyEQ(); save(); if(autoplay) doPlay(); emit(); });
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
function clearLock(){
  try{ document.cookie = "ec_nbs_lock=;path=/;max-age=0;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax" + COOKIE_DOM; }catch(e){}
}
/* 本页被卸载/跳走（同标签导航、关标签）时立即释放锁，新页面不用等 5 秒过期就能接管续播 */
window.addEventListener("pagehide", function(){
  if(playing) clearLock();
});
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
  if(playing){ writeLock(); }
  var l = lockHolder();
  /* 别的实例握着新锁：我安静退出（不写共享状态，共享进度由对方维护） */
  if(l && l.id !== _myId && Date.now() - l.ts < 5000 && playing){
    playing=false; clearInterval(schedTimer); stopSrcs(); emit();
    return;
  }
  /* 锁已过期但共享意图是"在播"（原播放标签已关闭/冻结）：本页面接管续播 */
  if(!playing && bgPlay && !lockHeldByOther()){
    var st = load();
    if(st && st.play){
      if(ctx && ctx.state === "running"){ doPlay(); }
      else{ bindGestureResume(); }
    }
  }
}, 300);

function doPlay(){
  if(!song||playing) return;
  ensureCtx().then(function(){
    if(ctx.state==="suspended") ctx.resume();
    if(offsetTick>=song.length){ offsetTick=0; notePtr=0; }
    playing=true; startCtxTime=ctx.currentTime;
    schedTimer=setInterval(schedule,40);
    announcePlay(); /* 写自己的锁：用户手动播放即抢锁，其他页面检测到新锁自动退出 */
    save(); emit();
  });
}
function doPause(){
  if(!playing) return;
  offsetTick=curTick(); playing=false;
  clearInterval(schedTimer); stopSrcs(); save(); emit();
}
function onEnd(){
  var nx = loopMode===1 ? curIdx : (loopMode===2 ? Math.floor(Math.random()*playlist.length) : curIdx+1);
  playing=false; clearInterval(schedTimer); stopSrcs();
  loadTrack(nx,true);
}
function emit(){ listeners.forEach(function(f){ try{f(api);}catch(e){} }); }

/* ---------- 启动：读歌单 + 恢复状态 ---------- */
/* 预恢复持久化设置（增益/EQ/音量等不依赖歌单，先于 manifest 加载完成即可生效，
   避免 UI 首次同步时读到未恢复的默认值 0） */
(function(){
  var st = load();
  if(!st) return;
  if(typeof st.g === "number") gainBoost = Math.max(0, Math.min(12, st.g));
  if(st.vol != null) vol = st.vol; muted = !!st.muted; loopMode = st.loop || 0;
  if(typeof st.bg === "boolean") bgPlay = st.bg;
  if(st.style === "raw" || st.style === "hifi") styleMode = st.style;
  if(st.preset && EQ_PRESETS[st.preset]) preset = st.preset;
  if(st.eqm && typeof st.eqm === "object"){
    Object.keys(st.eqm).forEach(function(t){
      var arr = st.eqm[t];
      if(!Array.isArray(arr)) return;
      var v = zeros();
      for(var i=0;i<12 && i<arr.length;i++){ if(typeof arr[i]==="number") v[i]=Math.max(-12,Math.min(12,arr[i])); }
      eqMap[t] = v;
    });
  }
})();
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
      if(st.eqm && typeof st.eqm==="object"){
        /* 新版：按曲目标题分组的 12 段设置 */
        Object.keys(st.eqm).forEach(function(t){
          var arr = st.eqm[t];
          if(!Array.isArray(arr)) return;
          var v = zeros();
          for(var i=0;i<12 && i<arr.length;i++){ if(typeof arr[i]==="number") v[i]=Math.max(-12,Math.min(12,arr[i])); }
          eqMap[t]=v;
        });
      } else if(st.eq){
        /* 旧版兼容：全局 EQ（12段数组 或 {low,mid,high} 对象）归到当前曲目，其余曲目默认 0 */
        var legacy = zeros();
        if(Array.isArray(st.eq)){
          for(var i=0;i<12 && i<st.eq.length;i++){ if(typeof st.eq[i]==="number") legacy[i]=Math.max(-12,Math.min(12,st.eq[i])); }
        } else if(st.eq && typeof st.eq==="object"){
          if(typeof st.eq.low==="number")  legacy[2] =Math.max(-12,Math.min(12,st.eq.low));
          if(typeof st.eq.mid==="number")  legacy[5] =Math.max(-12,Math.min(12,st.eq.mid));
          if(typeof st.eq.high==="number") legacy[8] =Math.max(-12,Math.min(12,st.eq.high));
        }
        var t = playlist[idx] ? playlist[idx].title : "_";
        eqMap[t] = legacy;
      }
      if(typeof st.g==="number") gainBoost=Math.max(0,Math.min(12,st.g));
    }
    loadTrack(idx,false).then(function(){
      if(st&&st.t){ offsetTick=Math.min(st.t,song.length); notePtr=findPtr(offsetTick); }
      /* 若上次在播放且本次无需手势（部分浏览器允许），尝试直接续播；否则等待手势 */
      if(st&&st.play){ tryResume(); }
      emit();
    });
  }).catch(function(){});

/* 尝试无手势续播（多数桌面浏览器允许；QQ/微信会被拒，转由首次手势触发） */
function tryResume(){
  if(!bgPlay) return;   // 关闭后台播放：不自动续播
  if(lockHeldByOther()){
    /* 旧实例（如跳走前的 bfcache 页面）可能还握着锁：等它过期后重试接管，而不是永久放弃 */
    setTimeout(function(){ if(!playing && bgPlay && !lockHeldByOther()){ var st=load(); if(st&&st.play) tryResume(); } }, 5500);
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
  /* 本页打开即接管续播：先写自己的锁，稍等旧页面退出再播，避免重音 */
  var st=load();
  if(st&&st.play && !playing){
    writeLock();
    ensureCtx().then(function(){
      if(ctx.state==="running"){ setTimeout(doPlay, 500); }
      else{ bindGestureResume(); }
    });
  }
}
/* QQ/微信：首次任意触摸/点击即恢复播放 */
var gestureBound=false;
function bindGestureResume(){
  if(gestureBound) return; gestureBound=true;
  var h=function(){
    var st=load();
    if(st&&st.play && !playing){ ensureCtx().then(function(){ if(ctx.resume)ctx.resume(); doPlay(); }); }
    document.removeEventListener("pointerdown",h,true);
    document.removeEventListener("touchstart",h,true);
    document.removeEventListener("keydown",h,true);
  };
  document.addEventListener("pointerdown",h,true);
  document.addEventListener("touchstart",h,true);
  document.addEventListener("keydown",h,true);
}

/* 切页/隐藏前保存；关闭后台播放时：切后台（切App/锁屏/切标签）自动暂停，回前台自动恢复 */
var bgAutoPaused=false;
window.addEventListener("pagehide",save);
document.addEventListener("visibilitychange",function(){
  if(document.hidden){
    save();
    /* 本页切到后台：立即停播并放锁，让新页面（market/子站）接管续播，杜绝跨标签重音 */
    if(playing){ doPause(); clearLock(); bgAutoPaused = true; }
  } else if(bgAutoPaused){
    bgAutoPaused=false;
    /* 切回来：如果锁还在自己手里（没人抢），恢复播放 */
    if(!lockHeldByOther()){
      ensureCtx().then(function(){ if(ctx.resume)ctx.resume(); doPlay(); });
    }
  }
});
/* bfcache 恢复：页面被浏览器整个冻结后带回来，引擎其实还活着；
   此时同步一次 UI，但不要再次触发续播（否则与原实例叠加） */
window.addEventListener("pageshow",function(e){
  if(e.persisted && playing){ emit(); }
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
  title:function(){ return playlist[curIdx]?playlist[curIdx].title:""; },
  progress:function(){ return song?Math.min(1,curTick()/song.length):0; },
  cur:function(){ return song?curTick()/song.tempo:0; },
  dur:function(){ return song?song.length/song.tempo:0; },
  playlist:function(){ return playlist.map(function(p,i){return{title:p.title,dur:p.dur,on:i===curIdx};}); },
  select:function(i){ doPause(); loadTrack(i,true); },
  onChange:function(f){ if(typeof f==="function") listeners.push(f); },
  resumeIfPlayed: resumeIfPlayed,
  setStyle:function(m){ if(m!=="hifi"&&m!=="raw")return; styleMode=m; applyStyleRouting(); save(); emit(); },
  getStyle:function(){ return styleMode; },
  setPreset:function(p){ if(!EQ_PRESETS[p])return; preset=p; applyEQ(); save(); emit(); },
  getPreset:function(){ return preset; },
  getPresetCurve:function(p){ var k=p||preset; return (EQ_PRESETS[k]||EQ_PRESETS.flat).slice(); },
  setQuality:setQuality,
  getQuality:getQuality,
  getQualityInfo:getQualityInfo,
  setSpatial:setSpatial,
  getSpatial:getSpatial,
  /* 每首歌独立 EQ：setEqFor(title) 编辑任意曲目的设置，互不影响；
     正在播放的曲目实时生效，非播放曲目只存设置，切到它时自动应用 */
  setEqFor:function(title, vals){
    if(typeof title!=="string" || !title) return;
    if(!eqMap[title]) eqMap[title]=zeros();
    var eq = eqMap[title];
    if(Array.isArray(vals)){
      for(var i=0;i<12 && i<vals.length;i++){ if(typeof vals[i]==="number") eq[i]=Math.max(-12,Math.min(12,vals[i])); }
    }
    if(title === curTitle()){ applyEQ(); }
    save(); emit();
  },
  getEqFor:function(title){
    if(!eqMap[title]) return zeros();
    return eqMap[title].slice();
  },
  setEQ:function(vals){ api.setEqFor(curTitle(), vals); },
  getEQ:function(){ return api.getEqFor(curTitle()); },
  setGain:function(v){ gainBoost=Math.max(0,Math.min(12,Number(v))); applyEQ(); save(); emit(); },
  getGain:function(){ return gainBoost; },
  getAnalyser:function(){ return analyser; },
  setBg:function(v){ bgPlay=!!v; save(); emit(); },
  getBg:function(){ return bgPlay; },
  setLoop:function(m){ m=Number(m); if(![0,1,2].includes(m))return; loopMode=m; save(); emit(); },
  getLoop:function(){ return loopMode; },
  cycleLoop:function(){ loopMode=(loopMode+1)%3; save(); emit(); return loopMode; }
};
window.EC_NBS = api;
})();
