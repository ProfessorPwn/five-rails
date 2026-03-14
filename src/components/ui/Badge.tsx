"use client";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "amber"
  | "blue"
  | "emerald"
  | "violet"
  | "rose";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-white/5 text-[#94a3b8] border-[#1e293b]",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  danger: "bg-red-500/10 text-red-400 border-red-500/30",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

export default function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
