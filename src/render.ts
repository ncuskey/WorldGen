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
  // Debug visualization options
  showHexOutlines?: boolean;
  showElevationHeatmap?: boolean;
  showLandWaterDebug?: boolean;
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
  { name: 'Deep Ocean', color: '#1e3a8a', minHeight: -1, maxHeight: -0.3, minMoisture: -1, maxMoisture: 1 },
  { name: 'Shallow Water', color: '#3b82f6', minHeight: -0.3, maxHeight: -0.1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Beach', color: '#fbbf24', minHeight: -0.1, maxHeight: 0, minMoisture: -1, maxMoisture: 1 },
  { name: 'Plains', color: '#84cc16', minHeight: 0, maxHeight: 0.3, minMoisture: -1, maxMoisture: 0.3 },
  { name: 'Forest', color: '#166534', minHeight: 0, maxHeight: 0.5, minMoisture: 0.3, maxMoisture: 1 },
  { name: 'Hills', color: '#a3a3a3', minHeight: 0.3, maxHeight: 0.6, minMoisture: -1, maxMoisture: 1 },
  { name: 'Mountains', color: '#6b7280', minHeight: 0.6, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Snow Peaks', color: '#ffffff', minHeight: 0.8, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
];

export function renderHexMap(
  ctx: CanvasRenderingContext2D,
  hexes: Hex[],
  riverPolylines: RiverPolyline[],
  moistureMap: number[],
  flowAccum: number[],
  config: RenderConfig,
  biomes: Biome[] = defaultBiomes,
  mode: 'elevation' | 'landwater' | 'biome' | 'hydrology' | 'coast' = 'biome'
) {
  const { width, height, showRivers, debugMode, coastEdges, showHexOutlines, showElevationHeatmap, showLandWaterDebug, hexRadius } = config;

  // Calculate map dimensions
  let cols = 0, rows = 0;
  if (hexes.length > 0) {
    cols = Math.max(...hexes.map(h => h.q)) + 1;
    rows = Math.max(...hexes.map(h => h.r)) + 1;
  }
  const mapW = cols * hexRadius * Math.sqrt(3);
  const mapH = rows * hexRadius * 1.5;
  const offsetX = (width - mapW) / 2;
  const offsetY = (height - mapH) / 2;

  // 1) Paint ocean background
  ctx.fillStyle = OCEAN_COLOR;
  ctx.fillRect(0, 0, width, height);

  // 2) Shift origin to center the map
  ctx.save();
  ctx.translate(offsetX, offsetY);

  // === Conditional rendering by mode ===
  if (mode === 'elevation') {
    drawElevationHeatmap(ctx, hexes, config);
    ctx.restore();
    return;
  }
  if (mode === 'landwater') {
    drawLandWaterDebug(ctx, hexes, config);
    ctx.restore();
    return;
  }

  if (mode === 'hydrology') {
    // 1) draw every hex exactly as in biome mode
    hexes.forEach((hex, i) => {
      const moisture = moistureMap[i];
      const biome = biomes.find(b =>
        hex.elevation >= b.minHeight &&
        hex.elevation <= b.maxHeight &&
        moisture >= b.minMoisture &&
        moisture <= b.maxMoisture
      );
      ctx.fillStyle = biome?.color ?? OCEAN_COLOR;
      drawHex(ctx, hex.x, hex.y, hexRadius);
    });

    // 2) stroke your coastEdges on top
    if (config.coastEdges) {
      ctx.save();
      ctx.strokeStyle = '#3d2914';
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      for (const loop of config.coastEdges) {
        if (loop.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(loop[0].x, loop[0].y);
        loop.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3) finally draw rivers
    if (showRivers) {
      drawRivers(ctx, riverPolylines, debugMode);
    }

    // we’re done
    ctx.restore();
    return;
  }

  if (mode === 'coast' && config.coastEdges && config.coastEdges.length) {
    ctx.save();
    // center the hex grid in the same way as App.tsx
    let cols = 0, rows = 0;
    if (hexes.length > 0) {
      cols = Math.max(...hexes.map(h => h.q)) + 1;
      rows = Math.max(...hexes.map(h => h.r)) + 1;
    }
    const mapW = cols * hexRadius * Math.sqrt(3);
    const mapH = rows * hexRadius * 1.5;
    const offsetX = (width - mapW) / 2;
    const offsetY = (height - mapH) / 2;
    ctx.translate(offsetX, offsetY);
    ctx.beginPath();
    for (const loop of config.coastEdges) {
      if (!loop.length) continue;
      ctx.moveTo(loop[0].x, loop[0].y);
      for (let i = 1; i < loop.length; i++) {
        ctx.lineTo(loop[i].x, loop[i].y);
      }
      ctx.closePath();
    }
    ctx.clip('evenodd');
    // draw only land hexes
    hexes.forEach((hex, i) => {
      if (hex.isLand) {
        const moisture = moistureMap[i] ?? hex.moisture;
        const biome = biomes.find(b =>
          hex.elevation >= b.minHeight &&
          hex.elevation <= b.maxHeight &&
          moisture >= b.minMoisture &&
          moisture <= b.maxMoisture
        );
        ctx.fillStyle = biome?.color ?? LAND_COLOR;
        drawHex(ctx, hex.x, hex.y, hexRadius);
      }
    });
    ctx.restore();
    return;
  }

  // Draw all land and water hexes (no mask)
  hexes.forEach((hex, i) => {
    if (hex.isLand) {
      const moisture = moistureMap[i] !== undefined ? moistureMap[i] : (hex.moisture !== undefined ? hex.moisture : 0.5);
      const biome = biomes.find(b =>
        hex.elevation >= b.minHeight &&
        hex.elevation <= b.maxHeight &&
        (moisture >= b.minMoisture && moisture <= b.maxMoisture)
      );
      ctx.fillStyle = biome ? biome.color : LAND_COLOR;
      drawHex(ctx, hex.x, hex.y, hexRadius);
    }
  });
  hexes.forEach((hex, i) => {
    if (!hex.isLand) {
      const waterBiome = biomes.find(b =>
        hex.elevation >= b.minHeight &&
        hex.elevation <= b.maxHeight &&
        (b.name.includes('Ocean') || b.name.includes('Water'))
      );
      ctx.fillStyle = waterBiome?.color || OCEAN_COLOR;
      drawHex(ctx, hex.x, hex.y, hexRadius);
    }
  });
  ctx.restore();

  // Draw rivers last, only in hydrology mode
}

// helper: signed area via shoelace formula
function polygonArea(pts: {x:number,y:number}[]) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return 0.5 * sum;
}

function fillCoastlinesWithHoles(
  ctx: CanvasRenderingContext2D,
  coastEdges: { x: number, y: number }[][],
  landColor: string
) {
  if (coastEdges.length === 0) return;
  ctx.save();
  ctx.fillStyle = landColor;
  ctx.beginPath();
  for (const loop of coastEdges) {
    if (loop.length === 0) continue;
    ctx.moveTo(loop[0].x, loop[0].y);
    for (let i = 1; i < loop.length; i++) {
      ctx.lineTo(loop[i].x, loop[i].y);
    }
    ctx.closePath();
  }
  ctx.fill('evenodd');
  ctx.restore();
}

function drawElevationHeatmap(
  ctx: CanvasRenderingContext2D,
  hexes: Hex[],
  config: RenderConfig
) {
  const { hexRadius } = config;
  
  // Find elevation range
  const elevations = hexes.map(h => h.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  
  hexes.forEach(hex => {
    // Normalize elevation to 0-1
    const normalizedElev = (hex.elevation - minElev) / (maxElev - minElev);
    
    // Create heatmap color (blue to green to red)
    let r, g, b;
    if (normalizedElev < 0.5) {
      // Blue to green
      const t = normalizedElev * 2;
      r = 0;
      g = Math.floor(t * 255);
      b = Math.floor((1 - t) * 255);
    } else {
      // Green to red
      const t = (normalizedElev - 0.5) * 2;
      r = Math.floor(t * 255);
      g = Math.floor((1 - t) * 255);
      b = 0;
    }
    
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    drawHex(ctx, hex.x, hex.y, hexRadius);
  });
}

function drawLandWaterDebug(
  ctx: CanvasRenderingContext2D,
  hexes: Hex[],
  config: RenderConfig
) {
  const { hexRadius } = config;
  
  hexes.forEach(hex => {
    if (hex.isLand) {
      ctx.fillStyle = '#90EE90'; // Light green for land
    } else {
      ctx.fillStyle = '#87CEEB'; // Light blue for water
    }
    drawHex(ctx, hex.x, hex.y, hexRadius);
  });
}

function drawHexOutlines(
  ctx: CanvasRenderingContext2D,
  hexes: Hex[],
  config: RenderConfig
) {
  const { hexRadius } = config;
  
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  
  hexes.forEach(hex => {
    drawHexOutline(ctx, hex.x, hex.y, hexRadius);
  });
}

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function drawHexOutline(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.stroke();
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

export { fillCoastlinesWithHoles, drawHex, drawRivers }; 