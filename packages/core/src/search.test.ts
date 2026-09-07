import { describe, expect, it } from 'vitest';
import type { ConversationSummary, UIMessage } from '@livechat-hub/shared';
import { messageText, orderConversations, searchConversations, searchMessages } from './search';

const messages: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'What is the weather in Hanoi?' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'Checking the forecast.' },
      { type: 'text', text: 'It is sunny in Hanoi today.' },
    ],
  },
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'get_weather',
        args: { city: 'Hanoi' },
        state: 'input-available',
      },
      { type: 'file', url: 'blob:x', name: 'forecast.pdf' },
    ],
  },
];

describe('searchMessages', () => {
  it('matches case-insensitively across messages, in order', () => {
    // a2's only searchable text is the file name (its tool-call args are not
    // searched), so "hanoi" hits just the user prompt and the assistant reply.
    expect(searchMessages(messages, 'hanoi').map((m) => m.messageId)).toEqual(['u1', 'a1']);
    expect(searchMessages(messages, 'SUNNY').map((m) => m.messageId)).toEqual(['a1']);
  });

  it('searches reasoning text and attachment names, not wire scaffolding', () => {
    // Reasoning is searchable...
    expect(searchMessages(messages, 'forecast').map((m) => m.messageId)).toEqual(['a1', 'a2']);
    // ...the file name is searchable...
    expect(searchMessages(messages, 'forecast.pdf').map((m) => m.messageId)).toEqual(['a2']);
    // ...but the tool call id / tool name is not part of the searchable text.
    expect(searchMessages(messages, 'get_weather')).toEqual([]);
    expect(searchMessages(messages, 'c1')).toEqual([]);
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(searchMessages(messages, '')).toEqual([]);
    expect(searchMessages(messages, '   ')).toEqual([]);
  });

  it('flattens a message to its human-readable text', () => {
    expect(messageText(messages[1]!)).toBe('Checking the forecast. It is sunny in Hanoi today.');
  });
});

const summaries: ConversationSummary[] = [
  { id: 'c1', title: 'Weather in Hanoi', preview: 'It is sunny', createdAt: 1, updatedAt: 30 },
  { id: 'c2', title: 'Billing question', preview: 'Refund a charge', createdAt: 2, updatedAt: 50 },
  { id: 'c3', createdAt: 3, updatedAt: 10, pinned: true },
  { id: 'c4', title: 'Old thread', createdAt: 4, updatedAt: 40, archived: true },
];

describe('searchConversations', () => {
  it('matches title or preview, case-insensitively', () => {
    expect(searchConversations(summaries, 'hanoi').map((c) => c.id)).toEqual(['c1']);
    expect(searchConversations(summaries, 'REFUND').map((c) => c.id)).toEqual(['c2']);
  });

  it('returns every conversation for an empty query', () => {
    expect(searchConversations(summaries, '   ')).toBe(summaries);
  });
});

describe('orderConversations', () => {
  it('floats pinned threads to the top, then sorts by recency', () => {
    // c3 is pinned (despite the oldest updatedAt); the rest by updatedAt desc.
    // c4 is archived → hidden by default.
    expect(orderConversations(summaries).map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('includes archived threads when asked', () => {
    expect(orderConversations(summaries, { showArchived: true }).map((c) => c.id)).toEqual([
      'c3',
      'c2',
      'c4',
      'c1',
    ]);
  });
});
