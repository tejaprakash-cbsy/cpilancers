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
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-900',
};

const iconColors = {
  info: 'text-blue-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
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
        'relative rounded-lg border p-4 flex items-start gap-3',
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
