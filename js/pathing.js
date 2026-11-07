// Grid-based navigation for the dollhouse floor.
export const CELL = 0.5;
export const BOUNDS = { minX: -5.5, maxX: 5.5, minZ: -4.5, maxZ: 4.5 };

export function rotPoint(x, z, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export class NavGrid {
  constructor(bounds = BOUNDS) {
    this.b = bounds;
    this.cols = Math.round((bounds.maxX - bounds.minX) / CELL);
    this.rows = Math.round((bounds.maxZ - bounds.minZ) / CELL);
    this.blocked = new Set();
  }

  key(i, j) { return i + ',' + j; }

  inBounds(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }

  cellCenter(i, j) {
    return { x: this.b.minX + (i + 0.5) * CELL, z: this.b.minZ + (j + 0.5) * CELL };
  }

  worldToCell(x, z) {
    return {
      i: Math.floor((x - this.b.minX) / CELL),
      j: Math.floor((z - this.b.minZ) / CELL),
    };
  }

  isFree(i, j) {
    return this.inBounds(i, j) && !this.blocked.has(this.key(i, j));
  }

  isFreeWorld(x, z) {
    const { i, j } = this.worldToCell(x, z);
    return this.isFree(i, j);
  }

  rebuild(objects) {
    this.blocked.clear();
    for (const obj of objects) {
      if (obj.def.walkable) continue;
      this.blockRect(obj.x, obj.z, obj.def.size[0], obj.def.size[1], obj.rot);
    }
  }

  blockRect(cx, cz, w, d, rotDeg = 0) {
    const r = (rotDeg * Math.PI) / 180;
    const swap = Math.abs(Math.sin(r)) > 0.5;
    const ew = (swap ? d : w) / 2 + 0.04;
    const ed = (swap ? w : d) / 2 + 0.04;
    const minI = this.worldToCell(cx - ew, cz - ed).i;
    const maxI = this.worldToCell(cx + ew, cz + ed).i;
    const minJ = this.worldToCell(cx - ew, cz - ed).j;
    const maxJ = this.worldToCell(cx + ew, cz + ed).j;
    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const c = this.cellCenter(i, j);
        if (Math.abs(c.x - cx) <= ew && Math.abs(c.z - cz) <= ed) this.blocked.add(this.key(i, j));
      }
    }
  }

  nearestFree(i, j, maxR = 8, fromWorld = null) {
    if (this.isFree(i, j)) return { i, j };
    let best = null, bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ni = i + di, nj = j + dj;
          if (!this.isFree(ni, nj)) continue;
          const c = this.cellCenter(ni, nj);
          let d = di * di + dj * dj;
          if (fromWorld) d += ((c.x - fromWorld.x) ** 2 + (c.z - fromWorld.z) ** 2) * 0.45;
          if (d < bestD) { bestD = d; best = { i: ni, j: nj }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  findPath(startWorld, goalWorld) {
    let start = this.worldToCell(startWorld.x, startWorld.z);
    let goal = this.worldToCell(goalWorld.x, goalWorld.z);
    start = this.nearestFree(start.i, start.j, 6, goalWorld);
    goal = this.nearestFree(goal.i, goal.j, 8, startWorld);
    if (!start || !goal) return null;
    if (start.i === goal.i && start.j === goal.j) {
      return [this.cellCenter(goal.i, goal.j)];
    }

    const open = [];
    const came = new Map();
    const gScore = new Map();
    const sk = this.key(start.i, start.j);
    gScore.set(sk, 0);
    open.push({ i: start.i, j: start.j, f: 0 });
    const gk = this.key(goal.i, goal.j);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];

    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
      const cur = open.splice(bi, 1)[0];
      const ck = this.key(cur.i, cur.j);
      if (ck === gk) {
        const pts = [];
        let kk = ck;
        while (kk) {
          const [i, j] = kk.split(',').map(Number);
          pts.unshift(this.cellCenter(i, j));
          kk = came.get(kk);
        }
        pts[0] = { x: startWorld.x, z: startWorld.z };
        return this.smooth(pts);
      }
      const cg = gScore.get(ck);
      for (const [di, dj, cost] of dirs) {
        const ni = cur.i + di, nj = cur.j + dj;
        if (!this.isFree(ni, nj)) continue;
        if (di && dj) {
          if (!this.isFree(cur.i + di, cur.j) || !this.isFree(cur.i, cur.j + dj)) continue;
        }
        const nk = this.key(ni, nj);
        const ng = cg + cost;
        if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
        gScore.set(nk, ng);
        came.set(nk, ck);
        const h = Math.hypot(ni - goal.i, nj - goal.j);
        open.push({ i: ni, j: nj, f: ng + h });
      }
    }
    return null;
  }

  lineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / 0.12);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (!this.isFreeWorld(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  smooth(points) {
    if (points.length < 3) return points;
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      for (; j > i + 1; j--) if (this.lineFree(points[i], points[j])) break;
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}

export function objectRect(obj) {
  const r = (obj.rot * Math.PI) / 180;
  const swap = Math.abs(Math.sin(r)) > 0.5;
  const w = swap ? obj.def.size[1] : obj.def.size[0];
  const d = swap ? obj.def.size[0] : obj.def.size[1];
  return { x: obj.x, z: obj.z, w, d };
}

export function rectsOverlap(a, b, pad = 0.05) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - pad &&
         Math.abs(a.z - b.z) < (a.d + b.d) / 2 - pad;
}
