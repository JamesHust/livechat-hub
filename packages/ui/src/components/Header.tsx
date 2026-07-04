import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconMessages,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useChatContext } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { AgentAvatar } from './AgentAvatar';
import { SettingsMenu } from './SettingsMenu';

export interface HeaderProps {
  onClose?: () => void;
  /** Whether the panel is currently expanded to fullscreen. */
  fullscreen?: boolean;
  /** Toggle fullscreen; omit to hide the control (e.g. embedded popup hosts). */
  onToggleFullscreen?: () => void;
  /** Toggle in-conversation search; omit to hide the control (e.g. empty chat). */
  onToggleSearch?: () => void;
  /** Whether the search bar is currently open. */
  searchActive?: boolean;
  /** Open the multi-thread conversation list; omit to hide the control. */
  onOpenConversations?: () => void;
}

export function Header({
  onClose,
  fullscreen,
  onToggleFullscreen,
  onToggleSearch,
  searchActive,
  onOpenConversations,
}: HeaderProps) {
  const { t } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  return (
    <header className="bg-card relative z-10 flex items-center gap-2 px-4 py-3 shadow-[var(--lch-shadow-sm)]">
      {onOpenConversations && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenConversations}
          aria-label={t('conversation.title')}
          className={cn('text-muted-foreground -ml-1', chromeButton)}
        >
          <IconMessages className={chromeIcon} aria-hidden="true" />
        </Button>
      )}
      <AgentAvatar size="md" animated />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-semibold tracking-tight">{t('header.title')}</p>
        <p className="text-muted-foreground m-0 flex items-center gap-1.5 truncate text-xs">
          {/* Solid presence dot (success token); the soft pulse only plays when
           * motion is allowed, otherwise it reads as a steady "online" light. */}
          <span className="relative inline-flex size-2 shrink-0">
            <span
              style={{ backgroundColor: 'var(--lch-success)' }}
              className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
            />
            <span
              style={{ backgroundColor: 'var(--lch-success)' }}
              className="relative inline-flex size-2 rounded-full"
            />
          </span>
          {t('header.online')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onToggleSearch && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSearch}
            aria-label={t('search.label')}
            aria-pressed={searchActive}
            className={cn('text-muted-foreground', chromeButton)}
          >
            <IconSearch className={chromeIcon} aria-hidden="true" />
          </Button>
        )}
        <SettingsMenu />
        {onToggleFullscreen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? t('header.exitFullscreen') : t('header.fullscreen')}
            aria-pressed={fullscreen}
            className={cn('text-muted-foreground', chromeButton)}
          >
            {fullscreen ? (
              <IconArrowsMinimize className={chromeIcon} aria-hidden="true" />
            ) : (
              <IconArrowsMaximize className={chromeIcon} aria-hidden="true" />
            )}
          </Button>
        )}
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('launcher.close')}
            className={cn('text-muted-foreground', chromeButton)}
          >
            <IconX className={chromeIcon} aria-hidden="true" />
          </Button>
        )}
      </div>
    </header>
  );
}
