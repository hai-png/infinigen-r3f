/**
 * Math Utilities - Legacy Aliases
 * Provides backward compatibility for files expecting utils module
 */
// FixedSeed is an alias for SeededRandom for backward compatibility
export { SeededRandom as FixedSeed } from '../MathUtils';
// Re-export commonly used utilities
export { clamp, lerp, inverseLerp, mapRange, degToRad, radToDeg, randomChoice, randomPleasantColor, weightedSample } from '../MathUtils';
//# sourceMappingURL=utils.js.map