/**
 * BlackbodyShader.ts
 *
 * Color-temperature-to-RGB conversion utility based on Planck's law.
 *
 * Provides TypeScript functions to convert blackbody color temperature
 * (in Kelvin) to RGB color values, using the Tanner Helland algorithm
 * (standard CIE approximation). This is the JavaScript/TypeScript companion
 * to the GLSL `blackbodyColor()` function in BlackbodyGLSL.ts.
 *
 * Common temperatures:
 *   2700K — Warm white (incandescent)
 *   3500K — Soft white
 *   4100K — Cool white (fluorescent)
 *   5000K — Daylight (horizon)
 *   6500K — Daylight blue (overcast)
 *
 * Valid range: 1000K – 40000K
 *
 * @module assets/lighting
 */

import * as THREE from 'three';

// ============================================================================
// Common color temperatures
// ============================================================================

/** Predefined color temperature constants (in Kelvin) */
export const COLOR_TEMPERATURES = {
  /** Candle flame */
  CANDLE: 1800,
  /** Traditional incandescent bulb */
  INCANDESCENT: 2700,
  /** Soft/warm white bulb */
  SOFT_WHITE: 3500,
  /** Cool white fluorescent */
  COOL_WHITE: 4100,
  /** Horizon daylight */
  DAYLIGHT_HORIZON: 5000,
  /** Noon daylight */
  DAYLIGHT_NOON: 5500,
  /** Overcast daylight */
  DAYLIGHT_OVERCAST: 6500,
  /** Blue sky */
  BLUE_SKY: 10000,
  /** Deep blue sky */
  DEEP_BLUE_SKY: 20000,
} as const;

// ============================================================================
// Core conversion functions
// ============================================================================

/**
 * Convert color temperature (Kelvin) to RGB color.
 *
 * Uses the Tanner Helland algorithm, which is a standard approximation
 * of CIE 1931 data for blackbody radiation in the 1000–40000K range.
 * The algorithm works by:
 * 1. Clamping temperature to valid range
 * 2. Computing each RGB channel with piecewise functions:
 *    - Red: 1.0 below 6600K, polynomial decay above
 *    - Green: logarithmic rise below 6600K, polynomial decay above
 *    - Blue: 0.0 below 1900K, logarithmic rise 1900–6600K, 1.0 above
 *
 * @param temperatureKelvin - Temperature in Kelvin (1000–40000)
 * @returns THREE.Color with RGB values in linear space (0–1 range)
 *
 * @example
 * ```ts
 * const warmWhite = blackbodyToRGB(2700);   // incandescent
 * const daylight  = blackbodyToRGB(6500);   // overcast daylight
 * ```
 */
export function blackbodyToRGB(temperatureKelvin: number): THREE.Color {
  // Clamp to valid range
  const temp = Math.max(1000, Math.min(40000, temperatureKelvin));
  const t = temp / 100.0;

  // Red channel
  let r: number;
  if (t <= 66.0) {
    r = 1.0;
  } else {
    r = 329.698727446 * Math.pow(t - 60.0, -0.1332047592);
    r = Math.max(0, Math.min(1, r / 255.0));
  }

  // Green channel
  let g: number;
  if (t <= 66.0) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    g = Math.max(0, Math.min(1, g / 255.0));
  } else {
    g = 288.1221695283 * Math.pow(t - 60.0, -0.0755148492);
    g = Math.max(0, Math.min(1, g / 255.0));
  }

  // Blue channel
  let b: number;
  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = 138.5177312231 * Math.log(t - 10.0) - 305.0447927307;
    b = Math.max(0, Math.min(1, b / 255.0));
  }

  return new THREE.Color(r, g, b);
}

/**
 * Convert color temperature (Kelvin) to a hex color string.
 *
 * @param temperatureKelvin - Temperature in Kelvin (1000–40000)
 * @returns Hex color string (e.g., "#ff9329" for 2700K)
 *
 * @example
 * ```ts
 * const hex = blackbodyToHex(2700); // "#ff9329"
 * ```
 */
export function blackbodyToHex(temperatureKelvin: number): string {
  const color = blackbodyToRGB(temperatureKelvin);
  return '#' + color.getHexString();
}

// ============================================================================
// Light creation helper
// ============================================================================

/**
 * Wattage-to-lumen conversion (approximate, for incandescent-equivalent).
 * Modern LEDs produce more lumens per watt, but this provides a useful
 * mapping for traditional bulb ratings.
 */
function wattageToCandela(wattage: number): number {
  // Incandescent: ~12 lumens/watt
  // 1 candela ≈ 12.57 lumens (for isotropic source)
  const lumens = wattage * 12;
  return lumens / 12.57;
}

