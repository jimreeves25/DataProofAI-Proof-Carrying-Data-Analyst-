'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function Logo({
  className,
  showText = true,
  size = 32,
  variant = 'dark',
}: {
  className?: string;
  showText?: boolean;
  size?: number;
  variant?: 'dark' | 'light';
}) {
  const textColor = variant === 'dark' ? 'text-slate-900' : 'text-white';
  const subColor = variant === 'dark' ? 'text-slate-400' : 'text-slate-300';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Outer shield shape - verification */}
        <path
          d="M24 2L6 8V22C6 32 14 40 24 46C34 40 42 32 42 22V8L24 2Z"
          fill="#1e3a5f"
          stroke="#2563eb"
          strokeWidth="1.5"
        />
        {/* Data bars inside */}
        <rect x="14" y="24" width="4" height="10" rx="1" fill="#60a5fa" />
        <rect x="22" y="18" width="4" height="16" rx="1" fill="#3b82f6" />
        <rect x="30" y="14" width="4" height="20" rx="1" fill="#2563eb" />
        {/* Checkmark at top - proof */}
        <path
          d="M18 10L22 14L30 6"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={cn('text-lg font-bold tracking-tight', textColor)}>
            DataProof<span className="text-blue-500">AI</span>
          </span>
          <span className={cn('text-[10px] font-medium tracking-wide', subColor)}>
            AI Analytics You Can Prove
          </span>
        </div>
      )}
    </div>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 2L6 8V22C6 32 14 40 24 46C34 40 42 32 42 22V8L24 2Z"
        fill="#1e3a5f"
        stroke="#2563eb"
        strokeWidth="1.5"
      />
      <rect x="14" y="24" width="4" height="10" rx="1" fill="#60a5fa" />
      <rect x="22" y="18" width="4" height="16" rx="1" fill="#3b82f6" />
      <rect x="30" y="14" width="4" height="20" rx="1" fill="#2563eb" />
      <path
        d="M18 10L22 14L30 6"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
