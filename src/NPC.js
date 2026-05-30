import * as THREE from 'three';
import { CONFIG, GENE_DEFS } from './config.js';
import { Organism } from './Organism.js';
import { DNA, generateNPCGenes } from './Genetics.js';

const STATES = { WANDERING: 0, HUNTING: 1, FLEEING: 2, MATING: 3, EATING: 4 };

let _speciesCounter = 1;

// Profile definitions for different NPC species
const NPC_PROFILES = [
  { name: 'herbivore_cilia',  profile: ['herbivore'],           threat: false, baseSpeedMult: 0.9 },
  { name: 'decomposer_pod',   profile: ['decomposer'],          threat: false, baseSpeedMult: 0.7 },
  { name: 'carnivore_spiny',  profile: ['carnivore'],           threat: true,  baseSpeedMult: 1.1 },
  { name: 'carnivore_fast',   profile: ['carnivore'],           threat: true,  baseSpeedMult: 1.1 },
  { name: 'chemosynthetic',   profile: ['chemosynthetic'],      threat: false, baseSpeedMult: 0.6 },
  { name: 'photosynthetic',   profile: ['photosynthetic'],      threat: false, baseSpeedMult: 0.8 },
];

export class NPC extends Organism {
  constructor(scene, renderer, world, foodManager, profileName, speciesId, x, z) {
    super(scene, renderer, world, x, z);

    this.foodManager = foodManager;
    this.profileName = profileName;

    const profileDef = NPC_PROFILES.find(p => p.name === profileName) || NPC_PROFILES[0];
    this.profile = profileDef;
    this.speciesId = speciesId;
    this.isThreat = profileDef.threat;
    this.baseSpeedMult = profileDef.baseSpeedMult;

    // Generate NPC genes
    this.dna = new DNA();
    const genes = generateNPCGenes(profileDef.profile);
    genes.forEach(g => this.dna.genes.add(g));
    this.dna.totalCollected = 50 + Math.random() * 200; // random size

    // AI state
    this.state = STATES.WANDERING;
    this.target = null;          // world position {x, z} or organism
    this.wanderTarget = { x, z };
    this.stateTimer = 0;
    this.lastSeenTarget = 0;
    this.mateCooldown = 0;

    // Wander
    this._wanderAngle = Math.random() * Math.PI * 2;
    this._wanderTimer = 0;

    // Size multiplier for "big predator" fear
    this.sizeMult = 1 + Math.random() * 0.8;
    this.dna.totalCollected *= this.sizeMult;
  }

  get speed() {
    return CONFIG.NPC_BASE_SPEED * this.dna.getSpeedMultiplier() * this.baseSpeedMult;
  }

