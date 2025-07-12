// coastlineSmoother.ts
// Utility to convert land hexes to a smooth coastline SVG path using alpha shapes
// Requires: npm install delaunator
import Delaunator from 'delaunator';
import type { Hex } from '../worldGenerator';

export function hexesToCoastline(
  hexGrid: Hex[],
  landThreshold: number = 0.5
): string {
  // Step 1: Collect all land hex centers
  const landHexes = hexGrid.filter(h => h.elevation > landThreshold);
  const centers = landHexes.map(h => [h.x, h.y]);
  if (centers.length < 3) return '';

  // Step 2: Create concave hull using Delaunay + alpha shape
  const delaunay = Delaunator.from(centers);
  const points = centers.flat();
  const avgHexSize = estimateHexSize(hexGrid);
  const alpha = avgHexSize * 1.5;
  const alphaShape = getAlphaShape(points, delaunay, alpha);

  // Step 3: Smooth the polygon
  return smoothPath(alphaShape, 0.5);
}

function estimateHexSize(hexGrid: Hex[]): number {
  if (hexGrid.length < 2) return 30;
  // Estimate from first two hexes
  const [a, b] = hexGrid;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAlphaShape(
  points: number[],
  delaunay: any, // changed from Delaunator to any to fix TS2709
  alpha: number
): number[][] {
  const edges: Set<string> = new Set();
  const triangles = delaunay.triangles;
  for (let i = 0; i < triangles.length; i += 3) {
    const p0 = [points[2 * triangles[i]], points[2 * triangles[i] + 1]];
    const p1 = [points[2 * triangles[i + 1]], points[2 * triangles[i + 1] + 1]];
    const p2 = [points[2 * triangles[i + 2]], points[2 * triangles[i + 2] + 1]];
    const circumRadius = getCircumRadius(p0, p1, p2);
    if (circumRadius < alpha) {
      addEdge(edges, p0, p1);
      addEdge(edges, p1, p2);
      addEdge(edges, p2, p0);
    }
  }
  return edgesToPolygon(edges);
}

function getCircumRadius(a: number[], b: number[], c: number[]): number {
  // Heron's formula for triangle area
  const A = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const B = Math.hypot(b[0] - c[0], b[1] - c[1]);
  const C = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const s = (A + B + C) / 2;
  const area = Math.sqrt(Math.max(s * (s - A) * (s - B) * (s - C), 0.0001));
  return (A * B * C) / (4 * area);
}

function addEdge(edges: Set<string>, a: number[], b: number[]) {
  const key = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
    ? `${a[0]},${a[1]}|${b[0]},${b[1]}`
    : `${b[0]},${b[1]}|${a[0]},${a[1]}`;
  if (edges.has(key)) {
    edges.delete(key); // Remove if already present (internal edge)
  } else {
    edges.add(key);
  }
}

function edgesToPolygon(edges: Set<string>): number[][] {
  // Convert edge set to an ordered polygon (single loop)
  const edgeArr = Array.from(edges).map(e => e.split('|').map(p => p.split(',').map(Number)));
  if (edgeArr.length === 0) return [];
  const polygon: number[][] = [edgeArr[0][0]];
  let current = edgeArr[0][1];
  edgeArr.splice(0, 1);
  while (edgeArr.length > 0) {
    const idx = edgeArr.findIndex(e =>
      (e[0][0] === current[0] && e[0][1] === current[1]) ||
      (e[1][0] === current[0] && e[1][1] === current[1])
    );
    if (idx === -1) break;
    const nextEdge = edgeArr.splice(idx, 1)[0];
    const next = (nextEdge[0][0] === current[0] && nextEdge[0][1] === current[1])
      ? nextEdge[1] : nextEdge[0];
    polygon.push(next);
    current = next;
  }
  return polygon;
}

function smoothPath(points: number[][], tension: number = 0.5): string {
  if (points.length < 3) return '';
  const smoothed = chaikinSmooth(points, 3);
  return `M${smoothed[0][0]},${smoothed[0][1]} ` +
    smoothed.slice(1).map(p => `L${p[0]},${p[1]}`).join(' ') + 'Z';
}

function chaikinSmooth(points: number[][], iterations: number): number[][] {
  let result = [...points];
  for (let i = 0; i < iterations; i++) {
    const newPoints: number[][] = [];
    for (let j = 0; j < result.length; j++) {
      const current = result[j];
      const next = result[(j + 1) % result.length];
      const q = [
        0.75 * current[0] + 0.25 * next[0],
        0.75 * current[1] + 0.25 * next[1]
      ];
      const r = [
        0.25 * current[0] + 0.75 * next[0],
        0.25 * current[1] + 0.75 * next[1]
      ];
      newPoints.push(q, r);
    }
    result = newPoints;
  }
  return result;
} 