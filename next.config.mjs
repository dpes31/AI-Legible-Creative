/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      ...['phase1', 'phase2', 'phase3', 'phase4'].map(path => ({ source: `/${path}`, destination: '/review', permanent: false })),
      ...['phase5', 'validation', 'export'].map(path => ({ source: `/${path}`, destination: '/results', permanent: false })),
      { source: '/extract', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
