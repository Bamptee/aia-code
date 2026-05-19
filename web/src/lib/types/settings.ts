/**
 * Settings types (handoff §12 + FR-19/20/21/22).
 */

import type { StepKey, Phase } from './step';

export type ConnectionState = 'connected' | 'disconnected' | 'unknown';

export interface IntegrationMeta {
  state: ConnectionState;
  lastVerifiedAt: string | null;
}

export interface BitbucketSettings extends IntegrationMeta {
  workspace: string;
  repo: string;
  branchPattern: string;
  phaseTargets: Record<Phase, string>;
  stepPipelines: Partial<Record<StepKey, string[]>>;
}

export type EpicMappingMode = 'folder' | 'list' | 'tag';

export interface ClickUpSettings extends IntegrationMeta {
  apiKey: string;
  workspace: string;
  list: string;
  epicMapping: EpicMappingMode;
  statusMapping: Array<{ aia: string; clickup: string }>;
}

export interface ModelAssignment {
  name: string;
  weight: number;
}

export type ModelsConfig = Record<StepKey, ModelAssignment[]>;

export type ConnectionTestStatus = 'idle' | 'pending' | 'success' | 'failed';

export interface ConnectionTestResult {
  status: ConnectionTestStatus;
  message: string | null;
}
