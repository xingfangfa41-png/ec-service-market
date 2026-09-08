import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/time";
import SiteNavPanel from "@/components/SiteNavPanel";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getAvatarSrc, fetchUserByQQToken, logout } from "@/lib/user";
import {
  Plus,
  MessageCircle,
  Users,
  Shield,
  Gamepad2,
  Eye,
  Clock,
  Server,
  LogOut,
  Tag,
  ImageIcon,
  User,
} from "lucide-react";

// Start QQ OAuth login (redirect to QQ authorization)
function startQQLogin(from: string) {
  window.location.href = "/api/auth/qq?from=" + encodeURIComponent(from);
}

// Listing type matching backend Drizzle schema (camelCase)
interface Listing {
  id: number;
  category: string;
  title: string;
  description: string;
  serverName: string | null;
  price: string | null;
  contactType: string;
  contactValue: string;
  publisherId: string;
  image: string | null;
  createdAt: Date;
  commentCount: number;
}

const categories = [
  { key: "all", label: "全部", icon: null },
  { key: "闲聊", label: "闲聊", icon: MessageCircle },
  { key: "组队", label: "组队", icon: Users },
  { key: "公会社区", label: "公会社区", icon: Shield },
];

const categoryClassMap: Record<string, string> = {
  "闲聊": "category-badge-chat",
  "组队": "category-badge-partner",
  "公会社区": "category-badge-guild",
};

function getCategoryBadgeClass(category: string) {
  return categoryClassMap[category] || "bg-gray-500/10 text-gray-400 border border-gray-500/20";
}

