import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { getListingById, deleteListing, updateListing } from "@/lib/turso";
import type { Listing } from "@/lib/turso";
import { formatRelativeTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ImageIcon,
  Pencil,
  Trash2,
  X,
  Save,
} from "lucide-react";

const categoryIconMap: Record<string, React.ElementType> = {
  "陪聊": MessageCircle,
  "找搭子": Users,
  "公会宣传": Shield,
  "卖号": Gamepad2,
};

const categoryClassMap: Record<string, string> = {
  "陪聊": "category-badge-chat",
  "找搭子": "category-badge-partner",
  "公会宣传": "category-badge-guild",
  "卖号": "category-badge-account",
};

const categories = [
  { key: "陪聊", label: "陪聊" },
  { key: "找搭子", label: "找搭子" },
  { key: "公会宣传", label: "公会宣传" },
  { key: "卖号", label: "卖号" },
];

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    category: "",
    title: "",
    description: "",
    serverName: "",
    price: "",
    contactType: "wechat" as "wechat" | "qq",
    contactValue: "",
  });
  const listingId = parseInt(id ?? "0", 10);

  const fingerprint = localStorage.getItem("publisher_fp") || "";
  const isOwner = listing ? listing.publisher_id === fingerprint : false;

  useEffect(() => {
    if (!listingId) return;
    setIsLoading(true);
    getListingById(listingId)
      .then((data) => {
        setListing(data);
        if (data) {
          setEditForm({
            category: data.category,
            title: data.title,
            description: data.description,
            serverName: data.server_name || "",
            price: data.price || "",
            contactType: data.contact_type as "wechat" | "qq",
            contactValue: data.contact_value,
          });
        }
      })
      .catch(() => setListing(null))
      .finally(() => setIsLoading(false));
  }, [listingId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!listing) return;
    setIsDeleting(true);
    try {
      await deleteListing(listing.id);
      navigate("/");
    } catch {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!listing) return;
    try {
      await updateListing(listing.id, {
        category: editForm.category,
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        serverName: editForm.serverName.trim() || undefined,
        price: editForm.price.trim() || undefined,
        contactType: editForm.contactType,
        contactValue: editForm.contactValue.trim(),
      });
      // Refresh
      const updated = await getListingById(listing.id);
      setListing(updated);
      setIsEditing(false);
    } catch {
      // error
    }
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
        <Button variant="ghost" onClick={() => navigate("/")} className="mt-4 text-emerald-400 hover:text-emerald-300">返回首页</Button>
      </div>
    );
  }

  const CategoryIcon = categoryIconMap[listing.category] || Gamepad2;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-zinc-400 hover:text-white hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">帖子详情</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="glow-border rounded-xl bg-[#111118] p-6">
          {/* Owner actions */}
          {isOwner && !isEditing && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}
                className="text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isDeleting}
                className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1.5 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "删除中..." : "删除"}
              </Button>
            </div>
          )}

          {/* Edit Mode */}
          {isEditing ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">编辑帖子</h2>
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}
                  className="text-zinc-400 hover:text-white gap-1 text-xs">
                  <X className="h-3.5 w-3.5" />
                  取消
                </Button>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">分类</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger className="bg-[#0d0d12] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16161f] border-white/10 text-white">
                    {categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">标题</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="bg-[#0d0d12] border-white/10 text-white h-10" maxLength={200} />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">描述</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4} maxLength={2000} className="bg-[#0d0d12] border-white/10 text-white resize-none" />
              </div>

              {/* Server */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">服务器</Label>
                <Input value={editForm.serverName} onChange={(e) => setEditForm({ ...editForm, serverName: e.target.value })}
                  className="bg-[#0d0d12] border-white/10 text-white h-10" />
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">价格</Label>
                <Input value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  className="bg-[#0d0d12] border-white/10 text-white h-10" />
              </div>

              {/* Contact */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">联系方式</Label>
                <div className="flex gap-3">
                  <Select value={editForm.contactType} onValueChange={(v: "wechat" | "qq") => setEditForm({ ...editForm, contactType: v })}>
                    <SelectTrigger className="w-[120px] bg-[#0d0d12] border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      <SelectItem value="wechat">微信</SelectItem>
                      <SelectItem value="qq">QQ</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={editForm.contactValue} onChange={(e) => setEditForm({ ...editForm, contactValue: e.target.value })}
                    className="flex-1 bg-[#0d0d12] border-white/10 text-white h-10" />
                </div>
              </div>

              <Button onClick={handleSave}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-10 gap-2">
                <Save className="h-4 w-4" />
                保存修改
              </Button>
            </div>
          ) : (
            <>
              {/* Category + Price */}
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
                {listing.server_name && (
                  <span className="flex items-center gap-1">
                    <Server className="h-3.5 w-3.5" />
                    {listing.server_name}
                  </span>
                )}
                {listing.image && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" />
                    有图片
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRelativeTime(listing.created_at)}
                </span>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2">描述</h3>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
              </div>

              {/* Image */}
              {listing.image && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">截图</h3>
                  <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0d0d12]">
                    <img src={listing.image} alt="Screenshot" className="w-full max-h-96 object-contain" />
                  </div>
                </div>
              )}

              {/* Contact */}
              <div className="rounded-xl bg-[#0d0d12] border border-white/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-emerald-400">联系方式</h3>
                </div>

                {!showContact ? (
                  <Button onClick={() => setShowContact(true)}
                    className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 h-10">
                    <Eye className="h-4 w-4 mr-2" />
                    点击查看联系方式
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-[#111118] border border-white/5 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                          {listing.contact_type === "wechat" ? (
                            <MessageCircle className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <span className="text-xs font-bold text-emerald-400">Q</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">{listing.contact_type === "wechat" ? "微信号" : "QQ号"}</p>
                          <p className="text-base font-semibold text-white">{listing.contact_value}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(listing.contact_value)}
                        className="text-zinc-400 hover:text-white hover:bg-white/5 gap-1">
                        {copied ? <><Check className="h-4 w-4 text-emerald-400" /><span className="text-emerald-400">已复制</span></>
                          : <><Copy className="h-4 w-4" />复制</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
