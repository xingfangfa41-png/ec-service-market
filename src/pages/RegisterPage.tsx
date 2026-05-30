import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVATARS, setCurrentUser, getFingerprint, getCurrentUser, clearCurrentUser } from "@/lib/user";
import {
  UserPlus,
  LogIn,
  Check,
  AlertCircle,
  Shuffle,
  ArrowLeft,
  User,
  LogOut,
  Sparkles,
} from "lucide-react";

type Mode = "choose" | "register" | "login";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") || "/";

  const existingUser = getCurrentUser();
  const [mode, setMode] = useState<Mode>(existingUser ? "choose" : "register");
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0].id);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debounced username availability check
  useEffect(() => {
    if (mode !== "register") return;
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
  }, [username, mode]);

  const handleRegister = async () => {
    setError("");
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 2) { setError("用户名至少2个字符"); return; }
    if (trimmed.length > 16) { setError("用户名最多16个字符"); return; }
    if (!/^[一-龥a-zA-Z0-9_]+$/.test(trimmed)) { setError("用户名只能包含中文、英文、数字和下划线"); return; }
    if (!available) { setError("用户名不可用"); return; }

    const fingerprint = getFingerprint();
    if (!fingerprint) { setError("无法获取设备标识，请刷新页面"); return; }

    setLoading(true);
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
      setCurrentUser({ id: 0, username: trimmed, avatar: selectedAvatar });
      setSuccess(true);
      setTimeout(() => navigate(from), 800);
    } catch (err: any) {
      setError(err.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError("");
    const trimmed = username.trim();
    if (!trimmed) { setError("请输入用户名"); return; }

    setLoading(true);
    try {
      // Try to find user by username via a simple check
      const res = await fetch(`/api/trpc/user.checkUsername?username=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      const isAvail = data.result?.data?.available;

      if (isAvail === true) {
        setError("用户名不存在，请先注册");
        return;
      }

      // Username exists - get user info
      const fingerprint = getFingerprint();
      const meRes = await fetch(`/api/trpc/user.getMe?fingerprint=${encodeURIComponent(fingerprint || "")}`);
      const meData = await meRes.json();
      const userInfo = meData.result?.data;

      if (userInfo && userInfo.username === trimmed) {
        setCurrentUser({
          id: userInfo.id,
          username: userInfo.username,
          avatar: userInfo.avatar,
        });
        setSuccess(true);
        setTimeout(() => navigate(from), 800);
      } else {
        // Try to get user by username from server
        const allRes = await fetch(`/api/trpc/user.list`);
        const allData = await allRes.json();
        const users = allData.result?.data || [];
        const found = users.find((u: any) => u.username === trimmed);
        if (found) {
          setCurrentUser({
            id: found.id,
            username: found.username,
            avatar: found.avatar,
          });
          setSuccess(true);
          setTimeout(() => navigate(from), 800);
        } else {
          setError("无法找到用户信息");
        }
      }
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    clearCurrentUser();
    setMode("register");
    setSuccess(false);
    setError("");
    setUsername("");
  };

  const randomizeAvatar = () => {
    const idx = Math.floor(Math.random() * AVATARS.length);
    setSelectedAvatar(AVATARS[idx].id);
  };

  const randomUsername = () => {
    const prefixes = ["快乐", "神秘", "勇敢", "聪明", "狂野", "温柔", "闪电", "无敌"];
    const suffixes = ["小龙", "猎手", "玩家", "骑士", "法师", "战士", "王者", "之星"];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const n = Math.floor(Math.random() * 999);
    setUsername(`${p}${s}${n}`);
    setError("");
  };

  // ─── Choose Mode (already logged in) ───
  if (mode === "choose" && existingUser) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-6">
          {/* Current User Card */}
          <div className="text-center space-y-2">
            <div className="relative h-20 w-20 mx-auto">
              <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-[#0a0a0f]">
                <img
                  src={AVATARS.find(a => a.id === existingUser.avatar)?.path || AVATARS[0].path}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <h1 className="text-lg font-bold text-white">{existingUser.username}</h1>
            <p className="text-sm text-zinc-500">当前已登录</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={() => navigate(from)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-11"
            >
              <Sparkles className="h-4 w-4" />
              继续使用
            </Button>
            <Button
              variant="outline"
              onClick={() => setMode("register")}
              className="w-full border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 gap-2 h-11"
            >
              <UserPlus className="h-4 w-4" />
              注册新账号
            </Button>
            <Button
              variant="ghost"
              onClick={handleSwitchAccount}
              className="w-full text-zinc-500 hover:text-zinc-300 gap-2 h-11"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="w-full text-zinc-600 hover:text-zinc-400 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  // ─── Register / Login Mode ───
  const isRegister = mode === "register";

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 mx-auto">
            {isRegister ? (
              <UserPlus className="h-6 w-6 text-emerald-400" />
            ) : (
              <LogIn className="h-6 w-6 text-emerald-400" />
            )}
          </div>
          <h1 className="text-lg font-bold text-white">
            {isRegister ? "创建你的身份" : "欢迎回来"}
          </h1>
          <p className="text-sm text-zinc-500">
            {isRegister ? "选择一个头像和用户名，开始你的旅程" : "输入用户名快速登录"}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-[#111118] border border-white/5 p-1">
          <button
            onClick={() => { setMode("register"); setError(""); setSuccess(false); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all cursor-pointer ${
              isRegister
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            注册
          </button>
          <button
            onClick={() => { setMode("login"); setError(""); setSuccess(false); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all cursor-pointer ${
              !isRegister
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <LogIn className="h-4 w-4" />
            登录
          </button>
        </div>

        {/* Avatar Selection - only for register */}
        {isRegister && (
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
                  className={`relative aspect-square rounded-full overflow-hidden transition-all cursor-pointer ${
                    selectedAvatar === avatar.id
                      ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#111118] scale-110"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title={avatar.name}
                >
                  <img src={avatar.path} alt={avatar.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Username Input */}
        <div className="rounded-xl bg-[#111118] border border-white/5 p-5 space-y-3">
          <label className="text-sm font-medium text-zinc-300">
            {isRegister ? "用户名" : "用户名"}
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
            <Input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  isRegister ? handleRegister() : handleLogin();
                }
              }}
              placeholder={isRegister ? "取个名字吧..." : "输入你的用户名..."}
              maxLength={16}
              className="bg-[#0d0d14] border-white/5 text-zinc-200 placeholder:text-zinc-700 pr-20 pl-10"
            />
            {isRegister && (
              <>
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
                )}
                {!checking && available === true && username.trim().length >= 2 && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                )}
                {!checking && available === false && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
                )
                }
                <button
                  onClick={randomUsername}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  随机
                </button>
              </>
            )}
          </div>
          {isRegister && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-600">2-16个字符，支持中文/英文/数字</span>
              {available === false && <span className="text-red-400">已被使用</span>}
              {available === true && username.trim().length >= 2 && <span className="text-emerald-400">可用</span>}
            </div>
          )}
        </div>

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
            <p className="text-emerald-400 font-medium">
              {isRegister ? "注册成功！" : "登录成功！"}
            </p>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={isRegister ? handleRegister : handleLogin}
          disabled={loading || success}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 h-11 gap-2"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : isRegister ? (
            <>
              <UserPlus className="h-4 w-4" />
              确认创建
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              登录
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="w-full text-zinc-600 hover:text-zinc-400 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Button>
      </div>
    </div>
  );
}
