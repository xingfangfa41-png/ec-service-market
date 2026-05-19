import { useState } from "react";
import {
  LayoutGrid,
  BarChart3,
  Palette,
  X,
} from "lucide-react";

const navItems = [
  {
    label: "社群数据中心",
    href: "https://ec-crystal-war.com/EC社群自治.html",
    icon: BarChart3,
  },
  {
    label: "二创馆",
    href: "https://ec-crystal-war.com/ercuang.html",
    icon: Palette,
  },
  {
    label: "服务广场",
    href: "https://market.ec-crystal-war.com/",
    icon: LayoutGrid,
    active: true,
  },
];

export default function SiteNavPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] border border-white/[0.06] text-xs transition-all duration-200"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>导航</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[999] bg-[rgba(10,10,18,0.92)] backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[90%] max-w-[400px] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-8 px-1">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">站点导航</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05] text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.1] transition-all text-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav Items */}
            <div className="flex flex-col gap-3">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.active ? undefined : "_blank"}
                  rel={item.active ? undefined : "noopener noreferrer"}
                  className={`flex items-center gap-3.5 px-5 py-4 rounded-xl border transition-all duration-200 group ${
                    item.active
                      ? "bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.1] hover:border-emerald-500/30"
                      : "bg-white/[0.02] border-white/[0.06] text-[#e8e4dc] hover:bg-[rgba(255,215,0,0.06)] hover:border-[rgba(255,215,0,0.15)]"
                  }`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-[15px]">{item.label}</span>
                </a>
              ))}
            </div>

            {/* Footer */}
            <p className="mt-6 text-xs text-[#5a5448]">
              EC玩家社群站 · 东河 · 2026
            </p>
          </div>
        </div>
      )}
    </>
  );
}