export default function Home() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const [currentUser, setCurrentUserState] = useState(getCurrentUser);
  const [loginError, setLoginError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Handle QQ OAuth callback: exchange qq_token for the user, then go to `from`
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qqToken = params.get("qq_token");
    const loginErr = params.get("login_error");
    if (loginErr) setLoginError(loginErr);
    if (!qqToken && !loginErr) return;
    (async () => {
      if (qqToken) {
        const user = await fetchUserByQQToken(qqToken);
        if (user) setCurrentUserState(user);
      }
      const from = params.get("from");
      const target = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
      window.history.replaceState({}, "", target);
      navigate(target, { replace: true });
    })();
  }, [navigate]);

  // tRPC queries
  const { data: listings = [], isLoading, error: rpcError, refetch } = trpc.listing.list.useQuery(
    { category: activeCategory },
    { enabled: true }
  );

  // QQ 快捷登录 SDK：加载 qc_jssdk 渲染 QQ 头像按钮，授权完成后自动换取会话
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetch("/api/auth/qq/config").then((r) => r.json());
        const appId = cfg && cfg.appId;
        if (!appId) return;
        const w = window as any;
        if (w.QC && w.QC.Login) return;
        const s = document.createElement("script");
        s.src = "https://connect.qq.com/qc_jssdk.js";
        s.setAttribute("data-app_id", appId);
        s.setAttribute("data-redirect_uri", window.location.origin + "/");
        s.async = true;
        s.onload = () => {
          if (cancelled || !(window as any).QC) return;
          (window as any).QC.Login({ btnId: "qqQuickLogin", size: "A_M", clientId: appId });
          (window as any).QC.Login.getMe(async (openId: string, accessToken: string) => {
            if (!openId || !accessToken) return;
            try {
              const res = await fetch(
                `/api/auth/qq/sdk?openid=${encodeURIComponent(openId)}&access_token=${encodeURIComponent(accessToken)}`
              ).then((r) => r.json());
              if (res && res.token && res.user) {
                localStorage.setItem("ec_user", JSON.stringify(res.user));
                setCurrentUserState(res.user);
              } else if (res && res.error) {
                setLoginError(res.error.message || "QQ登录失败");
              }
            } catch (e) { /* ignore */ }
          });
        };
        document.head.appendChild(s);
      } catch (e) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const error = rpcError ? "加载失败: " + rpcError.message : "";

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Gamepad2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">服务广场</h1>
              <p className="text-[11px] text-zinc-500 leading-none">聊天互助 · 组队交友 · 公会社区</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteNavPanel />
            {/* User badge (display only, no logout) */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex h-9 items-center gap-2 rounded-lg bg-white/5 px-2 border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="h-6 w-6 rounded-full overflow-hidden bg-emerald-500/10">
                    <img
                      src={getAvatarSrc(currentUser.avatar)}
                      alt="avatar"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <span className="text-sm text-zinc-300 max-w-[80px] truncate hidden sm:block">{currentUser.username}</span>
                </button>
                <div className={`absolute right-0 top-11 z-50 w-44 rounded-xl border border-white/10 bg-[#16161d] shadow-2xl p-2 ${userMenuOpen ? "" : "hidden"}`}>
                  <button
                    onClick={() => {
                      logout();
                      setUserMenuOpen(false);
                      setCurrentUserState(null);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-white/5"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative flex items-center">
                <Button
                  onClick={() => setLoginOpen((o) => !o)}
                  variant="ghost"
                  className="text-zinc-400 hover:text-white hover:bg-white/5 h-9 gap-2 px-2"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">登录</span>
                </Button>
                {/* 登录弹层：QQ快捷登录 + QQ登录 + 匿名注册（常驻DOM保证SDK可渲染） */}
                <div className={`absolute right-0 top-11 z-50 w-52 rounded-xl border border-white/10 bg-[#16161d] shadow-2xl p-2 space-y-1 ${loginOpen ? "" : "hidden"}`}>
                  <div className="flex items-center justify-center py-2 rounded-lg hover:bg-white/5">
                    <div id="qqQuickLogin" className="flex items-center" />
                  </div>
                  <button
                    onClick={() => { setLoginOpen(false); startQQLogin("/"); }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    <User className="h-4 w-4 text-emerald-400" />
                    QQ 登录
                  </button>
                  <button
                    onClick={() => { setLoginOpen(false); navigate("/register"); }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    <User className="h-4 w-4 text-zinc-400" />
                    匿名注册
                  </button>
                </div>
              </div>
            )}
            <Button
              onClick={() => {
                if (!currentUser) {
                  setLoginOpen(true);
                  return;
                }
                navigate("/create");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-9 px-4 text-sm"
            >
              <Plus className="h-4 w-4" />
              发布
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* QQ login error banner */}
        {loginError && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <span className="shrink-0">⚠️</span>
            <span>{loginError}</span>
            <button onClick={() => setLoginError("")} className="ml-auto underline shrink-0">关闭</button>
          </div>
        )}

        {/* Category Quick Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`category-badge transition-all duration-200 cursor-pointer ${
                activeCategory === cat.key
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/20"
                  : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10 hover:text-zinc-200"
              }`}
            >
              {cat.icon && <cat.icon className="h-3.5 w-3.5" />}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "闲聊", count: listings.filter(l => l.category === "闲聊").length, icon: MessageCircle, color: "text-pink-400", bg: "bg-pink-500/8" },
            { label: "组队", count: listings.filter(l => l.category === "组队").length, icon: Users, color: "text-sky-400", bg: "bg-sky-500/8" },
            { label: "公会社区", count: listings.filter(l => l.category === "公会社区").length, icon: Shield, color: "text-amber-400", bg: "bg-amber-500/8" },
          ].map((stat) => (
            <div key={stat.label} className="glow-border rounded-xl bg-[#111118] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <span className="text-xs text-zinc-500">{stat.label}</span>
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{isLoading ? "-" : stat.count}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
            <button onClick={() => refetch()} className="ml-3 underline">重试</button>
          </div>
        )}

        {/* Listings */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glow-border rounded-xl bg-[#111118] p-5 animate-pulse">
                <div className="h-5 bg-white/5 rounded w-1/3 mb-3" />
                <div className="h-4 bg-white/5 rounded w-2/3 mb-2" />
                <div className="h-4 bg-white/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="space-y-3">
            {listings.map((listing) => (
              <button
                key={listing.id}
                onClick={() => navigate(`/listing/${listing.id}`)}
                className="glow-border w-full rounded-xl bg-[#111118] p-5 text-left transition-all duration-200 hover:bg-[#16161f] hover:scale-[1.005] cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`category-badge ${getCategoryBadgeClass(listing.category)}`}>
                      {listing.category}
                    </span>
                    <h3 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
                      {listing.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {listing.price ? (
                      <span className={`price-tag ${listing.price === "免费" ? "price-tag-free" : "price-tag-paid"}`}>
                        <Tag className="h-3 w-3 mr-1" />
                        {listing.price}
                      </span>
                    ) : (
                      <span className="price-tag price-tag-free">免费</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-zinc-400 mb-4 line-clamp-2 leading-relaxed">{listing.description}</p>
                {/* Image display */}
                {listing.image && listing.image.length > 10 && (
                  <div className="mb-4 rounded-xl overflow-hidden border border-white/5 bg-[#0d0d14]">
                    <img
                      src={listing.image}
                      alt={listing.title}
                      className="w-full object-contain max-h-[480px]"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  {listing.serverName && (
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {listing.serverName}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(listing.createdAt instanceof Date ? listing.createdAt.toISOString() : String(listing.createdAt))}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {listing.commentCount ?? 0}
                  </span>
                  <span className="flex items-center gap-1 text-emerald-500/70 ml-auto group-hover:text-emerald-400 transition-colors">
                    <Eye className="h-3 w-3" />
                    查看详情
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
              <Gamepad2 className="h-8 w-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-400 mb-1">暂无帖子</h3>
            <p className="text-sm text-zinc-600 mb-6">成为第一个发布的人吧</p>
            <Button
              onClick={() => {
                if (!currentUser) {
                  startQQLogin("/create");
                  return;
                }
                navigate("/create");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              发布帖子
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
