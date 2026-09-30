'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  label,
  className,
  ...props
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin text-[#365cf5]', sizes[size])} />
      {label && <p className="text-sm text-[#667085] animate-pulse">{label}</p>}
    </div>
  );
};

interface LoadingPageProps {
  message?: string;
}

export const LoadingPage: React.FC<LoadingPageProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#f5f6f8]">
      <div className="text-center space-y-4">
        <Spinner size="xl" />
        <div className="space-y-2">
          <p className="text-lg font-medium text-[#172033]">{message}</p>
          <p className="text-sm text-[#667085]">Please wait a moment</p>
        </div>
      </div>
    </div>
  );
};

export const LoadingCard: React.FC = () => {
  return (
    <div className="bg-white rounded-[16px] border border-[#dde1e7] p-8">
      <div className="flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-[#667085]">Loading content...</p>
      </div>
    </div>
  );
};

export const LoadingOverlay: React.FC<{ isOpen: boolean; message?: string }> = ({
  isOpen,
  message = 'Processing...',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-[16px] shadow-xl p-8 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-base font-medium text-[#172033]">{message}</p>
        </div>
      </div>
    </div>
  );
};
