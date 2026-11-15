/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#172D44',
    background: '#EAF3FA',
    backgroundElement: '#FFFEF9',
    backgroundSelected: '#D3E4F5',
    textSecondary: '#50667D',
    accent: '#225DB2',
    accentSoft: '#DCEBFA',
    onAccent: '#FFFFFF',
    border: '#C7D9E8',
    realistic: '#26705D',
    stretch: '#7654A2',
    unrealistic: '#B23A53',
  },
  dark: {
    text: '#F3F7FC',
    background: '#101F30',
    backgroundElement: '#192D42',
    backgroundSelected: '#294563',
    textSecondary: '#B2C6DC',
    accent: '#8DBDFC',
    accentSoft: '#233E5D',
    onAccent: '#102B50',
    border: '#36516B',
    realistic: '#8FD5BA',
    stretch: '#C6A9EE',
    unrealistic: '#F49FB0',
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
