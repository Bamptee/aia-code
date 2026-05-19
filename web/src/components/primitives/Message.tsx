'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, RotateCw, ThumbsUp } from 'lucide-react';
import type { Message as MessageType } from '@/lib/types/messages';

interface MessageProps {
  message: MessageType;
  onRetry?: () => void;
}

/**
 * Chat message bubble (handoff §13, FR-13).
 * Role you/ai, markdown body via react-markdown + remark-gfm.
 * Hover actions : Copy, Retry, 👍 (stubs sauf Copy).
 */
export function Message({ message, onRetry }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className={'group relative ' + (isUser ? 'pl-8' : 'pr-8')}>
      <div
        className={
          'rounded-lg px-4 py-2.5 text-sm leading-relaxed ' +
          (isUser
            ? 'bg-accent text-accent-ink'
            : 'bg-surface text-text border border-border')
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose-message">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || ' '}
            </ReactMarkdown>
          </div>
        )}
        {message.partial && (
          <span className="ml-2 inline-block rounded bg-amber-soft px-1.5 py-0.5 text-[10px] text-amber">
            partial
          </span>
        )}
      </div>
      <div
        className={
          'absolute top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 ' +
          (isUser ? 'left-1' : 'right-1')
        }
      >
        <ActionButton onClick={copy} label={copied ? 'Copied' : 'Copy'}>
          <Copy size={12} />
        </ActionButton>
        {!isUser && onRetry && (
          <ActionButton onClick={onRetry} label="Retry">
            <RotateCw size={12} />
          </ActionButton>
        )}
        {!isUser && (
          <ActionButton onClick={() => { /* stub */ }} label="Like">
            <ThumbsUp size={12} />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded bg-surface/80 p-1 text-text-2 shadow-sm transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}
