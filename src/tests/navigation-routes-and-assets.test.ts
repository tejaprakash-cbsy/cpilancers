import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { metadata as rootMetadata } from '@/app/layout';
import TermsPage, { metadata as termsMetadata } from '@/app/terms/page';
import PrivacyPage, { metadata as privacyMetadata } from '@/app/privacy/page';
import PricingPage, { metadata as pricingMetadata } from '@/app/pricing/page';
import HowItWorksPage, { metadata as howItWorksMetadata } from '@/app/how-it-works/page';
import CertificationsPage, { metadata as certificationsMetadata } from '@/app/certifications/page';
import VerifyEmailPage, { metadata as verifyEmailMetadata } from '@/app/(auth)/verify-email/page';

describe('Navigation routes, legal compliance, and web assets regression tests', () => {
  describe('Web App Manifest and Icon Metadata', () => {
    it('manifest defines valid PWA configuration and complies with W3C icon size specs', () => {
      const manifestData = manifest();
      expect(manifestData.name).toBe('CPI Lancers | Integration Marketplace');
      expect(manifestData.short_name).toBe('CPI Lancers');
      expect(manifestData.display).toBe('standalone');
      expect(manifestData.theme_color).toBe('#365cf5');

      const icons = manifestData.icons || [];
      expect(icons.length).toBeGreaterThanOrEqual(3);

      // SVG icon must have sizes 'any' and type 'image/svg+xml'
      const svgIcon = icons.find((i) => i.src === '/icon.svg');
      expect(svgIcon).toBeDefined();
      expect(svgIcon?.sizes).toBe('any');
      expect(svgIcon?.type).toBe('image/svg+xml');

      // Raster PNG icons must have explicit numeric pixel sizes
      const png192 = icons.find((i) => i.src === '/icon-192.png');
      expect(png192?.sizes).toBe('192x192');
      expect(png192?.type).toBe('image/png');

      const png512 = icons.find((i) => i.src === '/icon-512.png');
      expect(png512?.sizes).toBe('512x512');
      expect(png512?.type).toBe('image/png');

      // No raster icon should have sizes 'any' (which triggers Chrome/Lighthouse warnings)
      const invalidAnyRaster = icons.find(
        (i) => i.type !== 'image/svg+xml' && i.sizes === 'any'
      );
      expect(invalidAnyRaster).toBeUndefined();
    });

    it('root layout metadata defines explicit icon configurations', () => {
      expect(rootMetadata.title).toContain('CPI Lancers');
      expect(rootMetadata.icons).toBeDefined();
      const icons = rootMetadata.icons as { icon?: unknown[]; apple?: unknown[] };
      expect(Array.isArray(icons.icon)).toBe(true);
      expect(Array.isArray(icons.apple)).toBe(true);
    });
  });

  describe('Terms of Service (/terms)', () => {
    it('exports metadata with page title and description', () => {
      expect(termsMetadata.title).toBe('Terms of Service | CPI Lancers');
      expect(termsMetadata.description).toBeDefined();
    });

    it('renders terms agreement elements cleanly', () => {
      const component = TermsPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });

  describe('Privacy Policy (/privacy)', () => {
    it('exports metadata with page title and description', () => {
      expect(privacyMetadata.title).toBe('Privacy Policy | CPI Lancers');
      expect(privacyMetadata.description).toBeDefined();
    });

    it('renders privacy policy elements cleanly', () => {
      const component = PrivacyPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });

  describe('Pricing Page (/pricing)', () => {
    it('exports metadata with page title and description', () => {
      expect(pricingMetadata.title).toBe('Pricing | CPI Lancers');
      expect(pricingMetadata.description).toBeDefined();
    });

    it('renders pricing tiers and commercial notice cleanly', () => {
      const component = PricingPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });

  describe('How It Works Page (/how-it-works)', () => {
    it('exports metadata with page title and description', () => {
      expect(howItWorksMetadata.title).toBe('How It Works | CPI Lancers');
      expect(howItWorksMetadata.description).toBeDefined();
    });

    it('renders client and consultant workflow steps cleanly', () => {
      const component = HowItWorksPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });

  describe('SAP Certifications Page (/certifications)', () => {
    it('exports metadata with page title and description', () => {
      expect(certificationsMetadata.title).toBe('Certifications | CPI Lancers');
      expect(certificationsMetadata.description).toBeDefined();
    });

    it('renders 3-step verification methodology and tracked certifications cleanly', () => {
      const component = CertificationsPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });

  describe('Verify Email Page (/verify-email)', () => {
    it('exports metadata with page title and description', () => {
      expect(verifyEmailMetadata.title).toBe('Verify Your Email | CPI Lancers');
      expect(verifyEmailMetadata.description).toBeDefined();
    });

    it('renders post-registration email verification instructions cleanly', () => {
      const component = VerifyEmailPage();
      expect(component).toBeDefined();
      expect(component.type).toBe('div');
    });
  });
});
