'use client';

import * as React from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  onClose?: () => void;
}

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const variants = {
  info: 'bg-[#eef1ff] border-[#dbe2ff] text-[#2445c7]',
  success: 'bg-[#e8f6f1] border-[#c7ebdf] text-[#148267]',
  warning: 'bg-[#fff3e5] border-[#f8d9b5] text-[#b85c12]',
  error: 'bg-[#fef0ef] border-[#f4c7c3] text-[#b42318]',
};

const iconColors = {
  info: 'text-[#365cf5]',
  success: 'text-[#148267]',
  warning: 'text-[#b85c12]',
  error: 'text-[#b42318]',
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  description,
  onClose,
  className,
  children,
  ...props
}) => {
  const Icon = icons[variant];

  return (
    <div
      role="alert"
      className={cn(
        'relative rounded-[10px] border p-4 flex items-start gap-3',
        variants[variant],
        className
      )}
      {...props}
    >
      <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', iconColors[variant])} />
      <div className="flex-1 space-y-1">
        {title && <div className="font-semibold text-sm">{title}</div>}
        {description && <div className="text-sm opacity-90">{description}</div>}
        {children && <div className="text-sm">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export interface ToastProps {
  id: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  duration?: number;
}

export const Toast: React.FC<ToastProps & { onClose: () => void }> = ({
  variant = 'info',
  title,
  description,
  onClose,
}) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <Alert
      variant={variant}
      title={title}
      description={description}
      onClose={onClose}
      className="shadow-lg animate-in slide-in-from-right"
    />
  );
};
