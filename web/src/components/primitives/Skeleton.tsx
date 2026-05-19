/**
 * Skeleton matching layout (handoff §15, Pattern Loading States).
 * Shimmer cycle 2s lent + fade-out 150ms à l'arrivée du contenu.
 *
 * Usage Tailwind v4 :
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-10 w-full rounded-lg" />
 */
export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={
        'rounded animate-shimmer bg-[length:200%_100%] ' +
        '[background-image:linear-gradient(90deg,var(--surface-hover)_0%,var(--surface)_50%,var(--surface-hover)_100%)] ' +
        className
      }
      {...props}
    />
  );
}
