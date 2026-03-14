"use client";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export default function Card({ children, className = "", onClick, hover = true }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#141822] border border-[#1e293b] rounded-xl p-5 transition-all duration-200 ${
        hover
          ? "hover:bg-[#1c2030] hover:border-[#2a3348] hover:-translate-y-0.5 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
          : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
