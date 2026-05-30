import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/time";
import SiteNavPanel from "@/components/SiteNavPanel";
import { Button } from "@/components/ui/button";
import { getCurrentUser, AVATARS } from "@/lib/user";
import {
  Plus,
  MessageCircle,
  Users,
  Shield,
  Gamepad2,
  Eye,
  Clock,
  Server,
  Tag,
  ImageIcon,
  User,
} from "lucide-react";

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
}

const categories = [
  { key: "all", label: "全部", icon: null },
  { key: "陪聊", label: "陪聊", icon: MessageCircle },
  { key: "找搭子", label: "找搭子", icon: Users },
  { key: "公会宣传", label: "公会宣传", icon: Shield },
  { key: "卖号", label: "卖号", icon: Gamepad2 },
];

const categoryClassMap: Record<string, string> = {
  "陪聊": "category-badge-chat",
  "找搭子": "category-badge-partner",
  "公会宣传": "category-badge-guild",
  "卖号": "category-badge-account",
};

function getCategoryBadgeClass(category: string) {
  return categoryClassMap[category] || "bg-gray-500/10 text-gray-400 border border-gray-500/20";
}

export default function Home() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const currentUser = getCurrentUser();

  // tRPC queries
  const { data: listings = [], isLoading, error: rpcError, refetch } = trpc.listing.list.useQuery(
    { category: activeCategory },
    { enabled: true }
  );

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
              <h1 className="text-lg font-bold text-white tracking-tight">游戏服务广场</h1>
              <p className="text-[11px] text-zinc-500 leading-none">陪聊 · 找搭子 · 公会宣传 · 卖号</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteNavPanel />
            {/* User badge (display only, no logout) */}
            {currentUser ? (
              <div className="flex h-9 items-center gap-2 rounded-lg bg-white/5 px-2 border border-white/5">
                <div className="h-6 w-6 rounded-full overflow-hidden bg-emerald-500/10">
                  <img
                    src={AVATARS.find(a => a.id === currentUser.avatar)?.path || AVATARS[0].path}
                    alt="avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <span className="text-sm text-zinc-300 max-w-[80px] truncate hidden sm:block">{currentUser.username}</span>
              </div>
            ) : (
              <Button
                onClick={() => navigate("/register?from=/")}
                variant="ghost"
                className="text-zinc-400 hover:text-white hover:bg-white/5 h-9 gap-2"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">登录</span>
              </Button>
            )}
            <Button
              onClick={() => {
                if (!currentUser) {
                  navigate("/register?from=/create");
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
            { label: "陪聊", count: listings.filter(l => l.category === "陪聊").length, icon: MessageCircle, color: "text-pink-400", bg: "bg-pink-500/8" },
            { label: "找搭子", count: listings.filter(l => l.category === "找搭子").length, icon: Users, color: "text-sky-400", bg: "bg-sky-500/8" },
            { label: "公会宣传", count: listings.filter(l => l.category === "公会宣传").length, icon: Shield, color: "text-amber-400", bg: "bg-amber-500/8" },
            { label: "卖号", count: listings.filter(l => l.category === "卖号").length, icon: Gamepad2, color: "text-violet-400", bg: "bg-violet-500/8" },
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
                  navigate("/register?from=/create");
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
