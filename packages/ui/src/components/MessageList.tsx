import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { searchMessages } from '@livechat-hub/core';
import { useChatContext, useChatStore } from '../context';
import { MessageBubble } from './MessageBubble';
import { MessageSearch } from './MessageSearch';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';
import { DayDivider } from './DayDivider';
import { Suggestions } from './Suggestions';
import { ScrollToBottom } from './ScrollToBottom';
import { dayBucket } from '../lib/format';

// `overscroll-contain` keeps a scroll that reaches the list's top/bottom from
// chaining out to the host page (important on mobile, where the panel is
// full-screen over the partner site).
const LIST_CLASS =
  'bg-background flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4';

// Distance (px) from the bottom still counted as "pinned" — a small tolerance
// so sub-pixel scroll offsets and layout jitter don't hide the follow behavior.
const BOTTOM_THRESHOLD = 64;

/** Follow-up suggestions the agent published via shared state (`STATE_*`). */
function readSuggestions(state: Record<string, unknown>): string[] {
  const raw = state.suggestions;
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

export interface MessageListProps {
  /** Whether the in-conversation search bar is open. */
  searchOpen?: boolean;
  /** Close the search bar (e.g. Escape inside it). */
  onCloseSearch?: () => void;
}

export function MessageList({ searchOpen = false, onCloseSearch }: MessageListProps = {}) {
  const { store } = useChatContext();
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.run.status);
  const agentState = useChatStore((s) => s.agentState);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(messages.length);
  const reduced = useReducedMotion() ?? false;

  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);

  // In-conversation search state. Matches are computed purely in core; the list
  // scrolls to the active hit and rings it (see MessageBubble `highlight`).
  const [query, setQuery] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const matches = useMemo(() => searchMessages(messages, query), [messages, query]);
  const safeMatch = matches.length ? Math.min(activeMatch, matches.length - 1) : 0;
  const activeMatchId = matches[safeMatch]?.messageId;

  // Reset to the first hit whenever the query changes; clear the query when the
  // bar closes so a re-open starts fresh.
  useEffect(() => setActiveMatch(0), [query]);
  useEffect(() => {
    if (!searchOpen) setQuery('');
  }, [searchOpen]);

  // Bring the active match into view (centered) as the user steps through hits.
  useEffect(() => {
    if (!searchOpen || !activeMatchId) return;
    const node = scrollerRef.current?.querySelector(`[data-message-id="${CSS.escape(activeMatchId)}"]`);
    node?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [searchOpen, activeMatchId, reduced]);

  const stepMatch = (delta: number) =>
    setActiveMatch((i) => (matches.length ? (i + delta + matches.length) % matches.length : 0));

  const lastMessage = messages[messages.length - 1];
  const isStreaming = status === 'running';
  // Show the standalone typing indicator only before the assistant message exists.
  const showTyping = isStreaming && lastMessage?.role === 'user';

  // Follow-up quick replies: shown after a completed assistant turn when the
  // agent surfaced them in shared state. Provider-agnostic — just a convention
  // on `agentState`, no new protocol event.
  const followUps = readSuggestions(agentState);
  const showFollowUps =
    status === 'completed' && lastMessage?.role === 'assistant' && followUps.length > 0;

  const scrollToEnd = (behavior: ScrollBehavior) =>
    endRef.current?.scrollIntoView?.({ behavior, block: 'end' });

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
    setAtBottom(bottom);
    if (bottom) setUnread(0);
  };

  // Keep pinned to the newest content while at the bottom (follows streaming
  // tokens); when scrolled up, count newly arrived messages for the badge.
  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = messages.length;
    if (atBottom) scrollToEnd(reduced ? 'auto' : 'smooth');
    else if (messages.length > prev) setUnread((n) => n + (messages.length - prev));
  }, [messages, status, atBottom, reduced]);

  if (messages.length === 0) {
    return (
      <div className={LIST_CLASS} data-slot="message-list">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AnimatePresence>
        {searchOpen && (
          <MessageSearch
            query={query}
            onQueryChange={setQuery}
            matchCount={matches.length}
            activeIndex={safeMatch}
            onPrev={() => stepMatch(-1)}
            onNext={() => stepMatch(1)}
            onClose={() => onCloseSearch?.()}
          />
        )}
      </AnimatePresence>
      <div ref={scrollerRef} onScroll={onScroll} className={LIST_CLASS} data-slot="message-list">
        {messages.map((message, i) => {
          const createdAt = message.metadata?.createdAt;
          const prevCreatedAt = messages[i - 1]?.metadata?.createdAt;
          const showDivider =
            typeof createdAt === 'number' &&
            (typeof prevCreatedAt !== 'number' ||
              dayBucket(createdAt) !== dayBucket(prevCreatedAt));
          return (
            <Fragment key={message.id}>
              {showDivider && <DayDivider timestamp={createdAt} />}
              <MessageBubble
                message={message}
                isStreaming={isStreaming && i === messages.length - 1}
                isLast={i === messages.length - 1}
                highlight={searchOpen && message.id === activeMatchId}
              />
            </Fragment>
          );
        })}
        {showTyping && <TypingIndicator />}
        {showFollowUps && (
          <Suggestions
            suggestions={followUps}
            onSelect={(text) => void store.getState().sendMessage(text)}
            className="pt-1"
          />
        )}
        <div ref={endRef} />
      </div>
      <ScrollToBottom
        visible={!atBottom}
        unread={unread}
        onClick={() => {
          setUnread(0);
          scrollToEnd(reduced ? 'auto' : 'smooth');
        }}
      />
    </div>
  );
}
