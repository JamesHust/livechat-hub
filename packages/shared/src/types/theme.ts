/**
 * Theme contracts. Themes are expressed as CSS custom properties so the widget
 * can be restyled at runtime and white-labelled without rebuilding. The token
 * names here are the single source of truth shared by the `themes` package and
 * the `ui` components.
 */

export type ColorScheme = 'light' | 'dark';

/** The canonical set of CSS variable names (without the `--lch-` prefix). */
export interface ThemeTokens {
  primary: string;
  'primary-foreground': string;
  /** Accent gradient (CSS image) for the launcher, agent avatar and send button. */
  gradient: string;
  /** Foreground (icon/text/hairline) on top of `gradient` — stays light in both
   * schemes because the gradient is a saturated accent in every theme. */
  'gradient-foreground': string;
  /** Low-opacity tint of `primary` — avatar fills, hover washes, focus halos. */
  'primary-soft': string;
  /** Positive / online status (presence dot, confirmations). */
  success: string;
  background: string;
  surface: string;
  'surface-muted': string;
  text: string;
  'text-muted': string;
  border: string;
  'user-bubble': string;
  'user-bubble-foreground': string;
  'assistant-bubble': string;
  'assistant-bubble-foreground': string;
  danger: string;
  'radius-sm': string;
  'radius-md': string;
  'radius-lg': string;
  'font-family': string;
  'font-mono': string;
  'font-size': string;
  shadow: string;
  /** Subtle elevation used to separate the header/composer from the message
   * list (instead of a hard divider line), like large chat apps. */
  'shadow-sm': string;
}

export type ThemeTokenName = keyof ThemeTokens;

export interface Theme {
  name: string;
  colorScheme: ColorScheme;
  tokens: ThemeTokens;
}

/** Partial overrides a host application can pass to white-label the widget. */
export type ThemeOverrides = Partial<ThemeTokens>;
