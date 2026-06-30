import { describe, expect, it } from 'vitest';
import { createActionRegistry } from './actions';

describe('createActionRegistry', () => {
  it('exposes serializable tool specs without leaking the handler', () => {
    const reg = createActionRegistry();
    reg.registerAction({
      name: 'a',
      description: 'd',
      parameters: { type: 'object' },
      handler: () => 1,
    });
    expect(reg.toolSpecs()).toEqual([
      { name: 'a', description: 'd', parameters: { type: 'object' } },
    ]);
    expect(reg.getAction('a')?.handler).toBeTypeOf('function');
  });

  it('unregisters an action, leaving others intact', () => {
    const reg = createActionRegistry();
    const off = reg.registerAction({ name: 'a', handler: () => 1 });
    reg.registerAction({ name: 'b', handler: () => 2 });
    off();
    expect(reg.getAction('a')).toBeUndefined();
    expect(reg.toolSpecs().map((t) => t.name)).toEqual(['b']);
  });

  it('does not let a stale unregister clobber a re-registered name', () => {
    const reg = createActionRegistry();
    const offStale = reg.registerAction({ name: 'a', handler: () => 1 });
    reg.registerAction({ name: 'a', handler: () => 2 });
    offStale();
    expect(reg.getAction('a')?.handler({})).toBe(2);
  });

  it('resolves context providers fresh on every read', () => {
    const reg = createActionRegistry();
    let n = 0;
    const off = reg.registerContext({ description: 'count', get: () => ++n });
    expect(reg.contextItems()).toEqual([{ description: 'count', value: 1 }]);
    expect(reg.contextItems()).toEqual([{ description: 'count', value: 2 }]);
    off();
    expect(reg.contextItems()).toEqual([]);
  });
});
