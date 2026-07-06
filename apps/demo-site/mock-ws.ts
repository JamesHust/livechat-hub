import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { runScenario, type RunBody } from './mock-agent';

/**
 * Dev-only mock of the WebSocket backend, mirroring [mock-agent.ts](./mock-agent.ts)
 * (the SSE mock) so the demo can exercise `transport: 'websocket'`. Implements
 * just enough of RFC 6455 — the handshake, masked client-frame decode, and text
 * frame encode — to avoid pulling in a `ws` dependency. Shares the SSE mock's
 * run path (`/agent/run`): the WebSocket upgrade and the SSE POST never collide.
 *
 * Wire format matches `packages/transport/src/websocket.ts`:
 *   client → server  {"type":"run","runKey","payload":<RunInput>}  and  {"type":"ping"}
 *   server → client  {"type":"event","runKey","id","event":<AgUiEvent>}  and  {"type":"pong"}
 */
export function mockWsPlugin(path = '/agent/run'): Plugin {
  return {
    name: 'livechat-mock-ws',
    configureServer(server) {
      server.httpServer?.on('upgrade', (req, socket, head) => {
        // Only claim our path; leave Vite's HMR upgrades untouched.
        const url = (req.url ?? '').split('?')[0];
        if (url !== path) return;
        handleUpgrade(req, socket as Duplex, head as Buffer);
      });
    },
  };
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function handleUpgrade(req: IncomingMessage, socket: Duplex, _head: Buffer): void {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    socket.destroy();
    return;
  }
  const accept = createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  let closed = false;
  const send = (obj: unknown) => {
    if (closed || socket.destroyed) return;
    socket.write(encodeTextFrame(JSON.stringify(obj)));
  };
  const cleanup = () => {
    closed = true;
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  let buffer: Buffer = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const frame = decodeFrame(buffer);
      if (!frame) break;
      buffer = frame.rest;
      if (frame.opcode === 0x8) {
        // Close frame — echo and tear down (a run in flight stops via `closed`).
        if (!socket.destroyed) socket.end(encodeCloseFrame());
        cleanup();
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodePongFrame(frame.payload));
        continue;
      }
      if (frame.opcode !== 0x1) continue; // ignore non-text data frames
      void handleClientMessage(frame.payload.toString('utf8'), send, () => closed);
    }
  });
}

async function handleClientMessage(
  text: string,
  send: (obj: unknown) => void,
  isClosed: () => boolean,
): Promise<void> {
  let msg: { type?: string; runKey?: string; payload?: RunBody };
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  if (msg.type === 'ping') {
    send({ type: 'pong' });
    return;
  }
  if (msg.type !== 'run') return;

  const runKey = msg.runKey;
  let id = 0;
  for await (const event of runScenario(msg.payload ?? {})) {
    if (isClosed()) return; // client aborted / navigated away
    send({ type: 'event', runKey, id: String(++id), event });
  }
}

// ---------------------------------------------------------------------------
// Minimal RFC 6455 framing (small text frames only)
// ---------------------------------------------------------------------------

interface DecodedFrame {
  opcode: number;
  payload: Buffer;
  /** Bytes remaining after this frame. */
  rest: Buffer;
}

/** Decode one complete frame from `buf`, or `null` if more bytes are needed. */
function decodeFrame(buf: Buffer): DecodedFrame | null {
  if (buf.length < 2) return null;
  const opcode = buf[0]! & 0x0f;
  const masked = (buf[1]! & 0x80) !== 0;
  let len = buf[1]! & 0x7f;
  let offset = 2;

  if (len === 126) {
    if (buf.length < offset + 2) return null;
    len = buf.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buf.length < offset + 8) return null;
    // Frames from the widget are tiny; the high 32 bits are always zero.
    len = Number(buf.readBigUInt64BE(offset));
    offset += 8;
  }

  let maskKey: Buffer | null = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + len) return null;
  const raw = buf.subarray(offset, offset + len);
  const payload = Buffer.from(raw);
  if (maskKey) {
    for (let i = 0; i < payload.length; i++) payload[i]! ^= maskKey[i % 4]!;
  }
  return { opcode, payload, rest: buf.subarray(offset + len) };
}

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodePongFrame(payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
}

function encodeCloseFrame(): Buffer {
  return Buffer.from([0x88, 0x00]);
}