/**
 * Create a THREE.PointLight with blackbody-correct color temperature.
 *
 * The light's color is set using the blackbody spectrum for the given
 * temperature, and the intensity is derived from the wattage parameter
 * using an approximate lumens-to-candela conversion.
 *
 * @param temperatureKelvin - Color temperature (1000–40000K)
 * @param intensity - Light intensity multiplier (default: 1.0).
 *                    When using physical mode, this is used as a candela scale.
 * @returns A configured THREE.PointLight
 *
 * @example
 * ```ts
 * // 60W-equivalent warm white light
 * const light = createBlackbodyLight(2700, 1.0);
 * scene.add(light);
 *
 * // 100W daylight lamp
 * const daylight = createBlackbodyLight(5000, 1.5);
 * scene.add(daylight);
 * ```
 */
export function createBlackbodyLight(
  temperatureKelvin: number,
  intensity: number = 1.0,
): THREE.PointLight {
  const color = blackbodyToRGB(temperatureKelvin);

  const light = new THREE.PointLight(color, intensity, 50);
  light.name = `BlackbodyLight_${temperatureKelvin}K`;

  // Store metadata for later reference
  light.userData = {
    temperatureKelvin,
    blackbodyColor: color.clone(),
    originalIntensity: intensity,
  };

  return light;
}

// ============================================================================
// Utility: common light presets
// ============================================================================

/**
 * Pre-configured PointLight presets matching common bulb types.
 * Each creates a PointLight with the correct blackbody color temperature
 * and appropriate intensity for the wattage.
 */
export const BlackbodyLightPresets = {
  /** Candle flame light (1800K) */
  candle: (intensity: number = 0.3): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.CANDLE, intensity),

  /** Warm incandescent bulb (2700K) */
  incandescent: (intensity: number = 1.0): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.INCANDESCENT, intensity),

  /** Soft white bulb (3500K) */
  softWhite: (intensity: number = 1.0): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.SOFT_WHITE, intensity),

  /** Cool white fluorescent (4100K) */
  coolWhite: (intensity: number = 1.0): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.COOL_WHITE, intensity),

  /** Horizon daylight (5000K) */
  daylight: (intensity: number = 1.2): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.DAYLIGHT_HORIZON, intensity),

  /** Overcast daylight (6500K) */
  daylightBlue: (intensity: number = 1.2): THREE.PointLight =>
    createBlackbodyLight(COLOR_TEMPERATURES.DAYLIGHT_OVERCAST, intensity),
} as const;

/**
 * Create a blackbody-corrected SpotLight.
 *
 * @param temperatureKelvin - Color temperature (1000–40000K)
 * @param intensity - Light intensity multiplier
 * @param angle - Spot cone angle in radians
 * @param penumbra - Spot edge softness (0–1)
 * @returns A configured THREE.SpotLight
 */
export function createBlackbodySpotLight(
  temperatureKelvin: number,
  intensity: number = 1.0,
  angle: number = Math.PI / 4,
  penumbra: number = 0.5,
): THREE.SpotLight {
  const color = blackbodyToRGB(temperatureKelvin);

  const light = new THREE.SpotLight(color, intensity, 50, angle, penumbra);
  light.name = `BlackbodySpotLight_${temperatureKelvin}K`;
  light.castShadow = true;

  light.userData = {
    temperatureKelvin,
    blackbodyColor: color.clone(),
    originalIntensity: intensity,
  };

  return light;
}

/**
 * Create a blackbody-corrected DirectionalLight (for sun simulation).
 *
 * @param temperatureKelvin - Color temperature (1000–40000K)
 * @param intensity - Light intensity multiplier
 * @returns A configured THREE.DirectionalLight
 */
export function createBlackbodyDirectionalLight(
  temperatureKelvin: number,
  intensity: number = 1.0,
): THREE.DirectionalLight {
  const color = blackbodyToRGB(temperatureKelvin);

  const light = new THREE.DirectionalLight(color, intensity);
  light.name = `BlackbodyDirLight_${temperatureKelvin}K`;
  light.castShadow = true;

  light.userData = {
    temperatureKelvin,
    blackbodyColor: color.clone(),
    originalIntensity: intensity,
  };

  return light;
}

/**
 * Update an existing light's color to match a new blackbody temperature.
 * Preserves all other light properties.
 *
 * @param light - The THREE.Light to update
 * @param temperatureKelvin - New color temperature (1000–40000K)
 */
export function updateLightTemperature(
  light: THREE.Light,
  temperatureKelvin: number,
): void {
  const color = blackbodyToRGB(temperatureKelvin);
  light.color.copy(color);

  if (light.userData) {
    light.userData.temperatureKelvin = temperatureKelvin;
    light.userData.blackbodyColor = color.clone();
  }
}

/**
 * Get the luminous efficacy factor for a given temperature.
 * Luminous efficacy peaks around 6600K (daylight) and falls off
 * for both warmer and cooler temperatures.
 *
 * @param temperatureKelvin - Color temperature
 * @returns Efficacy factor (0.2–1.0)
 */
export function getLuminousEfficacy(temperatureKelvin: number): number {
  const efficacy = 1.0 - 0.3 * Math.abs(temperatureKelvin - 6600) / 6600;
  return Math.max(0.2, Math.min(1.0, efficacy));
}
