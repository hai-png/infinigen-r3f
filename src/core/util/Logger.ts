/**
 * Logger.ts
 *
 * Centralised logging utility for the Infinigen R3F project.
 *
 * - **debug** / **info** → only emitted in development (`NODE_ENV === 'development'`)
 * - **warn**  → always emitted (important but non-fatal issues)
 * - **error** → always emitted (actual error conditions that must never be silenced)
 *
 * Every message is prefixed with `[module]` so the source is immediately identifiable
 * without having to trace the call-site.
 *
 * Usage:
 * ```ts
 * import { Logger } from '@/core/util/Logger';
 * Logger.debug('Pipeline', 'Starting stage', stageName);
 * Logger.warn('AssetLibrary', `Generator ${id} not found`);
 * Logger.error('HybridBridge', 'Connection error:', err);
 * ```
 */

export const Logger = {
  debug: (module: string, message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') console.debug(`[${module}] ${message}`, ...args);
  },

  info: (module: string, message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') console.info(`[${module}] ${message}`, ...args);
  },

  warn: (module: string, message: string, ...args: unknown[]) => {
    console.warn(`[${module}] ${message}`, ...args);
  },

  error: (module: string, message: string, ...args: unknown[]) => {
    console.error(`[${module}] ${message}`, ...args);
  },
};
