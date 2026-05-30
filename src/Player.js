import * as THREE from 'three';
import { CONFIG, GENE_DEFS } from './config.js';
import { Organism } from './Organism.js';
import { DNA } from './Genetics.js';

export class Player extends Organism {
  constructor(scene, renderer, world, camera) {
    super(scene, renderer, world, 0, 0);
    this.camera = camera;
    this.speciesId = CONFIG.PLAYER_SPECIES_ID;

    // Initial diet: herbivore
    this.dna.genes.add('herbivore');

    // Input state
    this.keys = {};
    this.mouseWorld = { x: 0, z: 0 };
    this.mouseDown = false;

    // Interaction state
    this.nearestAlly = null;
    this.nearestFood = null;
    this.mating = false;
    this.mateTimer = 0;
    this.mateCooldown = 0;
    this.attackCooldown = 0;

    // Camera smooth follow
    this._camTarget = new THREE.Vector3();

    // Damage/zone overlay
    this.envDamageColor = null;

    // Event callbacks (set by main.js)
    this.onDNAGained = null;
    this.onEvolutionToken = null;
    this.onMating = null;
    this.onDeath = null;
    this.onRespawn = null;

    this._bindInput();
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyW' && this.nearestAlly && !this.mating && this.mateCooldown <= 0) {
        this._startMating();
      }
      if (e.code === 'KeyE') this._tryEat(window._game?.food);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', e => {
      // Convert screen to world position (for attack direction)
      this.mouseWorld = this._screenToWorld(e.clientX, e.clientY);
    });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseDown = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouseDown = false; }
    });
  }

  _screenToWorld(screenX, screenY) {
    const renderer = this.camera.userData.rendererDom;
    if (!renderer) return { x: this.x, z: this.z };
    const rect = renderer.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    ray.ray.intersectPlane(plane, target);
    return { x: target.x, z: target.z };
  }

  update(dt, foodManager, npcManager) {
    if (this.isDead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this._respawn();
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.mateCooldown   = Math.max(0, this.mateCooldown - dt);

    // Mating animation
    if (this.mating) {
      this.mateTimer += dt;
      if (this.mateTimer >= 2.0) this._finishMating(npcManager);
    }

    // Movement input
    this._handleMovement(dt);

    // Attack input
    if (this.mouseDown && !this.mating) this._tryAttack(npcManager, dt);

    // Eat key handled on keydown, but also auto-eat if very close
    this._autoEatCheck(foodManager);

    // Environmental damage
    this.updateEnvironmental(dt);
    this.updatePassiveEnergy(dt);

    // Energy drain from moving
    const moving = Math.abs(this.vx) + Math.abs(this.vz) > 5;
    this.drainEnergy((moving ? CONFIG.PLAYER_ENERGY_DECAY : CONFIG.PLAYER_ENERGY_IDLE) * dt);

    // Health regen with high energy
    if (this.energy > 60) this.heal(CONFIG.PLAYER_HEALTH_REGEN * dt);

    this.updatePosition(dt);

    // Update camera to follow player
    this._updateCamera();

    // Update nearest ally / food (for HUD hints)
    this.nearestAlly = npcManager.findNearestAlly(this.x, this.z, this.speciesId, CONFIG.MATE_RANGE);
    this.nearestFood = foodManager.findNearestEdible(this.x, this.z, t => this.dna.canEat(t), CONFIG.FOOD_EAT_RANGE);

    // Environmental damage color
    this._updateEnvDamageViz();
  }

  _handleMovement(dt) {
    if (this.mating) { this.vx *= 0.8; this.vz *= 0.8; return; }

    let mx = 0, mz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    mz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  mz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  mx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;

    if (mx !== 0 || mz !== 0) {
      const len = Math.sqrt(mx * mx + mz * mz);
      const spd = this.speed;
      this.vx = (mx / len) * spd;
      this.vz = (mz / len) * spd;
      this.angle = Math.atan2(mx, mz);
    } else {
      // Decelerate
      this.vx *= 0.85;
      this.vz *= 0.85;
      if (Math.abs(this.vx) < 0.5) this.vx = 0;
      if (Math.abs(this.vz) < 0.5) this.vz = 0;
    }
  }

  _tryAttack(npcManager, dt) {
    if (this.attackCooldown > 0) return;
    if (!this.dna.genes.has('carnivore') && !this.dna.genes.has('spines') && !this.dna.genes.has('chemical_defense')) return;

    this.attackCooldown = CONFIG.PLAYER_ATTACK_COOLDOWN;

    // Find nearest NPC in attack range (in direction of mouse)
    const range = CONFIG.PLAYER_ATTACK_RANGE + this.radius;
    let best = null;
    let bestDist = range;
    for (const npc of npcManager.getAll()) {
      if (npc.isDead) continue;
      const d = this.distanceTo(npc);
      if (d < bestDist) { bestDist = d; best = npc; }
    }

    if (best) {
      const dmg = CONFIG.PLAYER_ATTACK_DAMAGE * this.dna.getAttackBonus();
      const actual = best.takeDamage(dmg);

      // Chemical defense poison
      if (this.dna.genes.has('chemical_defense') && Math.random() < GENE_DEFS.chemical_defense.poisonChance) {
        best.poisonTimer = GENE_DEFS.chemical_defense.poisonDuration;
        best.poisonDPS   = GENE_DEFS.chemical_defense.poisonDPS;
      }

      // If NPC dies, eat it (if carnivore)
      if (best.isDead && this.dna.genes.has('carnivore')) {
        this.restoreEnergy(CONFIG.FOOD.animal.energy);
        const gotToken = this.dna.addPoints(CONFIG.FOOD.animal.dna);
        if (this.onDNAGained) this.onDNAGained(CONFIG.FOOD.animal.dna);
        if (gotToken && this.onEvolutionToken) this.onEvolutionToken();
      }

      return actual;
    }
    return 0;
  }

  _tryEat(foodManager) {
    // Called from keydown
    this._eatNearestFood(foodManager || window._game?.foodManager);
  }

  _autoEatCheck(foodManager) {
    if (!foodManager) return;
    const food = foodManager.findNearestEdible(this.x, this.z, t => this.dna.canEat(t), this.radius + 5);
    if (food) this._eatNearestFood(foodManager);
  }

  _eatNearestFood(foodManager) {
    if (!foodManager) return;
    const food = foodManager.findNearestEdible(this.x, this.z, t => this.dna.canEat(t), CONFIG.FOOD_EAT_RANGE);
    if (!food) return;

    const eaten = foodManager.collectItem(food.id);
    if (!eaten) return;

    this.restoreEnergy(eaten.energyValue);
    const gotToken = this.dna.addPoints(eaten.dnaValue);
    if (this.onDNAGained) this.onDNAGained(eaten.dnaValue);
    if (gotToken && this.onEvolutionToken) this.onEvolutionToken();

    // Visual feedback: slight size bump animation
    if (this.mesh) {
      const body = this.mesh.children[0];
      if (body) {
        const r = this.radius;
        body.scale.set(r * 1.2, r * 0.55, r * 1.2);
        setTimeout(() => { body.scale.set(r, r * 0.45, r); }, 200);
      }
    }
  }

  _startMating() {
    if (!this.nearestAlly || this.mateCooldown > 0 || this.energy < CONFIG.MATE_ENERGY_REQUIRED) return;
    this.mating = true;
    this.mateTimer = 0;
    if (this.onMating) this.onMating('start');
  }

  _finishMating(npcManager) {
    this.mating = false;
    this.mateTimer = 0;
    this.mateCooldown = CONFIG.MATE_COOLDOWN;

    const ally = this.nearestAlly;
    if (!ally) return;

    // Receive genes from ally
    const received = this.dna.receiveGenesFromPartner(ally.dna.genes);

    // Bonus DNA
    this.dna.addPoints(CONFIG.MATE_DNA_BONUS);
    if (this.onDNAGained) this.onDNAGained(CONFIG.MATE_DNA_BONUS);

    if (this.onMating) this.onMating('finish', received);

    // Ally gets genes from player too
    ally.dna.receiveGenesFromPartner(this.dna.genes);
    ally.mateCooldown = CONFIG.MATE_COOLDOWN;
  }

  _onDeath() {
    this.isDead = true;
    this.deathTimer = 3.0;  // 3 seconds death screen
    if (this.onDeath) this.onDeath();

    // Leave corpse
    // (main.js handles spawning corpse food)
  }

  _respawn() {
    // Keep fraction of genes
    const keptGenes = this.dna.getRandomGeneSubset(CONFIG.RESPAWN_GENE_KEEP);
    const savedDNA = this.dna.totalCollected * CONFIG.RESPAWN_GENE_KEEP;

    this.isDead = false;
    this.deathTimer = 0;
    this.health = this.maxHealth;
    this.energy = this.maxEnergy * 0.7;
    this.x = 0; this.z = 0; // respawn at origin
    this.vx = 0; this.vz = 0;

    this.dna = new DNA();
    keptGenes.forEach(g => this.dna.genes.add(g));
    this.dna.totalCollected = savedDNA;
    // Ensure always has at least herbivore
    if (this.dna.genes.size === 0) this.dna.genes.add('herbivore');

    // Rebuild mesh
    if (this.mesh) this.renderer.rebuildMesh(this.mesh, this.dna, this.radius, this.z);

    if (this.onRespawn) this.onRespawn(keptGenes);
  }

  _updateCamera() {
    // Smooth camera follow
    this._camTarget.set(this.x, CONFIG.CAMERA_HEIGHT, this.z);
    this.camera.position.lerp(this._camTarget, 0.08);
    this.camera.lookAt(this.x, 0, this.z);
  }

  _updateEnvDamageViz() {
    const zone = this.getZone();
    const dmg = this.dna.computeEnvironmentalDamage(zone);
    if (dmg <= 0) { this.envDamageColor = null; return; }

    // Determine dominant damage source for color
    const params = [
      { name: 'temperature', val: zone.temperature, colors: ['0,150,255', '255,50,0'] },
      { name: 'pressure',    val: zone.pressure,    colors: ['200,100,255', '200,100,255'] },
      { name: 'radiation',   val: zone.radiation,   colors: ['0,200,0', '255,200,0'] },
      { name: 'acidity',     val: zone.acidity,     colors: ['0,200,50', '150,255,0'] },
    ];

    let maxDev = 0;
    let dominantColor = '255,0,0';
    for (const p of params) {
      const resist = this.dna.getResistance(p.name);
      const margin = CONFIG.ZONE_SAFE_MARGIN + resist;
      const dev = Math.max(0, p.val - (5 + margin)) + Math.max(0, (5 - margin) - p.val);
      if (dev > maxDev) {
        maxDev = dev;
        dominantColor = p.val > 5 ? p.colors[1] : p.colors[0];
      }
    }
    this.envDamageColor = dominantColor;
    this.envDamageIntensity = Math.min(1, dmg / 5);
  }

  // Called after evolution to rebuild mesh
  onEvolved() {
    if (this.mesh) {
      this.renderer.rebuildMesh(this.mesh, this.dna, this.radius, this.z);
    }
  }
}
