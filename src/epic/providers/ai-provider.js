/**
 * @fileoverview AI Provider - AI integration for content generation
 * @module epic/providers/ai-provider
 */

import { AIResponseError, AIUnavailableError, ConfigurationError } from '../utils/errors.js';

/**
 * Default timeout for AI requests in milliseconds
 * @type {number}
 */
const DEFAULT_TIMEOUT = 60000;

/**
 * Maximum retries for failed requests
 * @type {number}
 */
const MAX_RETRIES = 3;

/**
 * Provider types
 * @readonly
 * @enum {string}
 */
export const AI_PROVIDER_TYPE = Object.freeze({
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  LOCAL: 'local',
});

/**
 * Default models per provider
 * @private
 */
const DEFAULT_MODELS = {
  [AI_PROVIDER_TYPE.ANTHROPIC]: 'claude-3-5-sonnet-20241022',
  [AI_PROVIDER_TYPE.OPENAI]: 'gpt-4o',
  [AI_PROVIDER_TYPE.LOCAL]: 'local',
};

/**
 * Prompt templates for different generation tasks
 * @private
 */
const PROMPT_TEMPLATES = {
  // Story initialization - enriches user input
  storyInit: `You are a product discovery assistant helping to structure and enrich a feature idea.

User Input:
{input}

Task: Transform this initial input into a well-structured product discovery document.

Output Format (in markdown):
## Summary
A clear, concise summary of the feature/idea (2-3 sentences).

## Problem Statement
What problem does this solve? Who experiences this problem?

## Proposed Solution
High-level description of how this feature addresses the problem.

## Target Users
Who will use this feature? What are their needs?

## Key Requirements
- Bullet points of the main requirements
- Keep it high-level at this stage

## Constraints & Considerations
- Technical, business, or UX constraints to keep in mind

## Success Criteria
How will we know this feature is successful?

Be concise but thorough. Focus on discovery, not implementation.`,

  init: `You are a technical product init generator. Generate a concise feature init based on the following inputs.

{context}

Input:
{input}

Requirements:
- Write 2-3 paragraphs describing the feature
- Include the problem being solved
- Describe the expected user benefit
- Keep technical details minimal but mention key constraints if any
- Use clear, non-technical language where possible

Generate the feature init:`,

  specFunc: `You are a business analyst creating functional specifications. Generate a functional specification based on the following feature init and context.

{context}

Feature Init:
{input}

Requirements:
- Include acceptance criteria (as a numbered list)
- Define scope boundaries (in/out of scope)
- List assumptions and dependencies
- Identify potential risks
- Define success metrics
- Use clear, actionable language

Generate the functional specification:`,

  brainstorming: `You are a senior engineer reviewing a feature specification. Generate clarifying questions based on the following specification.

{context}

Specification:
{input}

Requirements:
- Generate 5-10 questions that should be answered before development
- Focus on technical ambiguities
- Ask about edge cases
- Question assumptions
- Identify potential integration points that need clarification
- Prioritize questions by importance

Generate the questions:`,

  // Iteration prompt - refines existing content based on feedback
  iterate: `You are helping to refine a product document based on user feedback.

Current Content:
{current}

User Feedback/Instructions:
{instructions}

{context}

Task: Update the content based on the user's feedback. Maintain the overall structure but incorporate the requested changes. Be precise and focused on the feedback provided.

Updated Content:`,

  poc: `You are a senior software engineer creating a proof of concept. Generate implementation code based on the following specification.

Specification:
{input}

Context:
{context}

Requirements:
- Generate working, well-structured code
- Include necessary imports and dependencies
- Add inline comments explaining key decisions
- Focus on the core functionality only
- Use modern best practices
- Include basic error handling

Generate the POC code:`,
};

/**
 * AI Provider for content generation
 */
export class AIProvider {
  /**
   * @param {Object} [options] - Configuration options
   * @param {string} [options.provider='anthropic'] - AI provider type
   * @param {string} [options.apiKey] - API key (from env if not provided)
   * @param {string} [options.model] - Model to use
   * @param {number} [options.timeout] - Request timeout in ms
   * @param {Function} [options.fetchFn] - Custom fetch function (for testing)
   */
  constructor(options = {}) {
    this.provider = options.provider || AI_PROVIDER_TYPE.ANTHROPIC;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.fetchFn = options.fetchFn || globalThis.fetch;

    // Get API key from options or environment
    if (this.provider === AI_PROVIDER_TYPE.ANTHROPIC) {
      this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
      this.baseUrl = 'https://api.anthropic.com/v1';
    } else if (this.provider === AI_PROVIDER_TYPE.OPENAI) {
      this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
      this.baseUrl = 'https://api.openai.com/v1';
    }

    this.model = options.model || DEFAULT_MODELS[this.provider];
  }

  /**
   * Checks if the provider is configured
   * @returns {boolean}
   */
  isConfigured() {
    if (this.provider === AI_PROVIDER_TYPE.LOCAL) {
      return true;
    }
    return Boolean(this.apiKey);
  }

  /**
   * Gets the current provider type
   * @returns {string}
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Gets the current model
   * @returns {string}
   */
  getModel() {
    return this.model;
  }

