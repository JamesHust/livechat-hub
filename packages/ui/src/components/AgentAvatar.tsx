import { AgentMark } from './AgentMark';
import { cn } from '../lib/utils';

export interface AgentAvatarProps {
  /** Visual size; `sm` sits beside bubbles, `lg` anchors the empty state. */
  size?: 'sm' | 'md' | 'lg';
  /** Play the mark's idle float. Off by default (calm in dense lists). */
  animated?: boolean;
  className?: string;
}

// Outer `size-*` is the gradient badge; the inner `[&_img]:size-*` insets the
// `bot.png` mark so the themeable gradient reads as a ring around it (rather
// than the image bleeding to the badge edge). Tune the inner value to resize
// just the image; the badge footprint stays put.
const SIZES = {
  sm: 'size-8 [&_img]:size-6',
  md: 'size-10 [&_img]:size-8',
  lg: 'size-16 [&_img]:size-14',
} as const;

/**
 * The agent's visual identity: a circular gradient-glass badge holding the
 * brand image (`AgentMark` → `bot.png`). The gradient comes from the
 * `--lch-gradient` token (never hard-coded) so it shows through a
 * transparent-background image and white-label themes restyle it for free.
 */
export function AgentAvatar({ size = 'sm', animated = false, className }: AgentAvatarProps) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundImage: 'var(--lch-gradient)' }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-[var(--lch-shadow)]',
        SIZES[size],
        className,
      )}
    >
      <AgentMark animated={animated} />
    </span>
  );
}
