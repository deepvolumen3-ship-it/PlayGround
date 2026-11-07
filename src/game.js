/* COMMANDOS: REALIST — Operation Nightfall
   A mobile-first isometric real-time stealth tactics game.
   Everything is procedural: terrain, soldiers, buildings, lighting, audio. */

const TAU = Math.PI * 2;
const ISO_X = 32;
const ISO_Y = 16;
const Z_SCALE = 30;
const MAP_W = 56;
const MAP_H = 56;

const T = { WATER: 0, SAND: 1, GRASS: 2, ROAD: 3, CONCRETE: 4, ROCK: 5, BUSH: 6, TREE: 7, FENCE: 8 };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angleDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const now = () => performance.now() / 1000;
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

function hash2(x, y, seed = 0) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function iso(x, y, z = 0) { return { x: (x - y) * ISO_X, y: (x + y) * ISO_Y - z * Z_SCALE }; }
function tileAt(world, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.WATER;
  return world.tiles[ty * MAP_W + tx];
}
function nearestWalkable(world, tx, ty) {
  tx = clamp(Math.floor(tx), 0, MAP_W - 1); ty = clamp(Math.floor(ty), 0, MAP_H - 1);
  if (world.walkable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && world.walkable(x, y)) return { x, y };
    }
  }
  return { x: tx, y: ty };
}

/* ============================ AUDIO ============================ */
class AudioSys {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.started = false; this.lastBoom = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this.makeAmbience();
    } catch (e) { this.ctx = null; }
  }
  makeAmbience() {
    const c = this.ctx;
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.985 + white * 0.015;
        d[i] = last * 1.8 + white * 0.05;
      }
    }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.055;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.wind = g;
    // rain hiss
    const len2 = c.sampleRate * 2;
    const buf2 = c.createBuffer(2, len2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf2.getChannelData(ch); for (let i = 0; i < len2; i++) d[i] = (Math.random() * 2 - 1) * 0.35; }
    const src2 = c.createBufferSource(); src2.buffer = buf2; src2.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g2 = c.createGain(); g2.gain.value = 0.012;
    src2.connect(hp).connect(g2).connect(this.master); src2.start();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.62, this.ctx.currentTime, 0.05);
  }
  env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  noise(dur) {
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * dur));
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
  }
  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { pan.pan.value = clamp(opts.pan || 0, -1, 1); pan.connect(this.master); }
    const out = pan || this.master;
    try {
      if (name === 'shot' || name === 'silenced' || name === 'rifle') {
        const loud = name === 'rifle' ? 0.26 : name === 'silenced' ? 0.045 : 0.16;
        const s = this.noise(name === 'rifle' ? 0.22 : 0.12);
        const f = c.createBiquadFilter(); f.type = name === 'silenced' ? 'highpass' : 'bandpass';
        f.frequency.value = name === 'rifle' ? 700 : name === 'silenced' ? 1900 : 1100; f.Q.value = 0.8;
        const g = c.createGain(); this.env(g, t, 0.002, name === 'rifle' ? 0.2 : 0.1, loud);
        s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.35);
        if (name !== 'silenced') {
          const o = c.createOscillator(), og = c.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(name === 'rifle' ? 110 : 150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
          this.env(og, t, 0.002, 0.12, name === 'rifle' ? 0.18 : 0.1);
          o.connect(og).connect(out); o.start(t); o.stop(t + 0.18);
        }
      } else if (name === 'knife') {
        const s = this.noise(0.12), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.12); f.Q.value = 1.2;
        const g = c.createGain(); this.env(g, t, 0.005, 0.1, 0.07);
        s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.2);
      } else if (name === 'explosion') {
        const s = this.noise(0.9), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.8);
        const g = c.createGain(); this.env(g, t, 0.005, 0.85, 0.5);
        s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 1);
        const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
        this.env(og, t, 0.005, 0.7, 0.42); o.connect(og).connect(out); o.start(t); o.stop(t + 0.8);
      } else if (name === 'alert') {
        [0, 0.16].forEach((d, i) => {
          const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = i ? 880 : 620;
          this.env(g, t + d, 0.01, 0.13, 0.045); o.connect(g).connect(out); o.start(t + d); o.stop(t + d + 0.15);
        });
      } else if (name === 'click') {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 880;
        this.env(g, t, 0.004, 0.06, 0.04); o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
      } else if (name === 'radio') {
        const s = this.noise(0.3), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
        const g = c.createGain(); this.env(g, t, 0.01, 0.25, 0.035);
        s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.3);
        const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 1040;
        this.env(og, t + 0.16, 0.01, 0.1, 0.03); o.connect(og).connect(out); o.start(t + 0.16); o.stop(t + 0.3);
      } else if (name === 'hurt') {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.16);
        this.env(g, t, 0.004, 0.16, 0.1); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      } else if (name === 'success') {
        [392, 523, 659, 784].forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f;
          this.env(g, t + i * 0.12, 0.02, 0.4, 0.05); o.connect(g).connect(out); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.5);
        });
      }
    } catch (e) { /* ignore */ }
  }
  distantBoom() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.noise(0.8), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = c.createGain(); this.env(g, t, 0.02, 0.7, 0.035);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 0.85);
  }
}
const audio = new AudioSys();