  update(dt, player) {
    if (this.isDead) {
      this.deathTimer -= dt;
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.mateCooldown   = Math.max(0, this.mateCooldown - dt);
    this.stateTimer     += dt;

    // Environmental damage
    this.updateEnvironmental(dt);
    this.updatePassiveEnergy(dt);

    // AI decision
    this._runAI(dt, player);
    this.updatePosition(dt);

    // Energy decay
    const moving = Math.abs(this.vx) + Math.abs(this.vz) > 1;
    this.drainEnergy((moving ? CONFIG.PLAYER_ENERGY_DECAY * 0.5 : CONFIG.PLAYER_ENERGY_IDLE * 0.2) * dt);
  }

  _runAI(dt, player) {
    const distToPlayer = this.distanceTo(player);

    switch (this.state) {
      case STATES.WANDERING:
        this._doWander(dt);
        // Check threats: predators bigger than me
        if (!player.isDead) {
          if (this.isThreat && distToPlayer < CONFIG.NPC_DETECTION_RADIUS &&
              player.radius < this.radius * 0.8 && player.health > 0) {
            this.state = STATES.HUNTING;
            this.target = player;
            this.stateTimer = 0;
          } else if (!this.isThreat && distToPlayer < 200 && player.radius > this.radius * 1.3) {
            // Flee from player if player is carnivore and bigger
            if (player.dna.genes.has('carnivore')) {
              this.state = STATES.FLEEING;
              this.target = player;
              this.stateTimer = 0;
            }
          }
        }
        // Check for food
        if (this.energy < 60) {
          const eatTypes = [...this.dna.genes].flatMap(g => GENE_DEFS[g]?.canEat || []);
          if (eatTypes.length > 0) {
            const food = this.foodManager.findNearestEdible(this.x, this.z, t => eatTypes.includes(t), 250);
            if (food) { this.state = STATES.EATING; this.target = food; this.stateTimer = 0; }
          }
        }
        // Mating with player (same species)
        if (this.speciesId === CONFIG.PLAYER_SPECIES_ID && this.mateCooldown <= 0 &&
            distToPlayer < CONFIG.MATE_RANGE * 2 && !player.isDead) {
          this.state = STATES.MATING;
          this.target = player;
          this.stateTimer = 0;
        }
        break;

      case STATES.HUNTING:
        if (!this.target || this.target.isDead || this.distanceTo(this.target) > CONFIG.NPC_ABANDON_CHASE) {
          this.state = STATES.WANDERING;
          break;
        }
        this.moveTo(this.target.x, this.target.z, dt);
        // Attack on contact
        if (this.distanceTo(this.target) < this.radius + this.target.radius + 4) {
          this._attack(this.target, dt);
        }
        break;

      case STATES.FLEEING: {
        if (!this.target || this.distanceTo(this.target) > CONFIG.NPC_FLEE_RANGE) {
          this.state = STATES.WANDERING;
          break;
        }
        // Run away from threat
        const dx = this.x - this.target.x;
        const dz = this.z - this.target.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;
        this.angle = Math.atan2(dx, dz);
        break;
      }

      case STATES.EATING: {
        if (!this.target || !this.target.alive) { this.state = STATES.WANDERING; break; }
        const distFood = Math.sqrt((this.x - this.target.x)**2 + (this.z - this.target.z)**2);
        if (distFood < this.radius + this.target.radius + 2) {
          const eaten = this.foodManager.collectItem(this.target.id);
          if (eaten) {
            this.restoreEnergy(eaten.energyValue);
            this.dna.addPoints(eaten.dnaValue * 0.5);
          }
          this.state = STATES.WANDERING;
        } else {
          this.moveTo(this.target.x, this.target.z, dt);
        }
        break;
      }

      case STATES.MATING:
        if (!this.target || this.target.isDead || this.distanceTo(this.target) > CONFIG.MATE_RANGE * 3) {
          this.state = STATES.WANDERING;
          break;
        }
        this.moveTo(this.target.x, this.target.z, dt);
        if (this.stateTimer > 3) {
          this.mateCooldown = CONFIG.MATE_COOLDOWN;
          this.state = STATES.WANDERING;
        }
        break;
    }
  }

  _doWander(dt) {
    this._wanderTimer -= dt;
    if (this._wanderTimer <= 0) {
      this._wanderAngle += (Math.random() - 0.5) * 1.8;
      this._wanderTimer = 1 + Math.random() * 3;
      const dist = 80 + Math.random() * 120;
      this.wanderTarget = {
        x: this.x + Math.cos(this._wanderAngle) * dist,
        z: this.z + Math.sin(this._wanderAngle) * dist,
      };
    }
    const dx = this.wanderTarget.x - this.x;
    const dz = this.wanderTarget.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 5) return;
    const spd = this.speed * 0.5;
    this.vx = (dx / dist) * spd;
    this.vz = (dz / dist) * spd;
    this.angle = Math.atan2(dx, dz);
  }

  _attack(target, dt) {
    if (this.attackCooldown > 0) return;
    this.attackCooldown = CONFIG.PLAYER_ATTACK_COOLDOWN;

    const base = CONFIG.PLAYER_ATTACK_DAMAGE;
    const dmg = base * this.dna.getAttackBonus() * (this.sizeMult * 0.5 + 0.5);
    const actual = target.takeDamage(dmg);

    // Spine reflection
    if (target.dna.genes.has('spines')) {
      this.takeDamage(GENE_DEFS.spines.reflectDamage);
    }
    // Chemical defense poison
    if (target.dna.genes.has('chemical_defense') && Math.random() < GENE_DEFS.chemical_defense.poisonChance) {
      this.poisonTimer    = GENE_DEFS.chemical_defense.poisonDuration;
      this.poisonDPS      = GENE_DEFS.chemical_defense.poisonDPS;
    }
  }

  isAlly(speciesId) {
    return this.speciesId === speciesId;
  }
}

export class NPCManager {
  constructor(scene, renderer, world, foodManager) {
    this.scene = scene;
    this.renderer = renderer;
    this.world = world;
    this.foodManager = foodManager;
    this.npcs = [];
    this._spawnedChunks = new Set();

    // Species pool: each chunk can have species variants
    this._predatorSpecies = [];
    for (let i = 0; i < 5; i++) {
      this._predatorSpecies.push(`predator_${i}_${Math.random().toString(36).slice(2,6)}`);
    }
  }

