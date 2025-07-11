# Fantasy World Generator

A procedural fantasy world map generator inspired by "Perilous Shores" by Watabou. Generate beautiful, unique fantasy world maps with customizable parameters and export them for your tabletop RPG campaigns, world-building projects, or creative endeavors.

## Features

- **Procedural Generation**: Uses noise algorithms to create unique, natural-looking terrain
- **Multiple Biomes**: Deep ocean, shallow water, beaches, plains, forests, hills, mountains, and snow peaks
- **Interactive Controls**: Adjust scale, octaves, persistence, and lacunarity to fine-tune your maps
- **Seed-based Generation**: Use specific seeds to recreate favorite maps or generate random ones
- **Export Functionality**: Save your generated maps as PNG files
- **Beautiful UI**: Modern, fantasy-themed interface with responsive design
- **Real-time Preview**: See changes instantly as you adjust parameters

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd worldgen
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view the generator in your browser.

## Usage

### Basic Controls

- **Seed**: The random seed used for generation. Click "Random Seed" to generate a new random world.
- **Scale**: Controls the overall size of terrain features. Lower values create larger features, higher values create smaller, more detailed features.
- **Octaves**: The number of noise layers used. 4-6 octaves provide good balance of broad shapes and fine detail without excessive computation.
- **Persistence**: How much each successive octave contributes. 0.5 means each octave is half as strong as the previous one.
- **Lacunarity**: How much the frequency increases per octave. 2.0 doubles frequency each octave to add higher-frequency detail.
- **Global Shape**: Weight of continental shapes vs noise. Higher values create more uniform continent shapes.
- **Local Detail**: Weight of the noise detail vs global shape. Higher values create more varied coastlines and terrain.
- **Land Threshold**: Sea level cutoff that separates water from land. Lower values create more land, higher values create more water.

### Generating Maps

1. Adjust the parameters to your liking (hover over labels for tooltips)
2. The map will automatically regenerate when you change any setting
3. Click "Export Map" to save your current map as a PNG file

### Tips for Great Maps

- **For large continents**: Use lower scale values (150-200) and lower land threshold (0.45-0.5)
- **For island chains**: Use higher scale values (250-300) and higher land threshold (0.6-0.7)
- **For varied terrain**: Use more octaves (5-6) and higher lacunarity (2.0-2.5)
- **For smooth terrain**: Use fewer octaves (3-4) and lower lacunarity (1.5-2.0)
- **Optimal settings**: Scale 200, Octaves 5, Persistence 0.5, Lacunarity 2.0, Global Shape 1, Local Detail 1, Land Threshold 0.5

### Preset World Types

The generator includes several preset configurations based on proven procedural generation practices:

- **Continental**: Large landmasses with varied terrain (Land Threshold 0.45)
- **Islands**: Scattered islands with detailed coastlines (Land Threshold 0.7)
- **Archipelago**: Balanced mix of land and water (default optimal settings)
- **Detailed**: High-detail terrain with complex coastlines
- **Wetland**: Low-lying areas with extensive water features (Land Threshold 0.3)

## Technical Details

### Technology Stack

- **React 19**: Modern React with hooks and functional components
- **TypeScript**: Type-safe development
- **Canvas API**: High-performance map rendering
- **Procedural Noise**: Custom noise algorithms for terrain generation

### Architecture

The generator uses a multi-layered approach:

1. **Height Map Generation**: Creates elevation data using multiple noise octaves
2. **Moisture Map Generation**: Creates moisture data that influences biome placement
3. **Biome Assignment**: Maps height and moisture values to specific biomes
4. **Visualization**: Renders the biome data to a canvas with appropriate colors

### Biome System

The current biome system includes:

- **Deep Ocean** (-1.0 to -0.3 height): Dark blue waters
- **Shallow Water** (-0.3 to -0.1 height): Light blue coastal waters
- **Beach** (-0.1 to 0.0 height): Sandy shores
- **Plains** (0.0 to 0.3 height, low moisture): Grasslands
- **Forest** (0.0 to 0.5 height, high moisture): Dense woodlands
- **Hills** (0.3 to 0.6 height): Rolling terrain
- **Mountains** (0.6 to 1.0 height): Rocky peaks
- **Snow Peaks** (0.8 to 1.0 height): Snow-capped mountains

## Future Enhancements

- [ ] Rivers and water systems
- [ ] Climate zones and temperature variation
- [ ] Settlement placement algorithms
- [ ] Road and path generation
- [ ] Different map styles (topographic, political, etc.)
- [ ] Custom biome definitions
- [ ] 3D terrain visualization
- [ ] Export to various formats (SVG, JSON, etc.)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- Inspired by "Perilous Shores" by Watabou
- Built with modern web technologies for accessibility and performance
- Designed for tabletop RPG enthusiasts and world-builders

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm test`

Launches the test runner in interactive watch mode.

### `npm run build`

Builds the app for production to the `build` folder.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time.
