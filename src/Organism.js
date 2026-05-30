import * as THREE from 'three';
import { CONFIG } from './config.js';
import { DNA } from './Genetics.js';

let _oidCounter = 0;

export class Organism {
  constructor(scene, renderer, world, x = 0, z = 0) {
    this.id = _oidCounter++;
    this.scene = scene;
    this.renderer = renderer;  // OrganismRenderer
    this.world = world;

    // Position in world space
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.angle = 0;  // facing direction (radians)

    // Stats
    this.health = CONFIG.PLAYER_BASE_HEALTH;
    this.maxHealth = CONFIG.PLAYER_BASE_HEALTH;
    this.energy = CONFIG.PLAYER_BASE_ENERGY;
    this.maxEnergy = CONFIG.PLAYER_BASE_ENERGY;

    // DNA / genetics
    this.dna = new DNA();

    // Visual
    this.mesh = null;
    this.isDead = false;
    this.deathTimer = 0;

    // Combat
    this.attackCooldown = 0;
    this.poisonTimer = 0;
    this.poisonDPS = 0;
    this.isBeingAttacked = false;
    this.attackTimer = 0;

    // Zone cache
    this._zoneCache = null;
    this._zoneCacheTimer = 0;
  }

  get radius() {
    return CONFIG.PLAYER_BASE_RADIUS * this.dna.getSizeMultiplier();
  }

  get speed() {
    return CONFIG.PLAYER_BASE_SPEED * this.dna.getSpeedMultiplier();
  }

  // Build the Three.js mesh
  spawn() {
    this.mesh = this.renderer.buildMesh(this.dna, this.radius, this.z);
    this.mesh.position.set(this.x, 0, this.z);
    this.scene.add(this.mesh);
  }

  despawn() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }

  // Get zone at current position (cached every 0.5s)
  getZone() {
    this._zoneCacheTimer -= 1;
    if (this._zoneCacheTimer <= 0 || !this._zoneCache) {
      this._zoneCache = this.world.getZone(this.x, this.z);
      this._zoneCacheTimer = 30; // refresh every 30 frames
    }
    return this._zoneCache;
  }

  takeDamage(amount) {
    const defense = this.dna.getDefenseMultiplier();
    const actual = amount / defense;
    this.health = Math.max(0, this.health - actual);
    if (this.mesh) this.renderer.flashDamage(this.mesh);
    if (this.health <= 0 && !this.isDead) this._onDeath();
    return actual;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  restoreEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  drainEnergy(amount) {
    this.energy = Math.max(0, this.energy - amount);
    if (this.energy <= 0) {
      // No energy → health degrades
      this.health = Math.max(0, this.health - amount * 0.5);
      if (this.health <= 0 && !this.isDead) this._onDeath();
    }
  }

  _onDeath() {
    this.isDead = true;
    this.deathTimer = 5.0; // stays as corpse for 5s
  }

  distanceTo(other) {
    return Math.sqrt((this.x - other.x) ** 2 + (this.z - other.z) ** 2);
  }

  distanceToPoint(wx, wz) {
    return Math.sqrt((this.x - wx) ** 2 + (this.z - wz) ** 2);
  }

  moveTo(targetX, targetZ, dt) {
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) return;
    const spd = this.speed;
    this.vx = (dx / dist) * spd;
    this.vz = (dz / dist) * spd;
    this.angle = Math.atan2(dx, dz);
  }

  updatePosition(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.mesh) {
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.angle;
      this.renderer.animateOrganism(this.mesh, dt, Math.sqrt(this.vx**2 + this.vz**2) / this.speed);
    }
  }

  // Environmental damage per frame
  updateEnvironmental(dt) {
    const zone = this.getZone();
    const dmg = this.dna.computeEnvironmentalDamage(zone);
    if (dmg > 0) this.drainEnergy(dmg * dt);
  }

  // Passive energy recovery from zone matching diet
  updatePassiveEnergy(dt) {
    const zone = this.getZone();

    // Photosynthetic: recover energy in high-radiation zones
    if (this.dna.genes.has('photosynthetic') && zone.radiation > 6) {
      const rate = (zone.radiation - 6) * 3;
      this.restoreEnergy(rate * dt);
    }

    // Chemosynthetic passive absorption near chemical vents
    if (this.dna.genes.has('chemosynthetic') && zone.temperature > 7 && zone.pressure > 6) {
      this.restoreEnergy(2 * dt);
    }

    // Slow energy regen when health is full
    if (this.health >= this.maxHealth * 0.9 && this.energy > 30) {
      this.heal(CONFIG.PLAYER_HEALTH_REGEN * dt * 0.5);
    }
  }

  update(dt) {
    if (this.isDead) {
      this.deathTimer -= dt;
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Poison
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.drainEnergy(this.poisonDPS * dt);
    }

    this.updateEnvironmental(dt);
    this.updatePassiveEnergy(dt);
    this.updatePosition(dt);
  }
}