/* ============================ WORLD ============================ */
class World {
  constructor() {
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.blocked = new Uint8Array(MAP_W * MAP_H);
    this.objects = [];
    this.buildings = [];
    this.fences = [];
    this.lights = [];
    this.searchlights = [];
    this.waterTiles = [];
    this.generate();
    this.terrain = this.renderTerrain();
  }
  idx(x, y) { return y * MAP_W + x; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return T.WATER;
    return this.tiles[y * MAP_W + x];
  }
  set(x, y, t) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    this.tiles[y * MAP_W + x] = t;
    this.blocked[y * MAP_W + x] = (t === T.WATER || t === T.ROCK || t === T.TREE || t === T.FENCE) ? 1 : 0;
  }
  block(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    this.blocked[y * MAP_W + x] = 1;
  }
  walkable(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    return !this.blocked[y * MAP_W + x];
  }
  walkableAt(wx, wy) { return this.walkable(Math.floor(wx), Math.floor(wy)); }
  generate() {
    const R = mulberry32(1942);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.tiles[this.idx(x, y)] = T.GRASS;
    // coast along the south edge
    for (let x = 0; x < MAP_W; x++) {
      const coast = 47.6 + Math.sin(x * 0.34) * 1.5 + Math.sin(x * 0.11 + 1.7) * 1.2;
      for (let y = 0; y < MAP_H; y++) {
        if (y + 0.5 > coast) { this.set(x, y, T.WATER); this.waterTiles.push([x, y]); }
        else if (y + 0.5 > coast - 3.4) this.set(x, y, T.SAND);
      }
    }
    // western bay
    for (let y = 18; y < MAP_H; y++) {
      const bay = 2.6 + Math.sin(y * 0.42) * 1.1;
      for (let x = 0; x < 4; x++) if (x + 0.5 < bay) { this.set(x, y, T.WATER); this.waterTiles.push([x, y]); }
    }
    // roads
    this.road([[11, 50], [12.5, 45], [15, 40], [20, 35], [26, 30], [31, 27], [34.5, 24], [34.5, 21], [33, 17], [31.5, 14.5]], 2.3);
    this.road([[34.5, 23], [38, 20], [41, 17], [42.5, 13.5]], 1.9);
    this.road([[31, 8], [26, 7], [20, 6], [14, 5], [9.5, 4]], 1.8);
    this.road([[16, 40], [23, 39], [29, 36], [33, 32]], 1.5);
    // compound concrete
    for (let y = 8; y < 26; y++) for (let x = 23; x < 47; x++) {
      if (this.get(x, y) !== T.WATER && this.get(x, y) !== T.ROAD) this.set(x, y, T.CONCRETE);
    }
    // interior concrete paths
    this.road([[31.5, 14], [31.5, 22], [34.5, 25]], 1.4, T.CONCRETE);
    this.road([[31.5, 15], [37, 15], [42, 13]], 1.3, T.CONCRETE);
    // perimeter fence (south and north gates)
    for (let x = 24; x <= 46; x++) {
      if (x >= 32 && x <= 36) continue;
      this.fence(x, 25); this.fence(x, 8);
    }
    for (let y = 8; y <= 25; y++) {
      if (y === 8 || y === 25) continue;
      this.fence(24, y); this.fence(46, y);
    }
    // buildings
    this.addBuilding({ x: 29, y: 10, w: 5, h: 4, height: 2.35, kind: 'bunker', name: 'COMMAND BUNKER', roof: '#5f625b', wall: '#696b62', door: 's', doorU: 0.52 });
    this.addBuilding({ x: 25, y: 18, w: 4, h: 3, height: 1.8, kind: 'barracks', name: 'BARRACKS', roof: '#51463a', wall: '#77705f', door: 's', doorU: 0.62 });
    this.addBuilding({ x: 38, y: 18, w: 3.5, h: 2.5, height: 1.55, kind: 'storage', name: 'SUPPLY', roof: '#4a5048', wall: '#6e7167', door: 'w', doorU: 0.55 });
    this.addBuilding({ x: 43, y: 15, w: 2.2, h: 2.2, height: 1.25, kind: 'shed', name: 'RADIO SHACK', roof: '#4d4437', wall: '#6b675b', door: 's', doorU: 0.5 });
    // tower bases
    this.addTower(24.4, 9.4, 'west');
    this.addTower(45.2, 23.6, 'east');
    this.addRadioTower(42.3, 11.3);
    // vehicle
    this.objects.push({ type: 'truck', x: 35.4, y: 15.9, w: 2.3, h: 1.25, depth: 35.4 + 15.9 + 2.2, solid: true });
    // prisoner
    this.objects.push({ type: 'pow', x: 30.1, y: 20.4, depth: 30.1 + 20.4, alive: true });
    // sandbags
    [[31.4, 26.2, 1.2], [36.2, 26.2, 1.2], [28.5, 25.7, 0.9], [39.2, 25.7, 0.9], [33.8, 13.2, 0.8], [44.5, 11.2, 0.9]].forEach(([x, y, s]) => {
      this.objects.push({ type: 'sandbags', x, y, size: s, depth: x + y });
    });
    // crates and barrels
    const crates = [[36.2, 12.8], [37.1, 13.6], [27.5, 22.3], [28.4, 22.1], [40.2, 20.8], [40.8, 21.4], [34.2, 18.8], [44.1, 13.8]];
    crates.forEach(([x, y], i) => this.objects.push({ type: i % 3 === 2 ? 'barrel' : 'crate', x, y, size: 0.6 + hash2(i, 2) * 0.25, depth: x + y }));
    // tents
    this.objects.push({ type: 'tent', x: 27.8, y: 15.2, depth: 27.8 + 15.2, size: 1.4 });
    this.objects.push({ type: 'tent', x: 43.0, y: 20.4, depth: 43.0 + 20.4, size: 1.25 });
    // lamps
    [[25.6, 16.6], [37.2, 24.2], [44.3, 9.1], [32.0, 22.8]].forEach(([x, y], i) => {
      this.objects.push({ type: 'lamp', x, y, depth: x + y, phase: i * 1.7 });
      this.lights.push({ type: 'lamp', x, y, z: 1.9, radius: 4.2, color: [255, 178, 92], intensity: 0.22, phase: i * 1.7 });
    });
    // scatter nature, keeping paths clear
    let tries = 0;
    while (this.trees === undefined || this.objects.filter(o => o.type === 'tree').length < 74) {
      if (tries++ > 3000) break;
      const x = 1 + R() * (MAP_W - 2), y = 1 + R() * (MAP_H - 2);
      const tx = Math.floor(x), ty = Math.floor(y);
      if (this.get(tx, ty) === T.WATER || this.get(tx, ty) === T.ROAD || this.get(tx, ty) === T.CONCRETE) continue;
      if (this.blocked[this.idx(tx, ty)]) continue;
      if (x > 20 && x < 49 && y > 5 && y < 29) continue;
      if (dist(x, y, 12, 45) < 7 || dist(x, y, 9.5, 4) < 4) continue;
      if (dist(x, y, 34, 26) < 3) continue;
      this.set(tx, ty, T.TREE);
      this.objects.push({ type: 'tree', x: tx + 0.5, y: ty + 0.5, size: 0.75 + R() * 0.55, depth: tx + ty + 1, seed: R() * 10 });
    }
    tries = 0;
    while (this.objects.filter(o => o.type === 'bush').length < 95) {
      if (tries++ > 5000) break;
      const x = 1 + R() * (MAP_W - 2), y = 1 + R() * (MAP_H - 2);
      const tx = Math.floor(x), ty = Math.floor(y);
      if (this.get(tx, ty) !== T.GRASS) continue;
      if (this.blocked[this.idx(tx, ty)]) continue;
      if (dist(x, y, 12, 45) < 4 || dist(x, y, 9.5, 4) < 3) continue;
      if (this.get(Math.floor(x + 0.6), Math.floor(y)) === T.ROAD) continue;
      this.set(tx, ty, T.BUSH);
      this.objects.push({ type: 'bush', x: tx + 0.5, y: ty + 0.5, size: 0.5 + R() * 0.6, depth: tx + ty + 1, seed: R() * 10 });
    }
    tries = 0;
    while (this.objects.filter(o => o.type === 'rock').length < 30) {
      if (tries++ > 3000) break;
      const x = 1 + R() * (MAP_W - 2), y = 1 + R() * (MAP_H - 2);
      const tx = Math.floor(x), ty = Math.floor(y);
      if (this.get(tx, ty) !== T.GRASS && this.get(tx, ty) !== T.SAND) continue;
      if (this.blocked[this.idx(tx, ty)]) continue;
      if (dist(x, y, 12, 45) < 5 || dist(x, y, 9.5, 4) < 4) continue;
      if (x > 21 && x < 48 && y > 6 && y < 27) continue;
      this.set(tx, ty, T.ROCK);
      this.objects.push({ type: 'rock', x: tx + 0.5, y: ty + 0.5, size: 0.5 + R() * 0.7, depth: tx + ty + 1, seed: R() * 10 });
    }
    // extraction marker
    this.objects.push({ type: 'extraction', x: 9.5, y: 4.0, depth: 9.5 + 4.0 });
    // dinghy at insertion
    this.objects.push({ type: 'dinghy', x: 10.2, y: 48.1, depth: 10.2 + 48.1 });
    // wreck / flavour
    this.objects.push({ type: 'wreck', x: 18.2, y: 42.4, depth: 18.2 + 42.4 });
    this.objects.push({ type: 'sign', x: 31.6, y: 30.2, depth: 31.6 + 30.2, text: 'CHECKPOINT 7' });
    // sort static objects by depth for first draw; units inserted each frame
    this.objects.sort((a, b) => a.depth - b.depth);
  }
  road(points, width, type = T.ROAD) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.ceil(len / 0.25);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, cx = lerp(x0, x1, t), cy = lerp(y0, y1, t);
        const r = width / 2;
        for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
          for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            if (dx * dx + dy * dy <= r * r) {
              if (this.get(x, y) !== T.WATER) this.set(x, y, type);
            }
          }
        }
      }
    }
  }
  fence(x, y) {
    this.set(x, y, T.FENCE);
    this.fences.push({ x: x + 0.5, y: y + 0.5, depth: x + y + 1 });
  }
  addBuilding(b) {
    b.type = 'building';
    b.depth = b.x + b.y + b.w + b.h;
    for (let y = Math.floor(b.y); y < Math.ceil(b.y + b.h); y++) {
      for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.w); x++) {
        this.block(x, y);
        if (this.get(x, y) !== T.WATER) this.set(x, y, T.CONCRETE);
      }
    }
    this.buildings.push(b);
    this.objects.push(b);
  }
  addTower(x, y, side) {
    this.block(Math.floor(x), Math.floor(y));
    const obj = { type: 'watchtower', x, y, depth: x + y + 0.5, side };
    this.objects.push(obj);
    const sl = {
      type: 'searchlight', x, y, z: 3.7, base: side === 'west' ? 0.72 : -2.35,
      sweep: side === 'west' ? 0.95 : 0.85, speed: side === 'west' ? 0.34 : 0.28,
      phase: side === 'west' ? 0.4 : 2.1, range: 13.5, half: 0.15, angle: 0
    };
    this.searchlights.push(sl);
  }
  addRadioTower(x, y) {
    this.block(Math.floor(x), Math.floor(y));
    this.block(Math.floor(x) + 1, Math.floor(y));
    const obj = { type: 'radiotower', x, y, depth: x + y + 1.5, destroyed: false, collapse: 0 };
    this.objects.push(obj);
    this.radioTower = obj;
    this.lights.push({ type: 'beacon', x, y, z: 5.4, radius: 2.6, color: [255, 58, 42], intensity: 0.4, phase: 0 });
  }
  renderTerrain() {
    const margin = 190;
    const minX = -MAP_H * ISO_X - margin;
    const minY = -margin;
    const cw = (MAP_W + MAP_H) * ISO_X + margin * 2;
    const ch = (MAP_W + MAP_H) * ISO_Y + margin * 2;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.translate(-minX, -minY);
    g.fillStyle = '#071011'; g.fillRect(minX, minY, cw, ch);
    const diamond = (x, y, grow = 0) => {
      const cx = (x - y) * ISO_X, cy = (x + y + 1) * ISO_Y;
      g.beginPath();
      g.moveTo(cx, cy - ISO_Y - grow); g.lineTo(cx + ISO_X + grow, cy);
      g.lineTo(cx, cy + ISO_Y + grow); g.lineTo(cx - ISO_X - grow, cy);
      g.closePath();
      return { cx, cy };
    };
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.get(x, y);
        const n = hash2(x, y, 7);
        let base;
        if (t === T.WATER) base = n < .5 ? '#18323b' : '#1a3740';
        else if (t === T.SAND) base = n < .5 ? '#7d7152' : '#877a58';
        else if (t === T.GRASS) base = n < .5 ? '#39452f' : '#3f4b34';
        else if (t === T.ROAD) base = n < .5 ? '#5d513d' : '#665943';
        else if (t === T.CONCRETE) base = n < .5 ? '#50544d' : '#565a52';
        else if (t === T.ROCK) base = n < .5 ? '#46453e' : '#4d4b43';
        else if (t === T.BUSH) base = '#35412d';
        else if (t === T.TREE) base = '#33402d';
        else if (t === T.FENCE) base = '#39452f';
        else base = '#39452f';
        const p = diamond(x, y, 0.4);
        g.fillStyle = base; g.fill();
        // fine grain texture
        if (t === T.GRASS || t === T.BUSH || t === T.TREE) {
          const cnt = 2 + Math.floor(n * 3);
          for (let i = 0; i < cnt; i++) {
            const a = hash2(x * 7 + i, y * 11, 3), b = hash2(x * 5, y * 13 + i, 9);
            const px = p.cx + (a - .5) * 44, py = p.cy + (b - .5) * 20;
            g.strokeStyle = i % 2 ? 'rgba(126,143,96,.34)' : 'rgba(26,36,24,.4)';
            g.lineWidth = .7; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (a - .5) * 3, py - 2.2 - b * 2.5); g.stroke();
          }
        } else if (t === T.SAND) {
          for (let i = 0; i < 3; i++) {
            const a = hash2(x * 9 + i, y * 3, 5), b = hash2(x * 3, y * 9 + i, 6);
            g.fillStyle = i % 2 ? 'rgba(196,180,136,.18)' : 'rgba(56,48,34,.22)';
            g.fillRect(p.cx + (a - .5) * 46, p.cy + (b - .5) * 18, 1.2, 1.2);
          }
        } else if (t === T.ROAD) {
          g.strokeStyle = 'rgba(45,39,28,.3)'; g.lineWidth = .8;
          const a = hash2(x, y, 21);
          g.beginPath(); g.moveTo(p.cx - 20 + a * 12, p.cy + 3); g.lineTo(p.cx + 16 - a * 9, p.cy - 4); g.stroke();
          if (n > .7) { g.fillStyle = 'rgba(160,148,115,.13)'; g.fillRect(p.cx - 8, p.cy - 2, 2, 1); }
        } else if (t === T.CONCRETE) {
          g.strokeStyle = 'rgba(30,32,29,.35)'; g.lineWidth = .7;
          if (x % 3 === 0) { g.beginPath(); g.moveTo(p.cx - 20, p.cy - 4); g.lineTo(p.cx + 18, p.cy + 4); g.stroke(); }
          if (n > .78) { g.strokeStyle = 'rgba(28,30,27,.5)'; g.beginPath(); g.moveTo(p.cx - 10, p.cy + 2); g.lineTo(p.cx - 2, p.cy - 3); g.lineTo(p.cx + 5, p.cy - 1); g.stroke(); }
        } else if (t === T.WATER) {
          const a = hash2(x, y, 31);
          g.strokeStyle = 'rgba(104,150,153,.2)'; g.lineWidth = .8;
          g.beginPath();
          g.moveTo(p.cx - 16 + a * 8, p.cy - 2);
          g.quadraticCurveTo(p.cx - 4 + a * 8, p.cy - 6, p.cx + 8 + a * 8, p.cy - 2);
          g.stroke();
          if (n > .55) { g.strokeStyle = 'rgba(160,194,190,.13)'; g.beginPath(); g.moveTo(p.cx - 8, p.cy + 6); g.lineTo(p.cx + 2, p.cy + 4); g.stroke(); }
        }
      }
    }
    // shore foam
    for (const [x, y] of this.waterTiles) {
      const cx = (x - y) * ISO_X, cy = (x + y + 1) * ISO_Y;
      const north = this.get(x, y - 1), west = this.get(x - 1, y);
      if (north === T.SAND) {
        g.strokeStyle = 'rgba(207,214,190,.38)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx, cy - ISO_Y + 1); g.lineTo(cx + ISO_X - 2, cy); g.stroke();
        g.strokeStyle = 'rgba(207,214,190,.12)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(cx, cy - ISO_Y + 5); g.lineTo(cx + ISO_X - 5, cy + 3); g.stroke();
      }
      if (west === T.SAND) {
        g.strokeStyle = 'rgba(207,214,190,.38)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(cx - ISO_X + 2, cy); g.lineTo(cx, cy - ISO_Y + 1); g.stroke();
        g.strokeStyle = 'rgba(207,214,190,.12)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(cx - ISO_X + 5, cy + 3); g.lineTo(cx, cy - ISO_Y + 5); g.stroke();
      }
    }
    // broad ground variation
    const R = mulberry32(77);
    for (let i = 0; i < 240; i++) {
      const wx = R() * MAP_W, wy = R() * MAP_H;
      if (this.get(Math.floor(wx), Math.floor(wy)) === T.WATER) continue;
      const p = iso(wx, wy);
      g.fillStyle = i % 3 === 0 ? 'rgba(20,28,18,.055)' : i % 3 === 1 ? 'rgba(170,158,118,.045)' : 'rgba(80,96,62,.05)';
      g.beginPath(); g.ellipse(p.x, p.y, 12 + R() * 38, 6 + R() * 18, R() * 3, 0, TAU); g.fill();
    }
    // map edge
    const edge = [[0, 0], [MAP_W, 0], [MAP_W, MAP_H], [0, MAP_H]].map(([x, y]) => iso(x, y));
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 20;
    g.beginPath(); g.moveTo(edge[0].x, edge[0].y); for (let i = 1; i < 4; i++) g.lineTo(edge[i].x, edge[i].y); g.closePath(); g.stroke();
    return { canvas: c, minX, minY, w: cw, h: ch };
  }
}

