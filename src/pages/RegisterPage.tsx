import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AVATARS, setCurrentUser, getFingerprint, isRegistered } from "@/lib/user";
import { UserPlus, Check, AlertCircle, Shuffle } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0].id);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Redirect if already registered
  useEffect(() => {
    if (isRegistered()) {
      navigate("/");
    }
  }, [navigate]);

  // Debounced username availability check
  useEffect(() => {
    if (!username.trim() || username.trim().length < 2) {
      setAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`/api/trpc/user.checkUsername?username=${encodeURIComponent(username.trim())}`);
        const data = await res.json();
        const avail = data.result?.data?.available;
        setAvailable(avail === true ? true : avail === false ? false : null);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [username]);

  const handleRegister = async () => {
    setError("");
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) { setError("用户名至少2个字符"); return; }
    if (!available) { setError("用户名不可用"); return; }

    const fingerprint = getFingerprint();
    if (!fingerprint) { setError("无法获取设备标识，请刷新页面"); return; }

    try {
      const res = await fetch("/api/trpc/user.register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmed,
          avatar: selectedAvatar,
          fingerprint,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || "注册失败");
        return;
      }
      // Save user
      setCurrentUser({
        id: 0, // will be fetched
        username: trimmed,
        avatar: selectedAvatar,
      });
      // Also set a simple verification token for commenting
      sessionStorage.setItem("ec_verify", JSON.stringify({
        verified: true,
        token: "registered:user",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      }));
      setSuccess(true);
      setTimeout(() => navigate("/"), 800);
    } catch (err: any) {
      setError(err.message || "注册失败");
    }
  };

  const randomizeAvatar = () => {
    const idx = Math.floor(Math.random() * AVATARS.length);
    setSelectedAvatar(AVATARS[idx].id);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 mx-auto">
            <UserPlus className="h-6 w-6 text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold text-white">创建你的身份</h1>
          <p className="text-sm text-zinc-500">选择一个头像和用户名，开始你的旅程</p>
        </div>

        {/* Avatar Selection */}
        <div className="rounded-xl bg-[#111118] border border-white/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300">选择头像</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={randomizeAvatar}
              className="text-zinc-500 hover:text-zinc-300 h-8 gap-1"
            >
              <Shuffle className="h-3.5 w-3.5" />
              随机
            </Button>
          </div>

          {/* Preview */}
          <div className="flex justify-center">
            <div className="relative h-20 w-20">
              <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-[#111118]">
                <img
                  src={AVATARS.find(a => a.id === selectedAvatar)?.path}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
          </div>

          {/* Avatar Grid */}
          <div className="grid grid-cols-5 gap-2">
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => setSelectedAvatar(avatar.id)}
                className={`relative aspect-square rounded-full overflow-hidden transition-all ${
                  selectedAvatar === avatar.id
                    ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#111118] scale-110"
                    : "opacity-60 hover:opacity-100"
                }`}
                title={avatar.name}
              >
                <img
                  src={avatar.path}
                  alt={avatar.name}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Username Input */}
        <div className="rounded-xl bg-[#111118] border border-white/5 p-5 space-y-3">
          <label className="text-sm font-medium text-zinc-300">用户名</label>
          <div className="relative">
            <Input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              placeholder="取个名字吧..."
              maxLength={16}
              className="bg-[#0d0d14] border-white/5 text-zinc-200 placeholder:text-zinc-700 pr-10"
            />
            {checking && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
            )}
            {!checking && available === true && username.trim().length >= 2 && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
            )}
            {!checking && available === false && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
            )}
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-600">2-16个字符，支持中文/英文/数字</span>
            {available === false && (
              <span className="text-red-400">已被使用</span>
            )}
            {available === true && username.trim().length >= 2 && (
              <span className="text-emerald-400">可用</span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
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
          disabled={success || available === false}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
        >
          {success ? "注册成功" : "确认创建"}
        </Button>

        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="w-full text-zinc-600 hover:text-zinc-400"
        >
          返回首页
        </Button>
      </div>
    </div>
  );
}
