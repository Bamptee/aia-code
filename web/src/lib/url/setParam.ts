/**
 * URL state helper (Story 3.2, architecture §State Management).
 *
 * Modifie les searchParams via `history.replaceState` + dispatch `popstate`
 * pour que Next.js `useSearchParams` resync **sans re-render server-side**.
 *
 * Pourquoi pas `router.push` ou `router.replace` ?
 * - Next.js App Router router.push/replace déclenchent un re-render des Server
 *   Components avec les nouveaux searchParams. C'est coûteux et inutile pour
 *   du state purement client (ex: toggle Read mode, switch step actif).
 * - `history.replaceState` est purement côté client : pas de fetch server,
 *   pas de re-render hors composants qui lisent `useSearchParams`.
 *
 * Pourquoi dispatch un PopStateEvent ?
 * - `useSearchParams` ne s'abonne qu'aux popstate events natifs. Sans dispatch
 *   manuel, l'URL change mais le hook ne le voit pas → state désynchronisé.
 *
 * Tous les changements de searchParams dans l'app passent par ce helper.
 * Règle non-négociable architecture §Implementation Patterns #5.
 */

export function setSearchParam(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  if (value === null) {
    params.delete(key);
  } else {
    params.set(key, value);
  }

  const query = params.toString();
  const newUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;

  window.history.replaceState(window.history.state, '', newUrl);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/**
 * Batch update plusieurs searchParams en une opération atomique.
 * Évite multiple dispatch popstate + re-render React.
 */
export function setSearchParams(updates: Record<string, string | null>): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const query = params.toString();
  const newUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;

  window.history.replaceState(window.history.state, '', newUrl);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}
