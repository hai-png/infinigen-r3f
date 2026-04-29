/**
 * Phase 4: Data Pipeline - Core Types and Interfaces
 *
 * Provides type definitions for the data generation pipeline,
 * including job management, scene configurations, and output formats.
 */
import { Vector3, Color } from 'three';
export type JobStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';
export interface JobConfig {
    id: string;
    name: string;
    priority: JobPriority;
    sceneConfig: SceneGenerationConfig;
    outputConfig: OutputConfig;
    renderConfig: RenderConfig;
    createdAt: Date;
    updatedAt: Date;
    status: JobStatus;
    progress: number;
    errorMessage?: string;
    retryCount: number;
    maxRetries: number;
    tags?: string[];
    metadata?: Record<string, any>;
}
export interface JobProgress {
    jobId: string;
    status: JobStatus;
    progress: number;
    currentStage: string;
    stageProgress: number;
    estimatedTimeRemaining?: number;
    completedAt?: Date;
    error?: JobError;
}
export interface JobError {
    code: string;
    message: string;
    stack?: string;
    timestamp: Date;
    recoverable: boolean;
}
export interface JobResult {
    jobId: string;
    status: 'success' | 'failure';
    outputs: GeneratedAsset[];
    metadata: JobMetadata;
    duration: number;
    renderTime: number;
}
export interface JobMetadata {
    seed: number;
    variantCount: number;
    resolution: {
        width: number;
        height: number;
    };
    sampleCount: number;
    generatedAt: Date;
    version: string;
}
export interface SceneGenerationConfig {
    seed: number;
    variant: number;
    terrain: TerrainConfig;
    objects: ObjectGenerationConfig;
    lighting: LightingConfig;
    cameras: CameraConfig[];
    environment: EnvironmentConfig;
    scatter: ScatterConfig;
}
export interface TerrainConfig {
    enabled: boolean;
    size: number;
    resolution: number;
    heightScale: number;
    biome: BiomeType;
    features: TerrainFeatureConfig;
}
export type BiomeType = 'temperate_forest' | 'tropical_rainforest' | 'desert' | 'arctic' | 'grassland' | 'mountain' | 'volcanic' | 'coastal';
export interface TerrainFeatureConfig {
    caves: boolean;
    erosion: boolean;
    ocean: boolean;
    rivers: boolean;
    lakes: boolean;
    cliffs: boolean;
}
export interface ObjectGenerationConfig {
    creatures: CreatureConfig;
    plants: PlantConfig;
    structures: StructureConfig;
    props: PropConfig;
}
export interface CreatureConfig {
    enabled: boolean;
    count: {
        min: number;
        max: number;
    };
    types: CreatureType[];
    sizeVariation: number;
    poseVariation: number;
}
export type CreatureType = 'mammal' | 'reptile' | 'amphibian' | 'bird' | 'fish' | 'insect' | 'mythical';
export interface PlantConfig {
    enabled: boolean;
    count: {
        min: number;
        max: number;
    };
    types: PlantType[];
    density: number;
    seasonalVariation: boolean;
}
export type PlantType = 'tree' | 'shrub' | 'grass' | 'flower' | 'vine' | 'cactus' | 'fern' | 'moss';
export interface StructureConfig {
    enabled: boolean;
    count: {
        min: number;
        max: number;
    };
    types: StructureType[];
    style: string;
}
export type StructureType = 'ruin' | 'building' | 'bridge' | 'tower' | 'wall' | 'fence';
export interface PropConfig {
    enabled: boolean;
    count: {
        min: number;
        max: number;
    };
    types: PropType[];
    scatterDensity: number;
}
export type PropType = 'rock' | 'log' | 'boulder' | 'crystal' | 'fossil' | 'artifact';
export interface LightingConfig {
    type: LightingType;
    intensity: number;
    color: Color;
    shadows: boolean;
    hdri?: string;
    threePoint?: ThreePointLightingConfig;
    volumetric?: VolumetricConfig;
}
export type LightingType = 'sun' | 'hdri' | 'three_point' | 'studio' | 'natural' | 'dramatic';
export interface ThreePointLightingConfig {
    keyIntensity: number;
    fillIntensity: number;
    rimIntensity: number;
    keyAngle: number;
    fillAngle: number;
    rimAngle: number;
}
export interface VolumetricConfig {
    enabled: boolean;
    density: number;
    scattering: number;
    color: Color;
}
export interface CameraConfig {
    id: string;
    type: CameraType;
    position?: Vector3;
    target?: Vector3;
    fov: number;
    aspect: number;
    near: number;
    far: number;
    orbit?: OrbitConfig;
    path?: CameraPathConfig;
}
export type CameraType = 'static' | 'orbit' | 'path' | 'random' | 'framing';
export interface OrbitConfig {
    radius: {
        min: number;
        max: number;
    };
    elevation: {
        min: number;
        max: number;
    };
    azimuth: {
        min: number;
        max: number;
    };
    speed: number;
}
export interface CameraPathConfig {
    waypoints: Vector3[];
    tension: number;
    closed: boolean;
    duration: number;
}
export interface EnvironmentConfig {
    skyColor: Color;
    fogEnabled: boolean;
    fogDensity: number;
    fogColor: Color;
    ambientLight: number;
    timeOfDay: number;
    weather: WeatherType;
}
export type WeatherType = 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy';
export interface ScatterConfig {
    groundCover: GroundCoverConfig;
    climbingPlants: ClimbingPlantConfig;
    underwater: UnderwaterScatterConfig;
}
export interface GroundCoverConfig {
    enabled: boolean;
    density: number;
    types: string[];
    seasonalVariation: boolean;
}
export interface ClimbingPlantConfig {
    enabled: boolean;
    density: number;
    types: string[];
    surfacePreference: SurfaceType[];
}
export type SurfaceType = 'rock' | 'wood' | 'concrete' | 'metal' | 'organic';
export interface UnderwaterScatterConfig {
    enabled: boolean;
    coralDensity: number;
    seaweedDensity: number;
    fishSchools: boolean;
}
export interface OutputConfig {
    format: OutputFormat[];
    resolution: {
        width: number;
        height: number;
    };
    sampleCount: number;
    denoise: boolean;
    saveBlend: boolean;
    saveUSDZ: boolean;
    saveOBJ: boolean;
    saveGLTF: boolean;
    groundTruth: GroundTruthConfig;
}
export type OutputFormat = 'png' | 'jpg' | 'exr' | 'hdr';
export interface GroundTruthConfig {
    enabled: boolean;
    depth: boolean;
    normal: boolean;
    albedo: boolean;
    segmentation: boolean;
    boundingBoxes: boolean;
    opticalFlow: boolean;
    instanceIds: boolean;
}
export interface GeneratedAsset {
    type: AssetType;
    path: string;
    format: string;
    size: number;
    resolution?: {
        width: number;
        height: number;
    };
    metadata: AssetMetadata;
}
export type AssetType = 'image' | 'depth' | 'normal' | 'albedo' | 'segmentation' | 'bounding_boxes' | 'optical_flow' | 'model_gltf' | 'model_obj' | 'model_usdz' | 'blend_file';
export interface AssetMetadata {
    jobId: string;
    cameraId: string;
    variant: number;
    seed: number;
    timestamp: Date;
    checksum: string;
}
export interface RenderConfig {
    engine: RenderEngine;
    samples: number;
    maxBounces: number;
    denoising: boolean;
    motionBlur: boolean;
    depthOfField: boolean;
    bloom: boolean;
    toneMapping: ToneMappingType;
    exposure: number;
}
export type RenderEngine = 'cycles' | 'eevee' | 'webgl';
export type ToneMappingType = 'linear' | 'reinhard' | 'aces' | 'filmic' | 'neutral';
export interface PipelineMetrics {
    totalJobs: number;
    pendingJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageRenderTime: number;
    throughputPerHour: number;
    successRate: number;
    resourceUtilization: ResourceUtilization;
}
export interface ResourceUtilization {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage: number;
    diskUsage: number;
    networkBandwidth: number;
}
export interface PipelineHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeWorkers: number;
    totalWorkers: number;
    queueDepth: number;
    lastHeartbeat: Date;
    issues: HealthIssue[];
}
export interface HealthIssue {
    severity: 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    timestamp: Date;
    resolved: boolean;
}
export interface CloudProvider {
    name: CloudProviderName;
    region: string;
    credentials: CloudCredentials;
}
export type CloudProviderName = 'aws' | 'gcp' | 'azure' | 'local';
export interface CloudCredentials {
    accessKeyId?: string;
    secretAccessKey?: string;
    projectId?: string;
    serviceAccountKey?: string;
    subscriptionId?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
}
export interface CloudStorageConfig {
    provider: CloudProviderName;
    bucket: string;
    prefix: string;
    region: string;
    acl: StorageACL;
}
export type StorageACL = 'private' | 'public-read' | 'authenticated-read';
export interface CloudComputeConfig {
    provider: CloudProviderName;
    instanceType: string;
    spotInstance: boolean;
    autoScaling: boolean;
    minInstances: number;
    maxInstances: number;
}
export interface BatchJob {
    id: string;
    name: string;
    jobConfigs: JobConfig[];
    cloudConfig: CloudIntegrationConfig;
    status: BatchStatus;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}
