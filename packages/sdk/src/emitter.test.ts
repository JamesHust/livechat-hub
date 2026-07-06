import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter';

describe('Emitter', () => {
  it('delivers typed events to subscribers and stops after off()', () => {
    const emitter = new Emitter();
    const handler = vi.fn();
    const unsubscribe = emitter.on('run:status', handler);

    emitter.emit('run:status', 'running');
    expect(handler).toHaveBeenCalledWith('running');

    unsubscribe();
    emitter.emit('run:status', 'completed');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('onAny() taps every event as { name, payload } — the analytics sink', () => {
    const emitter = new Emitter();
    const seen: Array<{ name: string; payload: unknown }> = [];
    emitter.onAny((event) => seen.push(event));

    emitter.emit('open', undefined);
    emitter.emit('message', { id: 'm1', role: 'assistant', parts: [] });
    emitter.emit('identify', { userId: 'u1' });

    expect(seen).toEqual([
      { name: 'open', payload: undefined },
      { name: 'message', payload: { id: 'm1', role: 'assistant', parts: [] } },
      { name: 'identify', payload: { userId: 'u1' } },
    ]);
  });

  it('onAny() unsubscribe stops the tap', () => {
    const emitter = new Emitter();
    const tap = vi.fn();
    const off = emitter.onAny(tap);
    emitter.emit('open', undefined);
    off();
    emitter.emit('close', undefined);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber never breaks the emit or the analytics tap', () => {
    const emitter = new Emitter();
    const tap = vi.fn();
    emitter.on('error', () => {
      throw new Error('subscriber blew up');
    });
    emitter.onAny(tap);
    expect(() => emitter.emit('error', { message: 'boom' })).not.toThrow();
    expect(tap).toHaveBeenCalledWith({ name: 'error', payload: { message: 'boom' } });
  });

  it('clear() drops both typed and any-handlers', () => {
    const emitter = new Emitter();
    const typed = vi.fn();
    const any = vi.fn();
    emitter.on('ready', typed);
    emitter.onAny(any);
    emitter.clear();
    emitter.emit('ready', undefined);
    expect(typed).not.toHaveBeenCalled();
    expect(any).not.toHaveBeenCalled();
  });
});
