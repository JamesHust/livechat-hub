import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only mock of the Go backend (`livechat-api`). Implements the AG-UI SSE
 * contract so the embedded widget streams realistically without any AI
 * provider. Mounted as Vite middleware at POST /agent/run.
 *
 * The scenario engine ({@link runScenario}) is transport-agnostic — it yields
 * AG-UI events — so the WebSocket mock ([mock-ws.ts](./mock-ws.ts)) replays the
 * exact same conversations over a socket.
 */
export function mockAgentPlugin(path = '/agent/run'): Plugin {
  return {
    name: 'livechat-mock-agent',
    configureServer(server) {
      server.middlewares.use(path, async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const body = await readJson(req);
        // The client echoes the last delivered SSE id on reconnect (the resume
        // contract in docs/BACKEND.md). We use its presence to distinguish a
        // first attempt from a resumed one in the fault-injection path below.
        const lastEventId = firstHeader(req.headers['last-event-id']);
        await streamMockRun(res, body, lastEventId);
      });
    },
  };
}

export interface RunBody {
  messages?: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string; toolName?: string; result?: unknown }>;
  }>;
  tools?: Array<{ name: string }>;
  resume?: Array<{ id: string; value?: unknown }>;
}

/** Has the browser already executed (returned a result for) the named tool? */
function hasToolResult(body: RunBody, toolName: string): boolean {
  return (body.messages ?? []).some((m) =>
    m.parts?.some((p) => p.type === 'tool-result' && p.toolName === toolName),
  );
}

/** The result the browser returned for the named tool, if any (last wins). */
function toolResultFor(body: RunBody, toolName: string): unknown {
  let result: unknown;
  for (const m of body.messages ?? []) {
    for (const p of m.parts ?? []) {
      if (p.type === 'tool-result' && p.toolName === toolName) result = p.result;
    }
  }
  return result;
}

/** Did the user approve the interrupt resolution? */
function isApproved(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { approved?: unknown }).approved === true
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The transport-agnostic scenario engine: yields the AG-UI events for a run,
 * pacing itself with `await sleep(...)` between deltas. Both the SSE middleware
 * and the WebSocket mock consume this — the only SSE-specific behavior (the
 * mid-stream fault injection) stays in {@link streamMockRun}.
 */
