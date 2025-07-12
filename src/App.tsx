import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { createNoise2D } from 'simplex-noise';
import { generateWorld, WorldConfig } from './mainGenerator';
import { renderWorld } from './mainGenerator';
import { renderHexMap, RenderConfig } from './render';
import { generateHexMapSteps } from './worldGenerator';
import { collectBorderSegments } from './coastline';
import { hexesToCoastline } from './utils/coastlineSmoother';

const STEP_LABELS = [
  '1. Raw Elevation (Heightmap)',
  '2. Land/Water Classification',
  '3. After Speck Removal',
  '4. Coastline Refinement',
];

interface MapSettings {
  seed: number;
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  globalShapeWeight: number;
  localDetailWeight: number;
  landThreshold: number;
  zoom: number;
  enableCoastlineRefinement: boolean;
  enableRivers: boolean;
  riverDensity: number;
  debugOverlay: boolean;
  // New hex grid settings
  hexRadius: number;
  hexCols: number;
  hexRows: number;
  // New river settings
  minSourceElev: number;
  mainRiverAccum: number;
  tributaryAccum: number;
  secondaryStreamAccum: number;
  tertiaryStreamAccum: number;
  riverWidth: number;
  riverSmooth: number;
  // Debug visualization settings
  showHexOutlines: boolean;
  showElevationHeatmap: boolean;
  showLandWaterDebug: boolean;
  gradientExponent: number; // new
}

interface Biome {
  name: string;
  color: string;
  minHeight: number;
  maxHeight: number;
  minMoisture: number;
  maxMoisture: number;
}

