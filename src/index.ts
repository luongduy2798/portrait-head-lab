export type { HeadAssetOptions } from './assets';
export * from './errors';
export * from './core/types';
export { HeadPipeline, loadTemplate, type Progress, type PipelineGenerationOptions } from './core/pipeline';
export { createHead, computeSmoothNormals, disposeObject, updateFlatAppearance, type HeadBuildOptions } from './core/mesh';
export { loadEarTemplate, type EarTemplate } from './core/ears';
export { loadExpressionRig, type ExpressionRigAsset, type OralRigSurface } from './core/expression-rig';
export {
  applyExpression, controlsForObject, expressionControls, expressionSet,
  expressionIntensityMultiplier, legacyExpressionControls, readExpression,
  supportsExpressions, updateExpressionBounds, type ExpressionName, type ExpressionSelection,
} from './core/expressions';
export { manualKeys, shapeControls } from './core/shape';
export { exportHead, inspectGLB } from './core/exporter';
export type { HeadSurface } from './core/subdivision';
