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
  messages?: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
}

async function streamMockRun(res: ServerResponse, body: RunBody): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.parts?.find((p) => p.type === 'text')?.text ?? '';
  const runId = `run_${Date.now()}`;
  const messageId = `msg_${Date.now()}`;

  send({ type: 'RUN_STARTED', runId });
  await sleep(250);

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
  send({ type: 'RUN_FINISHED', runId });
  res.end();
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
    '`weather` to see a tool-call rendered.'
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
