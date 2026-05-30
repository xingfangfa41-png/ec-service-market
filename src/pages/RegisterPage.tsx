import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AVATARS, setCurrentUser, getFingerprint } from "@/lib/user";
import {
  UserPlus,
  Check,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from "lucide-react";

/** Simple math expressions for username generation */
const NAME_PREFIXES = ["快乐", "神秘", "勇敢", "聪明", "狂野", "温柔", "闪电", "无敌", "自由", "极速"];
const NAME_SUFFIXES = ["小龙", "猎手", "玩家", "骑士", "法师", "战士", "王者", "之星", "风暴", "幻影"];

function generateRandomUsername(): string {
  const p = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `${p}${s}${n}`;
}

function generateRandomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}

// ─── Slider CAPTCHA Component ───
function SliderCaptcha({ onVerify }: { onVerify: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const [verified, setVerified] = useState(false);
  const startX = useRef(0);
  const trackWidth = useRef(0);

  const handleStart = useCallback((clientX: number) => {
    if (verified) return;
    setDragging(true);
    startX.current = clientX;
    trackWidth.current = trackRef.current?.offsetWidth || 300;
  }, [verified]);

  const handleMove = useCallback((clientX: number) => {
    if (!dragging || verified) return;
    const delta = clientX - startX.current;
    const max = (trackRef.current?.offsetWidth || 300) - 44;
    const clamped = Math.max(0, Math.min(delta, max));
    setOffset(clamped);

    if (clamped >= max - 2) {
      setVerified(true);
      setOffset(max);
      onVerify();
    }
  }, [dragging, verified, onVerify]);

  const handleEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (!verified) {
      setOffset(0); // Snap back
    }
  }, [dragging, verified]);

  // Mouse events
  useEffect(() => {
    const onMove = (e: MouseEvent) => handleMove(e.clientX);
    const onUp = () => handleEnd();
    if (dragging) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, handleMove, handleEnd]);

  // Touch events
  useEffect(() => {
    const onMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onUp = () => handleEnd();
    if (dragging) {
      window.addEventListener("touchmove", onMove, { passive: true });
      window.addEventListener("touchend", onUp);
    }
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, handleMove, handleEnd]);

  const trackWidthVal = trackRef.current?.offsetWidth || 300;
  const maxOffset = trackWidthVal - 44;
  const progress = maxOffset > 0 ? Math.min((offset / maxOffset) * 100, 100) : 0;

  return (
    <div className="rounded-xl bg-[#111118] border border-white/5 p-5 space-y-3">
      <label className="text-sm font-medium text-zinc-300">人机验证</label>
      <div
        ref={trackRef}
        className={`relative h-11 rounded-lg overflow-hidden select-none ${
          verified
            ? "bg-emerald-500/15 border border-emerald-500/30"
            : "bg-[#0d0d14] border border-white/5"
        }`}
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      >
        {/* Progress fill */}
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-75 ${
            verified ? "bg-emerald-500/20" : "bg-emerald-500/10"
          }`}
          style={{ width: `${progress}%` }}
        />

        {/* Text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {verified ? (
            <span className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              验证通过
            </span>
          ) : (
            <span className="text-sm text-zinc-500 flex items-center gap-2">
              <ChevronRight className="h-4 w-4" />
              拖动滑块到最右侧验证
            </span>
          )}
        </div>

        {/* Slider knob */}
        <div
          className={`absolute top-0.5 bottom-0.5 w-10 rounded-md flex items-center justify-center transition-shadow ${
            verified
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              : dragging
              ? "bg-emerald-500 text-white shadow-lg"
              : "bg-[#1a1a24] text-zinc-500 border border-white/5 hover:text-emerald-400"
          }`}
          style={{
            left: `${offset}px`,
            cursor: verified ? "default" : "grab",
            touchAction: "none",
          }}
        >
          {verified ? (
            <Check className="h-4 w-4" />
          ) : dragging ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Register Page ───
export default function RegisterPage() {
  const navigate = useNavigate();

  // Clear any old cached user data on mount (force fresh identity)
  useEffect(() => {
    localStorage.removeItem("ec_user");
    localStorage.removeItem("ec_verify");
  }, []);

  const [username] = useState(generateRandomUsername);
  const [selectedAvatar] = useState(generateRandomAvatar);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError("");

    if (!captchaVerified) {
      setError("请先完成滑动验证");
      return;
    }

    const fingerprint = getFingerprint();
    if (!fingerprint) {
      setError("无法获取设备标识，请刷新页面");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trpc/user.register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          avatar: selectedAvatar,
          fingerprint,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If username exists, try another random one (up to 5 attempts)
        if (data.error?.message?.includes("已被使用") || data.error?.message?.includes("注册过")) {
          // Try registering with a new random name
          for (let i = 0; i < 5; i++) {
            const newName = generateRandomUsername();
            const retryRes = await fetch("/api/trpc/user.register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: newName,
                avatar: selectedAvatar,
                fingerprint,
              }),
            });
            const retryData = await retryRes.json();
            if (retryRes.ok) {
              setCurrentUser({ id: 0, username: newName, avatar: selectedAvatar });
              setSuccess(true);
              setTimeout(() => navigate("/"), 800);
              return;
            }
          }
          setError("注册失败，请刷新页面重试");
          return;
        }
        setError(data.error?.message || "注册失败");
        return;
      }
      setCurrentUser({ id: 0, username, avatar: selectedAvatar });
      setSuccess(true);
      setTimeout(() => navigate("/"), 800);
    } catch (err: any) {
      setError(err.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 mx-auto ring-1 ring-emerald-500/20">
            <UserPlus className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white">创建你的身份</h1>
          <p className="text-sm text-zinc-500">
            系统已为你随机分配了身份，完成验证即可开始
          </p>
        </div>

        {/* Identity Preview Card */}
        <div className="rounded-xl bg-[#111118] border border-white/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full overflow-hidden ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-[#111118] shrink-0">
              <img
                src={AVATARS.find(a => a.id === selectedAvatar)?.path}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm text-zinc-500">你的昵称</p>
              <p className="text-lg font-bold text-white">{username}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-[#0d0d14] border border-white/5 px-3 py-2">
              <p className="text-[10px] text-zinc-600">头像</p>
              <p className="text-xs text-zinc-400">
                {AVATARS.find(a => a.id === selectedAvatar)?.name}
              </p>
            </div>
            <div className="flex-1 rounded-lg bg-[#0d0d14] border border-white/5 px-3 py-2">
              <p className="text-[10px] text-zinc-600">用户名长度</p>
              <p className="text-xs text-zinc-400">{username.length} 字符</p>
            </div>
          </div>
        </div>

        {/* Slider CAPTCHA */}
        <SliderCaptcha onVerify={() => setCaptchaVerified(true)} />

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
            <p className="text-emerald-400 font-medium">注册成功！</p>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleRegister}
          disabled={loading || success || !captchaVerified}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 h-12 text-base gap-2"
        >
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              {captchaVerified ? "确认创建" : "先完成验证"}
            </>
          )}
        </Button>

        <p className="text-xs text-zinc-700 text-center">
          身份随机分配，每位用户有30分钟发帖冷却
        </p>
      </div>
    </div>
  );
}
