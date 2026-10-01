import * as React from 'react';
import { cn } from '@/lib/utils';

export type LogoVariant = 'light' | 'dark';

const MARK_COLOR: Record<LogoVariant, string> = {
  light: '#365cf5',
  dark: '#4169fa',
};

const DOT_COLOR: Record<LogoVariant, string> = {
  light: '#172033',
  dark: '#ffffff',
};

export interface LogoMarkProps extends Omit<React.SVGProps<SVGSVGElement>, 'aria-label'> {
  /** Rendered edge length in px. */
  size?: number;
  /** `light` for pale backgrounds, `dark` for the navy dashboard/footer surfaces. */
  variant?: LogoVariant;
  /** Accessible name. Omit (or set `aria-hidden`) when a wordmark sits next to it. */
  'aria-label'?: string;
}

/**
 * The CPI Lancers glyph: a rounded "L" with a diagonal stroke rising to a
 * solid dot, signalling growth and a direct line to the person you hire.
 */
export function LogoMark({ size = 32, variant = 'light', className, ...props }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={cn('shrink-0', className)}
      {...props}
    >
      <path
        d="M11 11V89H89"
        stroke={MARK_COLOR[variant]}
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 80L74 26" stroke={MARK_COLOR[variant]} strokeWidth={9.5} strokeLinecap="round" />
      <circle cx="82.5" cy="17.5" r="13" fill={DOT_COLOR[variant]} />
    </svg>
  );
}

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Height of the mark in px; the wordmark scales proportionally from it. */
  size?: number;
  variant?: LogoVariant;
}

/**
 * Full horizontal lockup: the mark plus the "CPI Lancers" wordmark. The
 * wrapper's font-size is the mark size, so everything inside scales as one unit
 * and the wordmark sits optically centred against the glyph.
 */
export function Logo({ size = 34, variant = 'light', className, style, ...props }: LogoProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-[0.3em]', className)}
      style={{ fontSize: `${size}px`, ...style }}
      {...props}
    >
      <LogoMark size={size} variant={variant} aria-hidden focusable="false" />
      <span className="whitespace-nowrap text-[0.58em] tracking-[-0.015em]">
        <span className={cn('font-bold', variant === 'dark' ? 'text-white' : 'text-[#172033]')}>
          CPI
        </span>
        {' '}
        <span className={cn('font-medium', variant === 'dark' ? 'text-white' : 'text-[#365cf5]')}>
          Lancers
        </span>
      </span>
    </span>
  );
}