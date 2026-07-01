import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only mock of the Go backend (`livechat-api`). Implements the AG-UI SSE
 * contract so the embedded widget streams realistically without any AI
 * provider. Mounted as Vite middleware at POST /agent/run.
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
        await streamMockRun(res, body);
      });
    },
  };
}

interface RunBody {
  messages?: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string; toolName?: string }>;
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

/** Did the user approve the interrupt resolution? */
function isApproved(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { approved?: unknown }).approved === true
  );
}

async function streamMockRun(res: ServerResponse, body: RunBody): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  // Monotonic frame id per the resume contract (docs/BACKEND.md): the client
  // echoes the last id as `Last-Event-ID` on reconnect and dedupes by it.
  let seq = 0;
  const send = (event: unknown) => res.write(`id: ${++seq}\ndata: ${JSON.stringify(event)}\n\n`);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.parts?.find((p) => p.type === 'text')?.text ?? '';
  const runId = `run_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;

  send({ type: 'RUN_STARTED', runId });
  await sleep(250);

  // Human-in-the-loop: a resumed run carries the user's interrupt resolution.
  // Respond based on whether they approved.
  if (body.resume?.length) {
    const approved = body.resume.some((r) => isApproved(r.value));
    send({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
    const reply = approved
      ? 'Done — the file has been deleted (pretend!). ✅'
      : 'No problem — I left everything as is.';
    for (const word of reply.split(' ')) {
      send({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' });
      await sleep(45);
    }
    send({ type: 'TEXT_MESSAGE_END', messageId });
    send({ type: 'RUN_FINISHED', runId });
    res.end();
    return;
  }

  // Human-in-the-loop trigger: a destructive request pauses for approval. The
  // run finishes with an `interrupt` outcome; the widget shows accept/reject and
  // resumes the run (handled above) with the user's choice.
  if (/delete|remove|wipe/i.test(prompt)) {
    send({
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
    });
    res.end();
    return;
  }

  // Frontend tool hand-off: when asked about the page background, call the
  // browser-side `set_page_background` tool and finish WITHOUT a result. The
  // client executes the handler and starts a follow-up run carrying the result,
  // which lands in the `else` branch below to confirm.
  if (/background|backdrop/i.test(prompt)) {
    if (!hasToolResult(body, 'set_page_background')) {
      const toolCallId = `call_${Date.now()}`;
      send({ type: 'TOOL_CALL_START', messageId, toolCallId, toolName: 'set_page_background' });
      // Arbitrary demo color for the host page — not a widget theme token.
      for (const chunk of ['{"color":', '"#0f766e"}']) {
        send({ type: 'TOOL_CALL_ARGS', toolCallId, delta: chunk });
        await sleep(120);
      }
      send({ type: 'TOOL_CALL_END', toolCallId });
      send({ type: 'RUN_FINISHED', runId });
      res.end();
      return;
    }
    send({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
    for (const word of 'Done — I updated the page background for you. ✨'.split(' ')) {
      send({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' });
      await sleep(45);
    }
    send({ type: 'TEXT_MESSAGE_END', messageId });
    send({ type: 'RUN_FINISHED', runId });
    res.end();
    return;
  }

  // Demonstrate a tool-call lifecycle when the user mentions "weather".
  if (/weather/i.test(prompt)) {
    const toolCallId = `call_${Date.now()}`;
    send({ type: 'TOOL_CALL_START', messageId, toolCallId, toolName: 'get_weather' });
    for (const chunk of ['{"city":', '"Hanoi"}']) {
      send({ type: 'TOOL_CALL_ARGS', toolCallId, delta: chunk });
      await sleep(120);
    }
    send({ type: 'TOOL_CALL_END', toolCallId });
    await sleep(200);
    send({
      type: 'TOOL_CALL_RESULT',
      messageId,
      toolCallId,
      toolName: 'get_weather',
      result: { city: 'Hanoi', tempC: 31, condition: 'Sunny' },
    });
    await sleep(200);
  }

  send({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
  const reply = buildReply(prompt);
  for (const word of reply.split(' ')) {
    send({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: word + ' ' });
    await sleep(45);
  }
  send({ type: 'TEXT_MESSAGE_END', messageId });
  // Publish follow-up quick replies via shared state (STATE_SNAPSHOT) — the UI
  // reads `agentState.suggestions` and renders them as chips. No custom event.
  send({ type: 'STATE_SNAPSHOT', snapshot: { suggestions: suggestionsFor(prompt) } });
  send({ type: 'RUN_FINISHED', runId });
  res.end();
}

/** Contextual follow-up suggestions offered after an answer. */
function suggestionsFor(prompt: string): string[] {
  if (/weather/i.test(prompt)) {
    return ['What about tomorrow?', 'Change the background', 'Thanks!'];
  }
  return ['What is the weather?', 'Change the background', 'Delete a file'];
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
    '_frontend_ tool in your browser), or ask me to **delete a file** (a ' +
    'human-in-the-loop approval step).'
  );
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
