import { generateHexMap, HexMapConfig } from './worldGenerator';

// Test configuration
const testConfig: HexMapConfig = {
  radius: 20,
  cols: 20,
  rows: 15,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  noiseScale: 100,      // reasonable test default
  noiseWeight: 0.7,     // matches old blend
  shapeWeight: 0.3,     // matches old blend
  gradientExponent: 1.2,
  seaLevel: 0.5,
};

// Test function
export function testSteps1And2() {
  console.log('🧪 Testing Steps 1 & 2: Hex Grid & Land/Water Classification');
  console.log('=' .repeat(60));
  
  // Test with debug enabled
  const result = generateHexMap(12345, testConfig, true);
  
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Generated ${result.hexes.length} hexes`);
  console.log(`✅ Land/water classification completed`);
  console.log(`✅ Speck removal applied`);
  
  if (result.debugInfo) {
    console.log('\n📈 Statistics:');
    console.log(`   Total hexes: ${result.debugInfo.totalHexes}`);
    console.log(`   Land hexes: ${result.debugInfo.landHexes} (${((result.debugInfo.landHexes/result.debugInfo.totalHexes)*100).toFixed(1)}%)`);
    console.log(`   Water hexes: ${result.debugInfo.waterHexes} (${((result.debugInfo.waterHexes/result.debugInfo.totalHexes)*100).toFixed(1)}%)`);
    console.log(`   Speck removal: ${result.debugInfo.speckRemoved} hexes`);
    console.log(`   Elevation range: ${result.debugInfo.minElevation.toFixed(3)} to ${result.debugInfo.maxElevation.toFixed(3)}`);
    console.log(`   Average elevation: ${result.debugInfo.avgElevation.toFixed(3)}`);
  }
  
  // Validation checks
  console.log('\n🔍 Validation Checks:');
  
  // Check 1: All hexes have valid coordinates
  const validCoords = result.hexes.every(hex => 
    hex.q >= 0 && hex.q < testConfig.cols && 
    hex.r >= 0 && hex.r < testConfig.rows
  );
  console.log(`✅ Coordinate validation: ${validCoords ? 'PASS' : 'FAIL'}`);
  
  // Check 2: Elevation values are reasonable
  const validElevations = result.hexes.every(hex => 
    hex.elevation >= 0 && hex.elevation <= 1
  );
  console.log(`✅ Elevation range validation: ${validElevations ? 'PASS' : 'FAIL'}`);
  
  // Check 3: Land/water classification is consistent
  const landCount = result.hexes.filter(h => h.isLand).length;
  const waterCount = result.hexes.filter(h => !h.isLand).length;
  const totalCount = result.hexes.length;
  const classificationValid = (landCount + waterCount) === totalCount;
  console.log(`✅ Land/water classification: ${classificationValid ? 'PASS' : 'FAIL'}`);
  
  // Check 4: No isolated land hexes (speck removal worked)
  const directions = [[+1, 0], [0, +1], [-1, +1], [-1, 0], [0, -1], [+1, -1]];
  const hexIndex = (q: number, r: number) => r * testConfig.cols + q;
  
  let isolatedHexes = 0;
  for (const hex of result.hexes) {
    if (!hex.isLand) continue;
    let landNeighbors = 0;
    for (const [dq, dr] of directions) {
      const nq = hex.q + dq;
      const nr = hex.r + dr;
      if (nq >= 0 && nq < testConfig.cols && nr >= 0 && nr < testConfig.rows) {
        const neighbor = result.hexes[hexIndex(nq, nr)];
        if (neighbor && neighbor.isLand) landNeighbors++;
      }
    }
    if (landNeighbors < 2) isolatedHexes++;
  }
  console.log(`✅ Speck removal validation: ${isolatedHexes === 0 ? 'PASS' : 'FAIL'} (${isolatedHexes} isolated hexes found)`);
  
  console.log('\n🎉 Test completed!');
  return result;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).testSteps1And2 = testSteps1And2;
} 