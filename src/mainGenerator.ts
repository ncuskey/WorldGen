import { generateHexMap, Hex, HexMapConfig } from './worldGenerator';
import { refineCoast } from './coastline';
import { generateRivers, RiverResult } from './rivers';
import { renderHexMap, RenderConfig } from './render';

export interface WorldConfig {
  seed: number;
  hexRadius: number;
  cols: number;
  rows: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  gradientExponent: number;
  seaLevel: number;
  // River settings
  minSourceElev: number;
  mainRiverAccum: number;
  tributaryAccum: number;
  secondaryStreamAccum: number;
  tertiaryStreamAccum: number;
  riverWidth: number;
  riverSmooth: number;
  // Coastline settings
  erosionPasses: number;
  dilationPasses: number;
  coastNoiseSeed: number;
  // Render settings
  showRivers: boolean;
  showFlowAccumulation: boolean;
  showCoastlines: boolean;
  debugMode: boolean;
}

export interface WorldResult {
  hexes: Hex[];
  riverResult: RiverResult;
  coastEdges: { x: number, y: number }[][];
  config: WorldConfig;
}

export function generateWorld(config: WorldConfig): WorldResult {
  // Step 1: Generate hex map with elevation
  const hexConfig: HexMapConfig = {
    radius: config.hexRadius,
    cols: config.cols,
    rows: config.rows,
    octaves: config.octaves,
    persistence: config.persistence,
    lacunarity: config.lacunarity,
    gradientExponent: config.gradientExponent,
    seaLevel: config.seaLevel,
  };
  
  const { hexes } = generateHexMap(config.seed, hexConfig);
  
  // Step 2: Refine coastlines
  const { hexes: refinedHexes, coastEdges } = refineCoast(hexes, {
    cols: config.cols,
    rows: config.rows,
    radius: config.hexRadius,
    erosionPasses: config.erosionPasses,
    dilationPasses: config.dilationPasses,
    coastNoiseSeed: config.coastNoiseSeed,
  });
  
  // Step 3: Generate rivers
  const riverResult = generateRivers(refinedHexes, {
    cols: config.cols,
    rows: config.rows,
    minSourceElev: config.minSourceElev,
    mainRiverAccum: config.mainRiverAccum,
    tributaryAccum: config.tributaryAccum,
    secondaryStreamAccum: config.secondaryStreamAccum,
    tertiaryStreamAccum: config.tertiaryStreamAccum,
    riverWidth: config.riverWidth,
    smooth: config.riverSmooth,
  });
  
  return {
    hexes: refinedHexes,
    riverResult,
    coastEdges,
    config,
  };
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  worldResult: WorldResult,
  moistureMap: number[],
  biomes?: any[]
) {
  const renderConfig: RenderConfig = {
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    hexRadius: worldResult.config.hexRadius,
    showRivers: worldResult.config.showRivers,
    showFlowAccumulation: worldResult.config.showFlowAccumulation,
    showCoastlines: worldResult.config.showCoastlines,
    debugMode: worldResult.config.debugMode,
  };
  
  renderHexMap(
    ctx,
    worldResult.hexes,
    worldResult.riverResult.riverPolylines,
    moistureMap,
    worldResult.riverResult.flowAccum,
    renderConfig,
    biomes
  );
  
  // Draw coastlines if enabled
  if (worldResult.config.showCoastlines && worldResult.coastEdges.length > 0) {
    drawCoastlines(ctx, worldResult.coastEdges, worldResult.config.debugMode);
  }
}

function drawCoastlines(ctx: CanvasRenderingContext2D, coastEdges: { x: number, y: number }[][], debugMode: boolean) {
  ctx.strokeStyle = debugMode ? '#ff0000' : '#1e293b';
  ctx.lineWidth = debugMode ? 2 : 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const edge of coastEdges) {
    if (edge.length > 1) {
      ctx.beginPath();
      ctx.moveTo(edge[0].x, edge[0].y);
      
      for (let i = 1; i < edge.length; i++) {
        ctx.lineTo(edge[i].x, edge[i].y);
      }
      
      ctx.stroke();
    }
  }
} 