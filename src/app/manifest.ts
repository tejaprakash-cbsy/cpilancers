import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CPI Lancers | Integration Marketplace',
    short_name: 'CPI Lancers',
    description:
      'CPI Lancers connects clients with elite, verified SAP Cloud Integration (CPI) and SAP Integration Suite consultants for mission-critical enterprise projects.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f6f8',
    theme_color: '#365cf5',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}