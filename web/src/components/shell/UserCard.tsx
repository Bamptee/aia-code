/**
 * User card en bas de Sidebar (handoff §5).
 * Stub pour Story 1.9 — pas de profile/account settings en v1 (PRD §5 Non-Goals).
 * Affiche un avatar gradient + nom + plan.
 */
export function UserCard() {
  return (
    <div className="flex items-center gap-2 rounded p-2 hover:bg-surface-hover">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-phase-product to-phase-dev text-xs font-semibold text-white">
        AG
      </div>
      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-xs font-semibold text-text">Anthony Gouriou</span>
        <span className="text-[10px] text-text-3">Solo Plan</span>
      </div>
    </div>
  );
}
