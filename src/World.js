import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getZoneAt, hashSeed, ChunkRNG } from './noise.js';

// GLSL world background shader
const WORLD_VERT = `
varying vec2 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WORLD_FRAG = `
uniform float uTime;
varying vec2 vWorldPos;

// ──────── Value Noise ────────
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1,0));
  float c = hash(i + vec2(0,1));
  float d = hash(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5, mx = 0.0, f = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += a * vnoise(p * f); mx += a; a *= 0.5; f *= 2.0;
  }
  return v / mx;
}
// ──────── Caustics ────────
float caustic(vec2 uv) {
  float c = 0.0;
  c += sin(uv.x * 3.7 + uTime * 1.1) * sin(uv.y * 2.9 + uTime * 0.8);
  c += sin(uv.x * 5.1 - uTime * 0.7) * sin(uv.y * 4.3 + uTime * 1.3);
  c = c * 0.25 + 0.5;
  return c;
}
void main() {
  vec2 wp = vWorldPos;
  float sc = 0.001;

  // Zone fields
  float temp = fbm(wp * sc,              5);
  float pres = fbm(wp * sc * 0.8 + 100.0, 5);
  float rad  = fbm(wp * sc * 1.5 + 200.0, 4);
  float acid = fbm(wp * sc * 2.0 + 300.0, 4);

  // Depth: worldPos.y (Three.js top-down: we use world Z, stored in x of vWorldPos.y)
  // Actually vWorldPos = worldPos.xz
  float depth = vWorldPos.y; // world-Z is "depth" in top-down (we map Y of world to depth)
  float depthFactor = clamp((depth + 1500.0) / 3000.0, 0.0, 1.0); // 0=deep, 1=shallow

  // Base color: deep dark → shallow cyan
  vec3 deepColor    = vec3(0.01, 0.02, 0.10);
  vec3 shallowColor = vec3(0.05, 0.25, 0.55);
  vec3 col = mix(deepColor, shallowColor, depthFactor);

  // Temperature tint (deep vents: orange-red, neutral: none)
  float highTemp = max(0.0, temp - 0.65) * 3.0;
  col += vec3(0.5, 0.15, 0.0) * highTemp * (1.0 - depthFactor);

  // Radiation / sunlight tint (surface: bright blue-white)
  float radSurface = rad * depthFactor;
  col += vec3(0.1, 0.2, 0.4) * radSurface * 0.6;
  // Bright shafts near surface
  float shafts = fbm(wp * sc * 3.0 + uTime * 0.03, 3);
  col += vec3(0.05, 0.15, 0.3) * shafts * depthFactor * 0.8;

  // Acidity: green tint
  col += vec3(0.0, 0.25, 0.05) * acid * 0.35;

  // Caustic light effect (more visible near surface)
  float caust = caustic(wp * 0.04 + uTime * 0.015);
  col += vec3(0.03, 0.08, 0.15) * caust * depthFactor * 1.2;

  // Bioluminescence in deep zones
  float bio = fbm(wp * sc * 8.0 + uTime * 0.05, 4);
  bio = max(0.0, bio - 0.55) * 3.0;
  col += vec3(0.0, 0.15, 0.6) * bio * (1.0 - depthFactor) * 0.5;

  // Subtle animated micro-ripple
  float ripple = sin(wp.x * 0.08 + uTime * 0.4) * sin(wp.y * 0.07 + uTime * 0.3) * 0.012;
  col += ripple;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();          // key -> { mesh, foods, npcs, createdAt }
    this.backgroundMesh = null;
    this.uTime = { value: 0 };
    this._createBackground();
    this._createCausticOverlay();
  }

  _createBackground() {
    const size = 20000;
    const geo = new THREE.PlaneGeometry(size, size, 4, 4);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      vertexShader: WORLD_VERT,
      fragmentShader: WORLD_FRAG,
      side: THREE.DoubleSide,
    });

    this.backgroundMesh = new THREE.Mesh(geo, mat);
    this.backgroundMesh.position.set(0, -0.5, 0);
    this.backgroundMesh.receiveShadow = false;
    this.scene.add(this.backgroundMesh);
  }

  _createCausticOverlay() {
    // Extra large flat mesh slightly above background for caustic glow
    const geo = new THREE.PlaneGeometry(20000, 20000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.causticOverlay = new THREE.Mesh(geo, mat);
    this.causticOverlay.position.set(0, -0.3, 0);
    this.scene.add(this.causticOverlay);
  }

  update(dt, playerX, playerZ) {
    this.uTime.value += dt;
    // Follow player so shader is always relative to player area
    this.backgroundMesh.position.set(playerX, -0.5, playerZ);
  }

  // Evaluate zone at a given world position
  getZone(worldX, worldZ) {
    return getZoneAt(worldX, worldZ);
  }

  // Get chunk key
  _chunkKey(cx, cz) { return `${cx},${cz}`; }

  // Convert world pos to chunk coords
  _worldToChunk(wx, wz) {
    return {
      cx: Math.floor(wx / CONFIG.CHUNK_SIZE),
      cz: Math.floor(wz / CONFIG.CHUNK_SIZE),
    };
  }

  // Returns list of chunk coords needed around player
  getRequiredChunks(playerX, playerZ) {
    const { cx, cz } = this._worldToChunk(playerX, playerZ);
    const r = CONFIG.CHUNK_LOAD_RADIUS;
    const required = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        required.push({ cx: cx + dx, cz: cz + dz });
      }
    }
    return required;
  }

  isChunkLoaded(cx, cz) {
    return this.chunks.has(this._chunkKey(cx, cz));
  }

  createChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    const chunk = {
      cx, cz,
      key,
      worldX: cx * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE / 2,
      worldZ: cz * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE / 2,
      loaded: true,
      age: 0,
    };
    this.chunks.set(key, chunk);
    return chunk;
  }

  removeChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    this.chunks.delete(key);
  }

  // Chunks beyond unload radius (distance in chunk units)
  getStaleChunks(playerX, playerZ) {
    const { cx: pcx, cz: pcz } = this._worldToChunk(playerX, playerZ);
    const stale = [];
    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.cx - pcx);
      const dz = Math.abs(chunk.cz - pcz);
      if (dx > CONFIG.CHUNK_UNLOAD_RADIUS || dz > CONFIG.CHUNK_UNLOAD_RADIUS) {
        stale.push(chunk);
      }
    }
    return stale;
  }
}
