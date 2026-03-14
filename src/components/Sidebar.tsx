"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    label: "Command Center",
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="11" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="1" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Ideas",
    items: [
      {
        name: "Projects",
        href: "/projects",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 5l7-3.5L16 5v8l-7 3.5L2 13V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 8.5V16.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 5l7 3.5L16 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Browse",
        href: "/browse",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Arsenal",
    items: [
      {
        name: "Skills",
        href: "/skills",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9l3-6h6l3 6-3 6H6L3 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ),
      },
      {
        name: "Connections",
        href: "/connections",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="14" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.5 5.5L8 12M12.5 5.5L10 12" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        name: "Outbound",
        href: "/outbound",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 5l5 4-5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 4v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          </svg>
        ),
      },
      {
        name: "Audience",
        href: "/audience",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 13l3-4 2 2 4-5 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0d0f17] border-r border-[#1e293b]/50 flex flex-col z-40">
      {/* Logo */}
      <Link href="/dashboard" className="px-6 py-5 flex items-center gap-3 border-b border-[#1e293b]/50">
        <div className="text-amber-500">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            {/* Rail tracks icon */}
            <rect x="4" y="6" width="2" height="16" rx="1" fill="currentColor" />
            <rect x="22" y="6" width="2" height="16" rx="1" fill="currentColor" />
            <rect x="10" y="6" width="2" height="16" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="16" y="6" width="2" height="16" rx="1" fill="currentColor" opacity="0.6" />
            {/* Cross ties */}
            <rect x="3" y="9" width="22" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" />
            <rect x="3" y="14" width="22" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" />
            <rect x="3" y="19" width="22" height="1.5" rx="0.5" fill="currentColor" opacity="0.3" />
          </svg>
        </div>
        <div>
          <span className="text-lg font-bold tracking-wide text-[#e2e8f0]">FIVE</span>
          <span className="text-lg font-bold tracking-wide text-amber-500 ml-1">RAILS</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <span className={isActive ? "text-amber-400" : "text-[#64748b]"}>
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#1e293b]/50">
        <div className="text-[10px] text-[#64748b] tracking-wide">
          Five Rails v1.0
        </div>
      </div>
    </aside>
  );
}
