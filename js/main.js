
import * as THREE from '../vendor/three.module.js';
import { NEEDS, OBJECTS, CATALOG, START_OBJECTS, ROOM_ZONES, DAY_NAMES, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS } from './data.js';
import { NavGrid, BOUNDS, rotPoint, rectsOverlap } from './pathing.js';

const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe8df');
scene.fog = new THREE.Fog('#dfe8df', 26, 55);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight('#fff8e9', '#82938a', 2.2));
const sun = new THREE.DirectionalLight('#fff2d6', 2.4);
sun.position.set(-7, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const material = (color, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material('#dce8df'));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.13;
ground.receiveShadow = true;
scene.add(ground);
const home = new THREE.Group();
scene.add(home);
function addBox(parent, color, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
addBox(home, '#e9ddc9', 11, 0.16, 9, 0, -0.045, 0);
for (const zone of ROOM_ZONES) {
  const size = zone.id === 'living' ? [5.8, 4.3] : [4.5, 3.6];
  const rug = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.018, size[1]), material(zone.floor));
  rug.position.set(zone.x, 0.045, zone.z);
  rug.receiveShadow = true;
  home.add(rug);
}
// Dollhouse walls leave the front open for easy tapping and viewing.
addBox(home, '#f5ecdc', 11, 0.82, 0.16, 0, 0.39, -4.55);
addBox(home, '#f5ecdc', 0.16, 0.82, 9, 5.55, 0.39, 0);
addBox(home, '#f5ecdc', 0.16, 0.82, 9, -5.55, 0.39, 0);
addBox(home, '#f3eadb', 0.11, 0.38, 3.8, 2.1, 0.19, -2.62);
addBox(home, '#f3eadb', 2.4, 0.38, 0.11, 4.28, 0.19, -0.65);
addBox(home, '#f3eadb', 0.11, 0.38, 3, -1.15, 0.19, 2.95);

