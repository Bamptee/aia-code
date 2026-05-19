'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Message } from '@/components/primitives/Message';
import { ChatComposer } from './ChatComposer';
import { ChatActionBar, getComposerPlaceholder } from './ChatActionBar';
import { TypingIndicator } from './TypingIndicator';
import { CancelActionBar } from './CancelActionBar';
import { useChatStream } from '@/lib/sse/useChatStream';
import type { StepKey } from '@/lib/types/step';
import type { Story } from '@/lib/types/story';

interface ChatPaneProps {
  story: Story;
}

/**
 * ChatPane (FR-13, handoff §7.4).
 *
 * Right column, flex 1, bg surface-2.
 * Layout : header info + scrollable message list + (TypingIndicator si silent) +
 * (CancelActionBar si cancelled) + ChatComposer en bas.
 *
 * Streaming SSE via useChatStream (fetch + ReadableStream, Story 3.8 rewrite).
 *
 * Note v1 : backend POST /api/features/:slug/messages?step= n'existe pas encore
 * (architecture.md §10 ADD-13). Le UI affichera "error" status sur send réel.
 * La structure est prête pour quand le backend câblera l'endpoint.
 */
export function ChatPane({ story }: ChatPaneProps) {
  const searchParams = useSearchParams();
  const activeStep: StepKey = (searchParams?.get('step') as StepKey | null) ?? story.currentStep;

  const { messages, status, isSilent, send, cancel, reset } = useChatStream({
    slug: story.slug,
    step: activeStep,
  });

  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll en bas quand nouveau message.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = status === 'streaming';
  const isCancelled = status === 'cancelled';

  const handleContinue = () => {
    // Stub : "continuer depuis ici" devra envoyer un prompt système au backend.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) send(`continue from where you stopped`);
  };

  const handleRegenerate = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      reset();
      send(lastUserMsg.content);
    }
  };

  return (
    <aside className="flex flex-1 flex-col overflow-hidden bg-surface-2">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyChat activeStep={activeStep} />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                onRetry={m.role === 'ai' ? () => {
                  // Find previous user message and resend
                  const idx = messages.findIndex((x) => x.id === m.id);
                  if (idx > 0 && messages[idx - 1].role === 'user') {
                    send(messages[idx - 1].content);
                  }
                } : undefined}
              />
            ))}
            {isSilent && isStreaming && <TypingIndicator />}
            {isCancelled && (
              <CancelActionBar
                onContinue={handleContinue}
                onRegenerate={handleRegenerate}
                onKeep={() => { /* status reste cancelled, message partial reste */ }}
              />
            )}
          </div>
        )}
      </div>

      <ChatActionBar
        step={activeStep}
        state={story.steps[activeStep]}
        hasMessages={messages.length > 0}
      />

      <ChatComposer
        onSubmit={send}
        onCancel={cancel}
        status={status}
        placeholder={getComposerPlaceholder(activeStep)}
      />
    </aside>
  );
}

function EmptyChat({ activeStep }: { activeStep: StepKey }) {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-xs text-xs text-text-3">
        {activeStep === 'brainstorming' || activeStep === 'review'
          ? 'No messages yet. Share ideas, ask questions, explore…'
          : 'No messages yet. Type below or use '}
        {activeStep !== 'brainstorming' && activeStep !== 'review' && (
          <>
            <kbd className="rounded border border-border px-1 font-mono">/</kbd> to start
            with a slash command.
          </>
        )}
      </div>
    </div>
  );
}
