import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const mockGetCurrentUser = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getCurrentUser: () => mockGetCurrentUser(),
  },
}));

import { requireRole, CLIENT_ROLES, CONSULTANT_ROLES } from '@/lib/auth/require-role';
import AdminLayout from '@/app/admin/layout';
import ClientDashboardLayout from '@/app/dashboard/client/layout';
import ConsultantDashboardLayout from '@/app/dashboard/consultant/layout';

const TEST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireRole helper and layout guards', () => {
  describe('unauthenticated access', () => {
    it('redirects an unauthenticated user to /login on requireRole', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(requireRole(['admin'])).rejects.toThrow('REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('redirects an unauthenticated visitor away from AdminLayout to /login', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(AdminLayout({ children: 'admin-page' })).rejects.toThrow('REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('redirects an unauthenticated visitor away from ClientDashboardLayout to /login', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(ClientDashboardLayout({ children: 'client-dashboard' })).rejects.toThrow('REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });

    it('redirects an unauthenticated visitor away from ConsultantDashboardLayout to /login', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await expect(ConsultantDashboardLayout({ children: 'consultant-dashboard' })).rejects.toThrow('REDIRECT:/login');
      expect(mockRedirect).toHaveBeenCalledWith('/login');
    });
  });

  describe('cross-role redirection without loops', () => {
    it('redirects a client attempting to access AdminLayout to /dashboard/client', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'client@example.com', role: 'client' });

      await expect(AdminLayout({ children: 'admin-page' })).rejects.toThrow('REDIRECT:/dashboard/client');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard/client');
    });

    it('redirects a consultant attempting to access AdminLayout to /dashboard/consultant', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'consultant@example.com', role: 'consultant' });

      await expect(AdminLayout({ children: 'admin-page' })).rejects.toThrow('REDIRECT:/dashboard/consultant');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard/consultant');
    });

    it('redirects a consultant attempting to access ClientDashboardLayout to /dashboard/consultant', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'consultant@example.com', role: 'consultant' });

      await expect(ClientDashboardLayout({ children: 'client-dashboard' })).rejects.toThrow('REDIRECT:/dashboard/consultant');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard/consultant');
    });

    it('redirects a client attempting to access ConsultantDashboardLayout to /dashboard/client', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'client@example.com', role: 'client' });

      await expect(ConsultantDashboardLayout({ children: 'consultant-dashboard' })).rejects.toThrow('REDIRECT:/dashboard/client');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard/client');
    });
  });

  describe('authorized layout access', () => {
    it('allows an active administrator into AdminLayout', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'admin@example.com', role: 'admin' });

      const result = await AdminLayout({ children: 'admin-content' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('allows an active client into ClientDashboardLayout and requireRole(CLIENT_ROLES)', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'client@example.com', role: 'client' });

      const role = await requireRole(CLIENT_ROLES);
      expect(role).toBe('client');
      const result = await ClientDashboardLayout({ children: 'client-content' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('allows an active consultant into ConsultantDashboardLayout and requireRole(CONSULTANT_ROLES)', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: TEST_ID, email: 'consultant@example.com', role: 'consultant' });

      const role = await requireRole(CONSULTANT_ROLES);
      expect(role).toBe('consultant');
      const result = await ConsultantDashboardLayout({ children: 'consultant-content' });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
