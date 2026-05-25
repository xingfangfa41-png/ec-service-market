// User management - stores registered user info

export interface User {
  id: number;
  username: string;
  avatar: string | null;
}

// Get current user from localStorage
export function getCurrentUser(): User | null {
  try {
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
