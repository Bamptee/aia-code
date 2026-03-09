import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';

const MODEL_ALIASES = {
  'claude-default':  { provider: anthropic, model: null },
  'openai-default':  { provider: openai,    model: null },
  'codex-default':   { provider: openai,    model: null },
  'gemini-default':  { provider: gemini,    model: null },
};

const MODEL_PREFIXES = [
  { test: (m) => m.startsWith('gpt-') || /^o[0-9]/.test(m), provider: openai },
  { test: (m) => m.startsWith('claude-'),                    provider: anthropic },
  { test: (m) => m.startsWith('gemini-'),                    provider: gemini },
];

export function resolveModelAlias(model) {
  if (!model || typeof model !== 'string') {
    throw new Error('Model name must be a non-empty string.');
  }

  const alias = MODEL_ALIASES[model];
  if (alias) {
    return { provider: alias.provider, model: alias.model };
  }

  const match = MODEL_PREFIXES.find((entry) => entry.test(model));
  if (!match) {
    throw new Error(`No provider found for model "${model}".`);
  }

  return { provider: match.provider, model };
}

export function getProvider(model) {
  return resolveModelAlias(model).provider;
}
