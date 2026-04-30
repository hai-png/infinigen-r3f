/**
 * Infinigen GPL Module - GPL-licensed components
 * 
 * Contains components that are licensed under GPL and
 * are optional dependencies for the main MIT-licensed package.
 */

export const GPL_LICENSE_NOTICE = `
This module contains components derived from the Infinigen project
which are licensed under the GNU General Public License v3.0.
Use of these components is subject to the GPL v3 license terms.
`;

/**
 * GPL-licensed terrain generators that use original Infinigen algorithms
 */
export class GPLTerrainGenerator {
  generate(): string {
    return 'GPL Terrain Generator - placeholder';
  }
}

/**
 * GPL-licensed creature generators
 */
export class GPLCreatureGenerator {
  generate(): string {
    return 'GPL Creature Generator - placeholder';
  }
}
