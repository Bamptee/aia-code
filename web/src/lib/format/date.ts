/**
 * Format relatif d'une date ISO 8601.
 *
 * - < 60s : "Ns ago"
 * - < 60min : "Nm ago"
 * - < 24h : "Nh ago"
 * - < 7d : "Nd ago"
 * - < 30d : "Nw ago"
 * - sinon : "Nmo ago" ou "Ny ago"
 *
 * Pour v1 solo-dev en français/anglais : ces strings concises.
 * Si besoin i18n complète, remplacer par Intl.RelativeTimeFormat ou date-fns post-v1.
 */
export function formatRelative(isoDate: string, now: number = Date.now()): string {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 5) return `${diffW}w ago`;
  const diffMo = Math.floor(diffD / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffY = Math.floor(diffD / 365);
  return `${diffY}y ago`;
}
