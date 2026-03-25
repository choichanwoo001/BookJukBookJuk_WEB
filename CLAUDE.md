# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build to dist/
npm run lint      # ESLint
npm run preview   # Preview production build

# Regenerate mapData.ts from the PGM floor plan
node scripts/processMap.mjs
```

No test suite is currently configured.

## Architecture

**BookJukBookJuk_WEB** is a 3D bookstore visualization built from a SLAM-generated floor plan. The app renders an interactive 3D map with first-person navigation and a chat panel.

### SLAM Map Pipeline

Raw floor plan data flows through:
```
b2floor_edited.pgm + b2floor_edited.yaml
        ↓ (scripts/processMap.mjs)
src/data/mapData.ts  ← auto-generated, do not hand-edit (~141KB)
        ↓ (src/data/floorPlan.ts)
wallRects, floorRects, wallPolylines  ← consumed by Map3DView
```

`processMap.mjs` parses the PGM binary image, classifies pixels as wall/floor/unknown, extracts connected components, and outputs typed TypeScript data. Re-run it whenever `b2floor_edited.pgm` changes.

`floorPlan.ts` post-processes the raw data: filters noise, removes tiny walls, and exports the spawn point (`SPAWN_POINT_WORLD`) computed from the floor centroid.

### 3D View (`src/components/Map3DView.tsx`)

Uses **React Three Fiber** (R3F) + **@react-three/drei**. Key design decisions:

- **Two camera modes** toggled by a button: `overview` (top-down orthographic-style perspective) and `firstPerson` (WASD + mouse-drag look).
- **Geometry is merged/instanced** for performance: walls use `BufferGeometryUtils.mergeGeometries`, floor/ceiling use `InstancedMesh`.
- Scene sub-components are defined inside the file: `WallPolylineInstances`, `FloorInstances`, `CeilingInstances`, `BookstoreLights`.
- Ceiling renders only in first-person mode.
- Color palette: walls `#F5F0E8`, floor `#B5885A`, ceiling `#FAF6F0`.

### Movement Hook (`src/hooks/useWorldMovement.ts`)

Handles WASD input inside R3F's `useFrame` loop. Instead of moving the camera, it **moves the entire world group** (inverted translation), which keeps Three.js camera math simple. Includes radius-based collision detection against `wallRects` and floor boundaries.

Key constants in `floorPlan.ts`:
- `FLOOR_HEIGHT_M = 3` — wall/ceiling height
- `WALL_THICKNESS_M = 0.16`
- `PLAYER_RADIUS_M = 0.24`
- `WALK_SPEED_MPS = 2.8` (in the hook)

### Layout

`App.tsx` renders a CSS Grid split: 7fr map pane + 3fr chat panel (stacks vertically on ≤1080px). Styles are in `src/styles/layout.css`. The chat panel (`ChatPanel.tsx`) is currently frontend-only with no backend connection.
