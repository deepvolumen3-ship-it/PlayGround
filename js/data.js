// Static game data: needs, traits, furniture definitions and interactions.

export const NEEDS = [
  { key: 'hunger', label: 'Hunger', icon: '🍔', color: '#f2a541', decay: 11 },
  { key: 'energy', label: 'Energy', icon: '⚡', color: '#f4d35e', decay: 8 },
  { key: 'bladder', label: 'Bladder', icon: '🚽', color: '#8ecae6', decay: 13 },
  { key: 'hygiene', label: 'Hygiene', icon: '🫧', color: '#6ec6b8', decay: 7 },
  { key: 'fun', label: 'Fun', icon: '🎈', color: '#ec7fa9', decay: 9 },
  { key: 'social', label: 'Social', icon: '💬', color: '#b48be8', decay: 6 },
  { key: 'comfort', label: 'Comfort', icon: '🛋️', color: '#e8a87c', decay: 4 },
  { key: 'room', label: 'Room', icon: '🌿', color: '#9ccc65', decay: 0 },
];

export const NEED_MAP = Object.fromEntries(NEEDS.map(n => [n.key, n]));

export const TRAITS = [
  { id: 'cheerful', name: 'Cheerful', icon: '😄', desc: 'Fun drains 35% slower. Starts extra happy.' },
  { id: 'neat', name: 'Neat', icon: '🧹', desc: 'Hygiene drains 40% slower. Loves a tidy room.' },
  { id: 'social', name: 'Social Butterfly', icon: '🦋', desc: 'Social drains 45% slower. Calls friends often.' },
  { id: 'lazy', name: 'Lazy', icon: '😴', desc: 'Energy drains 30% slower. Naps are bliss.' },
  { id: 'ambitious', name: 'Ambitious', icon: '💼', desc: 'Freelance gigs pay 40% more. Fun drains faster.' },
];

export const SKIN_TONES = ['#f6d2b3', '#eab48b', '#d09466', '#a86f49', '#7a4c31', '#5a3522'];
export const HAIR_COLORS = ['#2b1d17', '#5a3a22', '#9b6435', '#d8a740', '#bab3a6', '#c2503d', '#7d4fa8'];
export const SHIRT_COLORS = ['#ef6f6c', '#f3b23f', '#45b39d', '#5a8fe0', '#a06cd5', '#e56ba8', '#f2eadf', '#334155'];

const seatA = { x: -0.5, z: 0.05, y: 0.05, rot: 0 };
const seatB = { x: 0.5, z: 0.05, y: 0.05, rot: 0 };

