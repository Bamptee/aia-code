/**
 * @fileoverview Unit tests for AI Provider
 * Uses Node.js built-in test runner (node:test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import { AIProvider, AI_PROVIDER_TYPE } from '../../src/epic/providers/ai-provider.js';
import { ConfigurationError, AIResponseError, AIUnavailableError } from '../../src/epic/utils/errors.js';

// Mock fetch helpers
function createMockAnthropicResponse(content) {
  return async () => ({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: content }],
    }),
  });
}

function createMockOpenAIResponse(content) {
  return async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  });
}

function createMockErrorResponse(status, errorMessage) {
  return async () => ({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({
      error: { message: errorMessage },
    }),
  });
}

describe('AIProvider', () => {
  describe('constructor', () => {
    test('defaults to Anthropic provider', () => {
      const provider = new AIProvider();
      assert.strictEqual(provider.getProvider(), AI_PROVIDER_TYPE.ANTHROPIC);
    });

    test('uses provided provider type', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.OPENAI });
      assert.strictEqual(provider.getProvider(), AI_PROVIDER_TYPE.OPENAI);
    });

    test('uses default model for provider', () => {
      const anthropic = new AIProvider({ provider: AI_PROVIDER_TYPE.ANTHROPIC });
      assert.strictEqual(anthropic.getModel(), 'claude-3-5-sonnet-20241022');

      const openai = new AIProvider({ provider: AI_PROVIDER_TYPE.OPENAI });
      assert.strictEqual(openai.getModel(), 'gpt-4o');
    });

    test('uses custom model when provided', () => {
      const provider = new AIProvider({ model: 'custom-model' });
      assert.strictEqual(provider.getModel(), 'custom-model');
    });
  });

  describe('isConfigured', () => {
    test('returns false when no API key for Anthropic', () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: null,
      });
      assert.strictEqual(provider.isConfigured(), false);
    });

    test('returns true when API key is set', () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
      });
      assert.strictEqual(provider.isConfigured(), true);
    });

    test('returns true for local provider without key', () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.LOCAL,
      });
      assert.strictEqual(provider.isConfigured(), true);
    });
  });

  describe('generate', () => {
    test('throws ConfigurationError when not configured', async () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: null,
      });

      await assert.rejects(
        async () => {
          await provider.generate('Test prompt');
        },
        ConfigurationError
      );
    });

    test('generates with Anthropic', async () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: createMockAnthropicResponse('Generated content'),
      });

      const result = await provider.generate('Test prompt');
      assert.strictEqual(result, 'Generated content');
    });

    test('generates with OpenAI', async () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.OPENAI,
        apiKey: 'test-key',
        fetchFn: createMockOpenAIResponse('OpenAI response'),
      });

      const result = await provider.generate('Test prompt');
      assert.strictEqual(result, 'OpenAI response');
    });

    test('generates locally', async () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.LOCAL,
      });

      const result = await provider.generate('Test prompt');
      assert.ok(result.includes('[LOCAL AI RESPONSE]'));
    });

    test('handles API errors', async () => {
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: createMockErrorResponse(400, 'Bad request'),
      });

      await assert.rejects(
        async () => {
          await provider.generate('Test prompt');
        },
        AIResponseError
      );
    });

    test('respects max tokens option', async () => {
      let capturedBody;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Response' }],
            }),
          };
        },
      });

      await provider.generate('Test', { maxTokens: 1000 });
      assert.strictEqual(capturedBody.max_tokens, 1000);
    });

    test('respects temperature option', async () => {
      let capturedBody;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Response' }],
            }),
          };
        },
      });

      await provider.generate('Test', { temperature: 0.5 });
      assert.strictEqual(capturedBody.temperature, 0.5);
    });
  });

  describe('generateBrief', () => {
    test('generates brief from input', async () => {
      let capturedPrompt;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedPrompt = JSON.parse(options.body).messages[0].content;
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Feature brief content' }],
            }),
          };
        },
      });

      const result = await provider.generateBrief('User authentication feature');

      assert.ok(capturedPrompt.includes('User authentication feature'));
      assert.ok(capturedPrompt.includes('feature brief'));
      assert.strictEqual(result, 'Feature brief content');
    });
  });

  describe('generateBASpec', () => {
    test('generates BA spec from brief', async () => {
      let capturedPrompt;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedPrompt = JSON.parse(options.body).messages[0].content;
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'BA specification content' }],
            }),
          };
        },
      });

      const result = await provider.generateBASpec('Feature brief here');

      assert.ok(capturedPrompt.includes('Feature brief here'));
      assert.ok(capturedPrompt.includes('acceptance criteria'));
      assert.strictEqual(result, 'BA specification content');
    });
  });

  describe('generateQuestions', () => {
    test('generates questions from spec', async () => {
      let capturedPrompt;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedPrompt = JSON.parse(options.body).messages[0].content;
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Question 1\nQuestion 2' }],
            }),
          };
        },
      });

      const result = await provider.generateQuestions('Specification text');

      assert.ok(capturedPrompt.includes('Specification text'));
      assert.ok(capturedPrompt.includes('clarifying questions'));
      assert.ok(result.includes('Question 1'));
    });
  });

  describe('generatePOC', () => {
    test('generates POC code', async () => {
      let capturedPrompt;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedPrompt = JSON.parse(options.body).messages[0].content;
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'function poc() {}' }],
            }),
          };
        },
      });

      const result = await provider.generatePOC('Create a login form', 'React project');

      assert.ok(capturedPrompt.includes('Create a login form'));
      assert.ok(capturedPrompt.includes('React project'));
      assert.ok(result.includes('function poc'));
    });

    test('uses higher max tokens for POC', async () => {
      let capturedBody;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Code' }],
            }),
          };
        },
      });

      await provider.generatePOC('Spec');
      assert.strictEqual(capturedBody.max_tokens, 8192);
    });
  });

  describe('generateCustom', () => {
    test('uses custom template', async () => {
      let capturedPrompt;
      const provider = new AIProvider({
        provider: AI_PROVIDER_TYPE.ANTHROPIC,
        apiKey: 'test-key',
        fetchFn: async (url, options) => {
          capturedPrompt = JSON.parse(options.body).messages[0].content;
          return {
            ok: true,
            json: async () => ({
              content: [{ text: 'Custom result' }],
            }),
          };
        },
      });

      const template = 'Custom template: {input}';
      const result = await provider.generateCustom(template, 'my input');

      assert.strictEqual(capturedPrompt, 'Custom template: my input');
      assert.strictEqual(result, 'Custom result');
    });
  });

  describe('validateResponse', () => {
    test('returns valid for good response', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('This is a valid response');

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.issues, []);
    });

    test('returns invalid for empty response', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('');

      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.length > 0);
    });

    test('checks minimum length', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('Short', { minLength: 100 });

      assert.strictEqual(result.valid, false);
      assert.ok(result.issues[0].includes('too short'));
    });

    test('checks maximum length', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('A'.repeat(1000), { maxLength: 100 });

      assert.strictEqual(result.valid, false);
      assert.ok(result.issues[0].includes('too long'));
    });

    test('checks required terms', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('Hello world', {
        contains: ['acceptance', 'criteria'],
      });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.issues.length, 2);
    });

    test('passes when terms are present', () => {
      const provider = new AIProvider({ provider: AI_PROVIDER_TYPE.LOCAL });
      const result = provider.validateResponse('Acceptance criteria are met', {
        contains: ['acceptance', 'criteria'],
      });

      assert.strictEqual(result.valid, true);
    });
  });
});