export async function* runScenario(body: RunBody): AsyncGenerator<Record<string, unknown>> {
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.parts?.find((p) => p.type === 'text')?.text ?? '';
  const runId = `run_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;

  yield { type: 'RUN_STARTED', runId };
  await sleep(250);

  // Human-in-the-loop: a resumed run carries the user's interrupt resolution.
  if (body.resume?.length) {
    const approved = body.resume.some((r) => isApproved(r.value));
    yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
    const reply = approved
      ? 'Done — the file has been deleted (pretend!). ✅'
      : 'No problem — I left everything as is.';
    for (const word of reply.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
      await sleep(45);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId };
    yield { type: 'RUN_FINISHED', runId };
    return;
  }

  // Frontend-action confirmation (client-side HITL): the agent calls the
  // `delete_note` frontend tool and finishes without a result; the widget shows
  // an approval card and only runs the handler once the user approves.
  if (/\bnote\b/i.test(prompt)) {
    const result = toolResultFor(body, 'delete_note');
    if (result === undefined) {
      const toolCallId = `call_${Date.now()}`;
      yield { type: 'TOOL_CALL_START', messageId, toolCallId, toolName: 'delete_note' };
      yield { type: 'TOOL_CALL_ARGS', toolCallId, delta: '{}' };
      yield { type: 'TOOL_CALL_END', toolCallId };
      yield { type: 'RUN_FINISHED', runId };
      return;
    }
    const declined =
      typeof result === 'object' && result !== null && (result as { declined?: unknown }).declined;
    yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
    const reply = declined
      ? 'No problem — I left the note in place.'
      : 'Done — I removed the pinned note for you. 🗑️';
    for (const word of reply.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
      await sleep(45);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId };
    yield { type: 'RUN_FINISHED', runId };
    return;
  }

  // Generative UI + artifact panel (Sprint 5.4): stream a chart canvas part into
  // the message AND publish a live document artifact via ARTIFACT_UPDATE, which
  // the widget surfaces in its artifact panel.
  if (/\b(chart|report|dashboard|artifact)\b/i.test(prompt)) {
    yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
    for (const word of 'Here is a quick sales snapshot — full report in the panel. 📊'.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
      await sleep(40);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId };
    // A generative-UI part rendered by the built-in `bar_chart` component — no
    // host registration needed (see packages/renderers/src/components.tsx).
    yield {
      type: 'CUSTOM_UI',
      messageId,
      component: 'bar_chart',
      props: {
        title: 'Weekly sales',
        unit: 'k',
        bars: [
          { label: 'Mon', value: 12 },
          { label: 'Tue', value: 19 },
          { label: 'Wed', value: 9 },
          { label: 'Thu', value: 22 },
          { label: 'Fri', value: 27 },
        ],
      },
    };
    // Artifact streamed out-of-band, updated live (v1 → v2) into the panel.
    const artifactId = 'report_sales';
    yield {
      type: 'ARTIFACT_UPDATE',
      artifactId,
      kind: 'markdown',
      title: 'Weekly sales report',
      payload: '# Weekly sales\n\nCompiling the latest figures…',
    };
    await sleep(500);
    yield {
      type: 'ARTIFACT_UPDATE',
      artifactId,
      kind: 'markdown',
      title: 'Weekly sales report',
      payload:
        '# Weekly sales\n\n**Total:** 89k this week (+14% WoW).\n\n' +
        '- Best day: **Friday** (27k)\n- Slowest: **Wednesday** (9k)\n\n' +
        'Momentum into the weekend looks strong.',
    };
    yield { type: 'RUN_FINISHED', runId };
    return;
  }

  // Agent handoff (Sprint 5.1): AI → human. Presence + handoff state are
  // published into the shared agent state (STATE_DELTA — no bespoke events); the
  // header + handoff banner read them. Uses deltas so other state is preserved.
  if (
    /human|representative|real person|talk to (a|an|someone|somebody)|\bsupport\b/i.test(prompt)
  ) {
    yield {
      type: 'STATE_DELTA',
      delta: [
        { op: 'add', path: '/handoff', value: { status: 'requested' } },
        { op: 'add', path: '/presence', value: 'away' },
      ],
    };
    yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
    for (const word of 'Sure — connecting you to a team member now.'.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
      await sleep(45);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId };
    await sleep(700);
    yield {
      type: 'STATE_DELTA',
      delta: [
        { op: 'add', path: '/handoff', value: { status: 'connected', agentName: 'Mai' } },
        { op: 'add', path: '/presence', value: 'online' },
      ],
    };
    const humanMessageId = `msg_${Date.now()}_h`;
    yield { type: 'TEXT_MESSAGE_START', messageId: humanMessageId, role: 'assistant' };
    for (const word of 'Hi, this is Mai from the team — how can I help? 👋'.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId: humanMessageId, delta: word + ' ' };
      await sleep(45);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId: humanMessageId };
    yield { type: 'RUN_FINISHED', runId };
    return;
  }

  // Human-in-the-loop trigger: a destructive request pauses for approval.
  if (/delete|remove|wipe/i.test(prompt)) {
    yield {
      type: 'RUN_FINISHED',
      runId,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: `int_${Date.now()}`,
            kind: 'approval',
            message: 'Deleting report.pdf is permanent. Do you want me to proceed?',
            value: { action: 'delete_file', path: '/demo/report.pdf' },
          },
        ],
      },
    };
    return;
  }

  // Frontend tool hand-off: when asked about the page background, call the
  // browser-side `set_page_background` tool and finish WITHOUT a result.
  if (/background|backdrop/i.test(prompt)) {
    if (!hasToolResult(body, 'set_page_background')) {
      const toolCallId = `call_${Date.now()}`;
      yield { type: 'TOOL_CALL_START', messageId, toolCallId, toolName: 'set_page_background' };
      for (const chunk of ['{"color":', '"#0f766e"}']) {
        yield { type: 'TOOL_CALL_ARGS', toolCallId, delta: chunk };
        await sleep(120);
      }
      yield { type: 'TOOL_CALL_END', toolCallId };
      yield { type: 'RUN_FINISHED', runId };
      return;
    }
    yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
    for (const word of 'Done — I updated the page background for you. ✨'.split(' ')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
      await sleep(45);
    }
    yield { type: 'TEXT_MESSAGE_END', messageId };
    yield { type: 'RUN_FINISHED', runId };
    return;
  }

  // Demonstrate a tool-call lifecycle when the user mentions "weather".
  if (/weather/i.test(prompt)) {
    const toolCallId = `call_${Date.now()}`;
    yield { type: 'TOOL_CALL_START', messageId, toolCallId, toolName: 'get_weather' };
    for (const chunk of ['{"city":', '"Hanoi"}']) {
      yield { type: 'TOOL_CALL_ARGS', toolCallId, delta: chunk };
      await sleep(120);
    }
    yield { type: 'TOOL_CALL_END', toolCallId };
    await sleep(200);
    yield {
      type: 'TOOL_CALL_RESULT',
      messageId,
      toolCallId,
      toolName: 'get_weather',
      result: { city: 'Hanoi', tempC: 31, condition: 'Sunny' },
    };
    await sleep(200);
  }

  yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
  const reply = buildReply(prompt);
  for (const word of reply.split(' ')) {
    yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' };
    await sleep(45);
  }
  yield { type: 'TEXT_MESSAGE_END', messageId };
  // Publish follow-up quick replies via shared state (STATE_SNAPSHOT) — the UI
  // reads `agentState.suggestions` and renders them as chips. No custom event.
  yield { type: 'STATE_SNAPSHOT', snapshot: { suggestions: suggestionsFor(prompt) } };
  yield { type: 'RUN_FINISHED', runId };
}

async function streamMockRun(
  res: ServerResponse,
  body: RunBody,
  lastEventId?: string,
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  // Monotonic frame id per the resume contract (docs/BACKEND.md): the client
  // echoes the last id as `Last-Event-ID` on reconnect and dedupes by it. On a
  // resumed run we continue numbering *after* that id so the replayed frames get
  // fresh ids the client hasn't seen — exactly what a resumable backend does.
  let seq = Number.parseInt(lastEventId ?? '', 10) || 0;
  const send = (event: unknown) => res.write(`id: ${++seq}\ndata: ${JSON.stringify(event)}\n\n`);

  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.parts?.find((p) => p.type === 'text')?.text ?? '';
  const runId = `run_${Date.now()}`;

  // Fault injection for E2E/resilience testing: the first attempt (no
  // Last-Event-ID) starts a reply then drops the socket mid-stream without a
  // terminal event. The transport reconnects with the last id; this branch then
  // resumes the *same* assistant message and finishes cleanly — proving the
  // widget survives a mid-stream network drop with no duplicated text.
  if (/\bflaky\b|reconnect-test/i.test(prompt)) {
    const flakyMsg = 'msg_flaky';
    if (lastEventId === undefined) {
      send({ type: 'RUN_STARTED', runId });
      send({ type: 'TEXT_MESSAGE_START', messageId: flakyMsg, role: 'assistant' });
      send({ type: 'TEXT_MESSAGE_CONTENT', messageId: flakyMsg, delta: 'Reconnected ' });
      await sleep(50);
      res.destroy(); // abrupt close — no RUN_FINISHED, so the client retries
      return;
    }
    send({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: flakyMsg,
      delta: 'successfully — the stream resumed without losing your reply.',
    });
    send({ type: 'TEXT_MESSAGE_END', messageId: flakyMsg });
    send({ type: 'RUN_FINISHED', runId });
    res.end();
    return;
  }

  for await (const event of runScenario(body)) send(event);
  res.end();
}

/** Contextual follow-up suggestions offered after an answer. */
function suggestionsFor(prompt: string): string[] {
  if (/weather/i.test(prompt)) {
    return ['What about tomorrow?', 'Show me the sales chart', 'Talk to a human'];
  }
  return ['What is the weather?', 'Show me the sales chart', 'Talk to a human'];
}

function buildReply(prompt: string): string {
  if (!prompt) return 'Hello! How can I help you today?';
  if (/weather/i.test(prompt)) {
    return 'It is currently **31°C and sunny** in Hanoi. Anything else you would like to know?';
  }
  return (
    `You said: _"${prompt}"_.\n\n` +
    'This is a **mock** AG-UI stream proving the end-to-end vertical slice: ' +
    'SDK → Shadow DOM → core store → renderers → UI. Try asking about the ' +
    '`weather` (backend tool-call), ask me to **change the background** (a ' +
    '_frontend_ tool in your browser), **show me the sales chart** (generative ' +
    'UI + a live artifact panel), **delete the note** (a frontend action that ' +
    'asks for confirmation first), **delete a file** (a backend ' +
    'human-in-the-loop approval step), or **talk to a human** (agent handoff).'
  );
}

/** Node lowercases header names but a value may arrive as string | string[]. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readJson(req: IncomingMessage): Promise<RunBody> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
