import * as THREE from 'three';
import { CONFIG } from './config.js';
import { ChunkRNG, getZoneAt } from './noise.js';

// Shared geometries for food
const _foodGeos = {
  vegetal:    new THREE.SphereGeometry(1, 8, 6),
  iron:       new THREE.OctahedronGeometry(1, 0),
  sulfur:     new THREE.TetrahedronGeometry(1, 0),
  radiation:  new THREE.SphereGeometry(1, 6, 4),
  decomposed: new THREE.SphereGeometry(1, 6, 4),
  animal:     new THREE.SphereGeometry(1, 8, 6),
};

let _fid = 0;

export class FoodItem {
  constructor(type, worldX, worldZ) {
    this.id = _fid++;
    this.type = type;
    this.x = worldX;
    this.z = worldZ;
    this.age = 0;
    this.maxAge = type === 'decomposed' ? CONFIG.FOOD_DECOMPOSE_TIME : Infinity;
    this.alive = true;
    this.mesh = null;

    const cfg = CONFIG.FOOD[type];
    this.dnaValue    = cfg.dna;
    this.energyValue = cfg.energy;
    this.radius      = cfg.radius;
  }
}

export class FoodManager {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();   // id -> FoodItem
    this._animTime = 0;
    this._spawnedChunks = new Set();
  }

  spawnChunkFood(chunk) {
    const key = chunk.key;
    if (this._spawnedChunks.has(key)) return;
    this._spawnedChunks.add(key);

    const rng = new ChunkRNG(Math.abs(chunk.cx * 73856093 ^ chunk.cz * 19349663));
    const zone = getZoneAt(chunk.worldX, chunk.worldZ);

    const attempts = Math.floor(rng.range(2, CONFIG.MAX_FOOD_PER_CHUNK));

    for (let i = 0; i < attempts; i++) {
      const wx = chunk.cx * CONFIG.CHUNK_SIZE + rng.range(10, CONFIG.CHUNK_SIZE - 10);
      const wz = chunk.cz * CONFIG.CHUNK_SIZE + rng.range(10, CONFIG.CHUNK_SIZE - 10);

      let type = null;

      // Determine food type based on zone
      const r = rng.next();
      if (zone.temperature > 7 && zone.pressure > 6) {
        type = r < 0.5 ? 'iron' : 'sulfur';
      } else if (zone.radiation > 7) {
        type = r < 0.6 ? 'radiation' : 'vegetal';
      } else if (zone.radiation > 3 && zone.temperature > 2 && zone.temperature < 8) {
        type = r < 0.7 ? 'vegetal' : 'decomposed';
      } else {
        type = r < 0.5 ? 'vegetal' : (r < 0.75 ? 'decomposed' : 'radiation');
      }

      this.spawnFood(type, wx, wz);
    }
  }

  spawnFood(type, wx, wz) {
    const item = new FoodItem(type, wx, wz);
    item.mesh = this._buildMesh(item);
    this.scene.add(item.mesh);
    this.items.set(item.id, item);
    return item;
  }

  // Spawn decomposing body
  spawnCorpse(wx, wz) {
    return this.spawnFood('decomposed', wx, wz);
  }

  _buildMesh(item) {
    const cfg = CONFIG.FOOD[item.type];
    const geo = _foodGeos[item.type] || _foodGeos.vegetal;
    const mat = new THREE.MeshPhongMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: item.type === 'radiation' ? 0.8 : 0.3,
      transparent: true,
      opacity: item.type === 'radiation' ? 0.75 : 0.9,
      shininess: 60,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(item.radius);
    mesh.position.set(item.x, 0, item.z);
    mesh.userData.foodId = item.id;

    // Glow ring for radiation food
    if (item.type === 'radiation') {
      const ringGeo = new THREE.RingGeometry(item.radius * 1.1, item.radius * 1.6, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xaaff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      mesh.add(ring);
    }

    return mesh;
  }

  collectItem(itemId) {
    const item = this.items.get(itemId);
    if (!item || !item.alive) return null;
    item.alive = false;
    this.scene.remove(item.mesh);
    this.items.delete(itemId);
    return item;
  }

  update(dt) {
    this._animTime += dt;
    const t = this._animTime;

    for (const [id, item] of this.items) {
      item.age += dt;

      // Decomposed items age out
      if (item.age > item.maxAge) {
        item.alive = false;
        this.scene.remove(item.mesh);
        this.items.delete(id);
        continue;
      }

      // Animate food items
      if (item.mesh) {
        item.mesh.position.y = Math.sin(t * 1.5 + item.id * 0.7) * 1.5;
        item.mesh.rotation.y += dt * (item.type === 'radiation' ? 1.5 : 0.5);

        // Pulse emissive for radiation food
        if (item.type === 'radiation') {
          const mat = item.mesh.material;
          mat.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.3;
        }

        // Fade decomposed near end of life
        if (item.type === 'decomposed') {
          const mat = item.mesh.material;
          const lifeLeft = 1 - item.age / item.maxAge;
          mat.opacity = Math.min(0.9, lifeLeft * 3);
        }
      }
    }
  }

  // Find closest edible food within range
  findNearestEdible(x, z, canEatFn, range = CONFIG.FOOD_EAT_RANGE) {
    let best = null;
    let bestDist = range;
    for (const item of this.items.values()) {
      if (!item.alive) continue;
      if (!canEatFn(item.type)) continue;
      const dx = item.x - x;
      const dz = item.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    return best;
  }

  // Find all food within range (for NPC AI)
  findAllInRange(x, z, range, typesAllowed = null) {
    const results = [];
    for (const item of this.items.values()) {
      if (!item.alive) continue;
      if (typesAllowed && !typesAllowed.includes(item.type)) continue;
      const dx = item.x - x;
      const dz = item.z - z;
      if (Math.sqrt(dx * dx + dz * dz) <= range) results.push(item);
    }
    return results;
  }

  removeChunkFood(chunkKey) {
    this._spawnedChunks.delete(chunkKey);
    for (const [id, item] of this.items) {
      // Check if item is in this chunk
      const cx = Math.floor(item.x / CONFIG.CHUNK_SIZE);
      const cz = Math.floor(item.z / CONFIG.CHUNK_SIZE);
      if (`${cx},${cz}` === chunkKey) {
        this.scene.remove(item.mesh);
        this.items.delete(id);
      }
    }
  }
}
