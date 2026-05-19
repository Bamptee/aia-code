/**
 * Brand block du Sidebar (handoff §5).
 * Carré 26×26 accent avec "A" blanc + nom "AIA" + badge mono "v2".
 */
export function BrandBlock() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded bg-accent text-accent-ink">
        <span className="text-sm font-semibold">A</span>
      </div>
      <span className="text-sm font-semibold text-text">AIA</span>
      <span className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-text-3">
        v2
      </span>
    </div>
  );
}