export interface CloudIntegrationConfig {
    storage: CloudStorageConfig;
    compute?: CloudComputeConfig;
    notification?: NotificationConfig;
}
export interface NotificationConfig {
    email?: string[];
    slack?: SlackConfig;
    webhook?: WebhookConfig;
    onComplete: boolean;
    onFailure: boolean;
}
export interface SlackConfig {
    webhookUrl: string;
    channel: string;
    username: string;
}
export interface WebhookConfig {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
}
export type BatchStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
export interface BatchProgress {
    batchId: string;
    status: BatchStatus;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    runningJobs: number;
    pendingJobs: number;
    progress: number;
    estimatedCompletion?: Date;
}
export type PipelineEvent = JobCreatedEvent | JobStartedEvent | JobProgressEvent | JobCompletedEvent | JobFailedEvent | BatchStartedEvent | BatchCompletedEvent | PipelineHealthEvent;
export interface JobCreatedEvent {
    type: 'job_created';
    jobId: string;
    timestamp: Date;
    config: JobConfig;
}
export interface JobStartedEvent {
    type: 'job_started';
    jobId: string;
    timestamp: Date;
    workerId: string;
}
export interface JobProgressEvent {
    type: 'job_progress';
    jobId: string;
    timestamp: Date;
    progress: JobProgress;
}
export interface JobCompletedEvent {
    type: 'job_completed';
    jobId: string;
    timestamp: Date;
    result: JobResult;
}
export interface JobFailedEvent {
    type: 'job_failed';
    jobId: string;
    timestamp: Date;
    error: JobError;
}
export interface BatchStartedEvent {
    type: 'batch_started';
    batchId: string;
    timestamp: Date;
    jobCount: number;
}
export interface BatchCompletedEvent {
    type: 'batch_completed';
    batchId: string;
    timestamp: Date;
    successCount: number;
    failureCount: number;
}
export interface PipelineHealthEvent {
    type: 'pipeline_health';
    timestamp: Date;
    health: PipelineHealth;
}
export interface PaginationParams {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filters?: Record<string, any>;
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface QueryParams {
    status?: JobStatus[];
    priority?: JobPriority[];
    tags?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    search?: string;
}
//# sourceMappingURL=types.d.ts.map