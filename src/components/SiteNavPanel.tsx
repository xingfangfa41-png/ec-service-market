import { useState, useRef, useEffect } from "react";
import {
  Undo2,
  BarChart3,
  Palette,
  ExternalLink,
  LayoutGrid,
  ChevronDown,
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.05] text-zinc-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-all duration-200 text-sm"
      >
        <Undo2 className="h-4 w-4" />
        <span>跳转</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/[0.08] bg-[#161620] shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-[#e8e4dc]">跳转页面</p>
            <p className="text-xs text-[#5a5448] mt-0.5">选择要前往的页面</p>
          </div>

          {/* Options */}
          <div className="p-2 space-y-1">
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
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-150 ${
                    isActive
                      ? "bg-emerald-500/[0.08] text-emerald-400 cursor-default"
                      : "text-[#e8e4dc] hover:bg-white/[0.05] active:bg-white/[0.08]"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-white/[0.05] text-[#8a8478]"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p
                      className={`text-xs mt-0.5 ${
                        isActive ? "text-emerald-400/60" : "text-[#5a5448]"
                      }`}
                    >
                      {item.desc}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                      当前
                    </span>
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 text-[#5a5448] flex-shrink-0" />
                  )}
                </a>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
            <p className="text-center text-[10px] text-[#5a5448]">
              EC玩家社群站 · 东河 · 2026
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
