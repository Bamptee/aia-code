import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import chalk from 'chalk';

const DEFAULT_IDLE_TIMEOUT_MS = 1_800_000;
const AGENT_IDLE_TIMEOUT_MS = 1_800_000;

/**
 * Parse stream-json events from Claude CLI and extract human-readable output
 * @param {string} line - JSON line from CLI
 * @param {Function} onData - Callback for output
 * @param {Object} state - Parsing state (tracks if we've seen streaming events)
 */
function parseStreamJsonEvent(line, onData, state = {}) {
  try {
    const event = JSON.parse(line);

    // Extract readable content based on event type
    if (event.type === 'system' && event.subtype === 'init') {
      const msg = `[init] Model: ${event.model}, Tools: ${event.tools?.length || 0}\n`;
      if (onData) onData({ type: 'stdout', text: msg });
      return { result: null, state };
    }

    // Stream events (partial messages) - token by token streaming
    if (event.type === 'stream_event' && event.event) {
      const streamEvent = event.event;

      // Mark that we're receiving streaming events (to avoid duplicates from 'assistant' events)
      state.hasStreamedContent = true;

      // Content block delta - actual text tokens
      if (streamEvent.type === 'content_block_delta' && streamEvent.delta) {
        if (streamEvent.delta.type === 'text_delta' && streamEvent.delta.text) {
          if (onData) onData({ type: 'stdout', text: streamEvent.delta.text });
        }
        // Tool use input delta
        if (streamEvent.delta.type === 'input_json_delta' && streamEvent.delta.partial_json) {
          // Tool input streaming - don't output raw JSON
        }
      }

      // Content block start - new block starting
      if (streamEvent.type === 'content_block_start' && streamEvent.content_block) {
        if (streamEvent.content_block.type === 'tool_use') {
          const toolMsg = `\n[tool] ${streamEvent.content_block.name}\n`;
          if (onData) onData({ type: 'stdout', text: toolMsg });
        }
      }

      // Message start
      if (streamEvent.type === 'message_start') {
        // New message starting - could add indicator
      }

      // Message stop
      if (streamEvent.type === 'message_stop') {
        if (onData) onData({ type: 'stdout', text: '\n' });
      }

      return { result: null, state };
    }

    // Complete assistant message (non-streaming)
    // Skip if we already received this content via streaming events
    if (event.type === 'assistant' && event.message?.content) {
      if (!state.hasStreamedContent) {
        // Only output if we haven't been streaming (fallback for non-streaming mode)
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            if (onData) onData({ type: 'stdout', text: block.text });
          } else if (block.type === 'tool_use') {
            const toolMsg = `\n[tool] ${block.name}\n`;
            if (onData) onData({ type: 'stdout', text: toolMsg });
          }
        }
      }
      // Capture file operations from tool_use blocks
      if (!state.fileOperations) state.fileOperations = [];
      for (const block of event.message.content) {
        if (block.type === 'tool_use' && block.input) {
          const filePath = typeof block.input.file_path === 'string' ? block.input.file_path.slice(0, 500) : null;
          if (filePath && ['Read', 'Edit', 'Write'].includes(block.name)) {
            state.fileOperations.push({
              tool: block.name,
              path: filePath,
              action: block.name === 'Read' ? 'read' : block.name === 'Edit' ? 'modified' : 'created',
            });
          }
        }
      }
      // Reset for next message
      state.hasStreamedContent = false;
      return { result: null, state };
    }

    // User message (tool results)
    if (event.type === 'user' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_result') {
          const status = block.is_error ? '✗' : '✓';
          const resultMsg = `\n[${status}] Tool completed\n`;
          if (onData) onData({ type: 'stdout', text: resultMsg });
        }
      }
      return { result: null, state };
    }

    // Final result
    if (event.type === 'result') {
      // Capture token usage from result event
      if (event.usage) {
        state.tokenUsage = {
          input: event.usage.input_tokens || 0,
          output: event.usage.output_tokens || 0,
          total: (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
        };
      }
      return { result: event.result || '', state };
    }

    // Capture token usage from message_delta events (cumulative)
    if (event.type === 'stream_event' && event.event?.type === 'message_delta' && event.event?.usage) {
      state.tokenUsage = {
        input: event.event.usage.input_tokens ?? state.tokenUsage?.input ?? 0,
        output: event.event.usage.output_tokens ?? 0,
        total: (event.event.usage.input_tokens ?? state.tokenUsage?.input ?? 0) + (event.event.usage.output_tokens ?? 0),
      };
    }

    return { result: null, state };
  } catch {
    // Not valid JSON, return as-is
    return { result: null, state };
  }
}

