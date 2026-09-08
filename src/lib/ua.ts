// Browser environment detection (QQ built-in browser / WeChat)
export type BrowserEnv = "qq" | "wechat" | "other";

export function getBrowserEnv(): BrowserEnv {
  try {
    const ua = navigator.userAgent;
    // QQ built-in webview UA contains "MQQBrowser" + "QQ/x.x" ; standalone QQ Browser also MQQBrowser
    if (/MQQBrowser|QQ\/\d|QBCore/i.test(ua)) return "qq";
    if (/MicroMessenger/i.test(ua)) return "wechat";
  } catch { /* ignore */ }
  return "other";
}

export const isQQBrowser = () => getBrowserEnv() === "qq";
export const isWeChat = () => getBrowserEnv() === "wechat";
