/**
 * Measurement-Based Auto-Grid Generator
 *
 * Generates walkable navigation nodes and edges from real-world store
 * measurements. 1 meter = 1 logical unit in the navigation engine.
 *
 * Layout strategy:
 * - Main corridor runs along z=0 (entrance side) and z=length (back wall)
 * - Aisles are evenly distributed across the store width
 * - Walking corridors run between aisle pairs
 * - Blocked (shelf) areas are skipped
 * - Entrance is placed at the center-bottom of the store
 */

// ── Types ──────────────────────────────────────────────────────

export interface GridConfig {
  lengthMeters: number;
  widthMeters: number;
  aisleCount: number;
  aisleWidth: number;
  corridorSpacing: number;
  cellSize: number; // default 1m
}

export interface GeneratedNode {
  x: number;
  z: number;
  type: 'normal' | 'entrance';
  label?: string;
}

export interface GeneratedEdge {
  fromIndex: number;
  toIndex: number;
}

export interface GeneratedGrid {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
}

// ── Default config ─────────────────────────────────────────────

export const DEFAULT_GRID_CONFIG: GridConfig = {
  lengthMeters: 20,
  widthMeters: 15,
  aisleCount: 4,
  aisleWidth: 1.2,
  corridorSpacing: 2.0,
  cellSize: 1.0,
};

// ── Grid Generator ─────────────────────────────────────────────

export function generateGrid(config: GridConfig): GeneratedGrid {
  const {
    lengthMeters,
    widthMeters,
    aisleCount,
    aisleWidth,
    corridorSpacing,
    cellSize,
  } = config;

  const nodes: GeneratedNode[] = [];
  const edges: GeneratedEdge[] = [];

  // Grid resolution
  const cols = Math.max(2, Math.floor(widthMeters / cellSize) + 1);
  const rows = Math.max(2, Math.floor(lengthMeters / cellSize) + 1);

  // Build a 2D grid of walkability
  // true = walkable, false = blocked (shelf/aisle interior)
  const walkable: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(true)
  );

  // Calculate aisle positions (evenly spaced)
  // Aisles are vertical blocks running from corridorSpacing to lengthMeters - corridorSpacing
  const aislePositions: { startCol: number; endCol: number }[] = [];

  if (aisleCount > 0) {
    const usableWidth = widthMeters;
    const spacing = usableWidth / (aisleCount + 1);

    for (let a = 0; a < aisleCount; a++) {
      const centerX = spacing * (a + 1);
      const halfWidth = aisleWidth / 2;
      const startCol = Math.floor((centerX - halfWidth) / cellSize);
      const endCol = Math.ceil((centerX + halfWidth) / cellSize);

      aislePositions.push({
        startCol: Math.max(0, startCol),
        endCol: Math.min(cols - 1, endCol),
      });

      // Mark aisle interior as blocked (not the top/bottom corridors)
      const corridorRows = Math.ceil(corridorSpacing / cellSize);
      for (let r = corridorRows; r < rows - corridorRows; r++) {
        for (let c = Math.max(0, startCol); c <= Math.min(cols - 1, endCol); c++) {
          walkable[r][c] = false;
        }
      }
    }
  }

  // Create node grid (only for walkable cells)
  const nodeGrid: (number | null)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );

  // Entrance position (center-bottom)
  const entranceCol = Math.floor(cols / 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!walkable[r][c]) continue;

      const x = c * cellSize;
      const z = r * cellSize;
      const isEntrance = r === 0 && c === entranceCol;

      const node: GeneratedNode = {
        x: parseFloat(x.toFixed(2)),
        z: parseFloat(z.toFixed(2)),
        type: isEntrance ? 'entrance' : 'normal',
      };

      if (isEntrance) {
        node.label = 'Entrance';
      }

      nodeGrid[r][c] = nodes.length;
      nodes.push(node);
    }
  }

  // Generate edges (4-directional: right, down, left, up)
  const directions = [
    [0, 1],   // right
    [1, 0],   // down
    [0, -1],  // left
    [-1, 0],  // up
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fromIdx = nodeGrid[r][c];
      if (fromIdx === null) continue;

      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const toIdx = nodeGrid[nr][nc];
        if (toIdx === null) continue;

        edges.push({ fromIndex: fromIdx, toIndex: toIdx });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Validates a GridConfig for reasonable values.
 */
export function validateGridConfig(config: GridConfig): string[] {
  const errors: string[] = [];

  if (config.lengthMeters < 2 || config.lengthMeters > 500) {
    errors.push('Length must be between 2 and 500 meters');
  }
  if (config.widthMeters < 2 || config.widthMeters > 500) {
    errors.push('Width must be between 2 and 500 meters');
  }
  if (config.aisleCount < 0 || config.aisleCount > 50) {
    errors.push('Aisle count must be between 0 and 50');
  }
  if (config.aisleWidth < 0.5 || config.aisleWidth > 5) {
    errors.push('Aisle width must be between 0.5 and 5 meters');
  }
  if (config.corridorSpacing < 1 || config.corridorSpacing > 10) {
    errors.push('Corridor spacing must be between 1 and 10 meters');
  }
  if (config.cellSize < 0.5 || config.cellSize > 5) {
    errors.push('Cell size must be between 0.5 and 5 meters');
  }

  // Check if aisles would be wider than the store
  const totalAisleWidth = config.aisleCount * config.aisleWidth;
  if (totalAisleWidth >= config.widthMeters * 0.8) {
    errors.push('Total aisle width exceeds 80% of store width');
  }

  return errors;
}
