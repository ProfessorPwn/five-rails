"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";

const baseStyles =
  "w-full bg-[#0f1118] border border-[#1e293b] rounded-lg px-3 py-2 text-[#e2e8f0] placeholder-[#64748b] transition-colors duration-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-[#94a3b8]">{label}</label>
        )}
        <input ref={ref} className={`${baseStyles} ${className}`} {...props} />
      </div>
    );
  }
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-[#94a3b8]">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`${baseStyles} resize-y min-h-[80px] ${className}`}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-[#94a3b8]">{label}</label>
        )}
        <select ref={ref} className={`${baseStyles} cursor-pointer ${className}`} {...props}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";