export const OBJECTS = {
  fridge: {
    name: 'Fridge', icon: '🧊', size: [0.98, 0.82], height: 1.9, price: 780, decor: 5,
    desc: 'Cold storage. Snacks and full meals live here.',
    interactions: [
      { id: 'snack', label: 'Grab a snack', icon: '🍎', duration: 16, needs: { hunger: 30, fun: 2 }, cost: 4, pose: 'eat', anim: 'eat',
        toast: 'Quick snack. Deliciously average.' },
      { id: 'meal', label: 'Make a meal', icon: '🥪', duration: 40, needs: { hunger: 68, fun: 5 }, cost: 13, pose: 'eat', anim: 'eat',
        toast: 'A proper fridge raid.' },
    ],
  },
  counter: {
    name: 'Counter', icon: '🧱', size: [1.2, 0.7], height: 0.93, price: 180, decor: 2,
    desc: 'Counter space for days.',
    interactions: [{ id: 'lean', label: 'Lean & ponder', icon: '💭', duration: 10, needs: { fun: 4 }, pose: 'stand' }],
  },
  counterSink: {
    name: 'Kitchen Sink', icon: '🚰', size: [1.2, 0.7], height: 0.93, price: 240, decor: 3,
    desc: 'Splash some water on your face.',
    interactions: [
      { id: 'wash', label: 'Wash up', icon: '💧', duration: 8, needs: { hygiene: 16, fun: 2 }, pose: 'sink', anim: 'brush' },
      { id: 'drink', label: 'Get water', icon: '🥛', duration: 6, needs: { energy: 6, fun: 3 }, pose: 'eat', anim: 'eat' },
    ],
  },
  counterStove: {
    name: 'Stove', icon: '🍳', size: [1.2, 0.7], height: 0.93, price: 420, decor: 3,
    desc: 'Home cooking restores more hunger than snacks.',
    interactions: [
      { id: 'cook', label: 'Cook a meal', icon: '🍝', duration: 45, needs: { hunger: 78, fun: 10 }, cost: 9, pose: 'stand', anim: 'cook',
        toast: 'You made a beautiful, slightly burnt meal.' },
      { id: 'coffee', label: 'Brew coffee', icon: '☕', duration: 9, needs: { energy: 20, fun: 3 }, cost: 4, pose: 'eat', anim: 'eat' },
    ],
  },
  table: {
    name: 'Dining Table', icon: '🍽️', size: [1.55, 2.0], height: 0.8, price: 460, decor: 6,
    desc: 'A proper place to eat. Meals here are extra cozy.',
    interactions: [
      { id: 'dine', label: 'Dine at the table', icon: '🍴', duration: 38, needs: { hunger: 58, fun: 8, comfort: 8 }, cost: 7,
        pose: 'sit', anim: 'eat', use: { x: 0, z: 0.78, y: 0.02, rot: 180 }, approach: { x: 0, z: 1.5 },
        toast: 'Dinner for one. Still counts as fine dining.' },
    ],
  },
  sofa: {
    name: 'Sofa', icon: '🛋️', size: [2.0, 0.95], height: 0.95, price: 640, decor: 7,
    desc: 'Sit, nap, or binge the TV.',
    interactions: [
      { id: 'sit', label: 'Take a seat', icon: '🪑', duration: 22, needs: { comfort: 32, fun: 5 }, pose: 'sit', anim: 'idle',
        use: seatA, approach: { x: seatA.x, z: 1.02 } },
      { id: 'watch', label: 'Watch TV', icon: '📺', duration: 60, needs: { fun: 42, comfort: 24, social: 2 }, pose: 'sit', anim: 'watch',
        use: seatB, approach: { x: seatB.x, z: 1.02 }, requires: 'tv', state: { on: true }, toast: 'Six episodes later...' },
      { id: 'nap', label: 'Sofa nap', icon: '😴', duration: 90, needs: { energy: 38, comfort: 22 }, pose: 'nap', anim: 'sleep',
        use: seatB, approach: { x: seatB.x, z: 1.02 } },
    ],
  },
  tv: {
    name: 'Television', icon: '📺', size: [1.7, 0.5], height: 1.45, price: 720, decor: 8,
    desc: 'The glowing altar of the living room.',
    interactions: [
      { id: 'watch', label: 'Watch TV', icon: '🍿', duration: 60, needs: { fun: 44, comfort: 20, social: 2 }, pose: 'watch',
        seatFrom: 'sofa', approach: { x: 0, z: 1.35 }, state: { on: true }, toast: 'The plots never make sense, but who cares?' },
      { id: 'toggle', label: 'Switch on/off', icon: '🔌', duration: 2, needs: { fun: 2 }, pose: 'stand', toggleOn: true },
    ],
  },
  bed: {
    name: 'Bed', icon: '🛏️', size: [1.7, 2.15], height: 0.95, price: 860, decor: 8,
    desc: 'Sleep until your energy is full.',
    interactions: [
      { id: 'sleep', label: 'Sleep', icon: '🌙', duration: 520, needs: { energy: 100, comfort: 35 }, pose: 'lie', anim: 'sleep',
        use: { x: 0, z: 0.52, y: 0.42, rot: 0, lie: true }, approach: { x: 0, z: 1.4 }, autoFull: 'energy',
        toast: 'Rested and ready.' },
      { id: 'nap', label: 'Power nap', icon: '😴', duration: 120, needs: { energy: 48, comfort: 12 }, pose: 'lie', anim: 'sleep',
        use: { x: 0, z: 0.52, y: 0.42, rot: 0, lie: true }, approach: { x: 0, z: 1.4 } },
    ],
  },
  toilet: {
    name: 'Toilet', icon: '🚽', size: [0.8, 0.88], height: 0.85, price: 390, decor: 2,
    desc: 'When you gotta go.',
    interactions: [
      { id: 'use', label: 'Use toilet', icon: '💦', duration: 18, needs: { bladder: 100, hygiene: 6 }, pose: 'toilet', anim: 'idle',
        use: { x: 0, z: 0.14, y: 0.02, rot: 0 }, approach: { x: 0, z: 1.02 }, toast: 'Much better.' },
    ],
  },
  shower: {
    name: 'Shower', icon: '🚿', size: [1.1, 1.15], height: 2.15, price: 560, decor: 4,
    desc: 'Hot water fixes almost everything.',
    interactions: [
      { id: 'shower', label: 'Take a shower', icon: '🫧', duration: 32, needs: { hygiene: 90, comfort: 14, fun: 8 }, pose: 'shower', anim: 'shower',
        use: { x: 0, z: 0.06, y: 0, rot: 0 }, approach: { x: 0, z: 1.05 }, state: { on: true }, toast: 'Squeaky clean.' },
    ],
  },
  bathSink: {
    name: 'Vanity', icon: '🪞', size: [1.0, 0.6], height: 1.9, price: 320, decor: 5,
    desc: 'Brush, splash, and check your hair.',
    interactions: [
      { id: 'teeth', label: 'Brush teeth', icon: '🪥', duration: 9, needs: { hygiene: 20 }, pose: 'sink', anim: 'brush' },
      { id: 'freshen', label: 'Freshen up', icon: '✨', duration: 7, needs: { hygiene: 9, fun: 7, social: 2 }, pose: 'sink', anim: 'admire' },
    ],
  },
  deskComputer: {
    name: 'Computer Desk', icon: '💻', size: [1.7, 1.0], height: 1.55, price: 940, decor: 7,
    desc: 'Freelance gigs pay the bills. Browsing is free.',
    interactions: [
      { id: 'work', label: 'Freelance gig', icon: '💼', duration: 90, needs: { energy: -12, fun: -8, comfort: -4 }, income: 70,
        pose: 'type', anim: 'type', use: { x: 0, z: 0.9, y: 0.02, rot: 180 }, approach: { x: 0, z: 1.6 },
        state: { on: true }, toast: 'Gig delivered. Money in the bank!' },
      { id: 'browse', label: 'Browse the web', icon: '🌐', duration: 40, needs: { fun: 34, energy: -3 }, pose: 'type', anim: 'type',
        use: { x: 0, z: 0.9, y: 0.02, rot: 180 }, approach: { x: 0, z: 1.6 }, state: { on: true } },
      { id: 'chat', label: 'Chat online', icon: '💬', duration: 32, needs: { social: 38, fun: 12 }, pose: 'type', anim: 'type',
        use: { x: 0, z: 0.9, y: 0.02, rot: 180 }, approach: { x: 0, z: 1.6 }, state: { on: true } },
    ],
  },
  bookshelf: {
    name: 'Bookshelf', icon: '📚', size: [1.3, 0.45], height: 2.05, price: 350, decor: 6,
    desc: 'A room always feels smarter with books.',
    interactions: [
      { id: 'read', label: 'Read a book', icon: '📖', duration: 45, needs: { fun: 38, room: 3 }, pose: 'read', anim: 'read',
        approach: { x: 0, z: 0.9 }, toast: 'You read three pages and remembered none of them.' },
      { id: 'browse', label: 'Browse spines', icon: '🔎', duration: 9, needs: { fun: 10 }, pose: 'read', approach: { x: 0, z: 0.9 } },
    ],
  },
  phone: {
    name: 'Wall Phone', icon: '☎️', size: [0.3, 0.45], height: 0.5, price: 120, decor: 3, wall: true,
    desc: 'Call a friend. Or order a pizza like a legend.',
    interactions: [
      { id: 'call', label: 'Call a friend', icon: '📞', duration: 26, needs: { social: 44, fun: 10 }, pose: 'call', anim: 'call',
        approach: { x: 0, z: 1.0 }, toast: 'You talked for ages about absolutely nothing.' },
      { id: 'pizza', label: 'Order pizza', icon: '🍕', duration: 12, needs: { hunger: 52, fun: 12 }, cost: 22, pose: 'call', anim: 'call',
        approach: { x: 0, z: 1.0 }, toast: 'Pizza delivered! You demolished it standing up.' },
    ],
  },
  armchair: {
    name: 'Armchair', icon: '🪑', size: [1.1, 1.0], height: 1.0, price: 330, decor: 5,
    desc: 'A throne for one.',
    interactions: [
      { id: 'sit', label: 'Sit & unwind', icon: '☁️', duration: 25, needs: { comfort: 30, fun: 7 }, pose: 'sit', anim: 'idle',
        use: { x: 0, z: 0.08, y: 0.02, rot: 0 }, approach: { x: 0, z: 1.0 } },
      { id: 'read', label: 'Read a book', icon: '📖', duration: 40, needs: { fun: 28, comfort: 15 }, pose: 'sit', anim: 'read',
        use: { x: 0, z: 0.08, y: 0.02, rot: 0 }, approach: { x: 0, z: 1.0 } },
    ],
  },
  coffeeTable: {
    name: 'Coffee Table', icon: '🫖', size: [1.35, 0.72], height: 0.48, price: 200, decor: 4,
    desc: 'Books, a candle, and questionable coasters.',
    interactions: [{ id: 'admire', label: 'Admire the clutter', icon: '✨', duration: 7, needs: { fun: 6, room: 2 }, pose: 'stand' }],
  },
  nightstand: {
    name: 'Nightstand', icon: '🕯️', size: [0.58, 0.5], height: 0.6, price: 160, decor: 4,
    desc: 'Drawer full of mystery cables.',
    interactions: [{ id: 'organize', label: 'Organize drawer', icon: '🧦', duration: 12, needs: { room: 5, fun: 4 }, pose: 'stand' }],
  },
  dresser: {
    name: 'Dresser', icon: '🗄️', size: [1.6, 0.55], height: 0.9, price: 280, decor: 4,
    desc: 'Somewhere to put the clothes you never fold.',
    interactions: [{ id: 'organize', label: 'Fold clothes', icon: '👕', duration: 14, needs: { room: 6, fun: 3 }, pose: 'stand', anim: 'brush' }],
  },
  lamp: {
    name: 'Floor Lamp', icon: '🪔', size: [0.42, 0.42], height: 1.7, price: 95, decor: 5,
    desc: 'Warm light for cozy evenings. Auto-switches on at dusk.',
    interactions: [{ id: 'admire', label: 'Basque in the glow', icon: '💡', duration: 6, needs: { fun: 5, room: 2 }, pose: 'stand' }],
  },
  plant: {
    name: 'Potted Plant', icon: '🪴', size: [0.55, 0.55], height: 1.2, price: 60, decor: 4,
    desc: 'A little green friend. Mostly self-sufficient.',
    interactions: [{ id: 'water', label: 'Water the plant', icon: '💧', duration: 8, needs: { fun: 7, room: 3 }, pose: 'stand', anim: 'admire' }],
  },
  rug: {
    name: 'Rug', icon: '🟧', size: [2.6, 1.9], height: 0.02, price: 140, decor: 6, walkable: true,
    desc: 'Ties the room together. Zero walking obstruction.',
    interactions: [{ id: 'admire', label: 'Admire the rug', icon: '✨', duration: 5, needs: { fun: 4, room: 3 }, pose: 'stand' }],
  },
  painting: {
    name: 'Wall Art', icon: '🖼️', size: [0.9, 0.2], height: 1.5, price: 170, decor: 7, wall: true,
    desc: 'Abstract. Deeply meaningful. Probably.',
    interactions: [{ id: 'admire', label: 'Contemplate art', icon: '🧐', duration: 8, needs: { fun: 6, room: 3 }, pose: 'stand', anim: 'admire' }],
  },
};