const nav = new NavGrid();
let placed = [];
let objects = [];
let money = 1250;
let simX = -0.15, simZ = 0.72;
let moving = false, walkPath = [], walkPhase = 0, lastFrame = performance.now();
let elapsed = 0, gameMinutes = 8 * 60, speed = 1, paused = true;
let task = null, placing = null, placingRot = 0, preview = null;
const simName = 'Milo';
const sim = new THREE.Group();
sim.position.set(simX, 0, simZ);
scene.add(sim);
const skinMat = material(SKIN_TONES[1]);
const bodyMat = material(SHIRT_COLORS[0]);
const hairMat = material(HAIR_COLORS[0]);
function orb(parent, radius, mat, x, y, z, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
orb(sim, 0.25, bodyMat, 0, 0.62, 0, [0.82, 1.08, 0.72]);
orb(sim, 0.22, skinMat, 0, 1.02, 0, [0.92, 1, 0.92]);
orb(sim, 0.22, hairMat, 0, 1.13, -0.02, [0.98, 0.56, 0.98]);
for (const x of [-0.08, 0.08]) {
  orb(sim, 0.033, material('#fff'), x, 1.03, 0.195);
  orb(sim, 0.014, material('#38312e'), x, 1.03, 0.224);
}
const legs = [], arms = [];
for (const x of [-0.105, 0.105]) {
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.25, 3, 8), bodyMat);
  leg.position.set(x, 0.28, 0); leg.castShadow = true; sim.add(leg); legs.push(leg);
}
for (const x of [-0.25, 0.25]) {
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.25, 3, 8), skinMat);
  arm.position.set(x, 0.65, 0); arm.castShadow = true; sim.add(arm); arms.push(arm);
}
function makeFurniture(type, x, z, rot = 0) {
  const def = OBJECTS[type];
  const g = new THREE.Group();
  g.position.set(x, 0.03, z);
  g.rotation.y = -rot * Math.PI / 180;
  const [w, d] = def.size;
  const wood = '#b9855c', accent = ({ sofa: '#699c89', bed: '#d89891', armchair: '#7197ae', tv: '#384449' })[type] || '#c79569';
  if (type === 'rug') {
    addBox(g, '#cf8e73', w, 0.025, d, 0, 0.02, 0);
    addBox(g, '#edc69f', w * 0.84, 0.03, d * 0.78, 0, 0.04, 0);
  } else if (type === 'plant') {
    addBox(g, '#b66f4d', 0.38, 0.36, 0.38, 0, 0.19, 0);
    orb(g, 0.35, material('#57936a'), 0, 0.68, 0, [0.82, 1.2, 0.82]);
    for (let i = 0; i < 4; i++) orb(g, 0.18, material(i % 2 ? '#6da678' : '#4e855f'), Math.sin(i * 1.5) * 0.22, 0.72 + Math.cos(i * 1.5) * 0.2, Math.cos(i * 1.5) * 0.22, [0.8, 1.2, 0.8]);
  } else if (type === 'lamp') {
    addBox(g, '#8e735a', 0.1, 0.82, 0.1, 0, 0.42, 0);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.32, 16), material('#f6d88c'));
    shade.position.y = 0.96; g.add(shade);
  } else if (type === 'bed') {
    addBox(g, wood, w, 0.3, d, 0, 0.18, 0);
    addBox(g, accent, w * 0.95, 0.18, d * 0.7, 0, 0.4, 0.13);
    addBox(g, '#fff5e9', w * 0.9, 0.12, d * 0.3, 0, 0.5, -d * 0.25);
    addBox(g, '#fff', 0.43, 0.12, 0.34, 0, 0.54, -d * 0.28);
  } else if (type === 'sofa' || type === 'armchair') {
    addBox(g, accent, w, 0.28, d, 0, 0.3, 0);
    addBox(g, accent, w, 0.62, 0.2, 0, 0.61, -d / 2 + 0.08);
    for (const sx of (type === 'sofa' ? [-0.42, 0.42] : [-0.43, 0.43])) addBox(g, accent, 0.17, 0.46, d, sx, 0.5, 0);
    for (const sx of [-0.55, 0.55]) addBox(g, wood, 0.13, 0.18, 0.13, sx, 0.09, d * 0.28);
  } else if (type === 'table' || type === 'coffeeTable' || type === 'nightstand' || type === 'dresser') {
    const top = type === 'coffeeTable' ? 0.4 : type === 'nightstand' ? 0.6 : type === 'dresser' ? 0.9 : 0.8;
    addBox(g, wood, w, 0.13, d, 0, top, 0);
    const legH = top - 0.08;
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.38, 0.38]) addBox(g, '#916747', 0.1, legH, 0.1, sx * w, legH / 2, sz * d);
    if (type === 'table') for (const sx of [-0.65, 0.65]) addBox(g, '#e7d4be', 0.38, 0.05, 0.38, sx, 0.48, d * 0.64);
  } else if (type === 'deskComputer') {
    addBox(g, wood, w, 0.12, 0.68, 0, 0.76, 0);
    for (const sx of [-0.68, 0.68]) addBox(g, '#8f694c', 0.1, 0.72, 0.1, sx, 0.36, 0);
    addBox(g, '#344b55', 0.53, 0.39, 0.09, 0, 1.03, -0.15);
    addBox(g, '#a8d7dc', 0.43, 0.28, 0.018, 0, 1.04, -0.095);
    addBox(g, '#ece8df', 0.58, 0.025, 0.22, 0, 0.85, 0.16);
  } else if (type === 'bookshelf' || type === 'fridge' || type === 'tv' || type === 'toilet' || type === 'shower' || type === 'bathSink' || type === 'phone' || type === 'painting' || type.startsWith('counter')) {
    const h = def.height || 0.8;
    const baseColor = type === 'fridge' || type === 'toilet' || type === 'shower' || type === 'bathSink' ? '#f0f0e9' : wood;
    addBox(g, baseColor, w, h, d, 0, h / 2, 0);
    if (type === 'fridge') addBox(g, '#d1d8d5', 0.045, 1.15, 0.05, w * 0.35, 0.7, d / 2 + 0.03);
    if (type === 'tv') { addBox(g, '#83bdc3', w * 0.88, 0.68, 0.025, 0, 1.02, d / 2 + 0.02); addBox(g, wood, 0.12, 0.35, 0.12, 0, 0.48, 0); }
    if (type === 'bookshelf') for (let y = 0.4; y < h; y += 0.48) {
      addBox(g, '#745844', w, 0.05, d + 0.02, 0, y, 0);
      for (let i = 0; i < 6; i++) addBox(g, ['#dd9875', '#d7bd75', '#789c83', '#758fb1'][i % 4], 0.13, 0.34, 0.12, -w * 0.38 + i * 0.15, y + 0.19, 0);
    }
    if (type.startsWith('counter')) {
      addBox(g, '#f5f2eb', w + 0.04, 0.12, d + 0.04, 0, h + 0.06, 0);
      if (type === 'counterStove') for (const sx of [-0.3, 0.3]) for (const sz of [-0.16, 0.16]) {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 16), material('#41464a'));
        burner.position.set(sx, h + 0.13, sz); g.add(burner);
      }
    }
    if (type === 'painting') addBox(g, '#8fb4b0', w * 0.78, 0.5, 0.025, 0, 0.8, d / 2 + 0.05);
    if (type === 'phone') addBox(g, '#e7b866', w, h, 0.08, 0, h / 2, 0);
    if (type === 'toilet') addBox(g, '#fff', 0.45, 0.5, 0.13, 0, 0.52, -d * 0.22);
    if (type === 'bathSink') { addBox(g, '#fff', w + 0.05, 0.1, d + 0.08, 0, 0.82, 0); addBox(g, '#d6e5e3', 0.45, 0.08, 0.36, 0, 0.9, 0); }
  } else {
    addBox(g, wood, w, def.height || 0.8, d, 0, (def.height || 0.8) / 2, 0);
  }
  const footprint = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.001, depthWrite: false }));
  footprint.position.y = 0.035;
  g.add(footprint);
  home.add(g);
  const obj = { type, def, x, z, rot, state: {}, group: g };
  g.userData.object = obj;
  g.traverse(child => { child.userData.object = obj; });
  objects.push(obj);
  return obj;
}
for (const item of START_OBJECTS) makeFurniture(item.type, item.x, item.z, item.rot);
nav.rebuild(objects);
const needs = Object.fromEntries(NEEDS.map(n => [n.key, 82]));
needs.room = 80;