export function runCli(command, args, { stdin: stdinData, verbose = false, apply = false, idleTimeoutMs, onData, cwd, streamJson = false } = {}) {
  if (!idleTimeoutMs) {
    idleTimeoutMs = apply ? AGENT_IDLE_TIMEOUT_MS : DEFAULT_IDLE_TIMEOUT_MS;
  }
  return new Promise((resolve, reject) => {
    // Log command for manual replay when debugging
    const safeArgs = args.map(a => /[\s"']/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a);
    console.error(chalk.gray(`[AI] $ ${command} ${safeArgs.join(' ')}${stdinData ? ` (stdin ${(stdinData.length / 1024).toFixed(1)}KB)` : ''}`));

    // Remove CLAUDECODE from env to avoid conflicts
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...cleanEnv, FORCE_COLOR: '0' },
      cwd,
    });

    const chunks = [];
    let stderr = '';
    let settled = false;
    let gotFirstOutput = false;
    let jsonBuffer = ''; // Buffer for incomplete JSON lines
    let finalResult = ''; // Store the final result from stream-json
    let parserState = {}; // State for stream parser

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(new Error(`CLI idle timeout (no output for ${idleTimeoutMs / 1000}s): ${command} ${args.join(' ')}`));
      }, idleTimeoutMs);
    }

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
    }

    let timer;
    resetTimer();

    child.stdout.on('data', (data) => {
      if (!gotFirstOutput) {
        gotFirstOutput = true;
        console.error(chalk.gray('[AI] First stdout received — agent is running'));
      }
      const text = data.toString();
      resetTimer();

      if (streamJson) {
        // Parse stream-json format line by line
        jsonBuffer += text;
        const lines = jsonBuffer.split('\n');
        jsonBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          const { result, state } = parseStreamJsonEvent(line, onData, parserState);
          parserState = state;
          if (result !== null) {
            finalResult = result;
          }
          if (verbose) {
            // In verbose mode, also show raw JSON for debugging
            process.stdout.write(chalk.gray(line + '\n'));
          }
        }
      } else {
        // Original behavior for non-stream-json
        if (verbose) process.stdout.write(text);
        chunks.push(text);
        if (onData) onData({ type: 'stdout', text });
      }
    });

    child.stderr.on('data', (data) => {
      if (!gotFirstOutput) {
        gotFirstOutput = true;
        console.error(chalk.gray('[AI] First stderr received — agent is running'));
      }
      const text = data.toString();
      stderr += text;
      if (verbose) {
        process.stderr.write(chalk.gray(text));
      }
      if (onData) onData({ type: 'stderr', text });
      resetTimer();
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        finish(new Error(`CLI not found: "${command}". Make sure it is installed and in your PATH.`));
      } else {
        finish(err);
      }
    });

    child.on('close', (code, signal) => {
      if (code !== 0 || signal) {
        console.error(chalk.gray(`[AI] Exited: code=${code} signal=${signal || 'none'}`));
      }
      // Process any remaining data in the buffer
      if (streamJson && jsonBuffer.trim()) {
        const { result } = parseStreamJsonEvent(jsonBuffer, onData, parserState);
        if (result !== null) {
          finalResult = result;
        }
      }

      if (code !== 0) {
        finish(new Error(`${command} exited with code ${code}:\n${stderr.trim()}`));
      } else {
        // For stream-json, return the extracted result with token usage; otherwise return chunks
        if (streamJson) {
          finish(null, {
            output: finalResult,
            tokenUsage: parserState.tokenUsage || null,
            fileOperations: parserState.fileOperations || [],
          });
        } else {
          finish(null, chunks.join(''));
        }
      }
    });

    if (stdinData) {
      child.stdin.on('error', () => {}); // Ignore EPIPE if child exits early
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}
