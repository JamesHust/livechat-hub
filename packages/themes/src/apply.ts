import {
  CSS_VAR_PREFIX,
  type ColorScheme,
  type Theme,
  type ThemeOverrides,
} from '@livechat-hub/shared';
import { darkTheme, lightTheme, themes } from './tokens';

/** Resolve a theme by name, honouring `'auto'` against the OS color scheme. */
export function resolveTheme(name: string | undefined, colorScheme?: ColorScheme): Theme {
  if (colorScheme) return colorScheme === 'dark' ? darkTheme : lightTheme;
  if (name === 'auto') return prefersDark() ? darkTheme : lightTheme;
  return themes[name ?? 'default'] ?? lightTheme;
}

/** Serialize a theme (plus overrides) into a CSS variable declaration block. */
export function themeToCssVars(theme: Theme, overrides?: ThemeOverrides): Record<string, string> {
  const merged = { ...theme.tokens, ...overrides };
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    vars[`${CSS_VAR_PREFIX}-${key}`] = String(value);
  }
  return vars;
}

/**
 * Apply a theme to a target host element (the Shadow DOM host or any element).
 * Writing CSS variables on the host means descendants restyle instantly and at
 * runtime without re-rendering React.
 */
export function applyThemeToElement(
  el: HTMLElement,
  theme: Theme,
  overrides?: ThemeOverrides,
): void {
  const vars = themeToCssVars(theme, overrides);
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
  el.dataset.lchColorScheme = theme.colorScheme;
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
