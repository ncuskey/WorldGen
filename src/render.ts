import { Hex } from './worldGenerator';
import { RiverPolyline } from './rivers';

export interface RenderConfig {
  width: number;
  height: number;
  hexRadius: number;
  showRivers: boolean;
  showFlowAccumulation: boolean;
  showCoastlines: boolean;
  debugMode: boolean;
  coastEdges?: { x: number, y: number }[][]; // Add this for coastline rendering
}

export interface Biome {
  name: string;
  color: string;
  minHeight: number;
  maxHeight: number;
  minMoisture: number;
  maxMoisture: number;
}

// Fantasy map palette
const OCEAN_COLOR = '#a3b9d7';
const LAND_COLOR = '#e9e4c7';
const HIGHLAND_COLOR = '#b7b48a';
const MOUNTAIN_COLOR = '#b0a18f';
const FOREST_COLOR = '#7ca07c';
const RIVER_COLOR = '#4a90e2';

const defaultBiomes: Biome[] = [
  { name: 'Deep Ocean', color: OCEAN_COLOR, minHeight: -1, maxHeight: -0.3, minMoisture: -1, maxMoisture: 1 },
  { name: 'Shallow Water', color: OCEAN_COLOR, minHeight: -0.3, maxHeight: -0.1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Beach', color: LAND_COLOR, minHeight: -0.1, maxHeight: 0, minMoisture: -1, maxMoisture: 1 },
  { name: 'Plains', color: LAND_COLOR, minHeight: 0, maxHeight: 0.3, minMoisture: -1, maxMoisture: 0.3 },
  { name: 'Forest', color: FOREST_COLOR, minHeight: 0, maxHeight: 0.5, minMoisture: 0.3, maxMoisture: 1 },
  { name: 'Hills', color: HIGHLAND_COLOR, minHeight: 0.3, maxHeight: 0.6, minMoisture: -1, maxMoisture: 1 },
  { name: 'Mountains', color: MOUNTAIN_COLOR, minHeight: 0.6, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Snow Peaks', color: '#ffffff', minHeight: 0.8, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
];

export function renderHexMap(
  ctx: CanvasRenderingContext2D,
  hexes: Hex[],
  riverPolylines: RiverPolyline[],
  moistureMap: number[],
  flowAccum: number[],
  config: RenderConfig,
  biomes: Biome[] = defaultBiomes
) {
  const { width, height, showRivers, showFlowAccumulation, debugMode, coastEdges } = config;

  // Fill ocean background
  ctx.fillStyle = OCEAN_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Fill all landmasses using coastline polylines
  if (coastEdges && coastEdges.length > 0) {
    fillCoastlines(ctx, coastEdges, LAND_COLOR);
  }

  // Draw rivers if enabled
  if (showRivers) {
    drawRivers(ctx, riverPolylines, debugMode);
  }

  // Draw flow accumulation debug overlay
  if (showFlowAccumulation && debugMode) {
    drawFlowAccumulation(ctx, hexes, flowAccum, config);
  }
}

function fillCoastlines(ctx: CanvasRenderingContext2D, coastEdges: { x: number, y: number }[][], landColor: string) {
  ctx.save();
  ctx.fillStyle = landColor;
  // Only fill the largest N closed polylines (likely the main islands)
  const minLength = 30; // Tune as needed
  const sorted = [...coastEdges].sort((a, b) => b.length - a.length);
  for (const poly of sorted) {
    if (poly.length < minLength) continue;
    ctx.beginPath();
    poly.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHexOutline(ctx: CanvasRenderingContext2D, hex: Hex, radius: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = hex.x + radius * Math.cos(angle);
    const y = hex.y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawRivers(ctx: CanvasRenderingContext2D, riverPolylines: RiverPolyline[], debugMode: boolean) {
  for (const river of riverPolylines) {
    // Set river style based on order
    let strokeColor: string;
    let strokeWidth: number;
    
    switch (river.order) {
      case 1: // Main rivers
        strokeColor = debugMode ? '#0066cc' : RIVER_COLOR;
        strokeWidth = river.width * 2;
        break;
      case 2: // Secondary streams
        strokeColor = debugMode ? '#0099ff' : '#7ec7e6';
        strokeWidth = river.width * 1.5;
        break;
      case 3: // Tertiary streams
        strokeColor = debugMode ? '#66ccff' : '#b3e0f7';
        strokeWidth = river.width;
        break;
      default:
        strokeColor = RIVER_COLOR;
        strokeWidth = river.width;
    }
    
    // Draw hollow river channel
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (river.path.length > 1) {
      ctx.beginPath();
      ctx.moveTo(river.path[0].x, river.path[0].y);
      
      for (let i = 1; i < river.path.length; i++) {
        ctx.lineTo(river.path[i].x, river.path[i].y);
      }
      
      ctx.stroke();
      
      // Draw river banks (dual-edge effect)
      if (river.order === 1) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = strokeWidth * 0.3;
        ctx.stroke();
      }
    }
  }
}

function drawFlowAccumulation(ctx: CanvasRenderingContext2D, hexes: Hex[], flowAccum: number[], config: RenderConfig) {
  const maxFlow = Math.max(...flowAccum);
  
  for (let i = 0; i < hexes.length; i++) {
    const hex = hexes[i];
    const flow = flowAccum[i];
    const normalizedFlow = flow / maxFlow;
    
    if (normalizedFlow > 0.1) { // Only show significant flow
      ctx.fillStyle = `rgba(0, 255, 255, ${Math.min(0.8, normalizedFlow * 0.5)})`;
      ctx.fillRect(hex.x - 2, hex.y - 2, 4, 4);
    }
  }
} 