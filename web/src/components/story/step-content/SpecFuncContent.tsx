import { EmptyStep } from '@/components/primitives/EmptyStep';

/**
 * `spec-func` step — handoff §7.4 : meta dl (Owner/Status/Epic/Target) +
 * sections numérotées avec body/list/KPI grid.
 * V1 minimal : empty state. Le rendu structuré arrivera avec l'endpoint API.
 */
export function SpecFuncContent() {
  return (
    <EmptyStep
      title="Spec Func not generated"
      description="Generate the functional specification with goals, scope, FRs, and success metrics."
      onGenerate={undefined}
    />
  );
}