function positionCamera() {
  const aspect = innerWidth / innerHeight;
  const distance = (aspect < 0.82 ? 39 : 25) * zoom;
  camera.position.set(target.x + distance * 0.53, distance * 0.72, target.z + distance * 0.72);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
const target = new THREE.Vector3();
let zoom = 1;
positionCamera();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let press = null, pinchStart = 0, dragMoved = false;
function pointerWorld(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  raycaster.setFromCamera(pointer, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, p) ? { x: p.x, z: p.z } : null;
}
function onPointerDown(e) {
  if (e.pointerType === 'touch' && e.isPrimary === false) return;
  canvas.setPointerCapture?.(e.pointerId);
  press = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, id: e.pointerId };
  dragMoved = false;
}
function onPointerMove(e) {
  if (placing) {
    const p = pointerWorld(e);
    if (p && preview) {
      preview.position.set(p.x, 0.015, p.z);
      const valid = validPlacement(placing, p.x, p.z, placingRot);
      preview.userData.foot.material.color.set(valid ? '#83bf91' : '#df7770');
      preview.children[1].material.color.set(valid ? '#4e9e71' : '#bd5047');
    }
    return;
  }
  if (!press) return;
  const dx = e.clientX - press.lastX, dy = e.clientY - press.lastY;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) dragMoved = true;
  if (dragMoved) {
    const distance = camera.position.distanceTo(target);
    const scale = distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight * 0.72;
    target.x -= dx * scale;
    target.z += dy * scale;
    positionCamera();
  }
  press.lastX = e.clientX; press.lastY = e.clientY;
}
function onPointerUp(e) {
  if (!press) return;
  const moved = dragMoved;
  press = null;
  if (moved) return;
  const p = pointerWorld(e);
  if (!p) return;
  if (placing) { placeObject(p.x, p.z); return; }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(home.children, true);
  let hitObj = null;
  for (const hit of hits) {
    let node = hit.object;
    while (node && node !== home) {
      if (node.userData?.object) { hitObj = node.userData.object; break; }
      node = node.parent;
    }
    if (hitObj) break;
  }
  if (hitObj) { showObject(hitObj); return; }
  closeAction();
  if (task) { toast('Milo is busy right now.'); return; }
  const cell = nav.worldToCell(p.x, p.z);
  const nearest = nav.nearestFree(cell.i, cell.j, 8, { x: simX, z: simZ });
  const destination = nearest && nav.cellCenter(nearest.i, nearest.j);
  const path = destination && nav.findPath({ x: simX, z: simZ }, destination);
  if (path) { walkPath = path; moving = true; task = null; setStatus('Taking a little stroll'); }
  else toast('That spot is just out of reach.');
}

