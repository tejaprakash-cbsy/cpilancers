'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-[10px] cursor-pointer';

    const variants = {
      primary:
        'bg-[#365cf5] text-white hover:bg-[#2445c7] active:bg-[#1d39a8] focus-visible:ring-[#365cf5]',
      secondary:
        'bg-[#eef1ff] text-[#2445c7] hover:bg-[#e1e6ff] active:bg-[#d5ddff] focus-visible:ring-[#365cf5]',
      outline:
        'border border-[#dde1e7] bg-white text-[#172033] hover:bg-[#f5f6f8] active:bg-[#eef1ff] focus-visible:ring-[#365cf5]',
      ghost:
        'text-[#667085] hover:bg-[#f5f6f8] hover:text-[#172033] active:bg-[#eef1ff] focus-visible:ring-[#365cf5]',
      danger:
        'bg-[#b42318] text-white hover:bg-[#912018] active:bg-[#7a1a13] focus-visible:ring-[#b42318]',
      success:
        'bg-[#148267] text-white hover:bg-[#0f6b55] active:bg-[#0b5947] focus-visible:ring-[#148267]',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
