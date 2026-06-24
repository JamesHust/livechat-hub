import botImage from '../assets/bot.png?inline';
import { cn } from '../lib/utils';

export interface AgentMarkProps {
  className?: string;
  /**
   * Play the idle float (gentle CSS `lch-float`, `prefers-reduced-motion`-safe).
   * Enable on the few attention placements (launcher, header, hero); leave off
   * in dense/streaming spots (per-message avatars) to keep the hot path calm.
   */
  animated?: boolean;
}

/**
 * The agent's shared brand image — the project-supplied `bot.png`
 * (`packages/ui/src/assets/bot.png`). Used by both the launcher badge and the
 * agent avatar so the identity is one consistent character.
 *
 * Vite inlines the PNG as a base64 data URI (the SDK ships one self-contained
 * IIFE bundle), so the embedded widget makes no extra asset request and the
 * image loads fine inside the Shadow DOM. The mark fills its parent badge
 * (`size-full`, `object-cover`, clipped round); that badge keeps the themeable
 * `--lch-gradient`, so a transparent-background PNG still reads as a branded,
 * white-labelable tile.
 */
export function AgentMark({ className, animated = false }: AgentMarkProps) {
  return (
    <img
      src={botImage}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        // Size is owned by the caller: `AgentAvatar` insets it per badge size
        // (`[&_img]:size-*`), the launcher sets it directly (`size-12`).
        'lch-mark rounded-full object-cover',
        animated && 'lch-mark--animated',
        className,
      )}
    />
  );
}