function addSimNeeds() {
  document.querySelector('#needs').innerHTML = NEEDS.map(n => `<div class="need-row" title="${n.label}"><span>${n.icon}</span><div class="need-track"><i id="need-${n.key}" style="width:82%;background:${n.color}"></i></div></div>`).join('');
}
addSimNeeds();
function toast(msg) {
  const el = document.querySelector('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}
function setStatus(text) { document.querySelector('#statusLabel span:last-child').textContent = text; }
function closeAction() { document.querySelector('#actionPanel').classList.add('hidden'); }
function showObject(obj) {
  if (task) { toast('Milo is busy right now.'); return; }
  const def = obj.def;
  document.querySelector('#objectKind').textContent = obj.type === 'plant' ? 'A LITTLE GREEN FRIEND' : 'AT HOME';
  document.querySelector('#objectName').textContent = def.name;
  document.querySelector('#objectDesc').textContent = def.desc;
  const actions = document.querySelector('#actions');
  actions.innerHTML = def.interactions.map((a, i) => `<button class="action-btn" data-action="${i}"><span>${a.icon}</span><b>${a.label}</b><small>${a.duration} min</small></button>`).join('');
  actions.querySelectorAll('button').forEach((button, i) => button.onclick = () => beginAction(obj, def.interactions[i]));
  document.querySelector('#actionPanel').classList.remove('hidden');
}
function beginAction(obj, action) {
  if (action.cost && money < action.cost) { toast('Not quite enough Simoleons for that.'); return; }
  if (action.requires && !objects.some(o => o.type === action.requires)) { toast('You need a TV for that.'); return; }
  closeAction();
  const local = action.approach || { x: 0, z: Math.max(obj.def.size[0], obj.def.size[1]) * 0.7 };
  const offset = rotPoint(local.x, local.z, obj.rot);
  const destination = { x: obj.x + offset.x, z: obj.z + offset.z };
  const path = nav.findPath({ x: simX, z: simZ }, destination);
  if (!path) { toast('Milo cannot reach that just now.'); return; }
  walkPath = path; moving = true;
  task = { obj, action, phase: 'walking', progress: 0, destination };
  setStatus(action.label);
}
function startWorking() {
  if (!task) return;
  task.phase = 'working'; task.progress = 0;
  const use = task.action.use || { x: 0, z: 0, rot: 0 };
  const offset = rotPoint(use.x || 0, use.z || 0, task.obj.rot);
  simX = task.obj.x + offset.x; simZ = task.obj.z + offset.z;
  sim.position.set(simX, use.y || 0, simZ);
  sim.rotation.y = -(task.obj.rot + (use.rot || 0)) * Math.PI / 180;
  setStatus(task.action.label + '…');
}
function finishTask() {
  const t = task;
  if (!t) return;
  for (const [key, value] of Object.entries(t.action.needs || {})) needs[key] = Math.max(0, Math.min(100, needs[key] + value));
  if (t.action.autoFull) needs[t.action.autoFull] = 100;
  if (t.action.cost) money -= t.action.cost;
  if (t.action.income) money += t.action.income;
  document.querySelector('#moneyLabel').textContent = '§ ' + money.toLocaleString();
  if (t.action.state) Object.assign(t.obj.state, t.action.state);
  toast(t.action.toast || 'A little moment well spent.');
  task = null; setStatus('Home sweet home'); sim.rotation.y = 0;
}
function updateGame(dt) {
  if (paused) return;
  elapsed += dt * speed; gameMinutes += dt * speed * 1.4;
  for (const n of NEEDS) if (n.key !== 'room') needs[n.key] = Math.max(0, needs[n.key] - n.decay * dt * speed / 450);
  const h = Math.floor(gameMinutes / 60) % 24, m = Math.floor(gameMinutes % 60);
  document.querySelector('#timeLabel').textContent = `${String((h + 11) % 12 + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  document.querySelector('#dayLabel').textContent = DAY_NAMES[Math.floor(gameMinutes / 1440) % 7].toUpperCase() + 'DAY';
  for (const n of NEEDS) { const bar = document.querySelector('#need-' + n.key); if (bar) bar.style.width = needs[n.key] + '%'; }
  const mood = Object.values(needs).reduce((a, b) => a + b, 0) / Object.keys(needs).length;
  document.querySelector('#simMood').textContent = mood > 70 ? 'Feeling pretty good' : mood > 40 ? 'Could use a little care' : 'Needs some attention';
  if (task?.phase === 'working') { task.progress += dt * speed * 10; if (task.progress >= task.action.duration) finishTask(); }
  if (needs.room < 75) needs.room = Math.min(100, 68 + objects.reduce((sum, o) => sum + o.def.decor, 0) * 0.05);
}
function finishWalking() {
  moving = false;
  if (task?.phase === 'walking') startWorking();
  else { setStatus('Home sweet home'); sim.rotation.y = 0; }
}
function updateWalker(dt) {
  if (!walkPath.length) { finishWalking(); return; }
  const next = walkPath[0], dx = next.x - simX, dz = next.z - simZ, dist = Math.hypot(dx, dz);
  if (dist < 0.07) { walkPath.shift(); if (!walkPath.length) finishWalking(); return; }
  const step = Math.min(dist, dt * 1.8);
  simX += dx / dist * step; simZ += dz / dist * step;
  sim.position.set(simX, 0.02, simZ); sim.rotation.y = Math.atan2(dx, dz);
  walkPhase += dt * 9; legs[0].rotation.x = Math.sin(walkPhase) * 0.55; legs[1].rotation.x = -Math.sin(walkPhase) * 0.55;
}
function validPlacement(type, x, z, rot = 0) {
  const def = OBJECTS[type];
  const swap = Math.abs(Math.sin(rot * Math.PI / 180)) > 0.5;
  const w = swap ? def.size[1] : def.size[0], d = swap ? def.size[0] : def.size[1];
  if (x < BOUNDS.minX + w / 2 || x > BOUNDS.maxX - w / 2 || z < BOUNDS.minZ + d / 2 || z > BOUNDS.maxZ - d / 2) return false;
  const candidate = { x, z, w, d };
  return objects.every(o => o.def.walkable || def.walkable || !rectsOverlap(candidate, { x: o.x, z: o.z, w: Math.abs(Math.sin(o.rot * Math.PI / 180)) > 0.5 ? o.def.size[1] : o.def.size[0], d: Math.abs(Math.sin(o.rot * Math.PI / 180)) > 0.5 ? o.def.size[0] : o.def.size[1] }));
}
function makeCatalog() {
  const el = document.querySelector('#catalog');
  el.innerHTML = CATALOG.map(type => { const d = OBJECTS[type]; return `<button class="catalog-item" data-type="${type}"><span>${d.icon}</span><b>${d.name}</b><small>§ ${d.price}</small></button>`; }).join('');
  el.querySelectorAll('button').forEach(button => button.onclick = () => beginPlacement(button.dataset.type));
}
function beginPlacement(type) {
  if (money < OBJECTS[type].price) { toast('Not enough Simoleons for that item.'); return; }
  placing = type; placingRot = 0;
  const [w, d] = OBJECTS[type].size;
  preview = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), new THREE.MeshBasicMaterial({ color: '#83bf91', transparent: true, opacity: 0.45 }));
  foot.position.y = 0.03; preview.add(foot);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.035, d)), new THREE.LineBasicMaterial({ color: '#4e9e71' }));
  preview.add(edges); preview.userData.foot = foot; home.add(preview);
  document.querySelector('#buildPanel').classList.add('hidden');
  document.querySelector('#placementBar').classList.remove('hidden');
  toast('Tap an open spot to place it.');
}
function endPlacement() {
  if (preview) { home.remove(preview); preview = null; }
  placing = null; document.querySelector('#placementBar').classList.add('hidden');
}
function placeObject(x, z) {
  if (!validPlacement(placing, x, z, placingRot)) { toast('That spot is already in use.'); return; }
  const type = placing;
  money -= OBJECTS[type].price; makeFurniture(type, x, z, placingRot); nav.rebuild(objects);
  document.querySelector('#moneyLabel').textContent = '§ ' + money.toLocaleString();
  endPlacement(); toast(OBJECTS[type].name + ' added to your home!');
}

// Camera and pointer handlers are defined above; wire them up with the interface controls here.
canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',()=>press=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.68,Math.min(1.65,zoom+(e.deltaY>0?.08:-.08)));positionCamera()},{passive:false});
function buttonsZoom(delta){zoom=Math.max(.68,Math.min(1.65,zoom+delta));positionCamera()}
document.querySelector('#zoomIn').onclick=()=>buttonsZoom(-.09);document.querySelector('#zoomOut').onclick=()=>buttonsZoom(.09);document.querySelector('#homeView').onclick=()=>{target.set(0,0,0);zoom=1;positionCamera()};
// Two-finger pinch on touch devices.
canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){pinchStart=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)}},{passive:true});canvas.addEventListener('touchmove',e=>{if(e.touches.length===2){e.preventDefault();const n=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinchStart){zoom=Math.max(.68,Math.min(1.65,zoom+(pinchStart-n)*.002));positionCamera()}pinchStart=n}},{passive:false});canvas.addEventListener('touchend',()=>pinchStart=0,{passive:true});
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;positionCamera()}addEventListener('resize',resize);resize();
function render(now){const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;updateGame(dt);if(moving)updateWalker(dt);if(task?.phase==='working'){const t=elapsed*5;arms[0].rotation.x=Math.sin(t)*.18;arms[1].rotation.x=Math.cos(t)*.18;sim.position.y=.008+Math.sin(elapsed*8)*.015}else{arms[0].rotation.x=0;arms[1].rotation.x=0;sim.position.y=Math.abs(Math.sin(walkPhase))*.045}renderer.render(scene,camera);requestAnimationFrame(render)}requestAnimationFrame(render);

// HUD actions, catalogue, wishes and onboarding.
document.querySelector('#closePanel').onclick=closeAction;document.querySelector('#buildButton').onclick=()=>{if(placing)return;makeCatalog();document.querySelector('#buildPanel').classList.remove('hidden')};document.querySelector('#closeBuild').onclick=()=>document.querySelector('#buildPanel').classList.add('hidden');document.querySelector('#rotateItem').onclick=()=>{placingRot=(placingRot+90)%360;if(preview){preview.rotation.y=-placingRot*Math.PI/180;const def=OBJECTS[placing],w=def.size[0],d=def.size[1];preview.children[0].geometry.dispose();preview.children[0].geometry=new THREE.BoxGeometry(Math.abs(Math.sin(placingRot*Math.PI/180))>.5?d:w,.025,Math.abs(Math.sin(placingRot*Math.PI/180))>.5?w:d);preview.children[1].geometry.dispose();preview.children[1].geometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.abs(Math.sin(placingRot*Math.PI/180))>.5?d:w,.035,Math.abs(Math.sin(placingRot*Math.PI/180))>.5?w:d))}};document.querySelector('#cancelPlace').onclick=endPlacement;
document.querySelectorAll('.speed').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);paused=false;document.querySelectorAll('.speed').forEach(x=>x.classList.toggle('active',x===b));document.querySelector('#pauseButton').classList.remove('active')});document.querySelector('#pauseButton').onclick=()=>{paused=!paused;document.querySelector('#pauseButton').classList.toggle('active',paused)};
function openModal(title,content){document.querySelector('#modalTitle').textContent=title;document.querySelector('#modalContent').innerHTML=content;document.querySelector('#modal').classList.remove('hidden')}
document.querySelector('#goalsButton').onclick=()=>openModal('Little wishes',`<div class="wish"><span class="wish-icon">🍳</span><div><b>Make a proper meal</b><small>Use the stove to satisfy your hunger.</small></div></div><div class="wish"><span class="wish-icon">💼</span><div><b>Earn your first §70</b><small>Try a freelance gig at the computer desk.</small></div></div><div class="wish"><span class="wish-icon">🪴</span><div><b>Make your home cozier</b><small>Try adding something from Build.</small></div></div><div class="wish"><span class="wish-icon">☀️</span><div><b>Make it to tomorrow</b><small>Keep Milo's needs in the green.</small></div></div>`);document.querySelector('#closeModal').onclick=()=>document.querySelector('#modal').classList.add('hidden');document.querySelector('#modal').onclick=e=>{if(e.target.id==='modal')document.querySelector('#modal').classList.add('hidden')};
document.querySelector('#editSim').onclick=()=>openModal('Meet '+simName,`<div class="wish"><span class="wish-icon">${SKIN_TONES.length>0?'😊':'🙂'}</span><div><b>Cheerful soul</b><small>Fun drains a little slower. Milo loves the small things.</small></div></div><div class="wish"><span class="wish-icon">🏠</span><div><b>First little home</b><small>A cozy starter home with everything for the day.</small></div></div><div class="wish"><span class="wish-icon">✨</span><div><b>Tip</b><small>Tap furniture to see what Milo can do there. Drag to look around.</small></div></div>`);
document.querySelector('#startButton').onclick=()=>{document.querySelector('#startScreen').classList.add('dismiss');paused=false;toast('Welcome home, Milo! Tap something to get started.')};

// Keep the initial camera framing resilient to changes in phone orientation.
positionCamera();
