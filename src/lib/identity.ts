// Random identity generator - each user gets a consistent random name + avatar
// Based on publisherId fingerprint (same person = same identity)

const ADJECTIVES = [
  "快乐", "勇敢", "聪明", "温柔", "热情", "冷静", "活泼", "神秘",
  "可爱", "帅气", "优雅", "调皮", "安静", "疯狂", "温柔", "冷酷",
  "乐观", "害羞", "自信", "细心", "大方", "单纯", "成熟", "幼稚",
  "坚强", "脆弱", "安静", "吵闹", "懒惰", "勤奋", "贪吃", "爱睡",
];

const NOUNS = [
  "小龙", "小猫", "小狗", "小兔", "小熊", "小鸟", "小鱼", "小狐狸",
  "小狼", "小虎", "小狮", "小象", "小鹿", "小马", "小牛", "小羊",
  "熊猫", "企鹅", "海豚", "蝴蝶", "蜜蜂", "蚂蚁", "青蛙", "乌龟",
  "考拉", "袋鼠", "松鼠", "刺猬", "浣熊", "猫头鹰", "孔雀", "天鹅",
];

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7",
  "#d946ef", "#f43f5e", "#78716c", "#64748b", "#475569",
];

// Deterministic hash from string
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

// Get a consistent random identity based on fingerprint
export function getRandomIdentity(fingerprint: string) {
  const hash = hashString(fingerprint);
  const name = ADJECTIVES[hash % ADJECTIVES.length] + NOUNS[hash % NOUNS.length];
  const color = COLORS[hash % COLORS.length];
  const gradient = `linear-gradient(135deg, ${color}22, ${color}44)`;
  
  return { name, color, gradient };
}

// Generate a random identity for one-time use (comments)
export function getRandomCommentIdentity(seed?: string) {
  const fp = seed || Math.random().toString(36).substring(2);
  return getRandomIdentity(fp);
}
