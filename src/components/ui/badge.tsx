'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'sap' | 'cpi' | 's4' | 'protocol' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  children,
  variant = 'default',
  size = 'md',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center font-medium rounded-full';

  const variants = {
    default: 'bg-[#f0f2f5] text-[#667085] border border-transparent',
    sap: 'bg-[#eef1ff] text-[#2445c7] border border-transparent',
    cpi: 'bg-[#eef1ff] text-[#2445c7] border border-transparent font-semibold',
    s4: 'bg-[#e8f6f1] text-[#148267] border border-transparent',
    protocol: 'bg-[#f0f2f5] text-[#667085] border border-transparent',
    success: 'bg-[#e8f6f1] text-[#148267] border border-transparent',
    warning: 'bg-[#fff3e5] text-[#b85c12] border border-transparent',
    danger: 'bg-[#fef0ef] text-[#b42318] border border-transparent',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  );
};
