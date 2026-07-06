import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { createChatStore } from '@livechat-hub/core';
import { BarChart } from '@livechat-hub/renderers';
import type { RendererContext } from '@livechat-hub/renderers';
import { ChatProvider } from '../context';
import { ArtifactPanel } from './ArtifactPanel';

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

const ARTIFACT_RUN: AgUiEvent[] = [
  { type: AgUiEventType.RunStarted, runId: 'r1' },
  {
    type: AgUiEventType.ArtifactUpdate,
    artifactId: 'doc1',
    kind: 'markdown',
    title: 'Weekly sales report',
    payload: '# Weekly sales\n\n**Total:** 89k this week.',
  },
  { type: AgUiEventType.RunFinished, runId: 'r1' },
];

describe('ArtifactPanel', () => {
  it('shows an empty state when there are no artifacts', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    render(
      <ChatProvider store={store}>
        <ArtifactPanel open onClose={() => {}} />
      </ChatProvider>,
    );
    expect(screen.getByText(/no artifacts yet/i)).toBeInTheDocument();
  });

  it('renders the latest artifact title and markdown content', async () => {
    const store = createChatStore({
      transport: fakeTransport(ARTIFACT_RUN),
      tenantId: 't1',
      storage: null,
    });
    await store.getState().sendMessage('make a report');

    render(
      <ChatProvider store={store}>
        <ArtifactPanel open onClose={() => {}} />
      </ChatProvider>,
    );
    expect(screen.getByRole('heading', { name: /weekly sales report/i })).toBeInTheDocument();
    expect(screen.getByText(/89k this week/i)).toBeInTheDocument();
  });
});

describe('BarChart (built-in generative component)', () => {
  const context = {
    message: { id: 'm', role: 'assistant', parts: [] },
    isStreaming: false,
    t: (k: string) => k,
  } as unknown as RendererContext;

  it('renders an accessible summary of its bars', () => {
    render(
      <BarChart
        props={{
          title: 'Weekly sales',
          unit: 'k',
          bars: [
            { label: 'Mon', value: 12 },
            { label: 'Fri', value: 27 },
          ],
        }}
        context={context}
      />,
    );
    expect(
      screen.getByRole('img', { name: /weekly sales: mon 12k, fri 27k/i }),
    ).toBeInTheDocument();
  });
});
