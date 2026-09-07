import { NOTIFY_SOUND_STORAGE_KEY } from '@livechat-hub/shared';

/**
 * The end-user's notification-sound preference, persisted in localStorage so it
 * survives reloads. Kept here (not in `core`) because it is a pure UI/device
 * choice; the settings menu writes it and the SDK's notification controller
 * reads it. Storage is always guarded — private mode / sandboxed iframes degrade
 * to "not chosen" rather than throwing.
 */

/** The stored choice, or `null` when the user hasn't chosen (use the config default). */
export function readSoundPref(): boolean | null {
  try {
    const raw = globalThis.localStorage?.getItem(NOTIFY_SOUND_STORAGE_KEY);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
    return null;
  } catch {
    return null;
  }
}

/** Persist the end-user's sound preference (`'on'` / `'off'`). */
export function writeSoundPref(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(NOTIFY_SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable (private mode / sandbox) — best-effort */
  }
}

/** Effective sound-on: the stored end-user choice if any, else the host default. */
export function soundEnabled(configDefault: boolean): boolean {
  return readSoundPref() ?? configDefault;
}
