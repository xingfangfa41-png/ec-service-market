import { useState } from "react";
import {
  LayoutGrid,
  BarChart3,
  Palette,
  X,
  ExternalLink,
  ChevronRight,
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
    label: "服务广场",
    href: "https://market.ec-crystal-war.com/",
    icon: LayoutGrid,
    active: true,
    desc: "当前页面",
  },
];

export default function SiteNavPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Nav Button - same size as publish button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] text-sm font-medium transition-all duration-200"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">导航</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[999] bg-black/60 transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom Sheet Panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[1000] bg-[#161620] border-t border-white/[0.08] rounded-t-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1" onClick={() => setOpen(false)}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-base font-bold text-[#e8e4dc]">跳转页面</h2>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.1] transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-4 pb-6 space-y-2">
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
                className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400"
                    : "bg-white/[0.02] border-white/[0.06] text-[#e8e4dc] active:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-white/[0.05] text-[#8a8478]"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium">{item.label}</p>
                  <p className={`text-xs mt-0.5 ${isActive ? "text-emerald-400/60" : "text-[#5a5448]"}`}>
                    {item.desc}
                  </p>
                </div>
                {isActive ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    当前
                  </span>
                ) : (
                  <ExternalLink className="h-4 w-4 text-[#5a5448] flex-shrink-0" />
                )}
              </a>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-[#5a5448] pb-4">
          EC玩家社群站 · 东河 · 2026
        </p>
      </div>
    </>
  );
}
