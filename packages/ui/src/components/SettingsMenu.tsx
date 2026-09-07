import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
  IconBell,
  IconDeviceDesktop,
  IconMoon,
  IconSettings,
  IconSun,
  IconVolume,
  IconVolumeOff,
  type IconProps,
} from '@tabler/icons-react';
import type { ThemeMode } from '@livechat-hub/shared';
import { useChatContext } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { soundEnabled, writeSoundPref } from '../lib/notify-prefs';
import { cn } from '../lib/utils';
import { ITEM_TRANSITION } from '../lib/motion';
import { Button } from './ui/button';
import { LanguageSwitcher } from './LanguageSwitcher';

const THEME_OPTIONS: ReadonlyArray<{
  mode: ThemeMode;
  icon: (props: IconProps) => ReturnType<typeof IconSun>;
  labelKey: 'settings.themeLight' | 'settings.themeDark' | 'settings.themeSystem';
}> = [
  { mode: 'light', icon: IconSun, labelKey: 'settings.themeLight' },
  { mode: 'dark', icon: IconMoon, labelKey: 'settings.themeDark' },
  { mode: 'auto', icon: IconDeviceDesktop, labelKey: 'settings.themeSystem' },
];

/**
 * Gear button + popover holding the runtime theme (Light/Dark/System) and the
 * language switcher. The popover is a plain positioned element (no Radix /
 * portal) so it stays inside the Shadow DOM; it closes on Escape and on a
 * pointer-down outside, detected via `composedPath()` so it works across the
 * shadow boundary.
 */
export function SettingsMenu() {
  const { t, themeMode, setThemeMode } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const root = containerRef.current?.getRootNode() ?? document;
    const onPointerDown = (e: Event) => {
      if (containerRef.current && !e.composedPath().includes(containerRef.current)) setOpen(false);
    };
    const onKeyDown = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') setOpen(false);
    };
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('keydown', onKeyDown, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('header.settings')}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn('text-muted-foreground', chromeButton)}
      >
        <IconSettings className={chromeIcon} aria-hidden="true" />
      </Button>

      <AnimatePresence>
        {open && (
          <m.div
            id={panelId}
            role="group"
            aria-label={t('header.settings')}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            transition={ITEM_TRANSITION}
            style={{ transformOrigin: 'top right' }}
            className="bg-popover text-popover-foreground absolute top-full right-0 z-20 mt-2 w-64 rounded-2xl border p-1.5 shadow-[var(--lch-shadow)] backdrop-blur-xl"
          >
            <section className="px-1.5 pt-1.5">
              <p className="text-muted-foreground m-0 mb-2 px-0.5 text-[11px] font-semibold tracking-wide uppercase">
                {t('settings.theme')}
              </p>
              <div className="bg-secondary grid grid-cols-3 gap-1 rounded-xl p-1">
                {THEME_OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
                  const active = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setThemeMode(mode)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-all outline-none',
                        'focus-visible:ring-ring/60 focus-visible:ring-2 motion-safe:active:scale-[0.97]',
                        active
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="bg-border mx-1.5 my-2 h-px" />

            <section className="px-1.5 pb-1.5">
              <p className="text-muted-foreground m-0 mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide uppercase">
                {t('settings.language')}
              </p>
              <LanguageSwitcher />
            </section>

            <NotificationSettings />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The "Notifications" section of the settings popover: a sound on/off toggle
 * (6.5) and a desktop-notification permission control (6.6). Both surfaces are
 * pure Web APIs (localStorage + the Notification API), so they work inside the
 * Shadow DOM; the SDK's controller reads the same signals to decide when to
 * chime / raise an OS notification. Channels the host disabled via
 * `notifications` config are hidden.
 */
function NotificationSettings() {
  const { t, notifications } = useChatContext();
  const [soundOn, setSoundOn] = useState(() => soundEnabled(notifications.sound ?? false));
  // Current OS permission, when the Notification API exists. `null` → unsupported
  // (or the host hid the channel) → the desktop row isn't rendered.
  const notificationApi = typeof Notification !== 'undefined' ? Notification : null;
  const [permission, setPermission] = useState<NotificationPermission | null>(
    notificationApi ? notificationApi.permission : null,
  );

  const soundVisible = notifications.sound !== false;
  const desktopVisible = notifications.desktop !== false && notificationApi !== null;
  if (!soundVisible && !desktopVisible) return null;

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      writeSoundPref(next);
      return next;
    });
  };

  const requestPermission = () => {
    // Must run from this user gesture — browsers reject silent permission asks.
    void notificationApi?.requestPermission().then((result) => setPermission(result));
  };

  return (
    <>
      <div className="bg-border mx-1.5 my-2 h-px" />
      <section className="px-1.5 pb-1.5">
        <p className="text-muted-foreground m-0 mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide uppercase">
          {t('settings.notifications')}
        </p>

        {soundVisible && (
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            onClick={toggleSound}
            className="hover:bg-muted/60 focus-visible:ring-ring/60 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2"
          >
            {soundOn ? (
              <IconVolume className="text-foreground size-[18px] shrink-0" aria-hidden="true" />
            ) : (
              <IconVolumeOff
                className="text-muted-foreground size-[18px] shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="text-foreground flex-1">{t('settings.sound')}</span>
            {/* Track + knob toggle, colored via the accent gradient when on. */}
            <span
              aria-hidden="true"
              style={soundOn ? { backgroundImage: 'var(--lch-gradient)' } : undefined}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                soundOn ? '' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'bg-background inline-block size-4 rounded-full shadow-sm transition-transform',
                  soundOn ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
        )}

        {desktopVisible && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
            <IconBell className="text-muted-foreground size-[18px] shrink-0" aria-hidden="true" />
            <span className="text-foreground flex-1">{t('settings.desktop')}</span>
            {permission === 'granted' ? (
              <span className="text-muted-foreground text-xs font-medium">
                {t('notify.enabled')}
              </span>
            ) : permission === 'denied' ? (
              <span className="text-muted-foreground text-xs font-medium">
                {t('notify.blocked')}
              </span>
            ) : (
              <button
                type="button"
                onClick={requestPermission}
                className="text-primary hover:bg-primary/10 focus-visible:ring-ring/60 rounded-md px-2 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2"
              >
                {t('notify.enable')}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
