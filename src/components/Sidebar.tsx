import { useState } from "react";
import {
  Menu,
  X,
  BarChart3,
  Palette,
  Swords,
  Hexagon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  onCategoryChange?: (cat: string) => void;
  activeCategory?: string;
}

const navLinks = [
  { label: "社群数据中心", href: "https://ec-crystal-war.com/EC社群自治.html", icon: BarChart3 },
  { label: "二创馆", href: "https://ec-crystal-war.com/ercuang.html", icon: Palette },
  {
    label: "水晶战争",
    href: "#",
    icon: Swords,
    children: [
      { label: "水晶玩家手册", href: "https://ec-crystal-war.com/handbook.html" },
      { label: "水晶公会与社群", href: "https://ec-crystal-war.com/handbook.html#guild" },
      { label: "历史与文创", href: "https://ec-crystal-war.com/handbook.html#history" },
      { label: "比赛回放", href: "https://ec-crystal-war.com/handbook.html#replay" },
    ],
  },
  { label: "服务广场", href: "https://market.ec-crystal-war.com/", icon: Hexagon, active: true },
];

const categories = [
  { key: "all", label: "全部" },
  { key: "陪聊", label: "陪聊" },
  { key: "找搭子", label: "找搭子" },
  { key: "公会宣传", label: "公会宣传" },
  { key: "卖号", label: "卖号" },
];

export default function Sidebar({ onCategoryChange, activeCategory = "all" }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [warExpanded, setWarExpanded] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {/* Menu Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="菜单"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[997] bg-black/60 transition-all duration-300 ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={close}
      />

      {/* Sidebar */}
      <nav
        className={`fixed top-0 left-0 bottom-0 w-[260px] z-[998] bg-[#11111a] border-r border-white/[0.06] transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-[15px] font-semibold text-[#e8e4dc]">导航菜单</span>
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center text-[#8a8478] hover:text-[#e8e4dc] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Logo area */}
        <div className="px-5 py-3">
          <strong className="text-[#FFD700] text-[15px] font-semibold block">EC玩家社群站</strong>
          <span className="text-[#8a8478] text-xs">东河 · 2026</span>
        </div>

        <div className="h-px bg-white/[0.06] mx-4" />

        {/* Nav Links */}
        <ul className="px-3 py-2 space-y-1">
          {/* 社群数据中心 */}
          <li>
            <a
              href="https://ec-crystal-war.com/EC社群自治.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
            >
              <BarChart3 className="h-4 w-4 flex-shrink-0" />
              社群数据中心
            </a>
          </li>

          {/* 二创馆 */}
          <li>
            <a
              href="https://ec-crystal-war.com/ercuang.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
            >
              <Palette className="h-4 w-4 flex-shrink-0" />
              二创馆
            </a>
          </li>

          {/* 水晶战争 - 可展开 */}
          <li>
            <button
              onClick={() => setWarExpanded(!warExpanded)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
            >
              <Swords className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">水晶战争</span>
              {warExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {warExpanded && (
              <ul className="ml-6 mt-1 space-y-1">
                <li>
                  <a
                    href="https://ec-crystal-war.com/handbook.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
                  >
                    水晶玩家手册
                  </a>
                </li>
                <li>
                  <a
                    href="https://ec-crystal-war.com/handbook.html#guild"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
                  >
                    水晶公会与社群
                  </a>
                </li>
                <li>
                  <a
                    href="https://ec-crystal-war.com/handbook.html#history"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
                  >
                    历史与文创
                  </a>
                </li>
                <li>
                  <a
                    href="https://ec-crystal-war.com/handbook.html#replay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04] rounded-lg text-sm transition-all"
                  >
                    比赛回放
                  </a>
                </li>
              </ul>
            )}
          </li>

          {/* 服务广场 - 当前页 */}
          <li>
            <a
              href="https://market.ec-crystal-war.com/"
              className="flex items-center gap-3 px-4 py-2.5 text-[#FFD700] bg-[rgba(255,215,0,0.1)] font-medium rounded-lg text-sm transition-all"
            >
              <Hexagon className="h-4 w-4 flex-shrink-0" />
              服务广场
            </a>
          </li>
        </ul>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mx-4 my-2" />

        {/* Category Filter */}
        <div className="px-5 py-2">
          <p className="text-xs text-[#5a5448] mb-2">分类筛选</p>
          <ul className="space-y-1">
            {categories.map((cat) => (
              <li key={cat.key}>
                <button
                  onClick={() => {
                    onCategoryChange?.(cat.key);
                    close();
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-all ${
                    activeCategory === cat.key
                      ? "text-[#FFD700] bg-[rgba(255,215,0,0.1)] font-medium"
                      : "text-[#8a8478] hover:text-[#e8e4dc] hover:bg-white/[0.04]"
                  }`}
                >
                  {cat.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-auto px-5 py-4 text-center text-[11px] text-[#5a5448] leading-relaxed">
          EC玩家社群站 · 东河 · 2026
        </div>
      </nav>
    </>
  );
}