/* ============================ DRAWING ============================ */
function polygon(ctx, points, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function drawUnit(ctx, unit, p, selected, time, enemy = false) {
  const bob = unit.moving ? Math.sin(time * 13 + unit.phase) * 1.2 : 0;
  const scale = enemy ? 1 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.2, 0, 0, TAU); ctx.fill();
  if (selected) {
    ctx.strokeStyle = 'rgba(240,190,101,.82)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 1, 11, 5, 0, 0, TAU); ctx.stroke();
  }
  if (unit.dead) {
    ctx.rotate(-0.2);
    ctx.fillStyle = enemy ? '#62594d' : '#41483e';
    ctx.fillRect(-6, -5, 12, 4); ctx.fillStyle = '#b59a79'; ctx.beginPath(); ctx.arc(7, -4, 2.2, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  const body = enemy ? '#766b51' : unit.color;
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -8 + bob, 4.8, 7.3, unit.facing, 0, TAU); ctx.fill();
  ctx.fillStyle = enemy ? '#c1ab82' : '#b5a27c';
  ctx.beginPath(); ctx.arc(0, -15 + bob, 3.1, 0, TAU); ctx.fill();
  ctx.fillStyle = enemy ? '#39362e' : '#2d352e';
  ctx.beginPath(); ctx.ellipse(0, -17 + bob, 4, 2.1, 0, Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = '#252b26'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(2, -9 + bob); ctx.lineTo(9, -11 + bob); ctx.stroke();
  if (unit.crouch && !enemy) {
    ctx.fillStyle = 'rgba(122,164,103,.48)'; ctx.beginPath(); ctx.arc(-3, -7, 8, 0, TAU); ctx.fill();
  }
  if (unit.health < 100) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(-8, -24, 16, 2);
    ctx.fillStyle = unit.health > 40 ? '#a4bf73' : '#d25843'; ctx.fillRect(-8, -24, 16 * unit.health / 100, 2);
  }
  ctx.restore();
}

/* ============================ GAME ============================ */
const UNIT_DEFS = [
  { id: 'scout', name: 'JACK O’HARA', role: 'GREEN BERET', color: '#66764a', weapon: 'silenced', speed: 2.65, range: 8.5, rate: 1.05 },
  { id: 'sniper', name: 'FRANCIS T. WOOLRIDGE', role: 'SNIPER', color: '#61705a', weapon: 'rifle', speed: 2.35, range: 15, rate: 2.3 },
  { id: 'sapper', name: 'SAMUEL BROOKLYN', role: 'SAPPER', color: '#79734c', weapon: 'shot', speed: 2.3, range: 8, rate: 1.4 }
];

class Game {
  constructor() {
    this.canvas = document.getElementById('game'); this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.mini = document.getElementById('minimap'); this.mctx = this.mini.getContext('2d');
    this.world = new World(); this.state = 'menu'; this.time = 0; this.last = now(); this.lastMinimap = 0;
    this.units = []; this.guards = []; this.effects = []; this.selected = 0; this.selectAll = false;
    this.camera = { x: 0, y: 0, zoom: 1 }; this.size = { w: 1, h: 1, dpr: 1 };
    this.grenades = 3; this.grenadeArmed = false; this.alarm = 0; this.threat = 'clear';
    this.objectives = { intel: false, radio: false, extract: false, pow: false };
    this.startTime = 0; this.casualties = 0; this.kills = 0; this.activeAction = '';
    this.toastTimer = 0; this.toastEl = document.getElementById('toast'); this.toastText = document.getElementById('hintText');
    this.pointer = null; this.keys = new Set(); this.interacting = null; this.radioPlant = 0;
    this.populate(); this.bind(); this.resize(); this.renderCards(); this.updateHUD();
    requestAnimationFrame(t => this.frame(t));
  }
  populate() {
    const defs = UNIT_DEFS;
    this.units = defs.map((d, i) => ({ ...d, x: 11.6 + i * 0.9, y: 45.1 + (i % 2) * 1.1, facing: -0.55, health: 100, alive: true, dead: false, crouch: false, grenades: i === 2 ? 3 : 0, path: [], moving: false, phase: i * 2.4, cooldown: 0, noise: 0 }));
    const positions = [
      [27.7, 11.5, 'sentry'], [35.1, 11.4, 'sentry'], [40.7, 11.9, 'patrol'], [44.3, 12.7, 'sentry'],
      [26.7, 16.4, 'patrol'], [33.7, 16.0, 'sentry'], [39.4, 17.0, 'patrol'], [44.0, 19.5, 'sentry'],
      [29.8, 23.2, 'sentry'], [35.0, 23.8, 'patrol'], [42.8, 23.0, 'sentry'], [31.4, 8.8, 'sentry']
    ];
    this.guards = positions.map(([x, y, kind], i) => ({ x, y, homeX: x, homeY: y, kind, id: i, alive: true, dead: false,
      facing: (i * 1.19) % TAU, suspicion: 0, mode: 'patrol', health: 100, cooldown: 0, phase: i * 1.7,
      path: [], waypoints: kind === 'patrol' ? [[x, y], [clamp(x + (i % 2 ? 2.5 : -2.2), 25, 45), clamp(y + (i % 3 ? 2 : -2), 9, 24)]] : null, waypoint: 0 }));
  }
  bind() {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('pointerdown', e => this.pointerDown(e));
    this.canvas.addEventListener('pointermove', e => this.pointerMove(e));
    this.canvas.addEventListener('pointerup', e => this.pointerUp(e));
    this.canvas.addEventListener('pointercancel', e => this.pointer = null);
    window.addEventListener('keydown', e => this.keyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btnStart', () => this.start()); on('btnSound', () => this.toggleSound()); on('btnSoundStart', () => this.toggleSound());
    on('btnPause', () => this.pause()); on('btnResume', () => this.resume());
    on('btnRestartPause', () => this.restart()); on('btnReplay', () => this.restart());
    on('btnMenuPause', () => this.toMenu()); on('btnMenuEnd', () => this.toMenu());
    on('btnHelp', () => this.openHelp()); on('btnHow', () => this.openHelp());
    document.querySelectorAll('[data-close="help"]').forEach(el => el.addEventListener('click', () => this.closeHelp()));
    on('btnAll', () => this.selectSquad());
    on('btnCrouch', () => this.toggleCrouch()); on('btnKnife', () => this.knife());
    on('btnGrenade', () => this.armGrenade()); on('btnUse', () => this.use());
    on('btnHold', () => this.hold()); on('btnCenter', () => this.center());
    this.mini.addEventListener('pointerdown', e => { this.mini.setPointerCapture(e.pointerId); this.miniDrag(e); });
    this.mini.addEventListener('pointermove', e => { if (e.buttons) this.miniDrag(e); });
    this.mini.addEventListener('click', e => this.miniDrag(e));
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = { w, h, dpr };
    if (!this.camera.x) { const p = iso(29, 28); this.camera.x = p.x; this.camera.y = p.y; }
    this.camera.zoom = clamp(this.camera.zoom || Math.min(w / 1120, h / 670) * 1.25, 0.48, 1.42);
  }
  start() {
    audio.init(); this.state = 'playing'; this.startTime = now(); this.time = 0;
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden'); document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('helpScreen').classList.add('hidden'); document.getElementById('hud').setAttribute('aria-hidden', 'false');
    this.center(); this.toast('SQUAD INSERTED — MOVE THROUGH THE TREELINE'); this.updateHUD();
  }
  restart() {
    this.populate(); this.selected = 0; this.selectAll = false; this.grenades = 3; this.alarm = 0; this.threat = 'clear';
    this.objectives = { intel: false, radio: false, extract: false, pow: false }; this.kills = 0; this.casualties = 0; this.effects = [];
    this.grenadeArmed = false; this.radioPlant = 0; this.interacting = null; this.start(); this.renderCards();
  }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; document.getElementById('pauseScreen').classList.remove('hidden'); }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.last = now(); document.getElementById('pauseScreen').classList.add('hidden'); }
  toMenu() {
    this.state = 'menu'; document.getElementById('pauseScreen').classList.add('hidden'); document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden'); document.getElementById('hud').setAttribute('aria-hidden', 'true');
  }
  openHelp() { document.getElementById('helpScreen').classList.remove('hidden'); if (this.state === 'playing') this.wasPlaying = true; }
  closeHelp() { document.getElementById('helpScreen').classList.add('hidden'); if (this.wasPlaying) { this.wasPlaying = false; this.last = now(); } }
  toggleSound() {
    audio.init(); audio.setMuted(!audio.muted);
    const label = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
    document.getElementById('btnSoundStart').textContent = label;
    document.getElementById('btnSound').classList.toggle('muted', audio.muted);
  }
  toast(text) {
    this.toastEl.textContent = text; this.toastEl.classList.add('show'); this.toastTimer = 3.2;
  }
  selectSquad() { this.selectAll = true; this.selected = 0; this.renderCards(); this.updateHUD(); }
  selectUnit(i) {
    if (!this.units[i] || !this.units[i].alive) return;
    this.selectAll = false; this.selected = i; this.renderCards(); this.updateHUD(); audio.play('click');
  }
  get selectedUnits() { return this.selectAll ? this.units.filter(u => u.alive) : [this.units[this.selected]].filter(u => u && u.alive); }
  renderCards() {
    const box = document.getElementById('unitCards'); box.innerHTML = '';
    this.units.forEach((u, i) => {
      const card = document.createElement('button'); card.className = 'unit-card' + (i === this.selected && !this.selectAll ? ' selected' : '') + (!u.alive ? ' dead' : '');
      card.setAttribute('aria-label', `${u.name}, ${u.alive ? 'select' : 'KIA'}`);
      card.innerHTML = `<span class="portrait"><i>${i + 1}</i></span><span class="unit-info"><b>${u.name.split(' ').slice(-1)[0]}</b><small>${u.role}</small><span class="health"><i style="width:${u.health}%"></i></span></span>`;
      card.addEventListener('click', () => this.selectUnit(i)); box.appendChild(card);
    });
  }
  pointerDown(e) {
    if (e.button === 2 || e.button === 1) e.preventDefault();
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, pan: e.button === 2 || e.button === 1 || e.shiftKey };
    if (this.pointer) { this.pointer.pinch = true; this.pointer.second = p; this.pointer.pinchDist = Math.hypot(p.x - this.pointer.x, p.y - this.pointer.y); }
    else this.pointer = p;
    this.canvas.setPointerCapture(e.pointerId);
  }
  pointerMove(e) {
    const p = this.pointer; if (!p) return;
    if (p.second && (p.id === e.pointerId || p.second.id === e.pointerId)) {
      const old = p.pinchDist || 1;
      if (p.id === e.pointerId) { p.x = e.clientX; p.y = e.clientY; } else { p.second.x = e.clientX; p.second.y = e.clientY; }
      const d = Math.hypot(p.second.x - p.x, p.second.y - p.y);
      this.camera.zoom = clamp(this.camera.zoom * d / old, 0.48, 1.42); p.pinchDist = d; return;
    }
    if (p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
    if (p.pan || p.moved) { p.pan = true; this.camera.x -= dx / this.camera.zoom; this.camera.y -= dy / this.camera.zoom; }
    p.x = e.clientX; p.y = e.clientY;
  }
  pointerUp(e) {
    const p = this.pointer; if (!p) return;
    if (p.second) {
      if (e.pointerId === p.second.id) p.second = null;
      else if (e.pointerId === p.id) { Object.assign(p, p.second, { id: p.second.id }); p.second = null; p.sx = p.x; p.sy = p.y; p.pan = false; p.moved = true; }
      return;
    }
    if (e.pointerId !== p.id) return;
    if (!p.moved && !p.pan) this.handleTap(e.clientX, e.clientY);
    this.pointer = null;
  }
  screenToWorld(sx, sy) {
    const { w, h } = this.size, ix = (sx - w / 2) / this.camera.zoom + this.camera.x;
    const iy = (sy - h / 2) / this.camera.zoom + this.camera.y;
    return { x: (ix / ISO_X + iy / ISO_Y) / 2, y: (iy / ISO_Y - ix / ISO_X) / 2 };
  }
  worldToScreen(x, y, z = 0) {
    const p = iso(x, y, z);
    return { x: (p.x - this.camera.x) * this.camera.zoom + this.size.w / 2, y: (p.y - this.camera.y) * this.camera.zoom + this.size.h / 2 };
  }
  handleTap(sx, sy) {
    if (this.state !== 'playing') return;
    const w = this.screenToWorld(sx, sy);
    const hit = (arr, radius) => arr.find(o => o.alive && !o.dead && dist2(w.x, w.y, o.x, o.y) < radius * radius);
    const guard = hit(this.guards, 0.85);
    if (guard) { this.attack(guard); return; }
    const friend = this.units.findIndex(u => u.alive && dist2(w.x, w.y, u.x, u.y) < 0.72 * 0.72);
    if (friend >= 0) { this.selectUnit(friend); return; }
    if (this.grenadeArmed) {
      this.grenadeArmed = false; document.getElementById('btnGrenade').classList.remove('armed');
      this.throwGrenade(w.x, w.y); return;
    }
    const target = nearestWalkable(this.world, w.x, w.y);
    if (this.selectAll) {
      const offsets = [[-0.8, -0.5], [0.8, 0], [0, 0.9]];
      this.units.forEach((u, i) => { if (!u.alive) return; this.commandMove(u, target.x + offsets[i][0], target.y + offsets[i][1]); });
    } else this.selectedUnits.forEach(u => this.commandMove(u, target.x + 0.5, target.y + 0.5));
  }
  miniDrag(e) {
    const r = this.mini.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1) * MAP_W;
    const y = clamp((e.clientY - r.top) / r.height, 0, 1) * MAP_H;
    const p = iso(x, y); this.camera.x = p.x; this.camera.y = p.y;
  }
  pathfind(sx, sy, tx, ty) {
    const start = nearestWalkable(this.world, sx, sy), goal = nearestWalkable(this.world, tx, ty);
    const key = (x, y) => y * MAP_W + x;
    const startKey = key(start.x, start.y), goalKey = key(goal.x, goal.y);
    if (startKey === goalKey) return [{ x: goal.x + .5, y: goal.y + .5 }];
    const open = [startKey], came = new Int32Array(MAP_W * MAP_H); came.fill(-1);
    const g = new Float32Array(MAP_W * MAP_H); g.fill(1e9); g[startKey] = 0;
    const f = new Float32Array(MAP_W * MAP_H); f.fill(1e9); f[startKey] = Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y);
    const closed = new Uint8Array(MAP_W * MAP_H);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let loops = 0;
    while (open.length && loops++ < 2800) {
      let best = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i;
      const cur = open.splice(best, 1)[0]; if (cur === goalKey) break; if (closed[cur]) continue; closed[cur] = 1;
      const x = cur % MAP_W, y = Math.floor(cur / MAP_W);
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!this.world.walkable(nx, ny) || (dx && dy && (!this.world.walkable(x + dx, y) || !this.world.walkable(x, y + dy)))) continue;
        const nk = key(nx, ny); if (closed[nk]) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng >= g[nk]) continue;
        came[nk] = cur; g[nk] = ng; f[nk] = ng + Math.hypot(goal.x - nx, goal.y - ny);
        if (!open.includes(nk)) open.push(nk);
      }
    }
    if (came[goalKey] < 0) return [{ x: goal.x + .5, y: goal.y + .5 }];
    const rev = []; let k = goalKey;
    while (k !== startKey && k >= 0) { rev.push({ x: (k % MAP_W) + .5, y: Math.floor(k / MAP_W) + .5 }); k = came[k]; }
    rev.reverse();
    // trim collinear points to keep movement smooth and path compact
    const out = []; let lastDir = '';
    for (let i = 0; i < rev.length; i++) {
      const prev = i ? rev[i - 1] : start, d = `${Math.sign(rev[i].x - prev.x)},${Math.sign(rev[i].y - prev.y)}`;
      if (d !== lastDir && out.length) out.push(rev[i - 1]);
      lastDir = d;
    }
    if (rev.length) out.push(rev[rev.length - 1]);
    return out;
  }
  commandMove(unit, x, y) {
    const goal = nearestWalkable(this.world, x, y);
    unit.path = this.pathfind(unit.x, unit.y, goal.x, goal.y); unit.moving = unit.path.length > 0;
    if (unit.moving) unit.facing = Math.atan2(unit.path[0].y - unit.y, unit.path[0].x - unit.x);
    unit.hold = false;
  }
  toggleCrouch() {
    const next = !this.selectedUnits[0]?.crouch;
    this.selectedUnits.forEach(u => { u.crouch = next; });
    document.getElementById('btnCrouch').classList.toggle('active', next); audio.play('click');
    this.toast(next ? 'SQUAD CROUCHING — REDUCED VISIBILITY' : 'SQUAD STANDING');
  }
  hold() { this.selectedUnits.forEach(u => { u.path = []; u.moving = false; u.hold = true; }); audio.play('click'); }
  center() {
    const group = this.selectedUnits;
    if (!group.length) return;
    const p = iso(group.reduce((s,u)=>s+u.x,0)/group.length, group.reduce((s,u)=>s+u.y,0)/group.length);
    this.camera.x = p.x; this.camera.y = p.y;
  }
  attack(guard) {
    const unit = this.selectedUnits[0]; if (!unit) return;
    if (this.activeAction === 'knife') { this.knife(guard); return; }
    unit.target = guard; unit.path = []; unit.moving = false; unit.hold = false;
    this.toast(`${unit.role} ENGAGING — GUNFIRE WILL RAISE THE ALARM`);
  }
  knife(target = null) {
    const unit = this.selectedUnits[0]; if (!unit) return;
    const enemy = target || this.guards.filter(g => g.alive).sort((a,b)=>dist2(unit.x,unit.y,a.x,a.y)-dist2(unit.x,unit.y,b.x,b.y))[0];
    if (!enemy) return this.toast('NO HOSTILE TARGETS');
    const d = dist(unit.x, unit.y, enemy.x, enemy.y);
    if (d > 1.35) { this.commandMove(unit, enemy.x, enemy.y); this.activeAction = 'knife'; this.toast('CLOSING FOR A SILENT TAKEDOWN'); return; }
    if (angleDiff(Math.atan2(unit.y-enemy.y, unit.x-enemy.x), enemy.facing) > -Math.PI * .58) {
      this.killGuard(enemy, true); audio.play('knife'); this.activeAction = ''; this.toast('SILENT TAKEDOWN');
    } else this.toast('GET BEHIND THE GUARD FIRST');
  }
  armGrenade() {
    const sapper = this.units.find(u => u.id === 'sapper' && u.alive);
    if (!sapper || !this.grenades) return this.toast('NO GRENADES AVAILABLE');
    this.grenadeArmed = !this.grenadeArmed;
    document.getElementById('btnGrenade').classList.toggle('armed', this.grenadeArmed);
    this.toast(this.grenadeArmed ? 'GRENADE ARMED — TAP A TARGET AREA' : 'GRENADE CANCELLED');
  }
  throwGrenade(x, y) {
    const sapper = this.units.find(u => u.id === 'sapper' && u.alive); if (!sapper || !this.grenades) return;
    this.grenades--; document.getElementById('grenadeCount').textContent = this.grenades ? `×${this.grenades}` : '';
    this.effects.push({ type: 'grenade', x: clamp(x, 0, MAP_W), y: clamp(y, 0, MAP_H), at: this.time + 1.1, born: this.time });
    audio.play('click'); this.toast('FRAG OUT — DETONATION IN 1.1 SECONDS');
  }
  use() {
    if (this.state !== 'playing') return;
    const unit = this.selectedUnits[0];
    if (!unit) return;
    const near = (x, y, r = 2.2) => dist(unit.x, unit.y, x, y) <= r;
    if (!this.objectives.intel && near(31.3, 14.6, 3.2)) {
      this.objectives.intel = true; audio.play('success'); this.toast('BATTLE PLANS SECURED'); this.updateHUD(); return;
    }
    if (!this.objectives.radio && unit.id === 'sapper' && near(this.world.radioTower.x, this.world.radioTower.y, 2.6)) {
      this.interacting = { type: 'radio', unit, progress: 0 }; this.toast('PLANTING SATCHEL — HOLD POSITION'); return;
    }
    const pow = this.world.objects.find(o => o.type === 'pow');
    if (pow?.alive && near(pow.x, pow.y, 2.3)) {
      pow.alive = false; this.objectives.pow = true; audio.play('success'); this.toast('PRISONER FREED — HE WILL FOLLOW TO EXTRACTION'); this.updateHUD(); return;
    }
    if (this.objectives.intel && this.objectives.radio && near(9.5, 4, 3.2)) {
      this.objectives.extract = true; this.finish(true); return;
    }
    this.toast(unit.id !== 'sapper' && !this.objectives.radio && near(this.world.radioTower.x, this.world.radioTower.y, 3) ? 'THE SAPPER MUST PLANT THE CHARGE' : 'NOTHING TO USE HERE');
  }
  finish(won) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    const alive = this.units.filter(u => u.alive).length;
    document.getElementById('endKicker').textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    document.getElementById('endTitle').textContent = won ? 'NIGHTFALL' : 'SQUAD LOST';
    document.getElementById('endCopy').textContent = won
      ? `The radio tower is silent. The plans are secure. ${alive} commando${alive === 1 ? '' : 's'} made it out${this.objectives.pow ? ', with the prisoner' : ''}.`
      : 'The operation is compromised. No commandos remain in the field.';
    document.getElementById('endStats').innerHTML = `<span><b>${fmtTime(this.time)}</b><small>TIME</small></span><span><b>${this.kills}</b><small>HOSTILES</small></span><span><b>${alive}/3</b><small>EXTRACTED</small></span>`;
    document.getElementById('endScreen').classList.remove('hidden');
    if (won) audio.play('success'); else audio.play('hurt');
  }
  killGuard(g, silent = false) {
    if (!g?.alive) return;
    g.alive = false; g.dead = true; g.mode = 'dead'; this.kills++;
    if (!silent) { this.raiseAlarm(0.65); audio.play('shot'); }
  }
  raiseAlarm(amount = 0.3) {
    this.alarm = clamp(this.alarm + amount, 0, 1);
    this.threat = this.alarm >= 0.72 ? 'alert' : 'suspicious';
    if (this.alarm >= 0.72 && !this.alertPlayed) { this.alertPlayed = true; audio.play('alert'); this.toast('ALARM RAISED — HOSTILES ARE HUNTING YOU'); }
  }
  update(dt) {
    if (this.state !== 'playing' || document.getElementById('helpScreen').classList.contains('hidden') === false) return;
    this.time += dt;
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.toastEl.classList.remove('show'); }
    for (const u of this.units) {
      if (!u.alive) continue;
      u.cooldown = Math.max(0, u.cooldown - dt);
      if (u.target?.alive) {
        const d = dist(u.x, u.y, u.target.x, u.target.y);
        if (d > u.range * 0.82) this.commandMove(u, u.target.x, u.target.y);
        else if (u.cooldown <= 0) {
          u.facing = Math.atan2(u.target.y - u.y, u.target.x - u.x);
          u.cooldown = u.rate; u.target.health -= u.weapon === 'rifle' ? 65 : 42;
          audio.play(u.weapon, { pan: clamp((u.x - 28) / 28, -1, 1) });
          this.raiseAlarm(u.weapon === 'silenced' ? 0.035 : 0.24);
          if (u.target.health <= 0) this.killGuard(u.target, false);
        }
      }
      if (u.moving && u.path.length) {
        const p = u.path[0], dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
        if (d < 0.1) { u.x = p.x; u.y = p.y; u.path.shift(); if (!u.path.length) { u.moving = false; if (this.activeAction === 'knife') this.knife(); } }
        else {
          const speed = u.speed * (u.crouch ? 0.62 : 1);
          const step = Math.min(d, speed * dt); u.x += dx / d * step; u.y += dy / d * step; u.facing = Math.atan2(dy, dx);
          u.noise = u.crouch ? 0.12 : 0.35;
        }
      }
    }
    this.updateGuards(dt);
    for (const fx of this.effects) {
      if (fx.type === 'grenade' && this.time >= fx.at) {
        fx.type = 'blast'; fx.until = this.time + 0.55; audio.play('explosion'); this.raiseAlarm(0.9);
        for (const g of this.guards) if (g.alive && dist(g.x, g.y, fx.x, fx.y) < 3.6) { g.health -= 120; if (g.health <= 0) this.killGuard(g, false); }
        for (const u of this.units) if (u.alive && dist(u.x, u.y, fx.x, fx.y) < 2.8) this.hurtUnit(u, 55);
      }
    }
    this.effects = this.effects.filter(fx => fx.type === 'grenade' || this.time < fx.until);
    if (this.interacting?.type === 'radio') {
      const it = this.interacting;
      if (!it.unit.alive || dist(it.unit.x, it.unit.y, this.world.radioTower.x, this.world.radioTower.y) > 3.2) { this.interacting = null; this.toast('CHARGE PLANTING INTERRUPTED'); }
      else if ((it.progress += dt) >= 3.2) {
        this.objectives.radio = true; this.interacting = null; this.world.radioTower.destroyed = true;
        this.effects.push({ type: 'blast', x: this.world.radioTower.x, y: this.world.radioTower.y, born: this.time, until: this.time + 1.2 });
        audio.play('explosion'); this.raiseAlarm(0.45); this.toast('RADIO TOWER DESTROYED'); this.updateHUD();
      }
    }
    const search = this.world.searchlights;
    for (const sl of search) sl.angle = sl.base + Math.sin(this.time * sl.speed + sl.phase) * sl.sweep;
    if (!this.units.some(u => u.alive)) this.finish(false);
    if (this.time - this.lastMinimap > 0.25) { this.drawMinimap(); this.lastMinimap = this.time; }
    this.updateHUD();
  }
  hurtUnit(u, amount) {
    if (!u.alive) return;
    u.health = Math.max(0, u.health - amount);
    if (u.health === 0) { u.alive = false; u.dead = true; this.casualties++; u.moving = false; u.path = []; this.renderCards(); audio.play('hurt'); this.toast(`${u.role} DOWN`); }
  }
  updateGuards(dt) {
    for (const g of this.guards) {
      if (!g.alive) continue;
      g.cooldown = Math.max(0, g.cooldown - dt);
      if (g.mode === 'patrol' && g.kind === 'patrol' && !g.path.length) {
        g.waypoint = (g.waypoint + 1) % g.waypoints.length;
        const w = g.waypoints[g.waypoint]; g.path = this.pathfind(g.x, g.y, w[0], w[1]);
      }
      if (g.path.length) {
        const p = g.path[0], dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
        if (d < 0.12) g.path.shift(); else { const step = Math.min(d, (g.mode === 'hunt' ? 1.75 : 0.72) * dt); g.x += dx / d * step; g.y += dy / d * step; g.facing = Math.atan2(dy, dx); }
      }
      let seen = null, best = Infinity;
      for (const u of this.units) {
        if (!u.alive) continue;
        const d = dist(g.x, g.y, u.x, u.y); if (d > 9.5) continue;
        const a = Math.atan2(u.y - g.y, u.x - g.x);
        if (Math.abs(angleDiff(a, g.facing)) > (u.crouch ? 0.62 : 0.86)) continue;
        if (d < best) { best = d; seen = u; }
      }
      if (seen) {
        g.suspicion = clamp(g.suspicion + dt * (seen.crouch ? 0.19 : 0.38) * (best < 4 ? 1.7 : 1), 0, 1);
        if (g.suspicion > 0.48) g.mode = 'suspicious';
        if (g.suspicion >= 1) { g.mode = 'hunt'; g.path = this.pathfind(g.x, g.y, seen.x, seen.y); this.raiseAlarm(0.8); }
      } else g.suspicion = Math.max(0, g.suspicion - dt * 0.12);
      if (g.mode === 'hunt') {
        const target = this.units.filter(u => u.alive).sort((a,b)=>dist2(g.x,g.y,a.x,a.y)-dist2(g.x,g.y,b.x,b.y))[0];
        if (target && dist(g.x,g.y,target.x,target.y) < 8 && g.cooldown <= 0) {
          g.cooldown = 1.5; target.facing = Math.atan2(g.y-target.y,g.x-target.x); this.hurtUnit(target, 13); audio.play('shot', { pan: clamp((g.x-28)/28,-1,1) });
        }
      }
    }
  }
  updateHUD() {
    const count = Number(this.objectives.intel) + Number(this.objectives.radio);
    document.getElementById('objCount').textContent = `${count} / 2`;
    document.getElementById('objHint').textContent = this.objectives.extract ? 'EXTRACTION COMPLETE' : this.objectives.intel && this.objectives.radio ? 'PROCEED TO NORTH RIDGE' : !this.objectives.intel ? 'INFILTRATE THE COMPOUND' : 'SABOTAGE THE RADIO';
    for (const key of ['intel','radio','extract','pow']) {
      const el = document.querySelector(`[data-obj="${key}"]`); if (!el) continue;
      el.classList.toggle('complete', !!this.objectives[key]);
      if (key === 'extract') el.classList.toggle('locked', !this.objectives.intel || !this.objectives.radio);
    }
    const th = document.getElementById('threat'); th.className = `threat is-${this.alarm >= .72 ? 'alert' : this.alarm > .12 ? 'suspicious' : 'clear'}`;
    document.getElementById('threatText').textContent = this.alarm >= .72 ? 'ALARM' : this.alarm > .12 ? 'SUSPICIOUS' : 'UNDETECTED';
    document.getElementById('clock').textContent = fmtTime(this.time);
    const selected = this.units[this.selected];
    document.getElementById('miniCoords').textContent = selected ? `${Math.floor(selected.x)} · ${Math.floor(selected.y)}` : '—';
  }
  frame(timestamp) {
    const t = timestamp / 1000;
    const dt = clamp(t - this.last, 0, 0.05); this.last = t;
    this.update(dt);
    this.render(t);
    requestAnimationFrame(next => this.frame(next));
  }
  render(time) {
    const { ctx, size, camera } = this;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = '#071011'; ctx.fillRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(size.w / 2 - camera.x * camera.zoom, size.h / 2 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    const terrain = this.world.terrain;
    ctx.drawImage(terrain.canvas, terrain.minX, terrain.minY);
    // Searchlight sweeps are deliberately translucent so terrain remains readable.
    for (const sl of this.world.searchlights) {
      const p = iso(sl.x, sl.y, 0.5);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(sl.angle);
      const grad = ctx.createLinearGradient(0, 0, sl.range * ISO_X, 0);
      grad.addColorStop(0, 'rgba(255,224,145,.13)'); grad.addColorStop(1, 'rgba(255,224,145,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(sl.range * ISO_X, -sl.range * ISO_Y * sl.half * 2.2);
      ctx.lineTo(sl.range * ISO_X, sl.range * ISO_Y * sl.half * 2.2); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    const entries = [];
    for (const o of this.world.objects) entries.push({ depth: o.depth ?? o.x + o.y, kind: 'object', value: o });
    for (const f of this.world.fences) entries.push({ depth: f.depth, kind: 'fence', value: f });
    for (const g of this.guards) entries.push({ depth: g.x + g.y, kind: 'guard', value: g });
    for (const u of this.units) entries.push({ depth: u.x + u.y, kind: 'unit', value: u });
    for (const e of this.effects) entries.push({ depth: e.x + e.y + 0.2, kind: 'effect', value: e });
    entries.sort((a, b) => a.depth - b.depth);
    for (const item of entries) {
      if (item.kind === 'object') this.drawObject(item.value, time);
      else if (item.kind === 'fence') this.drawFence(item.value);
      else if (item.kind === 'guard') {
        const g = item.value; const p = iso(g.x, g.y);
        if (g.alive && g.mode !== 'hunt') {
          ctx.save(); ctx.translate(p.x, p.y - 3); ctx.rotate(g.facing);
          ctx.fillStyle = g.mode === 'suspicious' ? 'rgba(255,177,73,.14)' : 'rgba(220,108,66,.09)';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ISO_X * 9.5, -ISO_Y * 5); ctx.lineTo(ISO_X * 9.5, ISO_Y * 5); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        drawUnit(ctx, g, p, false, time, true);
        if (g.alive && g.suspicion > .1) { ctx.fillStyle = '#161711'; ctx.fillRect(p.x - 8, p.y - 27, 16, 2); ctx.fillStyle = '#e2a04b'; ctx.fillRect(p.x - 8, p.y - 27, 16 * g.suspicion, 2); }
      } else if (item.kind === 'unit') drawUnit(ctx, item.value, iso(item.value.x, item.value.y), this.selectedUnits.includes(item.value), time);
      else this.drawEffect(item.value, time);
    }
    for (const sl of this.world.searchlights) {
      const p = iso(sl.x, sl.y, sl.z);
      ctx.fillStyle = 'rgba(255,226,160,.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // light vignette over the battlefield canvas
    const v = ctx.createRadialGradient(size.w / 2, size.h / 2, Math.min(size.w, size.h) * .22, size.w / 2, size.h / 2, Math.max(size.w, size.h) * .72);
    v.addColorStop(0, 'rgba(2,7,9,0)'); v.addColorStop(1, 'rgba(2,7,9,.28)'); ctx.fillStyle = v; ctx.fillRect(0, 0, size.w, size.h);
  }
  drawFence(f) {
    const p = iso(f.x, f.y);
    this.ctx.strokeStyle = '#89856a'; this.ctx.lineWidth = 2;
    this.ctx.beginPath(); this.ctx.moveTo(p.x - 16, p.y - 2); this.ctx.lineTo(p.x, p.y - 8); this.ctx.lineTo(p.x + 16, p.y - 2); this.ctx.stroke();
    this.ctx.strokeStyle = 'rgba(25,29,25,.75)'; this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.moveTo(p.x - 15, p.y + 1); this.ctx.lineTo(p.x + 15, p.y + 1); this.ctx.stroke();
  }
  drawObject(o, time) {
    const c = this.ctx, p = iso(o.x, o.y);
    c.save(); c.translate(p.x, p.y);
    const diamond = (w, h, fill, stroke = 'rgba(10,13,11,.55)') => polygon(c, [{x:0,y:-h},{x:w,y:0},{x:0,y:h},{x:-w,y:0}], fill, stroke, 1);
    switch (o.type) {
      case 'tree': {
        const s = 13 * o.size; c.fillStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(4, 0, s, s * .36, 0, 0, TAU); c.fill();
        c.fillStyle = '#514b37'; c.fillRect(-2, -s * 1.6, 4, s * 1.7);
        c.fillStyle = '#253324'; c.beginPath(); c.ellipse(-3, -s * 1.55, s * .72, s * .62, -.3, 0, TAU); c.fill();
        c.fillStyle = '#35432c'; c.beginPath(); c.ellipse(3, -s * 1.95, s * .64, s * .59, .25, 0, TAU); c.fill();
        c.fillStyle = 'rgba(133,143,87,.18)'; c.beginPath(); c.ellipse(-2, -s * 2.05, s * .32, s * .27, 0, 0, TAU); c.fill(); break;
      }
      case 'bush': c.fillStyle = '#293723'; c.beginPath(); c.ellipse(0,-5,9*o.size,5*o.size,0,0,TAU); c.fill(); c.fillStyle='#526044'; c.beginPath(); c.arc(-3,-8,4,0,TAU); c.arc(3,-9,4,0,TAU); c.fill(); break;
      case 'building': {
        const w = o.w * ISO_X, h = o.h * ISO_Y, z = o.height * Z_SCALE;
        polygon(c,[{x:-w,y:-h},{x:0,y:-h+h},{x:w,y:0},{x:0,y:h}], '#30352e');
        // wall faces and roof give structures a clear isometric silhouette
        polygon(c,[{x:-w,y:0},{x:0,y:h},{x:0,y:h-z},{x:-w,y:-z}],o.wall);
        polygon(c,[{x:0,y:h},{x:w,y:0},{x:w,y:-z},{x:0,y:h-z}], '#53564e');
        polygon(c,[{x:-w,y:-z},{x:0,y:-h-z},{x:w,y:-z},{x:0,y:h-z}],o.roof,'#858274',1.5);
        c.fillStyle='rgba(225,206,157,.48)'; c.font='bold 8px sans-serif'; c.textAlign='center'; c.fillText(o.name,0,-z-4);
        c.fillStyle='#292b27'; c.fillRect(-5,-8,10,16); break;
      }
      case 'watchtower':
        c.strokeStyle='#756f58'; c.lineWidth=3; c.beginPath(); c.moveTo(-7,0); c.lineTo(-5,-48); c.lineTo(6,-48); c.lineTo(8,0); c.stroke();
        c.fillStyle='#655f4c'; c.fillRect(-11,-51,22,10); c.fillStyle='#c1a56d'; c.fillRect(-4,-56,8,5); break;
      case 'radiotower':
        if (o.destroyed) { c.strokeStyle='#51493b'; c.lineWidth=4; c.beginPath(); c.moveTo(-11,0); c.lineTo(6,-30); c.lineTo(13,-6); c.stroke(); c.fillStyle='#302c25'; c.beginPath(); c.arc(0,-4,12,Math.PI,TAU); c.fill(); break; }
        c.strokeStyle='#8b8170'; c.lineWidth=2; c.beginPath(); c.moveTo(-14,0); c.lineTo(0,-86); c.lineTo(14,0); c.moveTo(-10,-23); c.lineTo(10,-23); c.moveTo(-6,-47); c.lineTo(6,-47); c.moveTo(-2,-69); c.lineTo(2,-69); c.stroke();
        c.fillStyle='#e64e39'; c.beginPath(); c.arc(0,-87,3+Math.sin(time*5)*.8,0,TAU); c.fill(); break;
      case 'truck':
        diamond(28,15,'#343c37'); c.fillStyle='#6b6e60'; c.fillRect(-18,-22,35,18); c.fillStyle='#303833'; c.fillRect(-5,-33,17,15); c.fillStyle='#8d876d'; c.fillRect(0,-31,10,7); c.fillStyle='#171c1b'; [-12,11].forEach(x=>{c.beginPath();c.arc(x,-4,4,0,TAU);c.fill();}); break;
      case 'pow': if (!o.alive) break; c.fillStyle='#b9a582'; c.beginPath(); c.arc(0,-11,4,0,TAU); c.fill(); c.fillStyle='#696b5d'; c.fillRect(-4,-8,8,10); break;
      case 'extraction':
        c.fillStyle='rgba(93,201,125,.17)'; c.beginPath(); c.ellipse(0,0,24,10,0,0,TAU);c.fill();
        c.fillStyle='#72d185'; c.fillRect(-1,-55,2,54); c.fillStyle='#8de79b'; c.beginPath(); c.moveTo(0,-54); c.lineTo(18,-48); c.lineTo(0,-42); c.closePath();c.fill(); break;
      case 'dinghy': diamond(26,12,'#625443'); c.fillStyle='#a18d67'; c.beginPath();c.ellipse(0,-5,17,6,0,0,TAU);c.fill(); break;
      case 'wreck': c.fillStyle='#49463a'; c.save();c.rotate(-.25);c.fillRect(-18,-10,36,13);c.fillStyle='#a07947';c.fillRect(-12,-14,8,5);c.restore();break;
      case 'sign': c.fillStyle='#6d5638';c.fillRect(-1,-23,2,23);c.fillStyle='#ad9a70';c.fillRect(-13,-24,26,10);c.fillStyle='#30291e';c.font='5px sans-serif';c.textAlign='center';c.fillText('CHECKPOINT',0,-17);break;
      case 'sandbags': for(let i=0;i<3;i++){c.fillStyle=i%2?'#8b8061':'#9a8d68';c.beginPath();c.ellipse((i-1)*7,-3-Math.abs(i-1)*2,7,4,0,0,TAU);c.fill();}break;
      case 'crate': c.fillStyle='#70583a';c.fillRect(-8,-16,16,16);c.strokeStyle='#b0925c';c.strokeRect(-8,-16,16,16);c.beginPath();c.moveTo(-7,-15);c.lineTo(7,-1);c.moveTo(7,-15);c.lineTo(-7,-1);c.stroke();break;
      case 'barrel': c.fillStyle='#645d48';c.fillRect(-6,-17,12,16);c.fillStyle='#9b8a63';c.fillRect(-6,-14,12,2);c.fillRect(-6,-5,12,2);break;
      case 'tent': c.fillStyle='#595843';c.beginPath();c.moveTo(-20,0);c.lineTo(0,-23*o.size);c.lineTo(20,0);c.closePath();c.fill();c.strokeStyle='#96906b';c.stroke();break;
      case 'lamp': c.strokeStyle='#36372f';c.lineWidth=2;c.beginPath();c.moveTo(0,0);c.lineTo(0,-26);c.stroke();c.fillStyle='rgba(255,186,99,.8)';c.beginPath();c.arc(0,-27,3,0,TAU);c.fill();break;
      case 'rock': c.fillStyle='#565248';c.beginPath();c.ellipse(0,-3,8*o.size,5*o.size,0,Math.PI,TAU);c.fill();break;
    }
    c.restore();
  }
  drawEffect(fx, time) {
    const c=this.ctx,p=iso(fx.x,fx.y), age=this.time-fx.born; c.save();c.translate(p.x,p.y);
    if(fx.type==='grenade') { c.strokeStyle='#f0bd62';c.lineWidth=2;c.beginPath();c.arc(0,-4,7+Math.sin(time*12)*2,0,TAU);c.stroke(); }
    else { const r=18+age*95;c.globalAlpha=Math.max(0,1-age/1.3);c.fillStyle='#f4a54d';c.beginPath();c.ellipse(0,-10,r,r*.48,0,0,TAU);c.fill();c.fillStyle='#ffdc8c';c.beginPath();c.ellipse(0,-10,r*.48,r*.25,0,0,TAU);c.fill(); }
    c.restore();
  }
  drawMinimap() {
    const c=this.mctx, w=this.mini.width, h=this.mini.height, sx=w/MAP_W, sy=h/MAP_H;
    c.clearRect(0,0,w,h); c.fillStyle='#15211e';c.fillRect(0,0,w,h);
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++) {
      const t=this.world.get(x,y); c.fillStyle=t===T.WATER?'#193844':t===T.SAND?'#786b4f':t===T.ROAD?'#76664b':t===T.CONCRETE?'#62645a':t===T.ROCK?'#484840':t===T.TREE?'#293a2a':t===T.BUSH?'#35432e':'#42503a';
      c.fillRect(x*sx,y*sy,sx+.3,sy+.3);
    }
    c.fillStyle='rgba(13,17,15,.72)'; for(const b of this.world.buildings)c.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);
    c.fillStyle='#c9a763';for(const g of this.guards)if(g.alive)c.fillRect(g.x*sx-1,g.y*sy-1,2.4,2.4);
    c.fillStyle='#c9e2a4';for(const u of this.units)if(u.alive){c.beginPath();c.arc(u.x*sx,u.y*sy,2.2,0,TAU);c.fill();}
    const topLeft=this.screenToWorld(0,0), bottomRight=this.screenToWorld(this.size.w,this.size.h);
    const pts=[[topLeft.x,topLeft.y],[bottomRight.x,bottomRight.y]];
    // Camera footprint on the minimap, approximated by inverse-projected viewport corners.
    const corners=[[0,0],[this.size.w,0],[this.size.w,this.size.h],[0,this.size.h]].map(([x,y])=>this.screenToWorld(x,y));
    c.strokeStyle='rgba(224,211,162,.7)';c.lineWidth=1;c.beginPath();corners.forEach((p,i)=>{const mx=(p.x-p.y)*.5+MAP_W/2,my=(p.x+p.y)*.5+MAP_H/2;if(!i)c.moveTo(mx*sx,my*sy);else c.lineTo(mx*sx,my*sy);});c.closePath();c.stroke();
    void pts;
  }
  keyDown(e) {
    const k=e.key.toLowerCase();
    if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
    if(k==='escape') { if(!document.getElementById('helpScreen').classList.contains('hidden'))this.closeHelp();else if(this.state==='playing')this.pause();else if(this.state==='paused')this.resume(); return; }
    if(this.state!=='playing') { if(k==='h')this.openHelp(); return; }
    if(this.keys.has(k))return; this.keys.add(k);
    if(k>='1'&&k<='3')this.selectUnit(Number(k)-1);
    else if(k==='0')this.selectSquad();
    else if(k==='q')this.toggleCrouch();
    else if(k==='f')this.knife();
    else if(k==='g')this.armGrenade();
    else if(k==='e')this.use();
    else if(k==='m')this.toggleSound();
    else if(k==='h')this.openHelp();
    else if(k===' ')this.pause();
  }
}

const game = new Game();

