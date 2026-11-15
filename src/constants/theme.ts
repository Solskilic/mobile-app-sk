/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2D2D24',
    background: '#F8F5EB',
    backgroundElement: '#FFFCF4',
    backgroundSelected: '#EDE5CC',
    textSecondary: '#716D5C',
    accent: '#8A6815',
    accentSoft: '#F2E4B6',
    onAccent: '#FFFFFF',
    border: '#DFD7C4',
    realistic: '#2F6B55',
    stretch: '#A86A12',
    unrealistic: '#B23A48',
  },
  dark: {
    text: '#F7F0DD',
    background: '#24231E',
    backgroundElement: '#302E25',
    backgroundSelected: '#423C29',
    textSecondary: '#C2B9A1',
    accent: '#E4BD52',
    accentSoft: '#484025',
    onAccent: '#24231E',
    border: '#4E4737',
    realistic: '#7CC4A4',
    stretch: '#E7B15C',
    unrealistic: '#F08A96',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 560;
