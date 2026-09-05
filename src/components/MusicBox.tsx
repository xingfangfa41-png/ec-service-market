import { useEffect, useRef, useState } from "react";

/* EC 全站共享音乐盒（与主站同一引擎 window.EC_NBS、同一份跨子域 cookie 状态）
   引擎脚本在 index.html 里通过 /nbs-sync.js 加载，资源走主站 EC_NBS_BASE */

declare global {
  interface Window {
    EC_NBS?: any;
  }
}

const CSS = `
.ec-music-root{--gold:#FFD700;--line-soft:rgba(255,255,255,.10);--ink-2:#8a8478;--ink-3:#5a5448}
.ec-fab{position:fixed;right:16px;bottom:18px;z-index:600;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,202,52,.4);
  background:radial-gradient(circle at 35% 30%,#2a2416,#14100a 70%);color:var(--gold);cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 20px rgba(0,0,0,.5);transition:transform .18s,box-shadow .25s}
.ec-fab:hover{transform:scale(1.07)}
.ec-fab:active{transform:scale(.94)}
.ec-fab.playing{box-shadow:0 0 0 0 rgba(255,202,52,.45);animation:ecFabPulse 1.8s ease-out infinite}
@keyframes ecFabPulse{0%{box-shadow:0 0 0 0 rgba(255,202,52,.4)}70%{box-shadow:0 0 0 12px rgba(255,202,52,0)}100%{box-shadow:0 0 0 0 rgba(255,202,52,0)}}
.ec-fab .eqmini{position:absolute;right:-1px;top:-1px;width:11px;height:11px;border-radius:50%;background:var(--gold);display:none}
.ec-fab.playing .eqmini{display:block;animation:ecFabDot 1s ease-in-out infinite}
@keyframes ecFabDot{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1);opacity:1}}
.music-drawer{position:fixed;inset:0;z-index:700;display:none}
.music-drawer.open{display:block}
.music-mask{position:absolute;inset:0;background:rgba(4,4,8,.7);backdrop-filter:blur(4px)}
.music-panel{position:absolute;top:0;right:0;bottom:0;width:min(520px,100%);background:#0c0c14;border-left:1px solid var(--line-soft);display:flex;flex-direction:column;animation:ecSlideIn .3s cubic-bezier(.22,1,.36,1)}
@keyframes ecSlideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
.music-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line-soft)}
.music-head b{font-size:14px;letter-spacing:.1em;color:#e8e4dc}
.music-head button{background:none;border:1px solid var(--line-soft);color:var(--ink-2);border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;transition:.18s}
.music-head button:hover{color:var(--gold);border-color:rgba(255,202,52,.4)}
.np-body{flex:1;overflow-y:auto;padding:18px 18px 30px;-webkit-overflow-scrolling:touch}
.np-hero{position:relative;text-align:center;padding:10px 0 4px}
.np-disc{position:relative;width:170px;height:170px;margin:0 auto 14px;border-radius:50%;
  background:repeating-radial-gradient(circle at 50% 50%,#0d0d12 0 1.6px,#16161d 1.6px 3.2px);
  box-shadow:0 14px 40px rgba(0,0,0,.65),inset 0 0 0 1px rgba(255,255,255,.05);
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.np-disc::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:conic-gradient(from 210deg,transparent 0deg,rgba(255,255,255,.09) 18deg,transparent 40deg,transparent 170deg,rgba(255,255,255,.05) 195deg,transparent 220deg)}
.np-disc span{position:relative;z-index:2;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 35% 30%,#ffe08a,#eda91c 75%);font-size:24px;color:#14100a}
.np-disc.spin{animation:ecSpin 7s linear infinite}
@keyframes ecSpin{to{transform:rotate(360deg)}}
.np-disc.spin::before{content:"";position:absolute;inset:-14px;border-radius:50%;border:1.5px solid rgba(255,202,52,.28);
  box-shadow:0 0 26px rgba(255,202,52,.16),inset 0 0 18px rgba(255,202,52,.08);animation:ecAura 2.6s ease-in-out infinite}
@keyframes ecAura{0%,100%{opacity:.45;transform:scale(.97)}50%{opacity:1;transform:scale(1.03)}}
.np-title{font-size:20px;font-weight:600;color:#e8e4dc;letter-spacing:.02em}
.np-sub{font-size:11.5px;color:var(--ink-3);letter-spacing:.14em;margin-top:4px}
.np-spec{position:absolute;left:0;right:0;bottom:-6px;width:100%;height:44px;pointer-events:none;opacity:.9}
.np-prog{padding:20px 6px 6px}
.np-bar{position:relative;height:5px;border-radius:3px;background:rgba(255,255,255,.08);cursor:pointer;touch-action:none}
.np-fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#d9a019,#ffe08a);width:0}
.np-dot{position:absolute;top:50%;left:0;width:13px;height:13px;border-radius:50%;background:#fff7e0;box-shadow:0 0 8px rgba(255,202,52,.6);transform:translate(-50%,-50%)}
.np-times{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-3);margin-top:7px;font-variant-numeric:tabular-nums}
.np-ctrl{display:flex;align-items:center;justify-content:center;gap:26px;padding:14px 0 6px}
.np-btn{background:none;border:none;color:#8a8478;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s,transform .15s}
.np-btn:active{transform:scale(.9)}
.np-btn.big{width:60px;height:60px;border-radius:50%;background:linear-gradient(160deg,#ffe08a 0%,#ffca34 45%,#eda91c 100%);color:#14100a;
  box-shadow:0 8px 24px rgba(255,202,52,.38),inset 0 1px 0 rgba(255,255,255,.5);transition:transform .18s,box-shadow .25s}
.np-btn.big:hover{transform:scale(1.06);box-shadow:0 10px 30px rgba(255,202,52,.5),inset 0 1px 0 rgba(255,255,255,.55)}
.np-btn.big:active{transform:scale(.94)}
.np-btn.mid{width:42px;height:42px;color:#e8e4dc}
.np-btn.mid:hover{color:var(--gold)}
.np-vol{display:flex;align-items:center;gap:10px;padding:4px 6px 14px}
.np-vol .np-vico{display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--ink-3);transition:color .2s}
.np-vol:hover .np-vico{color:rgba(255,215,0,.55)}
.np-vol input{flex:1;accent-color:#d9a019;height:24px}
.np-style{display:flex;align-items:center;gap:12px;padding:0 6px 14px}
.np-style-lbl{font-size:12px;color:var(--ink-3);letter-spacing:.08em;flex-shrink:0}
.np-style-seg{flex:1;display:flex;border:1px solid var(--line-soft);border-radius:9px;overflow:hidden}
.np-style-seg button{flex:1;background:none;border:none;color:var(--ink-3);font-size:12px;padding:7px 0;cursor:pointer;transition:.18s;letter-spacing:.04em}
.np-style-seg button.on{background:rgba(255,202,52,.12);color:var(--gold)}
.np-bgrow{padding-bottom:10px}
.np-bgdesc{flex:1;font-size:11px;color:var(--ink-3);opacity:.75;letter-spacing:.02em}
.np-sw{position:relative;display:inline-block;width:38px;height:22px;flex-shrink:0}
.np-sw input{display:none}
.np-sw i{position:absolute;inset:0;border-radius:11px;background:rgba(255,255,255,.10);border:1px solid var(--line-soft);transition:.22s;cursor:pointer}
.np-sw i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#8a8578;transition:.22s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.np-sw input:checked+i{background:rgba(255,202,52,.18);border-color:rgba(255,202,52,.55)}
.np-sw input:checked+i::after{left:18px;background:var(--gold);box-shadow:0 0 8px rgba(255,202,52,.5)}
.np-listhead{font-size:11.5px;color:var(--ink-3);letter-spacing:.14em;padding:8px 4px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between}
.np-listhead-l{display:flex;align-items:center;gap:8px}
.np-modebtn{background:none;border:none;color:#8a8478;cursor:pointer;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;transition:.15s}
.np-modebtn:hover{color:var(--gold)}
.np-modebtn.on{color:var(--gold);filter:drop-shadow(0 0 5px rgba(255,202,52,.5))}
.np-modetxt{font-size:11.5px;color:var(--ink-3);letter-spacing:.14em;transition:.15s;cursor:pointer}
.np-modetxt.on{color:var(--gold)}
.np-track{display:flex;align-items:center;gap:12px;padding:11px 10px;border-radius:10px;cursor:pointer;transition:.15s;position:relative}
.np-track:hover{background:rgba(255,255,255,.03)}
.np-track.on{background:linear-gradient(90deg,rgba(255,202,52,.10),rgba(255,202,52,.03))}
.np-track.on::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:linear-gradient(180deg,#ffe08a,#d9a019);box-shadow:0 0 8px rgba(255,202,52,.45)}
.np-track .nidx{width:22px;text-align:center;font-size:12px;color:var(--ink-3)}
.np-track.on .nidx{display:none}
.np-track .nti{flex:1;min-width:0}
.np-track .nti b{display:block;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e8e4dc}
.np-track.on .nti b{color:#ffe08a}
.np-track .nti i{display:block;font-style:normal;font-size:11px;color:var(--ink-3);margin-top:2px}
.np-track .ndur{font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.np-eq{display:none;gap:2.5px;align-items:flex-end;height:13px;width:16px}
.np-track.on .np-eq{display:flex}
.np-eq i{width:3px;background:var(--gold);border-radius:2px;animation:ecEq .9s ease-in-out infinite}
.np-eq i:nth-child(1){height:60%}.np-eq i:nth-child(2){height:100%;animation-delay:.25s}.np-eq i:nth-child(3){height:40%;animation-delay:.5s}
.np-eq.paused i{animation-play-state:paused;height:25% !important}
@keyframes ecEq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.np-tip{font-size:11px;color:var(--ink-3);text-align:center;padding:12px 0 0;line-height:1.7}
`;

