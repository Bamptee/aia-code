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
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var a=localStorage.getItem('accent');var r=document.documentElement;if(t&&t!=='undefined')r.dataset.theme=t;if(a&&a!=='undefined')r.dataset.accent=a;}catch(e){}})();`;
