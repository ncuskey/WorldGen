import { createNoise2D } from 'simplex-noise';
import { Hex } from './worldGenerator';

// Helper: axial neighbor directions for pointy-top hexes
const directions = [
  [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]
];

// Helper: get hex index in flat array
function hexIndex(q: number, r: number, cols: number): number {
  return r * cols + q;
}

// Helper: Chaikin smoothing for polylines
export function chaikinSmooth(points: { x: number, y: number }[], passes: number = 2): { x: number, y: number }[] {
  let pts = points.slice();
  for (let pass = 0; pass < passes; pass++) {
    const newPts: { x: number, y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const Q = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      };
      const R = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      };
      newPts.push(Q, R);
    }
    pts = newPts;
  }
  return pts;
}

export function refineCoast(
  hexes: Hex[],
  config: { cols: number; rows: number; radius: number; erosionPasses?: number; dilationPasses?: number; coastNoiseSeed?: number }
): { hexes: Hex[]; coastEdges: { x: number, y: number }[][] } {
  const { cols, rows, radius, erosionPasses = 1, dilationPasses = 1, coastNoiseSeed = 12345 } = config;
  const noiseSeed = coastNoiseSeed;
  const noise = createNoise2D(() => {
    let s = noiseSeed;
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  });

  // Erosion: remove land with many water neighbors, modulated by coast noise
  for (let pass = 0; pass < erosionPasses; pass++) {
    const toWater: number[] = [];
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      if (!hex.isLand) continue;
      let waterNeighbors = 0;
      for (const [dq, dr] of directions) {
        const nq = hex.q + dq;
        const nr = hex.r + dr;
        if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
          const neighbor = hexes[hexIndex(nq, nr, cols)];
          if (neighbor && !neighbor.isLand) waterNeighbors++;
        }
      }
      // Coast noise modulates erosion threshold
      const n = noise(hex.x * 0.01, hex.y * 0.01) * 0.5 + 0.5;
      const erosionThreshold = 2 + n * 2; // 2-4 water neighbors
      if (waterNeighbors >= erosionThreshold) toWater.push(i);
    }
    for (const i of toWater) hexes[i].isLand = false;
  }

  // Dilation: add land to water cells with many land neighbors, modulated by coast noise
  for (let pass = 0; pass < dilationPasses; pass++) {
    const toLand: number[] = [];
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      if (hex.isLand) continue;
      let landNeighbors = 0;
      for (const [dq, dr] of directions) {
        const nq = hex.q + dq;
        const nr = hex.r + dr;
        if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
          const neighbor = hexes[hexIndex(nq, nr, cols)];
          if (neighbor && neighbor.isLand) landNeighbors++;
        }
      }
      // Coast noise modulates dilation threshold
      const n = noise(hex.x * 0.01, hex.y * 0.01) * 0.5 + 0.5;
      const dilationThreshold = 4 - n * 2; // 2-4 land neighbors
      if (landNeighbors >= dilationThreshold) toLand.push(i);
    }
    for (const i of toLand) hexes[i].isLand = true;
  }

  // Trace land-water boundaries
  const coastEdges: { x: number, y: number }[][] = [];
  const visited: boolean[][] = Array(rows).fill(null).map(() => Array(cols).fill(false));
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const i = hexIndex(q, r, cols);
      const hex = hexes[i];
      if (!hex.isLand) continue;
      for (const [dq, dr] of directions) {
        const nq = q + dq;
        const nr = r + dr;
        if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
          const neighbor = hexes[hexIndex(nq, nr, cols)];
          if (!neighbor.isLand && !visited[r][q]) {
            // Start tracing this edge
            const edge: { x: number, y: number }[] = [];
            let currQ = q, currR = r;
            for (let step = 0; step < 1000; step++) {
              if (visited[currR][currQ]) break;
              visited[currR][currQ] = true;
              edge.push({ x: hexes[hexIndex(currQ, currR, cols)].x, y: hexes[hexIndex(currQ, currR, cols)].y });
              // Find next land-water boundary neighbor
              let found = false;
              for (const [ndq, ndr] of directions) {
                const nnq = currQ + ndq;
                const nnr = currR + ndr;
                if (nnq >= 0 && nnq < cols && nnr >= 0 && nnr < rows) {
                  const nhex = hexes[hexIndex(nnq, nnr, cols)];
                  if (nhex.isLand && !visited[nnr][nnq]) {
                    currQ = nnq;
                    currR = nnr;
                    found = true;
                    break;
                  }
                }
              }
              if (!found) break;
            }
            if (edge.length > 2) coastEdges.push(chaikinSmooth(edge, 2));
          }
        }
      }
    }
  }

  // At the end of refineCoast, only return the single outermost coastline loop (by area)
  function signedArea(pts: { x: number, y: number }[]) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return sum * 0.5;
  }
  const outer = coastEdges.reduce((best, loop) => {
    return Math.abs(signedArea(loop)) > Math.abs(signedArea(best)) ? loop : best;
  }, coastEdges[0]);
  return {
    hexes,
    coastEdges: [ outer ] // only keep the outermost ring
  };
}

