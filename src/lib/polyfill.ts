/**
 * iOS/Safari compatibility polyfills
 * Targets iOS 12+ Safari and older browsers
 */

// crypto.randomUUID polyfill for iOS < 15.4
if (typeof crypto !== "undefined" && !crypto.randomUUID) {
  // @ts-ignore
  crypto.randomUUID = function () {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  };
}

// Ensure crypto.subtle exists (iOS 10-11)
if (typeof crypto !== "undefined" && !crypto.subtle) {
  // @ts-ignore
  crypto.subtle = {} as any;
}

// sessionStorage polyfill for iOS private mode
// iOS private mode throws QuotaExceededError on setItem
try {
  const testKey = "__ios_test__";
  sessionStorage.setItem(testKey, "1");
  sessionStorage.removeItem(testKey);
} catch {
  // sessionStorage not available (iOS private mode), create in-memory fallback
  const memoryStore: Record<string, string> = {};
  // @ts-ignore
  window.sessionStorage = {
    getItem: (key: string) => memoryStore[key] || null,
    setItem: (key: string, value: string) => { memoryStore[key] = value; },
    removeItem: (key: string) => { delete memoryStore[key]; },
    clear: () => { for (const key in memoryStore) delete memoryStore[key]; },
  } as Storage;
}

// localStorage same treatment
try {
  const testKey = "__ios_test__";
  localStorage.setItem(testKey, "1");
  localStorage.removeItem(testKey);
} catch {
  const memoryStore: Record<string, string> = {};
  // @ts-ignore
  window.localStorage = {
    getItem: (key: string) => memoryStore[key] || null,
    setItem: (key: string, value: string) => { memoryStore[key] = value; },
    removeItem: (key: string) => { delete memoryStore[key]; },
    clear: () => { for (const key in memoryStore) delete memoryStore[key]; },
  } as Storage;
}

console.log("[polyfill] iOS compatibility loaded");
