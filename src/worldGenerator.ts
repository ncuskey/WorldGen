import { createNoise2D } from 'simplex-noise';

export interface Hex {
  q: number; // axial q
  r: number; // axial r
  x: number; // pixel center x
  y: number; // pixel center y
  elevation: number;
  isLand: boolean;
}

export interface HexMapConfig {
  radius: number; // hex radius in px
  cols: number;
  rows: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  gradientExponent: number;
  seaLevel: number;
}

export function generateHexMap(seed: number, config: HexMapConfig) {
  const { radius, cols, rows, octaves, persistence, lacunarity, gradientExponent, seaLevel } = config;
  const hexes: Hex[] = [];
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

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      // Pointy-top hex axial to pixel
      const x = radius * Math.sqrt(3) * (q + 0.5 * (r & 1));
      const y = radius * 1.5 * r;

      // Fractal noise sampling
      let amplitude = 1;
      let frequency = 1;
      let noiseHeight = 0;
      let maxValue = 0;
      for (let o = 0; o < octaves; o++) {
        const sampleX = (x / (radius * cols)) * frequency;
        const sampleY = (y / (radius * rows)) * frequency;
        const n = noise(sampleX, sampleY) * 0.5 + 0.5;
        noiseHeight += n * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      noiseHeight /= maxValue;

      // Radial gradient fall-off
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gradient = Math.pow(1 - dist / maxDist, gradientExponent);

      // Combine noise and gradient
      const elevation = noiseHeight * 0.7 + gradient * 0.3;
      const isLand = elevation > seaLevel;

      hexes.push({ q, r, x, y, elevation, isLand });
    }
  }

  // Speck removal: any land hex with fewer than two adjacent land neighbors is reclassified as water
  const hexIndex = (q: number, r: number) => r * cols + q;
  const directions = [
    [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1] // pointy-top axial neighbors
  ];
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
    }
  }

  return { hexes, seed, config };
} 