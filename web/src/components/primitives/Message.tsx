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
 * Chat message bubble (handoff §13, FR-13 + .msg / .msg-body / .ai-actions
 * CSS lignes 794-859).
 *
 * Layout : flex-col container avec align-self end (user) / start (ai), max-w 92%,
 * bubble rounded-[13px] avec coin réduit côté speaker (bottom-right 4px pour user,
 * bottom-left 4px pour ai). Hover actions placées EN-DESSOUS du bubble (pas absolute).
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
    <div
      className={
        'group flex max-w-[92%] flex-col ' + (isUser ? 'self-end items-end' : 'self-start items-start')
      }
    >
      <div
        className={
          'px-3 py-[9px] text-[13.5px] leading-[1.52] ' +
          (isUser
            ? 'bg-accent text-accent-ink'
            : 'border border-border bg-surface text-text')
        }
        style={{
          borderRadius: 13,
          ...(isUser ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
        }}
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
          <span className="ml-2 inline-block rounded-[4px] bg-amber-soft px-1.5 py-0.5 text-[10px] text-amber">
            partial
          </span>
        )}
      </div>
      {!isUser && (
        <div className="mt-1 flex gap-0.5 pl-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionButton onClick={copy} label={copied ? 'Copied' : 'Copy'}>
            <Copy size={11} />
          </ActionButton>
          {onRetry && (
            <ActionButton onClick={onRetry} label="Retry">
              <RotateCw size={11} />
            </ActionButton>
          )}
          <ActionButton onClick={() => { /* stub */ }} label="Like">
            <ThumbsUp size={11} />
          </ActionButton>
        </div>
      )}
      {isUser && (
        <div className="mt-1 flex gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionButton onClick={copy} label={copied ? 'Copied' : 'Copy'}>
            <Copy size={11} />
          </ActionButton>
        </div>
      )}
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
      className="inline-flex items-center gap-1 rounded-sm px-[7px] py-[3px] text-[11px] text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}
