import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';

const MODEL_PREFIXES = [
  { test: (m) => m.startsWith('gpt-') || m.startsWith('o'),          provider: openai },
  { test: (m) => m.startsWith('claude-'),                             provider: anthropic },
  { test: (m) => m.startsWith('gemini-'),                             provider: gemini },
];

export function getProvider(model) {
  const match = MODEL_PREFIXES.find((entry) => entry.test(model));
  if (!match) {
    throw new Error(`No provider found for model "${model}".`);
  }
  return match.provider;
}