  spawnChunkNPCs(chunk) {
    const key = chunk.key;
    if (this._spawnedChunks.has(key)) return;
    this._spawnedChunks.add(key);

    const rng = { s: Math.abs(chunk.cx * 12345 + chunk.cz * 67891) };
    const rand = () => { rng.s = (rng.s * 1664525 + 1013904223) & 0xffffffff; return (rng.s >>> 0) / 0xffffffff; };

    const zone = this.world.getZone(chunk.worldX, chunk.worldZ);

    // Allies (same species as player)
    const allyCount = Math.floor(rand() * 3);
    for (let i = 0; i < allyCount; i++) {
      const x = chunk.cx * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      const z = chunk.cz * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      this.spawnNPC('herbivore_cilia', CONFIG.PLAYER_SPECIES_ID, x, z);
    }

    // Predators (based on biome danger)
    const danger = (zone.temperature > 7 || zone.pressure > 7 || zone.radiation > 7) ? 2 : 1;
    const predCount = Math.floor(rand() * danger * 0.6);
    for (let i = 0; i < predCount; i++) {
      const x = chunk.cx * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      const z = chunk.cz * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      const speciesId = this._predatorSpecies[Math.floor(rand() * this._predatorSpecies.length)];
      const profile = rand() > 0.5 ? 'carnivore_spiny' : 'carnivore_fast';
      this.spawnNPC(profile, speciesId, x, z);
    }

    // Neutral feeders
    const neutralCount = Math.floor(rand() * 3);
    for (let i = 0; i < neutralCount; i++) {
      const x = chunk.cx * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      const z = chunk.cz * CONFIG.CHUNK_SIZE + rand() * CONFIG.CHUNK_SIZE;
      let profile = 'herbivore_cilia';
      if (zone.temperature > 7 && zone.pressure > 6) profile = 'chemosynthetic';
      else if (zone.radiation > 7) profile = 'photosynthetic';
      const speciesId = `neutral_${Math.floor(rand() * 3)}`;
      this.spawnNPC(profile, speciesId, x, z);
    }
  }

  spawnNPC(profileName, speciesId, x, z) {
    const npc = new NPC(this.scene, this.renderer, this.world, this.foodManager, profileName, speciesId, x, z);
    npc.spawn();
    this.npcs.push(npc);
    return npc;
  }

  // Spawn a predator off-screen relative to player
  spawnPredatorOffscreen(playerX, playerZ) {
    const angle = Math.random() * Math.PI * 2;
    const dist = CONFIG.NPC_SPAWN_EDGE_DISTANCE;
    const x = playerX + Math.cos(angle) * dist;
    const z = playerZ + Math.sin(angle) * dist;
    const speciesId = this._predatorSpecies[Math.floor(Math.random() * this._predatorSpecies.length)];
    return this.spawnNPC('carnivore_fast', speciesId, x, z);
  }

  update(dt, player) {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      npc.update(dt, player);

      // Remove dead organisms (after death timer)
      if (npc.isDead && npc.deathTimer <= 0) {
        // Leave a corpse
        this.foodManager.spawnCorpse(npc.x, npc.z);
        npc.despawn();
        this.npcs.splice(i, 1);
      }
    }
  }

  removeChunkNPCs(chunkKey) {
    this._spawnedChunks.delete(chunkKey);
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      const cx = Math.floor(npc.x / CONFIG.CHUNK_SIZE);
      const cz = Math.floor(npc.z / CONFIG.CHUNK_SIZE);
      if (`${cx},${cz}` === chunkKey) {
        npc.despawn();
        this.npcs.splice(i, 1);
      }
    }
  }

  // Find nearest ally (same species) within range
  findNearestAlly(x, z, speciesId, range) {
    let best = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (npc.speciesId !== speciesId) continue;
      if (npc.isDead) continue;
      const d = Math.sqrt((npc.x - x)**2 + (npc.z - z)**2);
      if (d < bestDist) { bestDist = d; best = npc; }
    }
    return best;
  }

  // Find nearest threat within range
  findNearestThreat(x, z, playerRadius, range) {
    let best = null;
    let bestDist = range;
    for (const npc of this.npcs) {
      if (!npc.isThreat) continue;
      if (npc.isDead) continue;
      if (npc.radius < playerRadius) continue; // not threatening if smaller
      const d = Math.sqrt((npc.x - x)**2 + (npc.z - z)**2);
      if (d < bestDist) { bestDist = d; best = npc; }
    }
    return best;
  }

  getAll() { return this.npcs; }
}
