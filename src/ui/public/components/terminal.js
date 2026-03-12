import React from 'react';

// Terminal component using xterm.js loaded from CDN
export function Terminal({ wsUrl, onClose }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const [status, setStatus] = React.useState('connecting');
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let term = null;
    let ws = null;
    let fitAddon = null;

    const initTerminal = async () => {
      // Check if xterm is loaded
      if (!window.Terminal) {
        setError('xterm.js not loaded');
        return;
      }

      try {
        term = new window.Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          theme: {
            background: '#0f172a',
            foreground: '#e2e8f0',
            cursor: '#38bdf8',
            cursorAccent: '#0f172a',
            selection: '#38bdf833',
            black: '#1e293b',
            red: '#f87171',
            green: '#4ade80',
            yellow: '#fbbf24',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#22d3ee',
            white: '#f1f5f9',
            brightBlack: '#475569',
            brightRed: '#fca5a5',
            brightGreen: '#86efac',
            brightYellow: '#fcd34d',
            brightBlue: '#93c5fd',
            brightMagenta: '#d8b4fe',
            brightCyan: '#67e8f9',
            brightWhite: '#f8fafc',
          },
        });

        if (window.FitAddon) {
          fitAddon = new window.FitAddon.FitAddon();
          term.loadAddon(fitAddon);
        }

        term.open(containerRef.current);

        if (fitAddon) {
          fitAddon.fit();
        }

        // Connect WebSocket
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setStatus('connected');
          // Send initial size
          if (fitAddon) {
            const dims = fitAddon.proposeDimensions();
            if (dims) {
              ws.send(`\x1b[8;${dims.rows};${dims.cols}t`);
            }
          }
        };

        ws.onmessage = (event) => {
          term.write(event.data);
        };

        ws.onclose = () => {
          setStatus('disconnected');
          term.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n');
        };

        ws.onerror = () => {
          setStatus('error');
          setError('WebSocket connection failed');
        };

        // Send input to server
        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle resize
        const handleResize = () => {
          if (fitAddon) {
            fitAddon.fit();
            const dims = fitAddon.proposeDimensions();
            if (dims && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(`\x1b[8;${dims.rows};${dims.cols}t`);
            }
          }
        };

        window.addEventListener('resize', handleResize);
        termRef.current = { term, ws, fitAddon, handleResize };
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    };

    initTerminal();

    return () => {
      if (termRef.current) {
        if (termRef.current.handleResize) {
          window.removeEventListener('resize', termRef.current.handleResize);
        }
        if (termRef.current.ws) {
          termRef.current.ws.close();
        }
        if (termRef.current.term) {
          termRef.current.term.dispose();
        }
      }
    };
  }, [wsUrl]);

  return React.createElement('div', { className: 'relative' },
    // Header bar
    React.createElement('div', { className: 'flex items-center justify-between bg-slate-800 px-3 py-1.5 rounded-t border border-slate-700 border-b-0' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: 'text-xs text-slate-400' }, 'Terminal'),
        React.createElement('span', {
          className: `w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`,
        }),
      ),
      onClose && React.createElement('button', {
        onClick: onClose,
        className: 'text-slate-400 hover:text-slate-200 text-xs',
        title: 'Close terminal',
      }, 'Close'),
    ),

    // Terminal container
    React.createElement('div', {
      ref: containerRef,
      className: 'h-64 bg-aia-bg rounded-b border border-slate-700 overflow-hidden',
    }),

    // Error message
    error && React.createElement('div', { className: 'absolute inset-0 flex items-center justify-center bg-black/80 rounded' },
      React.createElement('div', { className: 'text-center' },
        React.createElement('p', { className: 'text-red-400 text-sm mb-2' }, error),
        React.createElement('p', { className: 'text-slate-500 text-xs' }, 'Make sure node-pty is installed'),
      ),
    ),
  );
}

// Script loader for xterm.js from CDN
export function loadXtermScripts() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.Terminal && window.FitAddon) {
      resolve();
      return;
    }

    // Load CSS
    if (!document.querySelector('link[href*="xterm.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
      document.head.appendChild(link);
    }

    // Load xterm.js
    const xtermScript = document.createElement('script');
    xtermScript.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js';
    xtermScript.onload = () => {
      // Load fit addon
      const fitScript = document.createElement('script');
      fitScript.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js';
      fitScript.onload = resolve;
      fitScript.onerror = reject;
      document.head.appendChild(fitScript);
    };
    xtermScript.onerror = reject;
    document.head.appendChild(xtermScript);
  });
}
