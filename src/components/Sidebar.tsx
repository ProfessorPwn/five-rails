"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
      {
        name: "Agents",
        href: "/agents",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 15c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="14" cy="5" r="2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
            <circle cx="4" cy="5" r="2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          </svg>
        ),
      },
      {
        name: "Watchdog",
        href: "/agents/watchdog",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L2 6v6l7 4 7-4V6L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 7v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="13" r="0.75" fill="currentColor" />
          </svg>
        ),
      },
      {
        name: "Inbox",
        href: "/inbox",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 11l2-7h10l2 7v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M2 11h4l1 2h4l1-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Traces",
        href: "/traces",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="3" cy="9" r="1.5" fill="currentColor" />
            <circle cx="9" cy="5" r="1.5" fill="currentColor" />
            <circle cx="9" cy="13" r="1.5" fill="currentColor" />
            <circle cx="15" cy="9" r="1.5" fill="currentColor" />
            <path d="M3 9l6-4M3 9l6 4M9 5l6 4M9 13l6-4" stroke="currentColor" strokeWidth="1" />
          </svg>
        ),
      },
      {
        name: "Agent Metrics",
        href: "/metrics/agents",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 14V4M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="5" y="9" width="2" height="4" rx="0.4" fill="currentColor" />
            <rect x="8.5" y="6" width="2" height="7" rx="0.4" fill="currentColor" />
            <rect x="12" y="3" width="2" height="10" rx="0.4" fill="currentColor" />
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
        name: "IdeaBrowser",
        href: "/ideabrowser",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1.5a4.5 4.5 0 013 7.88V12a1 1 0 01-1 1H7a1 1 0 01-1-1V9.38A4.5 4.5 0 019 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7 14.5h4M8 16h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        name: "Validation",
        href: "/validation",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="3" y="11" width="3" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="7.5" y="7" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="12" y="3" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
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
        name: "Blueprints",
        href: "/blueprint",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 6h6M6 9h4M6 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="14" cy="14" r="3" fill="currentColor" opacity="0.3" />
            <path d="M13 14l1 1 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Metrics",
        href: "/metrics",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 15V7l4-3 4 5 4-7 2 3v10H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="6" cy="4" r="1.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            <circle cx="14" cy="2" r="1.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
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
      {
        name: "Brand Voice",
        href: "/brand-voice",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 9v2M9 7v4M12 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Output",
    items: [
      {
        name: "Library",
        href: "/library",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 3h14v12H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M2 6h14M6 3v12M10 3v12" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          </svg>
        ),
      },
      {
        name: "Activity",
        href: "/activity",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 9h4l2-5 2 10 2-5h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
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
        name: "Sequences",
        href: "/outbound?tab=sequences",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 5h10M4 9h8M4 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="15" cy="9" r="2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            <circle cx="13" cy="13" r="2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
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
      {
        name: "Newsletters",
        href: "/newsletters",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Ads",
        href: "/ads",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Analytics",
        href: "/analytics",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 14V8M7 14V5M11 14V9M15 14V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        name: "Webinars",
        href: "/webinars",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8l4 2-4 2V8z" fill="currentColor" opacity="0.6" />
            <circle cx="9" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1" />
            <path d="M9 4v0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        name: "Pipeline",
        href: "/pipeline",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 3h14v3l-5 4v5l-4 1V10L2 6V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        name: "Affiliates",
        href: "/affiliates",
        icon: (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 8l3 3M12 11l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
                // Handle hrefs with query params (e.g., /outbound?tab=sequences)
                const [itemPath, itemQuery] = item.href.split("?");
                let isActive: boolean;
                if (itemQuery) {
                  // For items with query params, match both pathname and param
                  const paramParts = itemQuery.split("=");
                  isActive = pathname === itemPath && searchParams.get(paramParts[0]) === paramParts[1];
                } else {
                  // For /outbound, only mark active when there's no tab=sequences param
                  const isSubItemWithQuery = section.items.some(
                    (other) => other !== item && other.href.startsWith(item.href + "?")
                  );
                  if (isSubItemWithQuery) {
                    isActive = pathname === item.href && !searchParams.get("tab");
                  } else {
                    isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  }
                }
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

      {/* Settings Link */}
      <div className="px-3 pb-2">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            pathname === "/settings"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5 border border-transparent"
          }`}
        >
          <span className={pathname === "/settings" ? "text-amber-400" : "text-[#64748b]"}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14.7 11.1l.7 1.2a1 1 0 01-.2 1.2l-1.1.9a1 1 0 01-1.2.1l-1.2-.5a5.5 5.5 0 01-1.5.9l-.3 1.3a1 1 0 01-1 .8h-1.4a1 1 0 01-1-.8l-.3-1.3a5.5 5.5 0 01-1.5-.9l-1.2.5a1 1 0 01-1.2-.1l-1.1-.9a1 1 0 01-.2-1.2l.7-1.2a5.5 5.5 0 010-1.8l-.7-1.2a1 1 0 01.2-1.2l1.1-.9a1 1 0 011.2-.1l1.2.5a5.5 5.5 0 011.5-.9l.3-1.3a1 1 0 011-.8h1.4a1 1 0 011 .8l.3 1.3a5.5 5.5 0 011.5.9l1.2-.5a1 1 0 011.2.1l1.1.9a1 1 0 01.2 1.2l-.7 1.2a5.5 5.5 0 010 1.8z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          Settings
        </Link>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#1e293b]/50">
        <div className="text-[10px] text-[#64748b] tracking-wide">
          Five Rails v1.0
        </div>
      </div>
    </aside>
  );
}
