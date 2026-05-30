// Simplex-like noise implementation for JS (CPU-side zone computation)

const perm = new Uint8Array(512);
const grad = [
  [1,1],[-1,1],[1,-1],[-1,-1],
  [1,0],[-1,0],[0,1],[0,-1],
];

// Initialize permutation table
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

function dot2(g, x, y) { return g[0] * x + g[1] * y; }

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

export function noise2D(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[X] + Y];
  const ab = perm[perm[X] + Y + 1];
  const ba = perm[perm[X + 1] + Y];
  const bb = perm[perm[X + 1] + Y + 1];

  return lerp(
    lerp(dot2(grad[aa & 7], xf,     yf    ), dot2(grad[ba & 7], xf - 1, yf    ), u),
    lerp(dot2(grad[ab & 7], xf,     yf - 1), dot2(grad[bb & 7], xf - 1, yf - 1), u),
    v
  );
}

// Fractal Brownian Motion — returns [0, 1]
export function fbm(x, y, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return (value / maxValue) * 0.5 + 0.5; // normalize to [0,1]
}

// Returns zone values (0-10) for a world position
// Each parameter uses different noise offsets so they're independent
export function getZoneAt(worldX, worldY) {
  const scale = 0.0008; // big biomes

  const temperature = fbm(worldX * scale,          worldY * scale,          5) * 10;
  const pressure    = fbm(worldX * scale * 0.8 + 100, worldY * scale * 0.8 + 50, 5) * 10;
  const radiation   = fbm(worldX * scale * 1.5 + 200, worldY * scale * 1.5 + 150, 4) * 10;
  const acidity     = fbm(worldX * scale * 2.0 + 300, worldY * scale * 2.0 + 250, 4) * 10;

  // Apply depth correlation: deeper (lower Y) = higher pressure, less radiation
  const depthBias = Math.max(-1, Math.min(1, -worldY / 1500));
  const pressureAdjusted  = Math.max(0, Math.min(10, pressure  + depthBias * 2.5));
  const radiationAdjusted = Math.max(0, Math.min(10, radiation - depthBias * 2.0));
  const temperatureAdjusted = Math.max(0, Math.min(10,
    // Hot at surface (solar) AND at deep vents
    temperature + (pressureAdjusted > 7 ? (pressureAdjusted - 7) * 1.5 : 0)
  ));

  return {
    temperature: temperatureAdjusted,
    pressure:    pressureAdjusted,
    radiation:   radiationAdjusted,
    acidity:     acidity,
  };
}

// Seeded hash for deterministic chunk spawning
export function hashSeed(a, b) {
  let h = (a * 1619 + b * 31337) ^ (a ^ b);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h >>> 0) / 0xffffffff; // [0, 1)
}

// Simple seeded RNG for chunk generation
export class ChunkRNG {
  constructor(seed) { this.s = (seed * 9301 + 49297) % 233280; }
  next() {
    this.s = (this.s * 9301 + 49297) % 233280;
    return this.s / 233280;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max)   { return Math.floor(this.range(min, max + 1)); }
}