// Local-space seats offered by stools / dining chairs.
export const CATALOG = [
  'armchair', 'lamp', 'plant', 'bookshelf', 'rug', 'painting', 'coffeeTable',
  'nightstand', 'dresser', 'table', 'sofa', 'tv', 'deskComputer', 'bed',
  'toilet', 'shower', 'bathSink', 'fridge', 'counterStove', 'counter', 'counterSink', 'phone',
];

export const START_OBJECTS = [
  { type: 'fridge', x: -5.0, z: -3.92, rot: 0 },
  { type: 'counterSink', x: -3.78, z: -4.02, rot: 0 },
  { type: 'counterStove', x: -2.53, z: -4.02, rot: 0 },
  { type: 'counter', x: -1.28, z: -4.02, rot: 0 },
  { type: 'table', x: -2.55, z: -1.75, rot: 0 },
  { type: 'phone', x: -5.4, z: -0.55, rot: 90 },
  { type: 'deskComputer', x: -4.68, z: 2.45, rot: 90 },
  { type: 'sofa', x: 1.0, z: 2.38, rot: 180 },
  { type: 'tv', x: 1.0, z: -3.98, rot: 0 },
  { type: 'coffeeTable', x: 1.0, z: 0.3, rot: 0 },
  { type: 'rug', x: 1.0, z: 1.25, rot: 0 },
  { type: 'armchair', x: -2.9, z: 1.5, rot: 90 },
  { type: 'bookshelf', x: 3.1, z: -3.92, rot: 0 },
  { type: 'bed', x: 4.2, z: 2.15, rot: 270 },
  { type: 'nightstand', x: 4.78, z: 0.3, rot: 270 },
  { type: 'toilet', x: 4.86, z: -3.88, rot: 0 },
  { type: 'shower', x: 4.74, z: -2.45, rot: 0 },
  { type: 'bathSink', x: 4.9, z: -0.98, rot: 270 },
  { type: 'plant', x: -5.02, z: 4.02, rot: 0 },
  { type: 'lamp', x: 2.55, z: -3.86, rot: 0 },
  { type: 'painting', x: -5.36, z: -1.9, rot: 90 },
  { type: 'dresser', x: -2.2, z: 4.12, rot: 180 },
];

export const ROOM_ZONES = [
  { id: 'kitchen', name: 'Kitchen', x: -3.6, z: -2.6, r: 2.6, floor: '#d9c6a5' },
  { id: 'living', name: 'Living Room', x: 1.0, z: 0.9, r: 3.1, floor: '#c9a97f' },
  { id: 'bath', name: 'Bathroom', x: 4.7, z: -2.4, r: 2.5, floor: '#cfe3e4' },
  { id: 'bedroom', name: 'Bedroom', x: 4.1, z: 2.3, r: 2.4, floor: '#d8c1b2' },
  { id: 'study', name: 'Study', x: -4.5, z: 2.6, r: 2.4, floor: '#cdb28c' },
];

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
