import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Hsl = readonly [hue: number, saturation: number, lightness: number];
type Theme = ReadonlyMap<string, Hsl>;

interface TokenPair {
  foreground: string;
  background: string;
}

const styles = readFileSync(
  new URL('../../../client/src/index.css', import.meta.url),
  'utf8'
);

const surfaceTextPairs: readonly TokenPair[] = [
  { foreground: 'foreground', background: 'background' },
  { foreground: 'primary', background: 'background' },
  { foreground: 'primary', background: 'card' },
  { foreground: 'muted-foreground', background: 'background' },
  { foreground: 'muted-foreground', background: 'card' },
  { foreground: 'destructive', background: 'background' },
  { foreground: 'destructive', background: 'card' },
  { foreground: 'success', background: 'background' },
  { foreground: 'success', background: 'card' },
  { foreground: 'warning', background: 'background' },
  { foreground: 'warning', background: 'card' },
  { foreground: 'sidebar-primary', background: 'sidebar' },
];

const inputBoundaryPairs: readonly TokenPair[] = [
  { foreground: 'input', background: 'background' },
  { foreground: 'input', background: 'card' },
];

const focusIndicatorPairs: readonly TokenPair[] = [
  { foreground: 'ring', background: 'background' },
  { foreground: 'ring', background: 'card' },
];

function extractRuleBody(marker: ':root' | '.dark'): string {
  const markerIndex = styles.indexOf(marker);
  const openingBrace = styles.indexOf('{', markerIndex);
  if (markerIndex < 0 || openingBrace < 0) {
    throw new Error(`Could not find ${marker} theme tokens in client/src/index.css`);
  }

  const closingBrace = styles.indexOf('\n}', openingBrace);
  if (closingBrace < 0) {
    throw new Error(`Could not find the closing brace for ${marker} theme tokens`);
  }

  return styles.slice(openingBrace + 1, closingBrace);
}

function parseTheme(marker: ':root' | '.dark'): Theme {
  const tokens = new Map<string, Hsl>();
  const tokenPattern = /--([a-z0-9-]+):\s*hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g;

  for (const match of extractRuleBody(marker).matchAll(tokenPattern)) {
    const [, name, hue, saturation, lightness] = match;
    if (name !== undefined && hue !== undefined && saturation !== undefined && lightness !== undefined) {
      tokens.set(name, [Number(hue), Number(saturation), Number(lightness)]);
    }
  }

  return tokens;
}

function getToken(theme: Theme, name: string): Hsl {
  const token = theme.get(name);
  if (token) {
    return token;
  }
  throw new Error(`Missing HSL token --${name} in client/src/index.css`);
}

function getSemanticForegroundPairs(theme: Theme): TokenPair[] {
  const pairs: TokenPair[] = [];

  for (const foreground of theme.keys()) {
    if (!foreground.endsWith('-foreground')) {
      continue;
    }

    const background = foreground.slice(0, -'-foreground'.length);
    getToken(theme, background);
    pairs.push({ foreground, background });
  }

  return pairs;
}

function hslToRgb([hue, saturationPercent, lightnessPercent]: Hsl): Hsl {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;

  if (hue < 60) { return [chroma + offset, intermediate + offset, offset]; }
  if (hue < 120) { return [intermediate + offset, chroma + offset, offset]; }
  if (hue < 180) { return [offset, chroma + offset, intermediate + offset]; }
  if (hue < 240) { return [offset, intermediate + offset, chroma + offset]; }
  if (hue < 300) { return [intermediate + offset, offset, chroma + offset]; }
  return [chroma + offset, offset, intermediate + offset];
}

function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function luminance(color: Hsl): number {
  const [red, green, blue] = hslToRgb(color).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Hsl, second: Hsl): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectPairsToMeet(themeName: string, theme: Theme, pairs: readonly TokenPair[], minimum: number): void {
  for (const pair of pairs) {
    const ratio = contrastRatio(
      getToken(theme, pair.foreground),
      getToken(theme, pair.background)
    );
    expect.soft(
      ratio,
      `${themeName} --${pair.foreground} on --${pair.background} is ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(minimum);
  }
}

describe.each([
  ['light', parseTheme(':root')],
  ['dark', parseTheme('.dark')],
] as const)('%s theme color contrast', (themeName, theme) => {
  it('keeps every declared foreground/background token pair at 4.5:1 or greater', () => {
    expectPairsToMeet(themeName, theme, getSemanticForegroundPairs(theme), 4.5);
  });

  it('keeps standalone semantic text colors at 4.5:1 or greater on their surfaces', () => {
    expectPairsToMeet(themeName, theme, surfaceTextPairs, 4.5);
  });

  it('keeps interactive input boundaries at 3:1 or greater', () => {
    expectPairsToMeet(themeName, theme, inputBoundaryPairs, 3);
  });

  it('keeps focus indicators at 3:1 or greater', () => {
    expectPairsToMeet(themeName, theme, focusIndicatorPairs, 3);
  });
});
