import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { createListing, checkPublisherListing } from "@/lib/turso";
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
  Send,
  ImagePlus,
  X,
} from "lucide-react";

const categories = [
  { key: "陪聊", label: "陪聊", icon: MessageCircle, desc: "找人陪聊、语音、一起玩游戏" },
  { key: "找搭子", label: "找搭子", icon: Users, desc: "找队友、找CP、找固玩" },
  { key: "公会宣传", label: "公会宣传", icon: Shield, desc: "宣传你的公会或社群" },
  { key: "卖号", label: "卖号", icon: Gamepad2, desc: "出售游戏账号" },
];

export default function CreateListing() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serverName, setServerName] = useState("");
  const [price, setPrice] = useState("");
  const [contactType, setContactType] = useState<"wechat" | "qq">("wechat");
  const [contactValue, setContactValue] = useState("");
  const [image, setImage] = useState<string>("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      setError("图片不能超过 2MB");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!category) { setError("请选择分类"); return; }
    if (!title.trim()) { setError("请填写标题"); return; }
    if (!description.trim()) { setError("请填写描述"); return; }
    if (!contactValue.trim()) { setError("请填写联系方式"); return; }

    const fingerprint = localStorage.getItem("publisher_fp") || crypto.randomUUID();
    localStorage.setItem("publisher_fp", fingerprint);

    const existing = await checkPublisherListing(fingerprint);
    if (existing) {
      setError("你已经发布过帖子了，每个人只能发布一个");
      return;
    }

    setSubmitting(true);
    try {
      await createListing({
        category,
        title: title.trim(),
        description: description.trim(),
        serverName: serverName.trim() || undefined,
        price: price.trim() || undefined,
        contactType,
        contactValue: contactValue.trim(),
        publisherId: fingerprint,
        image: image || undefined,
      });
      navigate("/");
    } catch (err: any) {
      setError("发布失败: " + (err.message || "未知错误"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-zinc-400 hover:text-white hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">发布帖子</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">选择分类</Label>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((cat) => (
                <button key={cat.key} type="button" onClick={() => setCategory(cat.key)}
                  className={`glow-border rounded-xl p-4 text-left transition-all duration-200 cursor-pointer ${
                    category === cat.key
                      ? "bg-emerald-500/8 border-emerald-500/30 ring-1 ring-emerald-500/20"
                      : "bg-[#111118] border-white/5 hover:bg-[#16161f]"
                  }`}>
                  <cat.icon className={`h-5 w-5 mb-2 ${category === cat.key ? "text-emerald-400" : "text-zinc-500"}`} />
                  <p className={`text-sm font-semibold ${category === cat.key ? "text-white" : "text-zinc-400"}`}>{cat.label}</p>
                  <p className="text-xs text-zinc-600 mt-1">{cat.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-zinc-300">标题</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="写个吸引人的标题..." maxLength={200}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-zinc-300">描述</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="详细描述你的需求或服务..." rows={5} maxLength={2000}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 resize-none" />
          </div>

          {/* Server */}
          <div className="space-y-2">
            <Label htmlFor="server" className="text-sm font-medium text-zinc-300">服务器</Label>
            <Input id="server" value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="哪个服务器？（选填）" maxLength={200}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11" />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price" className="text-sm font-medium text-zinc-300">价格</Label>
            <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例如：免费、10元/小时、50元..." maxLength={100}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11" />
            <p className="text-xs text-zinc-600">可以填写"免费"或自定义价格</p>
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">截图/图片（选填）</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            {image ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#111118]">
                <img src={image} alt="Preview" className="w-full max-h-64 object-contain" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-white/10 bg-[#111118] p-6 text-center transition-colors hover:bg-[#16161f] hover:border-emerald-500/30"
              >
                <ImagePlus className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-sm text-zinc-500">点击上传截图</p>
                <p className="text-xs text-zinc-600 mt-1">支持 jpg/png，最大 2MB</p>
              </button>
            )}
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">联系方式</Label>
            <div className="flex gap-3">
              <Select value={contactType} onValueChange={(v: "wechat" | "qq") => setContactType(v)}>
                <SelectTrigger className="w-[120px] bg-[#111118] border-white/10 text-white focus:ring-emerald-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="wechat">微信</SelectItem>
                  <SelectItem value="qq">QQ</SelectItem>
                </SelectContent>
              </Select>
              <Input value={contactValue} onChange={(e) => setContactValue(e.target.value)} placeholder={contactType === "wechat" ? "微信号" : "QQ号"} maxLength={200}
                className="flex-1 bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11" />
            </div>
            <p className="text-xs text-zinc-600">联系方式仅会在查看详情时显示</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <Button type="submit" disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 gap-2 text-sm font-medium">
            <Send className="h-4 w-4" />
            {submitting ? "发布中..." : "发布帖子"}
          </Button>
        </form>
      </main>
    </div>
  );
}
