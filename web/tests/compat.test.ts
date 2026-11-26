// The page's browser check (src/compat.js): run as the page runs it, a classic script whose `this` is the window,
// against windows with and without what the game needs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/compat.js', import.meta.url), 'utf8');

interface Lacking {
  needed: string[];
  parts: string[];
}

/** A window with everything the game asks for, in a context of its own; `change` takes some of it away. */
function lacking(change: (w: Record<string, unknown>) => void = () => {}): Lacking {
  const context = vm.createContext({});
  // The context's own built-ins (its Array, Promise, Function), as a browser window has.
  const w = vm.runInContext('this', context) as Record<string, unknown>;
  const storage = new Map<string, string>();
  Object.assign(w, {
    window: w,
    fetch: () => undefined,
    URLSearchParams,
    ResizeObserver: function ResizeObserver() {},
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    AudioContext: function AudioContext() {},
    localStorage: {
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
    document: {
      body: null, // no page to show a notice on: the check alone
      createElement: (tag: string) => (tag === 'script' ? { noModule: false } : { getContext: () => ({}) }),
    },
  });
  change(w);
  vm.runInContext(source, context);
  return (w.u3Compat as { check: (w: unknown) => Lacking }).check(w);
}

describe('browser check', () => {
  it('finds nothing missing in a browser with all the game needs', () => {
    // Every syntax probe parses in today's engine: a modern browser is never turned away.
    expect(lacking()).toEqual({ needed: [], parts: [] });
  });

  it('names a missing call', () => {
    expect(lacking((w) => delete w.ResizeObserver).needed).toEqual(['ResizeObserver']);
    expect(lacking((w) => delete (w.Array as { prototype: { at?: unknown } }).prototype.at).needed).toEqual(['Array.prototype.at']);
  });

  it('names missing syntax, from what the engine will not parse', () => {
    const missing = lacking((w) => {
      const real = w.Function as FunctionConstructor;
      // An engine that knows nothing past ES2019: these two forms are beyond it.
      w.Function = function (code: string) {
        if (/\?\?|\?\./.test(code)) throw new SyntaxError('Unexpected token');
        return real(code);
      };
    }).needed;
    expect(missing).toEqual(['optional chaining (?.)', 'nullish coalescing (??)', 'logical assignment (??=)']);
  });

  it('counts a browser without modules or a canvas as unable', () => {
    const missing = lacking((w) => {
      w.document = { body: null, createElement: () => ({ getContext: () => null }) };
    }).needed;
    expect(missing).toEqual(['JavaScript modules', 'canvas drawing']);
  });

  it('tells parts of the game lost from the game lost', () => {
    const result = lacking((w) => {
      delete w.AudioContext;
      w.localStorage = {
        setItem: () => {
          throw new Error('denied');
        },
      };
    });
    expect(result).toEqual({ needed: [], parts: ['sound (Web Audio)', 'saving the game (local storage)'] });
  });
});
