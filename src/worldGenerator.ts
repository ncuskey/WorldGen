import { createNoise2D } from 'simplex-noise';
import { refineCoast } from './coastline';
import { chaikinSmooth } from './coastline';
import { traceHexCoastline } from './coastline';

export interface Hex {
  q: number; // axial q
  r: number; // axial r
  x: number; // pixel center x
  y: number; // pixel center y
  elevation: number;
  isLand: boolean;
  region?: number; // optional region ID for region borders
}

export interface HexMapConfig {
  radius: number; // hex radius in px
  cols: number;
  rows: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  noiseScale: number;      // new
  noiseWeight: number;     // new
  shapeWeight: number;     // new
  gradientExponent: number;
  seaLevel: number;
}

export interface HexMapDebugInfo {
  totalHexes: number;
  landHexes: number;
  waterHexes: number;
  minElevation: number;
  maxElevation: number;
  avgElevation: number;
  speckRemoved: number;
  elevationStats: {
    belowSeaLevel: number;
    atSeaLevel: number;
    aboveSeaLevel: number;
  };
}

// New: Step-by-step generator for visual debugging
export function generateHexMapSteps(seed: number, config: HexMapConfig, debug: boolean = false) {
  const { radius, cols, rows, octaves, persistence, lacunarity, noiseScale, noiseWeight, shapeWeight, gradientExponent, seaLevel } = config;
  const noise = createNoise2D(() => {
    seed = Math.sin(seed) * 10000;
    return seed - Math.floor(seed);
  });

  // Calculate map center for gradient
  const mapWidth = cols * radius * Math.sqrt(3);
  const mapHeight = rows * radius * 1.5;
  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  // Step 1: Raw elevation (no land/water yet)
  const rawHexes: Hex[] = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x = radius * Math.sqrt(3) * (q + 0.5 * (r & 1));
      const y = radius * 1.5 * r;
      let amplitude = 1, frequency = 1, noiseSum = 0, maxAmp = 0;
      for (let o = 0; o < octaves; o++) {
        const sampleX = (x / noiseScale) * frequency;
        const sampleY = (y / noiseScale) * frequency;
        const n = noise(sampleX, sampleY) * 0.5 + 0.5;
        noiseSum += n * amplitude;
        maxAmp += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      const noiseHeight = noiseSum / maxAmp;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gradient = Math.pow(1 - dist / maxDist, gradientExponent);
      // Blend using user weights _and normalize_ so elevation stays in [0…1]
      const weightedSum = noiseHeight * noiseWeight + gradient * shapeWeight;
      const elevation = weightedSum / (noiseWeight + shapeWeight);
      rawHexes.push({ q, r, x, y, elevation, isLand: false });
    }
  }

  // Step 2: Land/water classification
  const landWaterHexes: Hex[] = rawHexes.map(h => ({ ...h, isLand: h.elevation > seaLevel }));

  // Step 3: Speck removal
  const speckHexes: Hex[] = landWaterHexes.map(h => ({ ...h }));
  const hexIndex = (q: number, r: number) => r * cols + q;
  const directions = [
    [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]
  ];
  for (let i = 0; i < speckHexes.length; i++) {
    const hex = speckHexes[i];
    if (!hex.isLand) continue;
    let landNeighbors = 0;
    for (const [dq, dr] of directions) {
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
        const neighbor = speckHexes[hexIndex(nq, nr)];
        if (neighbor && neighbor.isLand) landNeighbors++;
      }
    }
    if (landNeighbors < 2) {
      hex.isLand = false;
    }
  }

  // Step 3.5: Label contiguous land regions
  labelLandRegions(speckHexes, cols, rows);

  // Log number of land hexes after speck removal
  console.log('Land hexes after speck removal:', speckHexes.filter(h => h.isLand).length);

  // === Step 4: Coastline refinement using refineCoast for debug
  const { coastEdges, hexes: refinedHexes } = refineCoast(speckHexes, { cols, rows, radius, erosionPasses: 0, dilationPasses: 0 });
  // Log number of land hexes after refineCoast
  console.log('Land hexes after refineCoast:', refinedHexes.filter(h => h.isLand).length);

  // Helper to compute polygon area
  const polygonArea = (pts: { x: number, y: number }[]) =>
    pts.reduce((sum, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0) * 0.5;

  // Sort loops by absolute area, descending
  const loops = coastEdges.slice().sort((A, B) =>
    Math.abs(polygonArea(B)) - Math.abs(polygonArea(A))
  );

  // Pick the largest one (or empty if nothing)
  const mainLoop = loops.length > 0 ? loops[0] : [];

  // Debug logs
  console.log('coastEdges count:', coastEdges.length);
  console.log('coastEdges lengths:', coastEdges.map(l => l.length));
  console.log('coastEdges areas:', coastEdges.map(l => Math.abs(polygonArea(l))));
  console.log('mainCoastLoop length:', mainLoop.length);
  console.log('mainCoastLoop points:', mainLoop.slice(0, 5));

  return {
    rawHexes,
    landWaterHexes,
    speckHexes,
    refinedHexes,   // your hex data already updated to the smoothed coast mask
    coastEdges: loops,  // _all_ loops (if you really need them)
    mainCoastLoop: mainLoop, // the single outer coastline
    labeledHexes: speckHexes, // for region borders if needed
    config,
    seed
  };
}