const biomes: Biome[] = [
  { name: 'Deep Ocean', color: '#1e3a8a', minHeight: -1, maxHeight: -0.3, minMoisture: -1, maxMoisture: 1 },
  { name: 'Shallow Water', color: '#3b82f6', minHeight: -0.3, maxHeight: -0.1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Beach', color: '#fbbf24', minHeight: -0.1, maxHeight: 0, minMoisture: -1, maxMoisture: 1 },
  { name: 'Plains', color: '#84cc16', minHeight: 0, maxHeight: 0.3, minMoisture: -1, maxMoisture: 0.3 },
  { name: 'Forest', color: '#166534', minHeight: 0, maxHeight: 0.5, minMoisture: 0.3, maxMoisture: 1 },
  { name: 'Hills', color: '#a3a3a3', minHeight: 0.3, maxHeight: 0.6, minMoisture: -1, maxMoisture: 1 },
  { name: 'Mountains', color: '#6b7280', minHeight: 0.6, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
  { name: 'Snow Peaks', color: '#ffffff', minHeight: 0.8, maxHeight: 1, minMoisture: -1, maxMoisture: 1 },
];

function isLakeCell(x: number, y: number, lakes: [number, number][]) {
  for (const [lx, ly] of lakes) {
    if (Math.abs(lx - x) <= 2 && Math.abs(ly - y) <= 2) return true;
  }
  return false;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<MapSettings>({
    seed: Math.floor(Math.random() * 10000),
    width: 1024,
    height: 768,
    scale: 200,
    octaves: 5,
    persistence: 0.5,
    lacunarity: 2.0,
    globalShapeWeight: 1,
    localDetailWeight: 1,
    landThreshold: 0.5,
    zoom: 1,
    enableCoastlineRefinement: true,
    enableRivers: true,
    riverDensity: 0.3,
    debugOverlay: false,
    // Hex grid settings
    hexRadius: 10, // default to 10
    hexCols: 60,   // default to 60
    hexRows: 50,   // default to 50
    // River settings
    minSourceElev: 0.5,
    mainRiverAccum: 20,
    tributaryAccum: 5,
    secondaryStreamAccum: 15,
    tertiaryStreamAccum: 10,
    riverWidth: 2,
    riverSmooth: 2,
    // Debug visualization settings
    showHexOutlines: false,
    showElevationHeatmap: false,
    showLandWaterDebug: false,
    gradientExponent: 1.2,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [step, setStep] = useState(0); // 0: elevation, 1: land/water, 2: speck removal, 3: coastline
  const [svgCoastline, setSvgCoastline] = useState<string>('');

  // Create a seeded simplex noise instance for moisture
  const createSimplex = (seed: number) => {
    let s = seed;
    const seededRandom = () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
    return createNoise2D(seededRandom);
  };

  const simplexMoisture = React.useMemo(() => createSimplex(settings.seed + 2000), [settings.seed]);

  const generateMap = useCallback(() => {
    if (!canvasRef.current) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = settings.width;
    canvas.height = settings.height;

    // Use step-by-step generator
    const steps = generateHexMapSteps(settings.seed, {
      radius: settings.hexRadius,
      cols: settings.hexCols,
      rows: settings.hexRows,
      octaves: settings.octaves,
      persistence: settings.persistence,
      lacunarity: settings.lacunarity,
      noiseScale: settings.scale,
      noiseWeight: settings.localDetailWeight,
      shapeWeight: settings.globalShapeWeight,
      gradientExponent: settings.gradientExponent, // now from UI
      seaLevel: settings.landThreshold,
    });

    // Pick which hexes to render based on step
    let hexesToRender = steps.rawHexes;
    let renderMode: 'elevation' | 'landwater' | 'speck' | 'coast' = 'elevation';
    let coastEdges: { x: number, y: number }[][] = [];
    if (step === 1) {
      hexesToRender = steps.landWaterHexes;
      renderMode = 'landwater';
    } else if (step === 2) {
      hexesToRender = steps.speckHexes;
      renderMode = 'speck';
    } else if (step === 3) {
      hexesToRender = steps.refinedHexes;
      renderMode = 'coast';
      coastEdges = steps.coastEdges || [];
      // Generate SVG coastline path using alpha shape
      const svgPath = hexesToCoastline(hexesToRender, settings.landThreshold);
      setSvgCoastline(svgPath);
    } else {
      setSvgCoastline('');
    }

    // Render according to step
    const isCoastStep = renderMode === 'coast';
    const renderConfig: RenderConfig = {
      width: ctx.canvas.width,
      height: ctx.canvas.height,
      hexRadius: settings.hexRadius,
      showRivers: false,
      showFlowAccumulation: false,
      showCoastlines: isCoastStep,
      debugMode: true,
      coastEdges: coastEdges,
      // also show your land/water colors underneath the smoothed coast
      showLandWaterDebug: renderMode === 'landwater' || renderMode === 'speck' || renderMode === 'coast',
      showHexOutlines: false,
      showElevationHeatmap: renderMode === 'elevation',
    };
    renderHexMap(
      ctx,
      hexesToRender,
      [], // no rivers
      [], // no moisture
      [], // no flowAccum
      renderConfig,
      biomes
    );

    // Region border overlay (debug, coast step only)
    if (isCoastStep && settings.debugOverlay && steps.labeledHexes) {
      const borders = collectBorderSegments(steps.labeledHexes, settings.hexCols, settings.hexRows, settings.hexRadius);
      ctx.save();
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 2;
      for (const seg of borders) {
        ctx.beginPath();
        ctx.moveTo(seg.start.x, seg.start.y);
        ctx.lineTo(seg.end.x, seg.end.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    setIsGenerating(false);
  }, [settings, step]);

  // Apply zoom to the canvas

  // Apply zoom to the canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    // Apply zoom using CSS transform
    canvas.style.transform = `scale(${settings.zoom})`;
    canvas.style.transformOrigin = 'center center';
  }, [settings.zoom]);

  useEffect(() => {
    generateMap();
  }, [generateMap]);

  const handleRandomSeed = () => {
    setSettings(prev => ({ ...prev, seed: Math.floor(Math.random() * 10000) }));
  };

  const handlePresetContinental = () => {
    setSettings(prev => ({
      ...prev,
      scale: 150,
      landThreshold: 0.45, // Lower threshold for more land
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0,
      globalShapeWeight: 0.8, // Stronger global shape for continents
      localDetailWeight: 0.6,
    }));
  };

  const handlePresetIslands = () => {
    setSettings(prev => ({
      ...prev,
      scale: 250,
      landThreshold: 0.7, // Higher threshold for archipelago
      octaves: 6,
      persistence: 0.4,
      lacunarity: 2.5,
      globalShapeWeight: 0.4, // Weaker global shape for islands
      localDetailWeight: 0.9, // Strong local detail for varied coastlines
    }));
  };

  const handlePresetArchipelago = () => {
    setSettings(prev => ({
      ...prev,
      scale: 200,
      landThreshold: 0.5,
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0,
      globalShapeWeight: 1,
      localDetailWeight: 1,
    }));
  };

  const handlePresetDetailed = () => {
    setSettings(prev => ({
      ...prev,
      scale: 300,
      landThreshold: 0.4,
      octaves: 6,
      persistence: 0.7,
      lacunarity: 2.8,
      globalShapeWeight: 0.6,
      localDetailWeight: 1,
    }));
  };

  const handlePresetWetland = () => {
    setSettings(prev => ({
      ...prev,
      scale: 180,
      landThreshold: 0.3, // Lower threshold for wetland
      octaves: 4,
      persistence: 0.6,
      lacunarity: 1.8,
      globalShapeWeight: 0.7,
      localDetailWeight: 0.8,
    }));
  };

  const handleExport = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `fantasy-map-${settings.seed}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Fantasy World Generator</h1>
        <p>Generate procedural fantasy world maps inspired by Perilous Shores</p>
      </header>
      
      <div className="controls">
        <div className="control-group">
          <label>Seed: {settings.seed}</label>
          <button onClick={handleRandomSeed}>Random Seed</button>
        </div>
        
        {/* Debug Information Display */}
        {debugInfo && (
          <div className="debug-info" style={{ 
            background: '#f0f0f0', 
            padding: '10px', 
            margin: '10px 0', 
            borderRadius: '5px',
            fontSize: '12px'
          }}>
            <h4>Debug Info (Steps 1 & 2)</h4>
            <div>Total Hexes: {debugInfo.totalHexes}</div>
            <div>Land Hexes: {debugInfo.landHexes} ({((debugInfo.landHexes/debugInfo.totalHexes)*100).toFixed(1)}%)</div>
            <div>Water Hexes: {debugInfo.waterHexes} ({((debugInfo.waterHexes/debugInfo.totalHexes)*100).toFixed(1)}%)</div>
            <div>Elevation Range: {debugInfo.minElevation.toFixed(3)} to {debugInfo.maxElevation.toFixed(3)}</div>
            <div>Average Elevation: {debugInfo.avgElevation.toFixed(3)}</div>
            <div>Speck Removal: {debugInfo.speckRemoved} hexes</div>
            <div>Below Sea Level: {debugInfo.elevationStats.belowSeaLevel} ({((debugInfo.elevationStats.belowSeaLevel/debugInfo.totalHexes)*100).toFixed(1)}%)</div>
            <div>Above Sea Level: {debugInfo.elevationStats.aboveSeaLevel} ({((debugInfo.elevationStats.aboveSeaLevel/debugInfo.totalHexes)*100).toFixed(1)}%)</div>
          </div>
        )}

        {/* Debug Controls */}
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={settings.debugOverlay}
              onChange={(e) => setSettings(prev => ({ ...prev, debugOverlay: e.target.checked }))}
            />
            Enable Debug Mode
          </label>
        </div>

        {settings.debugOverlay && (
          <>
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.showHexOutlines}
                  onChange={(e) => setSettings(prev => ({ ...prev, showHexOutlines: e.target.checked }))}
                />
                Show Hex Outlines
              </label>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.showElevationHeatmap}
                  onChange={(e) => setSettings(prev => ({ ...prev, showElevationHeatmap: e.target.checked }))}
                />
                Show Elevation Heatmap
              </label>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.showLandWaterDebug}
                  onChange={(e) => setSettings(prev => ({ ...prev, showLandWaterDebug: e.target.checked }))}
                />
                Show Land/Water Classification
              </label>
            </div>
          </>
        )}

        <div className="control-group">
          <label title="Controls the overall size of terrain features. Lower values create larger features, higher values create smaller, more detailed features.">
            Scale: {settings.scale}
          </label>
          <input
            type="range"
            min="20"
            max="200"
            value={settings.scale}
            onChange={(e) => setSettings(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="Number of noise layers. 4-6 octaves provide good balance of broad shapes and fine detail without excessive computation.">
            Octaves: {settings.octaves}
          </label>
          <input
            type="range"
            min="1"
            max="8"
            value={settings.octaves}
            onChange={(e) => setSettings(prev => ({ ...prev, octaves: parseInt(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="How much each successive octave contributes. 0.5 means each octave is half as strong as the previous one.">
            Persistence: {settings.persistence}
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={settings.persistence}
            onChange={(e) => setSettings(prev => ({ ...prev, persistence: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="How much the frequency increases per octave. 2.0 doubles frequency each octave to add higher-frequency detail.">
            Lacunarity: {settings.lacunarity}
          </label>
          <input
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={settings.lacunarity}
            onChange={(e) => setSettings(prev => ({ ...prev, lacunarity: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="Weight of continental shapes vs local detail. Higher values create more uniform continent shapes.">
            Global Shape: {settings.globalShapeWeight}
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={settings.globalShapeWeight}
            onChange={(e) => setSettings(prev => ({ ...prev, globalShapeWeight: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="Weight of fine terrain detail vs global shape. Higher values create more varied coastlines and terrain.">
            Local Detail: {settings.localDetailWeight}
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={settings.localDetailWeight}
            onChange={(e) => setSettings(prev => ({ ...prev, localDetailWeight: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label title="Sea level cutoff that separates water from land. Lower values create more land, higher values create more water.">
            Land Threshold: {settings.landThreshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.landThreshold}
            onChange={(e) => setSettings(prev => ({ ...prev, landThreshold: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Zoom: {settings.zoom}x</label>
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={settings.zoom}
            onChange={(e) => setSettings(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Hex Radius: {settings.hexRadius}px</label>
          <input
            type="range"
            min="10"
            max="40"
            step="2"
            value={settings.hexRadius}
            onChange={(e) => setSettings(prev => ({ ...prev, hexRadius: parseInt(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Hex Columns: {settings.hexCols}</label>
          <input
            type="range"
            min="20"
            max="100"
            step="5"
            value={settings.hexCols}
            onChange={(e) => setSettings(prev => ({ ...prev, hexCols: parseInt(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Hex Rows: {settings.hexRows}</label>
          <input
            type="range"
            min="15"
            max="80"
            step="5"
            value={settings.hexRows}
            onChange={(e) => setSettings(prev => ({ ...prev, hexRows: parseInt(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={settings.enableCoastlineRefinement}
              onChange={(e) => setSettings(prev => ({ ...prev, enableCoastlineRefinement: e.target.checked }))}
            />
            Coastline Refinement
          </label>
        </div>
        
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={settings.enableRivers}
              onChange={(e) => setSettings(prev => ({ ...prev, enableRivers: e.target.checked }))}
            />
            Rivers
          </label>
        </div>
        
        {settings.enableRivers && (
          <>
            <div className="control-group">
              <label>River Density: {settings.riverDensity.toFixed(2)}</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={settings.riverDensity}
                onChange={(e) => setSettings(prev => ({ ...prev, riverDensity: parseFloat(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>Min Source Elevation: {settings.minSourceElev.toFixed(2)}</label>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={settings.minSourceElev}
                onChange={(e) => setSettings(prev => ({ ...prev, minSourceElev: parseFloat(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>Main River Accumulation: {settings.mainRiverAccum}</label>
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                value={settings.mainRiverAccum}
                onChange={(e) => setSettings(prev => ({ ...prev, mainRiverAccum: parseInt(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>Secondary Stream Accumulation: {settings.secondaryStreamAccum}</label>
              <input
                type="range"
                min="5"
                max="30"
                step="5"
                value={settings.secondaryStreamAccum}
                onChange={(e) => setSettings(prev => ({ ...prev, secondaryStreamAccum: parseInt(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>Tertiary Stream Accumulation: {settings.tertiaryStreamAccum}</label>
              <input
                type="range"
                min="3"
                max="20"
                step="2"
                value={settings.tertiaryStreamAccum}
                onChange={(e) => setSettings(prev => ({ ...prev, tertiaryStreamAccum: parseInt(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>River Width: {settings.riverWidth}</label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={settings.riverWidth}
                onChange={(e) => setSettings(prev => ({ ...prev, riverWidth: parseInt(e.target.value) }))}
              />
            </div>
            
            <div className="control-group">
              <label>River Smoothing: {settings.riverSmooth}</label>
              <input
                type="range"
                min="0"
                max="4"
                step="1"
                value={settings.riverSmooth}
                onChange={(e) => setSettings(prev => ({ ...prev, riverSmooth: parseInt(e.target.value) }))}
              />
            </div>
          </>
        )}

        <div className="control-group">
          <label title="Exponent for radial gradient. Higher = rounder continents, lower = more irregular.">
            Gradient Exponent: {settings.gradientExponent.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.01"
            value={settings.gradientExponent}
            onChange={e => setSettings(prev => ({ ...prev, gradientExponent: parseFloat(e.target.value) }))}
          />
        </div>

        <button onClick={handlePresetContinental}>Continental</button>
        <button onClick={handlePresetIslands}>Islands</button>
        <button onClick={handlePresetArchipelago}>Archipelago</button>
        <button onClick={handlePresetDetailed}>Detailed</button>
        <button onClick={handlePresetWetland}>Wetland</button>

        <button onClick={handleExport} disabled={isGenerating}>
          Export Map
        </button>

        <div className="control-group">
          <label>Step-by-step Debug:</label>
          <button onClick={() => setStep(s => (s + 1) % 4)} disabled={isGenerating}>
            Next Step
          </button>
          <span style={{ marginLeft: 10, fontWeight: 'bold' }}>{STEP_LABELS[step]}</span>
        </div>
      </div>
      
      <div className="map-container" style={{ position: 'relative', width: settings.width, height: settings.height }}>
        {isGenerating && <div className="loading">Generating map...</div>}
        <canvas
          ref={canvasRef}
          className="map-canvas"
          width={settings.width}
          height={settings.height}
        />
        {/* SVG coastline overlay for alpha shape, only on coast step */}
        {step === 3 && svgCoastline && (
          <svg
            width={settings.width}
            height={settings.height}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <path
              d={svgCoastline}
              fill="#d7cca1"
              stroke="#3d2914"
              strokeWidth={2}
              filter="url(#ink)"
            />
            {/* Optional: add SVG filter defs here or in your HTML */}
          </svg>
        )}
      </div>
      
      <div className="biome-legend">
        <h3>Biomes</h3>
        <div className="biome-list">
          {biomes.map((biome, index) => (
            <div key={index} className="biome-item">
              <div className="biome-color" style={{ backgroundColor: biome.color }}></div>
              <span>{biome.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
