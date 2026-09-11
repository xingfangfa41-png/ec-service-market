import { useState, useEffect, useRef } from "react";
import type { ElementType } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getAvatarSrc, getFingerprint } from "@/lib/user";
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
  Send,
  MessageSquare,
  ArrowUpDown,
} from "lucide-react";


const categoryIconMap: Record<string, ElementType> = {
  "闲聊": MessageCircle,
  "组队": Users,
  "公会社区": Shield,
};

const categoryClassMap: Record<string, string> = {
  "闲聊": "category-badge-chat",
  "组队": "category-badge-partner",
  "公会社区": "category-badge-guild",
};

const categories = [
  { key: "闲聊", label: "闲聊" },
  { key: "组队", label: "组队" },
  { key: "公会社区", label: "公会社区" },
];

// Render comment text with @mentions highlighted
function renderCommentContent(content: string) {
  const parts = String(content || "").split(/(@[\u4e00-\u9fa5a-zA-Z0-9_]+)/g);
  return parts.map((p, i) =>
    /^@[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(p) ? (
      <span key={i} className="text-emerald-400 font-medium">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const listingId = parseInt(id ?? "0", 10);

  const [copied, setCopied] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    category: "",
    title: "",
    description: "",
    serverName: "",
    price: "",
    contactType: "wechat" as "wechat" | "qq",
    contactValue: "",
  });

  const [isOwner, setIsOwner] = useState(false);

  // Comments
  const [commentText, setCommentText] = useState("");
  const [commentSort, setCommentSort] = useState<"asc" | "desc">("asc");
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUsers, setMentionUsers] = useState<{ id: number; username: string; avatar: string | null }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: comments, isLoading: commentsLoading, refetch: refetchComments } = trpc.comment.list.useQuery({ listingId, sort: commentSort });
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);
    const pos = e.target.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const m = before.match(/@([\u4e00-\u9fa5a-zA-Z0-9_]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionOpen(true);
      if (mentionUsers.length === 0) {
        fetch("/api/trpc/user.list")
          .then((r) => r.json())
          .then((d) => setMentionUsers(d?.result?.data || []))
          .catch(() => {});
      }
    } else {
      setMentionOpen(false);
    }
  };

  const pickMention = (username: string) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, pos);
    const m = before.match(/@([\u4e00-\u9fa5a-zA-Z0-9_]*)$/);
    if (!m) return;
    const replace = commentText.slice(0, pos - m[0].length) + "@" + username + " " + commentText.slice(pos);
    setCommentText(replace);
    setMentionOpen(false);
    requestAnimationFrame(() => el?.focus());
  };

  const commentMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setCommentText("");
      refetchComments();
    },
  });

  // Get registered user info for commenting
  const [currentUser, setCurrentUser] = useState<{ username: string; avatar: string | null } | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("ec_user");
    if (raw) {
      try { setCurrentUser(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  // tRPC queries & mutations
  const { data: listing, isLoading } = trpc.listing.getById.useQuery(
    { id: listingId },
    { enabled: listingId > 0 }
  );

  // Check ownership securely via backend (publisherId no longer exposed in API)
  const checkOwnerMutation = trpc.listing.checkOwner.useMutation();
  useEffect(() => {
    if (listing && listingId > 0) {
      checkOwnerMutation.mutate(
        { id: listingId },
        {
          onSuccess: (data) => {
            setIsOwner(data?.isOwner || false);
          },
        }
      );
    }
  }, [listing, listingId]);

  const utils = trpc.useUtils();

  const deleteMutation = trpc.listing.delete.useMutation({
    onSuccess: () => {
      navigate("/");
    },
  });

  const updateMutation = trpc.listing.update.useMutation({
    onSuccess: () => {
      utils.listing.getById.invalidate({ id: listingId });
      setIsEditing(false);
      setEditError("");
    },
    onError: (err) => {
      setEditError(err.message);
    },
  });

  // Initialize edit form when entering edit mode
  const startEditing = () => {
    if (!listing) return;
    setEditForm({
      category: listing.category,
      title: listing.title,
      description: listing.description,
      serverName: listing.serverName || "",
      price: listing.price || "",
      contactType: listing.contactType as "wechat" | "qq",
      contactValue: listing.contactValue,
    });
    setEditError("");
    setIsEditing(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (!listing) return;
    deleteMutation.mutate({ id: listing.id });
  };

  const handleSave = () => {
    if (!listing) return;
    const title = editForm.title.trim();
    const description = editForm.description.trim();
    if (title.length < 3) { setEditError("标题至少3个字符"); return; }
    if (description.length < 10) { setEditError("描述至少10个字符"); return; }

    updateMutation.mutate({
      id: listing.id,
      category: editForm.category,
      title,
      description,
      serverName: editForm.serverName.trim() || undefined,
      price: editForm.price.trim() || undefined,
      contactType: editForm.contactType,
      contactValue: editForm.contactValue.trim(),
    });
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
              <Button variant="ghost" size="sm" onClick={startEditing}
                className="text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}
                className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1.5 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
                {deleteMutation.isPending ? "删除中..." : "删除"}
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

              {editError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {editError}
                </div>
              )}

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

              {/* Tag */}
              <div className="space-y-2">
                <Label className="text-sm text-zinc-300">标签</Label>
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

              <Button onClick={handleSave} disabled={updateMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-10 gap-2 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "保存中..." : "保存修改"}
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

              {/* Publisher */}
              <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
                {listing.publisherAvatar ? (
                  <img
                    src={/^https?:\/\//.test(String(listing.publisherAvatar)) ? listing.publisherAvatar : `/avatars/${listing.publisherAvatar}.png`}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="h-5 w-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] flex items-center justify-center font-bold shrink-0">
                    {(listing.publisherNickname || "匿")[0]}
                  </span>
                )}
                <span className="font-medium text-zinc-300 truncate max-w-[180px]">{listing.publisherNickname || "匿名用户"}</span>
                <span className="ml-auto shrink-0 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatRelativeTime(listing.createdAt instanceof Date ? listing.createdAt.toISOString() : String(listing.createdAt))}
                </span>
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
                    <img 
                      src={listing.image} 
                      alt="帖子图片" 
                      className="w-full max-h-96 object-contain"
                      loading="lazy"
                      onClick={() => window.open(listing.image, '_blank')}
                      style={{cursor: 'zoom-in'}}
                    />
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
                          {listing.contactType === "wechat" ? (
                            <MessageCircle className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <span className="text-xs font-bold text-emerald-400">Q</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">{listing.contactType === "wechat" ? "微信号" : "QQ号"}</p>
                          <p className="text-base font-semibold text-white">{listing.contactValue}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(listing.contactValue)}
                        className="text-zinc-400 hover:text-white hover:bg-white/5 gap-1">
                        {copied ? <><Check className="h-4 w-4 text-emerald-400" /><span className="text-emerald-400">已复制</span></>
                          : <><Copy className="h-4 w-4" />复制</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== Comments Section ===== */}
              <div className="mt-8 rounded-xl bg-[#111118] border border-white/5 overflow-hidden">
                <div className="p-5 border-b border-white/5">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    评论
                    {comments && comments.length > 0 && (
                      <span className="text-sm text-zinc-500">({comments.length})</span>
                    )}
                    <button
                      onClick={() => setCommentSort(commentSort === "asc" ? "desc" : "asc")}
                      className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-white/10 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors"
                      title="点击切换排序"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      {commentSort === "asc" ? "正序" : "倒序"}
                    </button>
                  </h3>
                </div>

                {/* Comment list */}
                <div className="p-5 space-y-4">
                  {commentsLoading ? (
                    <p className="text-sm text-zinc-600 text-center py-4">加载评论中...</p>
                  ) : comments && comments.length > 0 ? (
                    comments.map((comment: any) => (
                      <div key={comment.id} className="flex gap-3">
                        {/* Avatar */}
                        <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden">
                          {comment.avatar ? (
                            <img
                              src={/^https?:\/\//.test(String(comment.avatar)) ? comment.avatar : `/avatars/${comment.avatar}.png`}
                              alt="avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="h-full w-full rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{ background: "linear-gradient(135deg, #10b98144, #10b98166)" }}
                            >
                              {(comment.nickname || "匿")[0]}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-zinc-300">
                              {comment.nickname || "匿名用户"}
                            </span>
                            {comment.publisherId && listing.publisherId && comment.publisherId === listing.publisherId && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                                帖主
                              </span>
                            )}
                            <span className="text-xs text-zinc-600">
                              {formatRelativeTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed break-words">
                            {renderCommentContent(comment.content)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-600 text-center py-4">暂无评论，来说点什么吧</p>
                  )}
                </div>

                {/* Comment input */}
                <div className="p-5 border-t border-white/5">
                  <div className="flex gap-3">
                    {/* User avatar preview */}
                    <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden bg-emerald-500/10">
                      {currentUser ? (
                        <img
                          src={getAvatarSrc(currentUser.avatar)}
                          alt="avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        "?"
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500 mb-2">
                        {currentUser ? (
                          <>你的昵称：<span className="text-zinc-300">{currentUser.username}</span></>
                        ) : (
                          <span className="text-zinc-500">需要先<button onClick={() => (window.location.href = "/api/auth/qq?from=" + encodeURIComponent("/listing/" + listingId))} className="text-emerald-400 hover:underline cursor-pointer bg-transparent border-none p-0">QQ登录</button>才能评论</span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          {mentionOpen && currentUser && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-[#16161d] shadow-2xl z-20">
                              {mentionUsers
                                .filter((u) => u.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
                                .slice(0, 8)
                                .map((u) => (
                                  <button
                                    key={u.id}
                                    onClick={() => pickMention(u.username)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
                                  >
                                    <div className="h-5 w-5 rounded-full overflow-hidden bg-emerald-500/10 flex items-center justify-center text-[10px] text-white flex-shrink-0">
                                      {u.avatar ? (
                                        <img src={getAvatarSrc(u.avatar)} className="w-full h-full object-cover" alt="" />
                                      ) : (
                                        (u.username || "?")[0]
                                      )}
                                    </div>
                                    <span className="truncate">{u.username}</span>
                                  </button>
                                ))}
                              {mentionUsers.filter((u) => u.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-xs text-zinc-500">没有匹配的用户</div>
                              )}
                            </div>
                          )}
                          <Textarea
                            ref={textareaRef}
                            value={commentText}
                            onChange={handleCommentChange}
                            placeholder={currentUser ? "写下你的评论...（输入 @ 可艾特用户）" : "请先注册后再评论"}
                            disabled={!currentUser}
                            className="min-h-[60px] w-full bg-[#0d0d14] border-white/5 text-zinc-200 placeholder:text-zinc-700 focus:border-emerald-500/30 focus:ring-emerald-500/10 text-sm disabled:opacity-50"
                            maxLength={500}
                          />
                        </div>
                        <Button
                          onClick={() => {
                            if (!commentText.trim() || !currentUser) return;
                            commentMutation.mutate({
                              listingId,
                              content: commentText.trim(),
                              nickname: currentUser.username,
                              color: currentUser.avatar,
                              publisherId: getFingerprint() || undefined,
                            });
                          }}
                          disabled={commentMutation.isPending || !commentText.trim() || !currentUser}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white self-end h-10 px-4 disabled:opacity-50"
                        >
                          {commentMutation.isPending ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {commentMutation.isError && (
                        <p className="text-xs text-red-400 mt-2">{commentMutation.error?.message || "评论失败"}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
