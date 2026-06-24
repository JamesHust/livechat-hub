import type { Theme, ThemeTokens } from '@livechat-hub/shared';

/*
 * Glassmorphism is the project's design language (see the `glassmorphism`
 * skill). Surfaces are intentionally translucent so the panel's
 * `backdrop-filter` blur shows the host page through frosted glass; text
 * tokens stay solid for WCAG-AA contrast. Electric blue `#1856FF` is the single
 * accent, muted plum is support.
 */
const shared = {
  'radius-sm': '8px',
  'radius-md': '12px',
  'radius-lg': '20px',
  'font-family': "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'font-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  'font-size': '14px',
} satisfies Partial<ThemeTokens>;

export const lightTheme: Theme = {
  name: 'default',
  colorScheme: 'light',
  tokens: {
    ...shared,
    primary: '#1856FF',
    'primary-foreground': '#ffffff',
    gradient: 'linear-gradient(135deg, #1856FF 0%, #4d7dff 100%)',
    'gradient-foreground': '#ffffff',
    'primary-soft': 'rgba(24, 86, 255, 0.10)',
    success: '#07ca6b',
    // Conversation canvas (message list): a cool off-white, slightly darker and
    // more opaque than the chrome — it reads as a recessed surface the white
    // chrome bars + bubbles sit on top of (iMessage/Messenger pattern).
    background: 'rgba(236, 238, 244, 0.85)',
    // Chrome surfaces (header, composer, popovers): clean near-white, lighter
    // than the canvas so the bars feel elevated.
    surface: 'rgba(255, 255, 255, 0.72)',
    'surface-muted': 'rgba(58, 52, 78, 0.06)',
    text: '#141414',
    'text-muted': '#5b5468',
    // Subtle neutral hairline (like large apps), not a bright white edge — reads
    // as a faint divider on the frosted panel without boxing every surface in.
    border: 'rgba(17, 17, 17, 0.08)',
    'user-bubble': '#1856FF',
    'user-bubble-foreground': '#ffffff',
    // White bubble that pops against the cool-gray canvas.
    'assistant-bubble': 'rgba(255, 255, 255, 0.88)',
    'assistant-bubble-foreground': '#141414',
    danger: '#ea2143',
    shadow: '0 12px 40px rgba(24, 86, 255, 0.20)',
    'shadow-sm': '0 0 10px rgba(17, 17, 17, 0.08)',
  },
};

export const darkTheme: Theme = {
  name: 'dark',
  colorScheme: 'dark',
  tokens: {
    ...shared,
    primary: '#4d7dff',
    'primary-foreground': '#0b1020',
    gradient: 'linear-gradient(135deg, #1856FF 0%, #6f93ff 100%)',
    'gradient-foreground': '#ffffff',
    'primary-soft': 'rgba(77, 125, 255, 0.16)',
    success: '#1fdd86',
    // Deepened canvas so the chrome bars + bubbles read as elevated above it.
    background: 'rgba(12, 12, 20, 0.72)',
    surface: 'rgba(40, 38, 56, 0.60)',
    'surface-muted': 'rgba(255, 255, 255, 0.06)',
    text: '#f5f5f7',
    'text-muted': '#a9a4b8',
    border: 'rgba(255, 255, 255, 0.10)',
    'user-bubble': '#1856FF',
    'user-bubble-foreground': '#ffffff',
    'assistant-bubble': 'rgba(58, 52, 78, 0.66)',
    'assistant-bubble-foreground': '#f5f5f7',
    danger: '#ff6178',
    shadow: '0 16px 48px rgba(0, 0, 0, 0.55)',
    'shadow-sm': '0 0 10px rgba(0, 0, 0, 0.45)',
  },
};

export const themes: Record<string, Theme> = {
  default: lightTheme,
  dark: darkTheme,
};