// Helper: Given a hex grid, trace all land-water edges and stitch into loops
export function traceHexCoastline(hexes: Hex[], cols: number, rows: number, radius: number): { x: number, y: number }[][] {
  // Pointy-top hex axial directions and their edge endpoints (relative to hex center)
  const directions = [
    [+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]
  ];
  // For each direction, the two endpoints of the edge (in local hex coordinates)
  const edgeOffsets = [
    [0.5, Math.sqrt(3)/2], [0, 1], [-0.5, Math.sqrt(3)/2],
    [-0.5, -Math.sqrt(3)/2], [0, -1], [0.5, -Math.sqrt(3)/2]
  ];

  // Helper: get hex index in flat array
  function hexIndex(q: number, r: number) { return r * cols + q; }
  function pointsEqual(a: {x:number,y:number}, b: {x:number,y:number}) {
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  }

  // 1. Collect all coastline segments
  const segments: { start: {x:number,y:number}, end: {x:number,y:number} }[] = [];
  for (let i = 0; i < hexes.length; i++) {
    const hex = hexes[i];
    if (!hex.isLand) continue;
    for (let d = 0; d < 6; d++) {
      const [dq, dr] = directions[d];
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      let neighbor: Hex | undefined = undefined;
      if (nq >= 0 && nq < cols && nr >= 0 && nr < rows) {
        neighbor = hexes[hexIndex(nq, nr)];
      }
      if (!neighbor || neighbor.isLand === false) {
        // This side is a coastline segment
        // Compute endpoints in pixel space
        const angle0 = Math.PI/3 * d;
        const angle1 = Math.PI/3 * (d+1);
        const x0 = hex.x + radius * Math.cos(angle0);
        const y0 = hex.y + radius * Math.sin(angle0);
        const x1 = hex.x + radius * Math.cos(angle1);
        const y1 = hex.y + radius * Math.sin(angle1);
        segments.push({ start: {x: x0, y: y0}, end: {x: x1, y: y1} });
      }
    }
  }

  // 2. Stitch segments into ordered loops
  const loops: { x: number, y: number }[][] = [];
  const segs = segments.slice();
  while (segs.length) {
    const { start, end } = segs.pop()!;
    const loop = [start, end];
    let cursor = end;
    while (!pointsEqual(cursor, start)) {
      const idx = segs.findIndex(s => pointsEqual(s.start, cursor));
      if (idx < 0) break;
      const seg = segs.splice(idx, 1)[0];
      loop.push(seg.end);
      cursor = seg.end;
    }
    if (loop.length > 2) loops.push(loop);
  }

  // 3. Smooth each loop
  return loops.map(loop => chaikinSmooth(loop, 2));
} 