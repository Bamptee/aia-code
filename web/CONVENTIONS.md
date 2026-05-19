# Web — Conventions

Source de vérité pour le code dans `aia-code/web/` (Next.js App Router + React 19 + Tailwind v4).

## 5 règles non-négociables

1. **Adapter layer obligatoire** : tout fetch via `src/lib/api/client.ts`. Composants consomment uniquement des types normalisés depuis `src/lib/types/`.
2. **State serveur via React Query** : jamais `useState + useEffect(fetch)`.
3. **SSE via `useChatStream`** : jamais `EventSource` direct dans un composant.
4. **Theme/accent via Context `ThemeProvider`** : jamais Zustand v1, jamais classes Tailwind `dark:` conditionnelles à un state React.
5. **URL state via `lib/url/setParam.ts`** : jamais `router.push` direct pour `searchParams`.

## Stack figée

- Next.js 16.2.6 (App Router, Turbopack default, React Compiler optional)
- React 19.2.4
- TypeScript strict
- Tailwind v4 (CSS-first config, pas de `tailwind.config.ts`)
- ESLint 9 flat config (`eslint.config.mjs`)
- `next/font/google` pour Geist + Geist Mono

## Références complètes

- Architecture : `../../_bmad-output/planning-artifacts/architecture.md`
- Patterns d'implémentation : §Implementation Patterns dans architecture
- Stories backlog : `../../_bmad-output/planning-artifacts/epics.md`
- Design source : `../../design_handoff_aia_workspace/README.md`
