"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: number;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; fallbackLink: string }> = {
  agent_completed: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#3b82f6" strokeWidth="1.5" />
        <circle cx="12" cy="4" r="1.5" stroke="#3b82f6" strokeWidth="1" opacity="0.5" />
      </svg>
    ),
    fallbackLink: "/agents",
  },
  agent_blocked: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5l6 11H2l6-11z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v3" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.75" fill="#f59e0b" />
      </svg>
    ),
    fallbackLink: "/agents",
  },
  deal_stage_changed: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 3h12v2.5l-4.5 3.5v4l-3 1V9L2 5.5V3z" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    fallbackLink: "/pipeline",
  },
  content_published: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#8b5cf6" strokeWidth="1.5" />
        <path d="M6 5h4M6 8h3" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    fallbackLink: "/audience",
  },
  skill_executed: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2l2 4h4l-3.5 3 1.5 5L8 11l-4 3 1.5-5L2 6h4l2-4z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    fallbackLink: "/skills",
  },
  sequence_step_sent: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="#6366f1" strokeWidth="1.5" />
        <path d="M2 6l6 3.5L14 6" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    fallbackLink: "/outbound?tab=sequences",
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        if (data.notifications) setNotifications(data.notifications);
        if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const markAsRead = (id: string) => {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(() => fetchNotifications());
  };

  const markAllAsRead = () => {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).then(() => fetchNotifications());
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) {
      router.push(n.link);
      setIsOpen(false);
    } else {
      const config = TYPE_CONFIG[n.type];
      if (config?.fallbackLink) {
        router.push(config.fallbackLink);
        setIsOpen(false);
      }
    }
  };

  const displayedNotifications = notifications.slice(0, 30);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2a5 5 0 00-5 5v3l-1.5 2.5a.5.5 0 00.43.75h12.14a.5.5 0 00.43-.75L15 10V7a5 5 0 00-5-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 14a2 2 0 004 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[#141822] border border-[#1e293b] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
            <h3 className="text-sm font-semibold text-[#e2e8f0]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {displayedNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#64748b] text-sm">
                No notifications yet
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.skill_executed;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors hover:bg-white/5 border-l-2 ${
                      n.is_read
                        ? "border-transparent"
                        : "border-amber-400 bg-amber-500/5"
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm leading-tight ${
                          n.is_read ? "text-[#94a3b8]" : "text-[#e2e8f0] font-medium"
                        }`}
                      >
                        {n.title}
                      </div>
                      {n.message && (
                        <div className="text-xs text-[#64748b] mt-0.5 truncate">
                          {n.message}
                        </div>
                      )}
                      <div className="text-[10px] text-[#475569] mt-1">
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 30 && (
            <div className="px-4 py-2 border-t border-[#1e293b] text-center">
              <span className="text-xs text-[#64748b]">
                Showing 30 of {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
