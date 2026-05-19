import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /*
   * Spike findings (Sprint 0) :
   * - Story 1.2 : Next.js 16 rewrites passent les SSE streams sans buffering
   *   (dev + prod). D4 (SSE pass-through) validé.
   * - Story 1.3 : Pattern défensif useRef dans useChatStream empêche les
   *   double-connexions SSE en React Strict Mode + dev mode. AC-1 validé
   *   (server logs : active=1 toujours, jamais 2).
   * - Story 1.4 : output:'standalone' produit un bundle mais npm pack strip
   *   ses node_modules. Pas distribuable directement via npm. Stratégie à
   *   trancher en Story 1.6 (aia ui command).
   * - Story 1.5 : dev loop concurrently OK. turbopack.root explicite pour
   *   silencer le warning "inferred workspace root" (multiple lockfiles
   *   dans le filesystem parent).
   *
   * Le rewrite réel /api/:path* → Express :3001 sera ajouté quand on cablera
   * le front Next.js sur les routes API existantes (Stories Epic 2+).
   */
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  /*
   * Story 2.1 : rewrite toutes les routes /api/* vers l'Express backend :3001.
   * Pattern D1 / D4 validés par Spike 1.2 (SSE pass-through OK).
   * Le browser fait fetch('/api/...') et Next.js forward vers Express :3001.
   */
  async rewrites() {
    return [
      // 127.0.0.1 explicite (pas `localhost`) pour éviter les fails IPv6 — Node 18+
      // peut résoudre localhost vers ::1 alors qu'Express bind IPv4 only.
      { source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' },
    ];
  },
};

export default nextConfig;