  /**
   * Generates content using the AI provider
   * @param {string} prompt - Prompt to send
   * @param {Object} [options] - Generation options
   * @param {number} [options.maxTokens=4096] - Maximum tokens to generate
   * @param {number} [options.temperature=0.7] - Temperature for generation
   * @returns {Promise<string>} Generated content
   */
  async generate(prompt, options = {}) {
    if (!this.isConfigured()) {
      throw new ConfigurationError(
        `AI provider ${this.provider} is not configured. Set the appropriate API key.`
      );
    }

    const { maxTokens = 4096, temperature = 0.7 } = options;

    if (this.provider === AI_PROVIDER_TYPE.LOCAL) {
      return this._generateLocal(prompt);
    }

    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (this.provider === AI_PROVIDER_TYPE.ANTHROPIC) {
          return await this._generateAnthropic(prompt, { maxTokens, temperature });
        } else if (this.provider === AI_PROVIDER_TYPE.OPENAI) {
          return await this._generateOpenAI(prompt, { maxTokens, temperature });
        }
      } catch (error) {
        lastError = error;
        if (error.name === 'ConfigurationError' || error.name === 'AIResponseError') {
          throw error;
        }
        // Retry on transient errors
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw new AIUnavailableError(`AI request failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  /**
   * Generates content using Anthropic Claude
   * @private
   */
  async _generateAnthropic(prompt, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIResponseError(`Anthropic API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new AIResponseError('Unexpected response format from Anthropic API');
      }

      return data.content[0].text;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new AIUnavailableError('AI request timed out');
      }
      throw error;
    }
  }

  /**
   * Generates content using OpenAI
   * @private
   */
  async _generateOpenAI(prompt, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIResponseError(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new AIResponseError('Unexpected response format from OpenAI API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new AIUnavailableError('AI request timed out');
      }
      throw error;
    }
  }

  /**
   * Generates content locally (for testing/development)
   * @private
   */
  _generateLocal(prompt) {
    // Local generation returns a placeholder response
    return `[LOCAL AI RESPONSE]

This is a locally generated placeholder response for:
${prompt.substring(0, 200)}...

Note: Configure an AI provider (Anthropic or OpenAI) for actual generation.`;
  }

  /**
   * Enriches story initial input
   * @param {string} input - User's initial input/idea
   * @param {string} [figmaContext=''] - Optional Figma design context
   * @returns {Promise<string>} Enriched structured content
   */
  async enrichStoryInit(input, figmaContext = '') {
    let prompt = PROMPT_TEMPLATES.storyInit.replace('{input}', input);
    if (figmaContext) {
      prompt += `\n\nFigma Design Information:\n${figmaContext}`;
    }
    return this.generate(prompt);
  }

  /**
   * Generates a feature init
   * @param {string} input - Input description or requirements
   * @param {string} [context=''] - Additional context (init.enriched, etc.)
   * @returns {Promise<string>} Generated init
   */
  async generateInit(input, context = '') {
    const prompt = PROMPT_TEMPLATES.init
      .replace('{input}', input)
      .replace('{context}', context ? `Context:\n${context}\n` : '');
    return this.generate(prompt);
  }

  /**
   * Generates a functional specification
   * @param {string} init - Feature init to expand
   * @param {string} [context=''] - Additional context
   * @returns {Promise<string>} Generated specification
   */
  async generateSpecFunc(init, context = '') {
    const prompt = PROMPT_TEMPLATES.specFunc
      .replace('{input}', init)
      .replace('{context}', context ? `Context:\n${context}\n` : '');
    return this.generate(prompt);
  }

  /**
   * Generates brainstorming questions
   * @param {string} spec - Specification to review
   * @param {string} [context=''] - Additional context
   * @returns {Promise<string>} Generated questions
   */
  async generateBrainstorming(spec, context = '') {
    const prompt = PROMPT_TEMPLATES.brainstorming
      .replace('{input}', spec)
      .replace('{context}', context ? `Context:\n${context}\n` : '');
    return this.generate(prompt);
  }

  /**
   * Iterates on existing content with user feedback
   * @param {string} currentContent - Current step content
   * @param {string} instructions - User's feedback/instructions
   * @param {string} [context=''] - Additional context
   * @returns {Promise<string>} Updated content
   */
  async iterateContent(currentContent, instructions, context = '') {
    const prompt = PROMPT_TEMPLATES.iterate
      .replace('{current}', currentContent)
      .replace('{instructions}', instructions)
      .replace('{context}', context ? `Additional Context:\n${context}\n` : '');
    return this.generate(prompt);
  }

  /**
   * Generates POC code
   * @param {string} spec - Specification
   * @param {string} [context=''] - Additional context (codebase info, etc.)
   * @returns {Promise<string>} Generated code
   */
  async generatePOC(spec, context = '') {
    const prompt = PROMPT_TEMPLATES.poc
      .replace('{input}', spec)
      .replace('{context}', context || 'No additional context provided.');
    return this.generate(prompt, { maxTokens: 8192 });
  }

  /**
   * Generates custom content with a provided template
   * @param {string} template - Template with {input} placeholder
   * @param {string} input - Input to inject into template
   * @param {Object} [options] - Generation options
   * @returns {Promise<string>} Generated content
   */
  async generateCustom(template, input, options = {}) {
    const prompt = template.replace('{input}', input);
    return this.generate(prompt, options);
  }

  /**
   * Validates AI response structure
   * @param {string} response - AI response to validate
   * @param {Object} [requirements={}] - Validation requirements
   * @returns {{valid: boolean, issues: string[]}}
   */
  validateResponse(response, requirements = {}) {
    const issues = [];

    if (!response || typeof response !== 'string') {
      return { valid: false, issues: ['Response is empty or invalid'] };
    }

    if (requirements.minLength && response.length < requirements.minLength) {
      issues.push(`Response too short (${response.length} < ${requirements.minLength})`);
    }

    if (requirements.maxLength && response.length > requirements.maxLength) {
      issues.push(`Response too long (${response.length} > ${requirements.maxLength})`);
    }

    if (requirements.contains) {
      for (const term of requirements.contains) {
        if (!response.toLowerCase().includes(term.toLowerCase())) {
          issues.push(`Response missing required term: ${term}`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
