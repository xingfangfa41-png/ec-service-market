import { useState, useEffect } from "react";
import {
  Undo2,
  BarChart3,
  Palette,
  LayoutGrid,
  BookOpen,
  X,
} from "lucide-react";

const navItems = [
  {
    label: "社群数据中心",
    href: "https://ec-crystal-war.com/EC社群自治.html",
    icon: BarChart3,
    desc: "社群数据统计",
  },
  {
    label: "二创馆",
    href: "https://ec-crystal-war.com/ercuang.html",
    icon: Palette,
    desc: "玩家创作展示",
  },
  {
    label: "水晶战争玩家手册",
    href: "https://ec-crystal-war.com/handbook.html",
    icon: BookOpen,
    desc: "玩家手册指南",
  },
  {
    label: "服务广场",
    href: "https://market.ec-crystal-war.com/",
    icon: LayoutGrid,
    active: true,
    desc: "当前页面",
  },
];

export default function SiteNavPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [open]);

  return (
    <>
      {/* Toggle Button - compact icon only */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-all duration-200"
        title="跳转其他页面"
      >
        <Undo2 className="h-4 w-4" />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[999]"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#161620] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-base font-bold text-[#e8e4dc]">跳转页面</h2>
                <p className="text-xs text-[#5a5448] mt-0.5">
                  选择要前往的页面
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.1] transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Options */}
            <div className="p-3 space-y-1.5">
              {navItems.map((item) => {
                const isActive = item.active;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target={isActive ? undefined : "_blank"}
                    rel={isActive ? undefined : "noopener noreferrer"}
                    onClick={(e) => {
                      if (isActive) {
                        e.preventDefault();
                        setOpen(false);
                      }
                    }}
                    className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                      isActive
                        ? "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400"
                        : "bg-white/[0.02] border-white/[0.06] text-[#e8e4dc] hover:bg-white/[0.05] active:bg-white/[0.08]"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-white/[0.05] text-[#8a8478]"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium">{item.label}</p>
                      <p
                        className={`text-xs mt-0.5 ${
                          isActive ? "text-emerald-400/60" : "text-[#5a5448]"
                        }`}
                      >
                        {item.desc}
                      </p>
                    </div>
                    {isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                        当前
                      </span>
                    )}
                  </a>
                );
              })}
            </div>

            {/* Footer */}
            <p className="text-center text-[11px] text-[#5a5448] pb-4 pt-1">
              EC玩家社群站 · 东河 · 2026
            </p>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
