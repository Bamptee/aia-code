/**
 * Inline script source for SSR `<head>`.
 *
 * Runs synchronously before React hydration. Reads `theme` and `accent` from
 * localStorage and applies them to <html> as `data-theme` / `data-accent`,
 * overriding the SSR default ("dark").
 *
 * The check `t !== 'undefined'` guards against the classic bug where
 * `localStorage.setItem('theme', undefined)` stores the string "undefined".
 *
 * Used in app/layout.tsx via:
 *   <script dangerouslySetInnerHTML={{ __html: themeScript }} />
 *
 * Must remain ES5-compatible (runs before any bundling/transpilation).
 */
/*
 * Whitelist explicite des valeurs acceptées pour `theme` et `accent`. Si localStorage
 * contient une valeur inattendue (corruption, vieille version, injection manuelle),
 * on l'ignore plutôt que d'appliquer un attribut data-* invalide qui casserait le rendu.
 *
 * IMPORTANT : ne JAMAIS interpoler de variable dans cette string template-literal.
 * Si tu dois ajouter du dynamisme un jour, utilise un nonce CSP côté script tag.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var a=localStorage.getItem('accent');var r=document.documentElement;if(t==='light'||t==='dark')r.dataset.theme=t;if(a==='neutral'||a==='indigo'||a==='forest'||a==='rust')r.dataset.accent=a;}catch(e){}})();`;
