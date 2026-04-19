/**
 * UI System Themes
 * Dark theme configuration for the Infinigen R3F UI
 */

import { Theme } from '../types';

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: '#1e1e1e',
    backgroundSecondary: '#252525',
    foreground: '#ffffff',
    foregroundSecondary: '#aaaaaa',
    accent: '#4488ff',
    accentHover: '#5599ff',
    border: '#333333',
    error: '#ff4444',
    warning: '#ffaa00',
    success: '#44ff88',
    info: '#4488ff',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  fontSize: {
    xs: '10px',
    sm: '11px',
    md: '12px',
    lg: '14px',
    xl: '16px',
  },
  borderRadius: {
    sm: '3px',
    md: '4px',
    lg: '8px',
  },
};

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: '#f5f5f5',
    backgroundSecondary: '#ffffff',
    foreground: '#1a1a1a',
    foregroundSecondary: '#666666',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    border: '#e5e5e5',
    error: '#dc2626',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#2563eb',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  fontSize: {
    xs: '10px',
    sm: '11px',
    md: '12px',
    lg: '14px',
    xl: '16px',
  },
  borderRadius: {
    sm: '3px',
    md: '4px',
    lg: '8px',
  },
};

export const themes = {
  dark: darkTheme,
  light: lightTheme,
};

export type ThemeName = keyof typeof themes;
