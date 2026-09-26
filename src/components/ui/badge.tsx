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
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    sap: 'bg-blue-50 text-blue-800 border border-blue-200',
    cpi: 'bg-sky-50 text-sky-800 border border-sky-200 font-semibold',
    s4: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    protocol: 'bg-purple-50 text-purple-800 border border-purple-200',
    success: 'bg-green-50 text-green-700 border border-green-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-red-50 text-red-700 border border-red-200',
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
