
import { GRID_STEP } from '../types';

export function rotatePoint(x: number, y: number, rotation: number) {
  if (rotation === 0) return { x, y };
  if (rotation === 1) return { x: -y, y: x };
  if (rotation === 2) return { x: -x, y: -y };
  if (rotation === 3) return { x: y, y: -x };
  return { x, y };
}

export function distPointToSegment(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// JPS-like A* implementation for Manhattan grid
export function findSmartPath(
  start: {x:number, y:number}, 
  end: {x:number, y:number}, 
  obstacles: Set<string>,
  startDir?: {x:number, y:number},
  softObstacles?: Set<string>
) {
  const s = { x: Math.round(start.x / GRID_STEP) * GRID_STEP, y: Math.round(start.y / GRID_STEP) * GRID_STEP };
  const e = { x: Math.round(end.x / GRID_STEP) * GRID_STEP, y: Math.round(end.y / GRID_STEP) * GRID_STEP };

  const key = (x: number, y: number) => `${x},${y}`;
  
  // Directions: Right, Down, Left, Up
  const DIRS = [
    { x: GRID_STEP, y: 0 },
    { x: 0, y: GRID_STEP },
    { x: -GRID_STEP, y: 0 },
    { x: 0, y: -GRID_STEP }
  ];

  const isWalkable = (x: number, y: number) => {
    // Start and End are always walkable
    if (x === s.x && y === s.y) return true;
    if (x === e.x && y === e.y) return true;
    return !obstacles.has(key(x, y));
  };

  // Node structure
  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    parent?: Node;
    dir?: {x: number, y: number}; // Direction entering this node
  }

  const openList: Node[] = [];
  const closedSet = new Set<string>();
  const nodeMap = new Map<string, Node>(); // Keep track of best G found for specific coordinates

  // Initial node
  const startNode: Node = {
    x: s.x,
    y: s.y,
    g: 0,
    f: Math.abs(e.x - s.x) + Math.abs(e.y - s.y), // Manhattan heuristic
    dir: startDir
  };

  openList.push(startNode);
  nodeMap.set(key(s.x, s.y), startNode);

  let bestNode = startNode;
  const maxIter = 5000;
  let iter = 0;

  while (openList.length > 0 && iter++ < maxIter) {
    // Sort by F score (lowest first)
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    const cKey = key(current.x, current.y);

    if (current.x === e.x && current.y === e.y) {
      bestNode = current;
      break;
    }

    closedSet.add(cKey);

    // Keep track of closest node to target in case we fail
    const currentDist = Math.abs(e.x - current.x) + Math.abs(e.y - current.y);
    const bestDist = Math.abs(e.x - bestNode.x) + Math.abs(e.y - bestNode.y);
    if (currentDist < bestDist) bestNode = current;

    // Explore neighbors
    for (const dir of DIRS) {
      // Prevent immediate U-turns if we have a direction
      if (current.dir && current.dir.x === -dir.x && current.dir.y === -dir.y) continue;
      
      // If startDir is provided at the very beginning, prevent U-turn there too
      if (!current.parent && startDir && startDir.x === -dir.x && startDir.y === -dir.y) continue;

      const nx = current.x + dir.x;
      const ny = current.y + dir.y;

      if (!isWalkable(nx, ny)) continue;
      if (closedSet.has(key(nx, ny))) continue;

      // Cost Calculation
      let moveCost = GRID_STEP;
      
      // Bend Penalty - higher penalty for turns makes wires straighter and more "intelligent"
      if (current.dir && (current.dir.x !== dir.x || current.dir.y !== dir.y)) {
        moveCost += 20; 
      }

      // Proximity Penalty - penalize being near an obstacle to keep wires "afastados"
      let proximityPenalty = 0;
      
      // Check distance to start/end to avoid penalty near ports (allow straight connections)
      const distToStart = Math.abs(nx - s.x) + Math.abs(ny - s.y);
      const distToEnd = Math.abs(nx - e.x) + Math.abs(ny - e.y);
      const isNearPort = distToStart <= GRID_STEP * 3 || distToEnd <= GRID_STEP * 3;

      if (!isNearPort) {
          for (let dx = -GRID_STEP * 2; dx <= GRID_STEP * 2; dx += GRID_STEP) {
              for (let dy = -GRID_STEP * 2; dy <= GRID_STEP * 2; dy += GRID_STEP) {
                  if (dx === 0 && dy === 0) continue;
                  if (obstacles.has(key(nx + dx, ny + dy))) {
                      // Higher penalty for being closer
                      const dist = Math.max(Math.abs(dx), Math.abs(dy));
                      proximityPenalty += dist === GRID_STEP ? 30 : 10;
                  }
              }
          }
      }

      const g = current.g + moveCost + proximityPenalty;
      const h = Math.abs(e.x - nx) + Math.abs(e.y - ny);
      const f = g + h;

      const nKey = key(nx, ny);
      const existing = nodeMap.get(nKey);

      // Wire Avoidance Penalty
      let wirePenalty = 0;
      if (softObstacles && softObstacles.has(nKey)) {
          wirePenalty = 500; // Very high penalty to avoid overlapping other wires unless absolutely necessary
      }

      if (!existing || g + wirePenalty < existing.g) {
        const neighborNode: Node = {
          x: nx,
          y: ny,
          g: g + wirePenalty,
          f: g + wirePenalty + h,
          parent: current,
          dir: dir
        };
        nodeMap.set(nKey, neighborNode);
        
        // Use binary heap push logic in a real app, strict push here
        if (!existing) {
          openList.push(neighborNode);
        } else {
            // If it existed but we found a better path, we need to ensure it's in openList with updated values
            // Ideally we update the existing object reference in openList, but since we created a new object:
            const idx = openList.indexOf(existing);
            if (idx !== -1) openList[idx] = neighborNode;
            else openList.push(neighborNode);
        }
      }
    }
  }

  // Path reconstruction
  const path: {x:number, y:number}[] = [];
  let curr: Node | undefined = bestNode;
  
  // Safety check: if we didn't reach end, make a straight line attempt from best to end or just return partial
  if (iter >= maxIter && (bestNode.x !== e.x || bestNode.y !== e.y)) {
     return [s, {x: s.x, y: e.y}, e]; // Fallback L-shape
  }

  while (curr) {
    path.unshift({x: curr.x, y: curr.y});
    curr = curr.parent;
  }
  
  // Post-processing: Simplify path (JPS-like behavior)
  // Remove collinear intermediate points to make the wire look like straight segments
  if (path.length > 2) {
      const simplified = [path[0]];
      let lastDir = { x: path[1].x - path[0].x, y: path[1].y - path[0].y };
      
      for (let i = 1; i < path.length - 1; i++) {
          const nextDir = { x: path[i+1].x - path[i].x, y: path[i+1].y - path[i].y };
          // If direction changes, keep the corner point
          if (nextDir.x !== lastDir.x || nextDir.y !== lastDir.y) {
              simplified.push(path[i]);
              lastDir = nextDir;
          }
      }
      simplified.push(path[path.length - 1]);
      return simplified;
  }

  return path;
}
