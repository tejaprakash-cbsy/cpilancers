export * from './database';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NavigationItem {
  name: string;
  href: string;
  icon?: string;
  badge?: string | number;
  roles?: ('client' | 'consultant' | 'admin' | 'public')[];
}
