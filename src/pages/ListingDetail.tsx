import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  MessageCircle,
  Users,
  Shield,
  Gamepad2,
  Clock,
  Server,
  Eye,
  Tag,
  Copy,
  Check,
} from "lucide-react";

const categoryIconMap: Record<string, React.ElementType> = {
  陪聊: MessageCircle,
  找搭子: Users,
  公会宣传: Shield,
  卖号: Gamepad2,
};

const categoryClassMap: Record<string, string> = {
  陪聊: "category-badge-chat",
  找搭子: "category-badge-partner",
  公会宣传: "category-badge-guild",
  卖号: "category-badge-account",
};

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const listingId = parseInt(id ?? "0", 10);

  const { data: listing, isLoading } = trpc.listing.getById.useQuery(
    { id: listingId },
    { enabled: !!listingId }
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center text-zinc-500">
        <p>帖子不存在</p>
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mt-4 text-emerald-400 hover:text-emerald-300"
        >
          返回首页
        </Button>
      </div>
    );
  }

  const CategoryIcon = categoryIconMap[listing.category] || Gamepad2;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-zinc-400 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">帖子详情</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="glow-border rounded-xl bg-[#111118] p-6">
          {/* Category */}
          <div className="flex items-center gap-3 mb-4">
            <span className={`category-badge ${categoryClassMap[listing.category] || ""}`}>
              <CategoryIcon className="h-3.5 w-3.5" />
              {listing.category}
            </span>
            {listing.price ? (
              <span className={`price-tag ${listing.price === "免费" ? "price-tag-free" : "price-tag-paid"}`}>
                <Tag className="h-3 w-3 mr-1" />
                {listing.price}
              </span>
            ) : (
              <span className="price-tag price-tag-free">免费</span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-white mb-4">{listing.title}</h1>

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-6 pb-4 border-b border-white/5">
            {listing.serverName && (
              <span className="flex items-center gap-1">
                <Server className="h-3.5 w-3.5" />
                {listing.serverName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {listing.createdAt
                ? new Date(listing.createdAt).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </span>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">描述</h3>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {listing.description}
            </p>
          </div>

          {/* Contact */}
          <div className="rounded-xl bg-[#0d0d12] border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-emerald-400">联系方式</h3>
            </div>

            {!showContact ? (
              <Button
                onClick={() => setShowContact(true)}
                className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 h-10"
              >
                <Eye className="h-4 w-4 mr-2" />
                点击查看联系方式
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-[#111118] border border-white/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                      {listing.contactType === "wechat" ? (
                        <MessageCircle className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <span className="text-xs font-bold text-emerald-400">Q</span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">
                        {listing.contactType === "wechat" ? "微信号" : "QQ号"}
                      </p>
                      <p className="text-base font-semibold text-white">
                        {listing.contactValue}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(listing.contactValue)}
                    className="text-zinc-400 hover:text-white hover:bg-white/5 gap-1"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-400">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        复制
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