// Label contiguous land regions with unique region IDs
function labelLandRegions(hexes: Hex[], cols: number, rows: number): void {
  let regionId = 1;
  const hexIndex = (q: number, r: number) => r * cols + q;
  const visited = new Set<number>();
  const directions = [
    [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]
  ];
  for (let i = 0; i < hexes.length; i++) {
    const hex = hexes[i];
    if (!hex.isLand || visited.has(i)) continue;
    // BFS to label all connected land hexes
    const queue = [i];
    while (queue.length > 0) {
      const idx = queue.pop()!;
      if (visited.has(idx)) continue;
      visited.add(idx);
      hexes[idx].region = regionId;
      const h = hexes[idx];
      for (const [dq, dr] of directions) {
        const nq = h.q + dq;
        const nr = h.r + dr;
        if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
          const nidx = hexIndex(nq, nr);
          if (!visited.has(nidx) && hexes[nidx].isLand) {
            queue.push(nidx);
          }
        }
      }
    }
    regionId++;
  }
}

export function generateHexMap(seed: number, config: HexMapConfig, debug: boolean = false): { hexes: Hex[]; seed: number; config: HexMapConfig; debugInfo?: HexMapDebugInfo } {
  const { radius, cols, rows, octaves, persistence, lacunarity, noiseScale, noiseWeight, shapeWeight, gradientExponent, seaLevel } = config;
  const hexes: Hex[] = [];
  const noise = createNoise2D(() => {
    seed = Math.sin(seed) * 10000;
    return seed - Math.floor(seed);
  });

  if (debug) {
    console.log('=== STEP 1: HEX GRID & HEIGHTMAP GENERATION ===');
    console.log(`Config: ${cols}x${rows} hexes, radius=${radius}px, seaLevel=${seaLevel}`);
    console.log(`Noise: ${octaves} octaves, persistence=${persistence}, lacunarity=${lacunarity}`);
    console.log(`Gradient: exponent=${gradientExponent}`);
  }

  // Calculate map center for gradient
  const mapWidth = cols * radius * Math.sqrt(3);
  const mapHeight = rows * radius * 1.5;
  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  if (debug) {
    console.log(`Map dimensions: ${mapWidth.toFixed(1)}x${mapHeight.toFixed(1)}px`);
    console.log(`Map center: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
    console.log(`Max distance from center: ${maxDist.toFixed(1)}px`);
  }

  let minElev = Infinity;
  let maxElev = -Infinity;
  let totalElev = 0;
  let belowSeaLevel = 0;
  let atSeaLevel = 0;
  let aboveSeaLevel = 0;

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      // Pointy-top hex axial to pixel
      const x = radius * Math.sqrt(3) * (q + 0.5 * (r & 1));
      const y = radius * 1.5 * r;

      // Fractal noise sampling with user scale
      let amplitude = 1;
      let frequency = 1;
      let noiseSum = 0;
      let maxAmp = 0;
      for (let o = 0; o < octaves; o++) {
        const sampleX = (x / noiseScale) * frequency;
        const sampleY = (y / noiseScale) * frequency;
        const n = noise(sampleX, sampleY) * 0.5 + 0.5;
        noiseSum += n * amplitude;
        maxAmp += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      const noiseHeight = noiseSum / maxAmp;

      // Radial gradient fall-off
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gradient = Math.pow(1 - dist / maxDist, gradientExponent);

      // Blend using user weights _and normalize_ so elevation stays in [0…1]
      const sum = noiseHeight * noiseWeight + gradient * shapeWeight;
      const elevation = sum / (noiseWeight + shapeWeight);

      // Track elevation statistics
      minElev = Math.min(minElev, elevation);
      maxElev = Math.max(maxElev, elevation);
      totalElev += elevation;
      
      if (elevation < seaLevel) belowSeaLevel++;
      else if (Math.abs(elevation - seaLevel) < 0.001) atSeaLevel++;
      else aboveSeaLevel++;

      hexes.push({ q, r, x, y, elevation, isLand: elevation > seaLevel });
    }
  }

  const avgElev = totalElev / hexes.length;
  const initialLandHexes = hexes.filter(h => h.isLand).length;

  if (debug) {
    console.log('\n--- Elevation Statistics ---');
    console.log(`Elevation range: ${minElev.toFixed(3)} to ${maxElev.toFixed(3)}`);
    console.log(`Average elevation: ${avgElev.toFixed(3)}`);
    console.log(`Below sea level: ${belowSeaLevel} hexes (${(belowSeaLevel/hexes.length*100).toFixed(1)}%)`);
    console.log(`At sea level: ${atSeaLevel} hexes (${(atSeaLevel/hexes.length*100).toFixed(1)}%)`);
    console.log(`Above sea level: ${aboveSeaLevel} hexes (${(aboveSeaLevel/hexes.length*100).toFixed(1)}%)`);
    console.log(`Initial land hexes: ${initialLandHexes} (${(initialLandHexes/hexes.length*100).toFixed(1)}%)`);
  }

  // Speck removal: any land hex with fewer than two adjacent land neighbors is reclassified as water
  if (debug) {
    console.log('\n=== STEP 2: SPECK REMOVAL ===');
  }

  const hexIndex = (q: number, r: number) => r * cols + q;
  const directions = [
    [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1] // pointy-top axial neighbors
  ];
  
  let speckRemoved = 0;
  for (let i = 0; i < hexes.length; i++) {
    const hex = hexes[i];
    if (!hex.isLand) continue;
    let landNeighbors = 0;
    for (const [dq, dr] of directions) {
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
        const neighbor = hexes[hexIndex(nq, nr)];
        if (neighbor && neighbor.isLand) landNeighbors++;
      }
    }
    if (landNeighbors < 2) {
      hex.isLand = false;
      speckRemoved++;
    }
  }

  const finalLandHexes = hexes.filter(h => h.isLand).length;

  if (debug) {
    console.log(`Speck removal: ${speckRemoved} isolated land hexes reclassified as water`);
    console.log(`Final land hexes: ${finalLandHexes} (${(finalLandHexes/hexes.length*100).toFixed(1)}%)`);
    console.log(`Land reduction: ${initialLandHexes - finalLandHexes} hexes (${((initialLandHexes - finalLandHexes)/initialLandHexes*100).toFixed(1)}% reduction)`);
    console.log('=== END STEPS 1 & 2 ===\n');
  }

  const debugInfo: HexMapDebugInfo = {
    totalHexes: hexes.length,
    landHexes: finalLandHexes,
    waterHexes: hexes.length - finalLandHexes,
    minElevation: minElev,
    maxElevation: maxElev,
    avgElevation: avgElev,
    speckRemoved: speckRemoved,
    elevationStats: {
      belowSeaLevel,
      atSeaLevel,
      aboveSeaLevel
    }
  };

  return { hexes, seed, config, debugInfo };
} 