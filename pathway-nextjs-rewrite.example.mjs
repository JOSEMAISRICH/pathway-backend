/**
 * Si tu front Next.js corre en :5500 y el API Express en :3000,
 * las peticiones a "/api/..." deben reenviarse al backend.
 *
 * En tu proyecto del front, en next.config.mjs (o .ts), fusiona esto con tu config:
 *
 *   async rewrites() {
 *     return [
 *       { source: '/api/:path*', destination: 'http://localhost:3000/api/:path*' },
 *     ];
 *   },
 *
 * Reinicia "npm run dev" del front. Asegúrate de que el backend también esté en :3000.
 */

export const pathwayApiRewrites = async () => [
  { source: '/api/:path*', destination: 'http://localhost:3000/api/:path*' },
];