function fmt(s: number) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  return m + ":" + ("0" + (s % 60)).slice(-2);
}

const MODE_ICONS = [
  <svg key="0" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>,
  <svg key="1" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/><text x="12" y="16" fontSize="10" textAnchor="middle" fill="currentColor" fontWeight="bold">1</text></svg>,
  <svg key="2" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 9.2L7.4 6H3v2h3.6l3.2 3.2.8-2zm6.8 9.8L14.2 16l.8-2 3.2 3H21v2h-3.6zM14 4h7v2h-4.4l-1.9 1.9-.8-2L16.6 4H14zM3 18h4.4l7-7 2.4-2.4L18.2 7H14V5h7v2"/></svg>,
];
const MODE_NAMES = ["顺序", "单曲", "随机"];
const MODE_TITLES = ["顺序播放", "单曲循环", "随机播放"];

interface TrackItem { title: string; dur: number; on: boolean }

export default function MusicBox() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState("");
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [vol, setVol] = useState(100);
  const [style, setStyle] = useState("hifi");
  const [bg, setBg] = useState(true);
  const [loop, setLoop] = useState(0);
  const [list, setList] = useState<TrackItem[]>([]);
  const specRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const N = () => window.EC_NBS;

  /* 引擎状态 → React state */
  const sync = () => {
    const e = N(); if (!e) return;
    setPlaying(!!(e.isPlayingAnywhere ? e.isPlayingAnywhere() : e.isPlaying()));
    setTitle(e.title() || "");
    setDur(e.dur());
    setList(e.playlist());
    if (e.getStyle) setStyle(e.getStyle());
    if (e.getBg) setBg(e.getBg());
    if (e.getLoop) setLoop(e.getLoop());
  };

  useEffect(() => {
    /* 引擎就绪：订阅变化 + 恢复上次播放（跨页续播） */
    const t = setInterval(() => {
      if (N()) {
        N().onChange(sync);
        if (N().resumeIfPlayed) N().resumeIfPlayed();
        sync();
        /* 音量条初始 = 引擎当前音量 */
        try {
          const st = JSON.parse(localStorage.getItem("EC_NBS") || "{}");
          setVol(Math.round((st.vol != null ? st.vol : 1) * 100));
        } catch { /* ignore */ }
        clearInterval(t);
      }
    }, 150);
    return () => clearInterval(t);
  }, []);

  /* 进度刷新 */
  useEffect(() => {
    const t = setInterval(() => {
      const e = N();
      if (e && e.isPlaying()) setCur(e.cur());
    }, 150);
    return () => clearInterval(t);
  }, []);

  /* 频谱条（抽屉打开时运行） */
  useEffect(() => {
    if (!open) return;
    const cv = specRef.current; if (!cv) return;
    const sx = cv.getContext("2d"); if (!sx) return;
    let run = true, analyser: any = null, data: Uint8Array | null = null;
    const w = cv.clientWidth || 320;
    cv.width = w * 2; cv.height = 88;
    const draw = () => {
      if (!run) return;
      const e = N();
      if (!analyser && e && e.getAnalyser && e.getAnalyser()) {
        analyser = e.getAnalyser();
        data = new Uint8Array(analyser.frequencyBinCount);
      }
      const on = e && e.isPlaying && e.isPlaying();
      if (on && analyser && data) analyser.getByteFrequencyData(data);
      const W = cv.width, H = cv.height, NB = 44, bw = W / NB;
      sx.clearRect(0, 0, W, H);
      const now = Date.now();
      const M = data ? data.length : 128, sr = 44100, fMin = 40, fMax = Math.min(16000, sr / 2);
      const logMin = Math.log(fMin), logRange = Math.log(fMax) - logMin;
      for (let i = 0; i < NB; i++) {
        let v: number;
        if (on && data) {
          const f0 = Math.exp(logMin + logRange * i / NB), f1 = Math.exp(logMin + logRange * (i + 1) / NB);
          const b0 = Math.max(0, Math.floor(f0 / sr * M * 2));
          const b1 = Math.min(M - 1, Math.max(b0, Math.ceil(f1 / sr * M * 2)));
          let peak = 0;
          for (let b = b0; b <= b1; b++) if (data[b] > peak) peak = data[b];
          v = peak / 255;
        } else {
          v = 0.05 + 0.03 * Math.sin(now / 900 + i * 0.55);
        }
        const h = Math.max(3, v * H * 0.92), x = i * bw + bw * 0.28, bwid = bw * 0.44, r = bwid / 2;
        const g = sx.createLinearGradient(0, H, 0, H - h);
        g.addColorStop(0, "rgba(255,202,52,.14)");
        g.addColorStop(1, "rgba(255,224,138," + (on ? (0.35 + v * 0.6) : 0.25) + ")");
        sx.fillStyle = g;
        sx.beginPath(); sx.moveTo(x, H); sx.lineTo(x, H - h + r);
        sx.arc(x + r, H - h + r, r, Math.PI, 0); sx.lineTo(x + bwid, H); sx.closePath(); sx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
    return () => { run = false; };
  }, [open]);

  const seek = (clientX: number) => {
    const e = N(), bar = barRef.current;
    if (!e || !bar) return;
    const r = bar.getBoundingClientRect();
    e.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  };

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className="ec-music-root">
      <style>{CSS}</style>

      {/* 悬浮音乐按钮 */}
      <button
        className={"ec-fab" + (playing ? " playing" : "")}
        title="音乐播放器"
        aria-label="音乐播放器"
        onClick={() => setOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <span className="eqmini" />
      </button>

      {/* 抽屉 */}
      <div className={"music-drawer" + (open ? " open" : "")}>
        <div className="music-mask" onClick={() => setOpen(false)} />
        <div className="music-panel">
          <div className="music-head">
            <b>NBS 音乐播放器</b>
            <button onClick={() => setOpen(false)}>关闭</button>
          </div>
          <div className="np-body">
            <div className="np-hero">
              <div className={"np-disc" + (playing ? " spin" : "")}><span>♫</span></div>
              <div className="np-title">{title || "加载中…"}</div>
              <div className="np-sub">Minecraft 音盒 · 真实采样</div>
              <canvas className="np-spec" ref={specRef} aria-hidden="true" />
            </div>

            <div className="np-prog">
              <div
                className="np-bar" ref={barRef}
                onPointerDown={(e) => { dragging.current = true; seek(e.clientX); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
                onPointerMove={(e) => { if (dragging.current) seek(e.clientX); }}
                onPointerUp={() => { dragging.current = false; }}
              >
                <div className="np-fill" style={{ width: pct + "%" }} />
                <div className="np-dot" style={{ left: pct + "%" }} />
              </div>
              <div className="np-times"><span>{fmt(cur)}</span><span>{fmt(dur)}</span></div>
            </div>

            <div className="np-ctrl">
              <button className="np-btn mid" title="上一首" onClick={() => { N()?.prev(); setTimeout(sync, 80); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L8.5 12z"/></svg>
              </button>
              <button className="np-btn big" title="播放/暂停" onClick={() => {
                const e = N(); if (!e) return;
                const on = e.isPlayingAnywhere ? e.isPlayingAnywhere() : e.isPlaying();
                if (on && e.pauseEverywhere) e.pauseEverywhere(); else e.play();
                setTimeout(sync, 80);
              }}>
                {playing
                  ? <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                  : <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
              </button>
              <button className="np-btn mid" title="下一首" onClick={() => { N()?.next(); setTimeout(sync, 80); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11.5-7z"/></svg>
              </button>
            </div>

            <div className="np-vol">
              <span className="np-vico" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/></svg></span>
              <input type="range" min={0} max={100} value={vol}
                onChange={(e) => { const v = Number(e.target.value); setVol(v); N()?.setVol(v / 100); }} />
              <span className="np-vico" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg></span>
            </div>

            <div className="np-style">
              <span className="np-style-lbl">播放风格</span>
              <div className="np-style-seg">
                <button className={style === "hifi" ? "on" : ""} onClick={() => { N()?.setStyle("hifi"); sync(); }}>HiFi 增强</button>
                <button className={style === "raw" ? "on" : ""} onClick={() => { N()?.setStyle("raw"); sync(); }}>原版 NBS</button>
              </div>
            </div>

            <div className="np-style np-bgrow">
              <span className="np-style-lbl">后台播放</span>
              <span className="np-bgdesc">切页后音乐继续播放</span>
              <label className="np-sw" title="关闭后，切到其他页面再回来不会自动续播">
                <input type="checkbox" checked={bg} onChange={(e) => { N()?.setBg(e.target.checked); setBg(e.target.checked); }} />
                <i />
              </label>
            </div>

            <div className="np-listhead">
              <span className="np-listhead-l">
                播放列表
                <button
                  className={"np-modebtn" + (loop !== 0 ? " on" : "")}
                  title={"播放模式：" + MODE_TITLES[loop]}
                  onClick={() => { if (N()?.cycleLoop) { setLoop(N().cycleLoop()); } }}
                >{MODE_ICONS[loop]}</button>
              </span>
              <span
                className={"np-modetxt" + (loop !== 0 ? " on" : "")}
                onClick={() => { if (N()?.cycleLoop) { setLoop(N().cycleLoop()); } }}
              >{MODE_NAMES[loop]}</span>
            </div>

            <div className="np-list">
              {list.map((p, i) => (
                <div
                  key={p.title}
                  className={"np-track" + (p.title === title ? " on" : "")}
                  onClick={() => {
                    const e = N(); if (!e) return;
                    if (p.title === e.title()) e.toggle(); else e.select(i);
                    setTimeout(sync, 60);
                  }}
                >
                  <span className="nidx">{i + 1}</span>
                  <span className={"np-eq" + (playing ? "" : " paused")}><i /><i /><i /></span>
                  <div className="nti"><b>{p.title}</b><i>Minecraft 音盒</i></div>
                  <span className="ndur">{fmt(p.dur)}</span>
                </div>
              ))}
            </div>

            <p className="np-tip">真实 Minecraft 音盒采样</p>
          </div>
        </div>
      </div>
    </div>
  );
}
