import { Hex } from './worldGenerator';

// Pointy-top axial directions
const directions = [
  [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]
];

// Helper: get hex index in flat array
function hexIndex(q: number, r: number, cols: number): number {
  return r * cols + q;
}

// Helper: Chaikin smoothing for polylines
function chaikinSmooth(points: { x: number, y: number }[], iterations: number): { x: number, y: number }[] {
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const newPts: { x: number, y: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      newPts.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      newPts.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    pts = newPts;
  }
  return pts;
}

export interface RiverPolyline {
  path: { x: number, y: number }[];
  width: number;
  order: number; // 1 = main, 2 = secondary, 3 = tertiary
}

export interface RiverResult {
  riverPolylines: RiverPolyline[];
  flowDirs: (number | null)[]; // index of downstream neighbor or null for sinks/sea
  flowAccum: number[];
}

export function generateRivers(
  hexes: Hex[],
  config: { 
    cols: number; 
    rows: number; 
    minSourceElev?: number; 
    mainRiverAccum?: number; 
    tributaryAccum?: number; 
    secondaryStreamAccum?: number;
    tertiaryStreamAccum?: number;
    riverWidth?: number; 
    smooth?: number 
  }
): RiverResult {
  const { 
    cols, 
    rows, 
    minSourceElev = 0.5, 
    mainRiverAccum = 20, 
    tributaryAccum = 5, 
    secondaryStreamAccum = 15,
    tertiaryStreamAccum = 10,
    riverWidth = 2, 
    smooth = 2 
  } = config;
  const N = hexes.length;
  // Step 1: Flow direction (steepest descent)
  const flowDirs: (number | null)[] = Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const hex = hexes[i];
    if (!hex.isLand) continue;
    let minElev = hex.elevation;
    let minIdx: number | null = null;
    for (const [dq, dr] of directions) {
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
        const ni = hexIndex(nq, nr, cols);
        const nhex = hexes[ni];
        if (nhex.elevation < minElev) {
          minElev = nhex.elevation;
          minIdx = ni;
        }
      }
    }
    flowDirs[i] = minIdx;
  }
  // Step 2: Flow accumulation
  const flowAccum: number[] = Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    if (hexes[i].isLand) flowAccum[i] = 1;
  }
  // Topological order: downstream first
  const order: number[] = [];
  const visited = new Set<number>();
  function visit(idx: number) {
    if (visited.has(idx)) return;
    visited.add(idx);
    const down = flowDirs[idx];
    if (down !== null) visit(down);
    order.push(idx);
  }
  for (let i = 0; i < N; i++) if (hexes[i].isLand) visit(i);
  for (const idx of order.reverse()) {
    const down = flowDirs[idx];
    if (down !== null) flowAccum[down] += flowAccum[idx];
  }
  // Step 3: Find primary sources (local maxima above minSourceElev and with enough accumulation)
  const primarySources: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!hexes[i].isLand) continue;
    if (hexes[i].elevation < minSourceElev) continue;
    let isMax = true;
    for (const [dq, dr] of directions) {
      const nq = hexes[i].q + dq;
      const nr = hexes[i].r + dr;
      if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
        const ni = hexIndex(nq, nr, cols);
        if (hexes[ni].elevation > hexes[i].elevation) isMax = false;
      }
    }
    if (isMax && flowAccum[i] >= tributaryAccum) primarySources.push(i);
  }
  // Step 4: Find secondary and tertiary stream sources based on flow accumulation
  const secondarySources: number[] = [];
  const tertiarySources: number[] = [];
  const usedHexes = new Set<number>();
  
  // Mark primary sources as used
  for (const src of primarySources) {
    usedHexes.add(src);
  }
  
  // Find secondary sources (high flow accumulation, not already used)
  for (let i = 0; i < N; i++) {
    if (!hexes[i].isLand || usedHexes.has(i)) continue;
    if (flowAccum[i] >= secondaryStreamAccum && flowAccum[i] < mainRiverAccum) {
      secondarySources.push(i);
      usedHexes.add(i);
    }
  }
  
  // Find tertiary sources (medium flow accumulation, not already used)
  for (let i = 0; i < N; i++) {
    if (!hexes[i].isLand || usedHexes.has(i)) continue;
    if (flowAccum[i] >= tertiaryStreamAccum && flowAccum[i] < secondaryStreamAccum) {
      tertiarySources.push(i);
      usedHexes.add(i);
    }
  }
  
  // Step 5: Trace river paths for all stream orders
  const riverPolylines: RiverPolyline[] = [];
  
  // Trace primary rivers
  for (const src of primarySources) {
    let idx: number | null = src;
    const path: { x: number, y: number }[] = [];
    let isMain = flowAccum[src] >= mainRiverAccum;
    while (idx !== null && hexes[idx].isLand) {
      path.push({ x: hexes[idx].x, y: hexes[idx].y });
      const nextIdx: number | null = flowDirs[idx];
      if (nextIdx !== null && path.length > cols + rows) break; // prevent infinite loops
      idx = nextIdx;
    }
    if (path.length > 4) {
      riverPolylines.push({ 
        path: chaikinSmooth(path, smooth), 
        width: isMain ? riverWidth : Math.max(1, riverWidth - 1),
        order: 1
      });
    }
  }
  
  // Trace secondary streams
  for (const src of secondarySources) {
    let idx: number | null = src;
    const path: { x: number, y: number }[] = [];
    while (idx !== null && hexes[idx].isLand) {
      path.push({ x: hexes[idx].x, y: hexes[idx].y });
      const nextIdx: number | null = flowDirs[idx];
      if (nextIdx !== null && path.length > cols + rows) break;
      idx = nextIdx;
    }
    if (path.length > 3) {
      riverPolylines.push({ 
        path: chaikinSmooth(path, smooth), 
        width: Math.max(1, riverWidth - 2),
        order: 2
      });
    }
  }
  
  // Trace tertiary streams
  for (const src of tertiarySources) {
    let idx: number | null = src;
    const path: { x: number, y: number }[] = [];
    while (idx !== null && hexes[idx].isLand) {
      path.push({ x: hexes[idx].x, y: hexes[idx].y });
      const nextIdx: number | null = flowDirs[idx];
      if (nextIdx !== null && path.length > cols + rows) break;
      idx = nextIdx;
    }
    if (path.length > 2) {
      riverPolylines.push({ 
        path: chaikinSmooth(path, smooth), 
        width: 1,
        order: 3
      });
    }
  }
  
  return { riverPolylines, flowDirs, flowAccum };
} 