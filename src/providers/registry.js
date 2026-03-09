import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';

const MODEL_PREFIXES = [
  { test: (m) => m.startsWith('gpt-') || /^o[0-9]/.test(m), provider: openai },
  { test: (m) => m.startsWith('claude-'),                    provider: anthropic },
  { test: (m) => m.startsWith('gemini-'),                    provider: gemini },
];

export function getProvider(model) {
  if (!model || typeof model !== 'string') {
    throw new Error('Model name must be a non-empty string.');
  }

  const match = MODEL_PREFIXES.find((entry) => entry.test(model));
  if (!match) {
    throw new Error(`No provider found for model "${model}".`);
  }
  return match.provider;
}
