// User management - stores registered user info

const STORAGE_VERSION = "3"; // v3: 清除匿名身份缓存，仅保留QQ登录

export interface User {
  id: number;
  username: string;
  avatar: string | null;
}

/** Auto-clear old data when version changes */
function checkStorageVersion() {
  try {
    const v = localStorage.getItem("ec_version");
    if (v !== STORAGE_VERSION) {
      localStorage.removeItem("ec_user");
      localStorage.removeItem("ec_token");
      localStorage.removeItem("ec_verify");
      localStorage.setItem("ec_version", STORAGE_VERSION);
    }
  } catch { /* ignore */ }
}

// Run version check on module load
checkStorageVersion();

// Get current user from localStorage
export function getCurrentUser(): User | null {
  try {
    checkStorageVersion();
    const raw = localStorage.getItem("ec_user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Save user to localStorage
export function setCurrentUser(user: User) {
  localStorage.setItem("ec_user", JSON.stringify(user));
}

// Get fingerprint (publisherId) for identifying the device/browser
export function getFingerprint(): string | null {
  try {
    const raw = localStorage.getItem("ec_token");
    if (!raw) return null;
    return JSON.parse(raw)?.publisherId || null;
  } catch {
    return null;
  }
}

// Check if user is registered
export function isRegistered(): boolean {
  return getCurrentUser() !== null;
}

// Clear current user (logout)
export function clearCurrentUser() {
  localStorage.removeItem("ec_user");
}

// Logout: clear logged-in user but KEEP the device fingerprint (ec_token),
// so the same browser can sign back into the registered account later.
export function logout() {
  localStorage.removeItem("ec_user");
}

// Sign back in with the device fingerprint (restores the anonymous account registered on this device)
export async function fetchUserByFingerprint(): Promise<User | null> {
  const fp = getFingerprint();
  if (!fp) return null;
  try {
    const res = await fetch(`/api/trpc/user.getMe?fingerprint=${encodeURIComponent(fp)}`);
    const data = await res.json();
    const u = data?.result?.data;
    if (!u) return null;
    const user: User = { id: Number(u.id) || 0, username: String(u.username || ""), avatar: u.avatar || null };
    setCurrentUser(user);
    return user;
  } catch {
    return null;
  }
}

// Available avatars
export const AVATARS = [
  { id: "dragon", name: "小火龙", path: "/avatars/dragon.png" },
  { id: "fox", name: "小狐狸", path: "/avatars/fox.png" },
  { id: "chick", name: "小鸡", path: "/avatars/chick.png" },
  { id: "frog", name: "小青蛙", path: "/avatars/frog.png" },
  { id: "wolf", name: "小狼", path: "/avatars/wolf.png" },
  { id: "cat", name: "小猫", path: "/avatars/cat.png" },
  { id: "rabbit", name: "小兔", path: "/avatars/rabbit.png" },
  { id: "penguin", name: "企鹅", path: "/avatars/penguin.png" },
  { id: "bear", name: "小熊", path: "/avatars/bear.png" },
];

// Resolve avatar display source (supports remote QQ avatars)
export function getAvatarSrc(avatar: string | null): string {
  if (avatar && /^https?:\/\//.test(avatar)) return avatar;
  return AVATARS.find((a) => a.id === avatar)?.path || AVATARS[0].path;
}

// Exchange a QQ session token for the current user (stores it on success)
export async function fetchUserByQQToken(token: string): Promise<User | null> {
  try {
    const res = await fetch(`/api/trpc/user.getMe?qq_token=${encodeURIComponent(token)}`);
    const data = await res.json();
    const u = data?.result?.data;
    if (!u) return null;
    const user: User = { id: Number(u.id) || 0, username: String(u.username || ""), avatar: u.avatar || null };
    setCurrentUser(user);
    return user;
  } catch {
    return null;
  }
}
