export function formatRelativeTime(timestamp: string | number | null): string {
  if (!timestamp) return "";
  
  const now = Date.now();
  const ts = typeof timestamp === "string" 
    ? timestamp.match(/^\d+$/) 
      ? parseInt(timestamp) * 1000 
      : new Date(timestamp).getTime()
    : timestamp * 1000;
  
  const diff = now - ts;
  
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 172800000) return "昨天";
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  
  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
