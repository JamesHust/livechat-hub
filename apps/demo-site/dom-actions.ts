import type { ContextProvider, FrontendAction } from '@livechat-hub/sdk';

/**
 * A generic **DOM-primitive** action pack (Sprint 5.6): a "browser-use
 * client-side" toolkit that lets the agent read and operate the *real* page the
 * widget is embedded on — running in the visitor's own tab, so it keeps their
 * login/session. It lives here in the example app, NOT in `core`, which stays
 * provider- and page-agnostic; the widget only ever sees generic frontend
 * tool-calls. Every *write* is gated behind a confirmation card (HITL).
 *
 * The three primitives mirror browser-use's `readInteractables` / `fill` /
 * `click`, addressing elements by a stable `ref` assigned on read.
 */

/** Assign (once) and read a stable ref for an element, so the agent can address it. */
function refFor(el: Element): string {
  let ref = el.getAttribute('data-lch-ref');
  if (!ref) {
    ref = `el-${refSeq++}`;
    el.setAttribute('data-lch-ref', ref);
  }
  return ref;
}
let refSeq = 1;

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** A concise, accessible label for an interactive element. */
function labelFor(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;
  const name = el.getAttribute('name');
  if (name) return name;
  return (el.textContent ?? '').trim().slice(0, 40);
}

interface Interactable {
  ref: string;
  tag: string;
  type?: string;
  label: string;
  value?: string;
}

/** Snapshot the page's interactive elements (buttons, links, form fields). */
function readInteractables(): Interactable[] {
  const selector = 'a[href], button, input, textarea, select, [role="button"]';
  // Skip anything inside the widget's own shadow host — the agent operates the
  // host page, not its own chat chrome.
  const host = document.querySelector('[data-livechat-hub]');
  return [...document.querySelectorAll(selector)]
    .filter((el) => isVisible(el) && !host?.contains(el))
    .map((el) => {
      const field = el as HTMLInputElement;
      return {
        ref: refFor(el),
        tag: el.tagName.toLowerCase(),
        type: field.type || undefined,
        label: labelFor(el),
        value: field.value || undefined,
      };
    });
}

function find(ref: unknown): HTMLElement | null {
  if (typeof ref !== 'string') return null;
  // Prefer the assigned ref; fall back to an element id (lets a caller address a
  // stable, well-known field without a prior read).
  return (
    document.querySelector<HTMLElement>(`[data-lch-ref="${CSS.escape(ref)}"]`) ??
    document.getElementById(ref)
  );
}

/**
 * The action pack + a context provider. The context feeds the interactable tree
 * to the agent on every run (a "readable"); the actions let it act on refs.
 * `onLog` mirrors each operation into the demo's activity log.
 */
export function createDomActions(onLog: (msg: string) => void): {
  actions: FrontendAction[];
  context: ContextProvider;
} {
  const context: ContextProvider = {
    description: 'Interactive elements on the host page (ref, tag, label, value)',
    get: () => readInteractables(),
  };

  const actions: FrontendAction[] = [
    {
      name: 'dom.readInteractables',
      description:
        'List the interactive elements on the current page, each with a stable ref, tag, label and value.',
      parameters: { type: 'object', properties: {} },
      handler: () => {
        const elements = readInteractables();
        onLog(`dom.readInteractables → ${elements.length} elements`);
        return { elements };
      },
    },
    {
      name: 'dom.fill',
      description: 'Fill a form field addressed by its ref. Args: { ref, value }',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' }, value: { type: 'string' } },
        required: ['ref', 'value'],
      },
      // Writing to the page is consequential — confirm before running.
      requireConfirmation: true,
      confirmationMessage: 'Let the assistant fill a field on this page?',
      handler: ({ ref, value }) => {
        const el = find(ref) as HTMLInputElement | null;
        if (!el) return { ok: false, ref };
        el.value = String(value ?? '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        onLog(`dom.fill → ${String(ref)} = "${String(value)}"`);
        return { ok: true, ref, value };
      },
    },
    {
      name: 'dom.click',
      description: 'Click an element addressed by its ref. Args: { ref }',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
      },
      requireConfirmation: true,
      confirmationMessage: 'Let the assistant click an element on this page?',
      handler: ({ ref }) => {
        const el = find(ref);
        if (!el) return { ok: false, ref };
        el.click();
        onLog(`dom.click → ${String(ref)}`);
        return { ok: true, ref };
      },
    },
  ];

  return { actions, context };
}
