import { describe, expect, it } from 'vitest';
import { resolveTheme, themeToCssVars } from './apply';

describe('themes', () => {
  it('resolves named themes and falls back to default', () => {
    expect(resolveTheme('dark').colorScheme).toBe('dark');
    expect(resolveTheme('nonexistent').name).toBe('default');
  });

  it('honours an explicit color scheme over the name', () => {
    expect(resolveTheme('default', 'dark').colorScheme).toBe('dark');
  });

  it('serializes tokens to prefixed CSS variables with overrides applied', () => {
    const vars = themeToCssVars(resolveTheme('default'), { primary: '#ff0000' });
    expect(vars['--lch-primary']).toBe('#ff0000');
    // Glassmorphism surfaces stay translucent so the panel's backdrop blur shows
    // through; the conversation canvas is a slightly darker cool off-white.
    expect(vars['--lch-background']).toBe('rgba(236, 238, 244, 0.85)');
  });
});
