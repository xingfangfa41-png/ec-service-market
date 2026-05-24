import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/lib/trpc";
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
  Clock,
} from "lucide-react";

const categories = [
  { key: "陪聊", label: "陪聊", icon: MessageCircle, desc: "找人陪聊、语音、一起玩游戏" },
  { key: "找搭子", label: "找搭子", icon: Users, desc: "找队友、找CP、找固玩" },
  { key: "公会宣传", label: "公会宣传", icon: Shield, desc: "宣传你的公会或社群" },
  { key: "卖号", label: "卖号", icon: Gamepad2, desc: "出售游戏账号" },
];

/** Format seconds to mm:ss */
function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [canSubmit, setCanSubmit] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Get or create fingerprint
  const fingerprint = (() => {
    const fp = localStorage.getItem("publisher_fp") || crypto.randomUUID();
    localStorage.setItem("publisher_fp", fp);
    return fp;
  })();

  // Check if user already has a listing
  const { data: existingListing } = trpc.listing.checkPublisher.useQuery(
    { publisherId: fingerprint },
    { enabled: !!fingerprint }
  );

  // Check cooldown status
  const { data: cooldownData, refetch: refetchCooldown } = trpc.listing.cooldownStatus.useQuery(
    { publisherId: fingerprint },
    { enabled: !!fingerprint, refetchInterval: cooldownSeconds > 0 ? 5000 : false }
  );

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownData?.inCooldown && cooldownData.remainingSeconds) {
      setCooldownSeconds(cooldownData.remainingSeconds);
      setCanSubmit(false);
    } else if (cooldownData && !cooldownData.inCooldown) {
      setCooldownSeconds(0);
      setCanSubmit(true);
    }
  }, [cooldownData]);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      setCanSubmit(true);
      return;
    }
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          setCanSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Create listing mutation
  const createMutation = trpc.listing.create.useMutation({
    onSuccess: () => {
      navigate("/");
    },
    onError: (err) => {
      setError(err.message);
      // If cooldown error, refresh cooldown status
      if (err.message.includes("太频繁") || err.message.includes("等待")) {
        refetchCooldown();
      }
    },
  });

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "ec_market_upload");

    const res = await fetch("https://api.cloudinary.com/v1_1/dubpl7gp6/image/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("图片上传失败");
    const data = await res.json();
    return data.secure_url;
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 24 * 1024 * 1024) {
      setError("图片不能超过 24MB");
      return;
    }

    try {
      setError("");
      const url = await uploadToCloudinary(file);
      setImage(url);
    } catch (err: any) {
      setError(err.message || "图片上传失败");
    }
  };

  const removeImage = () => {
    setImage("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Frontend validations
    if (!category) { setError("请选择分类"); return; }
    if (!title.trim()) { setError("请填写标题"); return; }
    if (title.trim().length < 3) { setError("标题至少3个字符"); return; }
    if (!description.trim()) { setError("请填写描述"); return; }
    if (description.trim().length < 10) { setError("描述至少10个字符"); return; }
    if (!contactValue.trim()) { setError("请填写联系方式"); return; }

    if (existingListing) {
      setError("你已经发布过帖子了，每个人只能发布一个");
      return;
    }

    if (!canSubmit || cooldownSeconds > 0) {
      setError(`请等待 ${formatCooldown(cooldownSeconds)} 后再发布`);
      return;
    }

    createMutation.mutate({
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
  };

  const isSubmitting = createMutation.isPending;

  // Check if form should be disabled
  const isDisabled = isSubmitting || !canSubmit || !!existingListing;

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
        {/* Status banner */}
        {existingListing && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400 flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            你已经发布过帖子了，每人只能发布一个。如需修改请删除原帖后重新发布。
          </div>
        )}
        {cooldownSeconds > 0 && !existingListing && (
          <div className="mb-4 rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-3 text-sm text-orange-400 flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            发布冷却中，剩余时间：<span className="font-mono font-bold">{formatCooldown(cooldownSeconds)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">选择分类</Label>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((cat) => (
                <button key={cat.key} type="button" onClick={() => setCategory(cat.key)}
                  disabled={isDisabled}
                  className={`glow-border rounded-xl p-4 text-left transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
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
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="写个吸引人的标题..." maxLength={200} disabled={isDisabled}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11 disabled:opacity-50" />
            <p className="text-xs text-zinc-600">{title.length}/200 字符，至少3个字符</p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-zinc-300">描述</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="详细描述你的需求或服务..." rows={5} maxLength={2000} disabled={isDisabled}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 resize-none disabled:opacity-50" />
            <p className="text-xs text-zinc-600">{description.length}/2000 字符，至少10个字符</p>
          </div>

          {/* Server */}
          <div className="space-y-2">
            <Label htmlFor="server" className="text-sm font-medium text-zinc-300">服务器</Label>
            <Input id="server" value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="哪个服务器？（选填）" maxLength={200} disabled={isDisabled}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11 disabled:opacity-50" />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price" className="text-sm font-medium text-zinc-300">价格</Label>
            <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例如：免费、10元/小时、50元..." maxLength={100} disabled={isDisabled}
              className="bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11 disabled:opacity-50" />
            <p className="text-xs text-zinc-600">可以填写"免费"或自定义价格</p>
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">截图/图片（选填）</Label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" disabled={isDisabled} />
            {image ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#111118]">
                <img src={image} alt="Preview" className="w-full max-h-64 object-contain" />
                <button type="button" onClick={removeImage} disabled={isDisabled}
                  className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={isDisabled}
                className="w-full rounded-xl border border-dashed border-white/10 bg-[#111118] p-6 text-center transition-colors hover:bg-[#16161f] hover:border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
                <ImagePlus className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-sm text-zinc-500">点击上传截图</p>
                <p className="text-xs text-zinc-600 mt-1">支持 jpg/png，最大 24MB（上传到 Cloudinary 图床）</p>
              </button>
            )}
          </div>

          {/* Contact */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-zinc-300">联系方式</Label>
            <div className="flex gap-3">
              <Select value={contactType} onValueChange={(v: "wechat" | "qq") => setContactType(v)} disabled={isDisabled}>
                <SelectTrigger className="w-28 bg-[#111118] border-white/10 text-white disabled:opacity-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="wechat" className="text-white">微信</SelectItem>
                  <SelectItem value="qq" className="text-white">QQ</SelectItem>
                </SelectContent>
              </Select>
              <Input value={contactValue} onChange={(e) => setContactValue(e.target.value)} placeholder={contactType === "wechat" ? "微信号" : "QQ号"} maxLength={200} disabled={isDisabled}
                className="flex-1 bg-[#111118] border-white/10 text-white placeholder:text-zinc-700 focus-visible:ring-emerald-500/30 h-11 disabled:opacity-50" />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isDisabled}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>发布中...</>
            ) : cooldownSeconds > 0 && !existingListing ? (
              <>
                <Clock className="h-4 w-4" />
                等待 {formatCooldown(cooldownSeconds)}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {existingListing ? "已发布（无法重复）" : "发布帖子"}
              </>
            )}
          </Button>

          {/* Security note */}
          <p className="text-xs text-zinc-700 text-center">
            每人只能发布一个帖子，发布后有30分钟冷却时间
          </p>
        </form>
      </main>
    </div>
  );
}
