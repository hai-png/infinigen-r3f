/**
 * Genome module — genome-driven interpolation for creature blending
 *
 * Provides the genome system for cross-species creature blending using
 * maximum bipartite matching (Hungarian algorithm).
 */

export {
  // Gene types and interfaces
  type GeneValueType,
  type GeneColor,
  type CreatureGene,
  type InterpolatableAttachment,

  // Core genome class
  CreatureGenome,

  // Bipartite matching
  MaximumBipartiteMatching,

  // Genome interpolation
  GenomeInterpolator,

  // Attachment interpolation
  AttachmentInterpolator,

  // Genome factory
  GenomeFactory,
  type SpeciesType,

  // Utility functions
  geneColorToThreeColor,
  threeColorToGeneColor,
  genomeToPlainObject,
} from './CreatureGenome';
