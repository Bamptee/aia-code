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
      return { result: event.result || '', state };
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

    child.on('close', (code) => {
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
        // For stream-json, return the extracted result; otherwise return chunks
        finish(null, streamJson ? finalResult : chunks.join(''));
      }
    });

    if (stdinData) {
      child.stdin.on('error', () => {}); // Ignore EPIPE if child exits early
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}
