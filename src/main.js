import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './World.js';
import { OrganismRenderer } from './OrganismRenderer.js';
import { FoodManager } from './FoodManager.js';
import { NPCManager } from './NPC.js';
import { Player } from './Player.js';
import { ParticleSystem } from './ParticleSystem.js';
import { UI } from './UI.js';
import { Audio } from './Audio.js';

class Game {
  constructor() {
    this.paused = false;
    this.clock = new THREE.Clock();
    this._predatorSpawnTimer = 0;
    this._predatorSpawnInterval = 30 + Math.random() * 30;
    this._chunkUpdateTimer = 0;
    this._bigPredatorWarned = false;

    this._init();
  }

  _init() {
    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    document.body.insertBefore(this.renderer.domElement, document.getElementById('ui'));

    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000810, 0.0005);

    // ── Camera (orthographic-style perspective top-down) ──
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      1,
      5000
    );
    this.camera.position.set(0, CONFIG.CAMERA_HEIGHT, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.userData.rendererDom = this.renderer.domElement;

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0x334466, 1.2);
    this.scene.add(ambient);

    this.sunLight = new THREE.DirectionalLight(0x88aaff, 1.5);
    this.sunLight.position.set(0, 200, 0);
    this.scene.add(this.sunLight);

    // Point light that follows player (creates depth feel)
    this.playerLight = new THREE.PointLight(0x4488ff, 2.0, 300);
    this.playerLight.position.set(0, 50, 0);
    this.scene.add(this.playerLight);

    // ── Systems ──
    this.world       = new World(this.scene);
    this.orgRenderer = new OrganismRenderer(this.scene);
    this.food        = new FoodManager(this.scene);
    this.npcMgr      = new NPCManager(this.scene, this.orgRenderer, this.world, this.food);
    this.particles   = new ParticleSystem(this.scene);
    this.ui          = new UI();
    this.audio       = new Audio();

    // ── Player ──
    this.player = new Player(this.scene, this.orgRenderer, this.world, this.camera);
    this.player.spawn();

    // Wire up player events
    this.player.onDNAGained = (amount) => {
      this.particles.burstDNA(this.player.x, this.player.z);
      this.audio.playEat();
    };
    this.player.onEvolutionToken = () => {
      if (this.player.dna.hasAllEvolutions()) return;
      this.audio.playEvolution();
      this.ui.notify('Evolução disponível! [ESC]', '#88ffcc');
      setTimeout(() => {
        if (!this.ui.isEvoMenuOpen()) this._openEvoMenu();
      }, 500);
    };
    this.player.onMating = (phase, genes) => {
      if (phase === 'start') {
        this.audio.playMating();
        this.ui.showMatingFlash();
      }
      if (phase === 'finish') {
        this.particles.burstMate(this.player.x, this.player.z);
        if (genes && genes.length > 0) {
          this.ui.notify(`Gene recebido: ${genes[0]}`, '#ffaaff');
        }
        this.ui.notify('+30 DNA via acasalamento', '#88ffcc');
      }
    };
    this.player.onDeath = () => {
      this.audio.playDeath();
      this.particles.burstDeath(this.player.x, this.player.z);
      this.food.spawnCorpse(this.player.x, this.player.z);
      this.ui.showDeath();
    };
    this.player.onRespawn = (keptGenes) => {
      this.ui.hideDeath();
      this.ui.notify('Ressurgindo...', '#aaddff');
    };

    // ESC key → evolution menu
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !this.player.isDead) {
        if (this.ui.isEvoMenuOpen()) {
          this.ui.closeEvoMenu();
          this.paused = false;
        } else if (this.player.dna.tokens > 0 && !this.player.dna.hasAllEvolutions()) {
          this._openEvoMenu();
        }
      }
    });

    // Expose to window for debug
    window._game = this;

    // ── Init first chunks ──
    this._updateChunks();

    // ── Resize ──
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start loop
    this._loop();
  }

  _openEvoMenu() {
    this.paused = true;
    this.ui.openEvoMenu(this.player.dna, (geneId) => {
      const ok = this.player.dna.evolve(geneId);
      if (ok) {
        this.audio.playEvolution();
        this.player.onEvolved();
        this.ui.notify(`Evolução: ${geneId.toUpperCase()}!`, '#aaffcc');
        this.particles.burstDNA(this.player.x, this.player.z);

        // If no more tokens, close menu
        if (this.player.dna.tokens === 0) {
          setTimeout(() => {
            this.ui.closeEvoMenu();
            this.paused = false;
          }, 800);
        }
      }
    });
  }

  _updateChunks() {
    const required = this.world.getRequiredChunks(this.player.x, this.player.z);

    for (const { cx, cz } of required) {
      if (!this.world.isChunkLoaded(cx, cz)) {
        const chunk = this.world.createChunk(cx, cz);
        if (chunk) {
          this.food.spawnChunkFood(chunk);
          this.npcMgr.spawnChunkNPCs(chunk);
        }
      }
    }

    // Remove stale chunks
    const stale = this.world.getStaleChunks(this.player.x, this.player.z);
    for (const chunk of stale) {
      this.food.removeChunkFood(chunk.key);
      this.npcMgr.removeChunkNPCs(chunk.key);
      this.world.removeChunk(chunk.cx, chunk.cz);
    }
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.05); // cap at 50ms

    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    // ── Chunk management ──
    this._chunkUpdateTimer += dt;
    if (this._chunkUpdateTimer > 0.5) {
      this._chunkUpdateTimer = 0;
      this._updateChunks();
    }

    // ── World shader ──
    this.world.update(dt, this.player.x, this.player.z);

    // ── Player ──
    this.player.update(dt, this.food, this.npcMgr);

    // ── NPCs ──
    this.npcMgr.update(dt, this.player);

    // ── Food ──
    this.food.update(dt);

    // ── Particles ──
    this.particles.update(dt, this.player.x, this.player.z, this.player.z);

    // ── Player light follows player ──
    this.playerLight.position.set(this.player.x, 50, this.player.z);

    // ── Ambient depth ──
    this.audio.updateDepth(this.player.z);

    // ── Predator spawn timer ──
    this._predatorSpawnTimer += dt;
    if (this._predatorSpawnTimer >= this._predatorSpawnInterval) {
      this._predatorSpawnTimer = 0;
      this._predatorSpawnInterval = 25 + Math.random() * 35;
      const pred = this.npcMgr.spawnPredatorOffscreen(this.player.x, this.player.z);

      // If predator is much bigger → warn
      if (pred && pred.radius > this.player.radius * 2) {
        this.audio.playDanger();
        this.ui.triggerShake(8, 0.6);
        this.ui.notify('Predador detectado!', '#ff6644');
      }
    }

    // ── Player light ──
    const zone = this.player.getZone();
    const radFactor = zone.radiation / 10;
    this.sunLight.intensity = 0.5 + radFactor * 1.5;
    this.sunLight.position.set(this.player.x, 200, this.player.z);

    // ── UI updates ──
    this.ui.updateStats(this.player);
    this.ui.updateZone(zone, this.player.dna);
    this.ui.updateInteractionHint(this.player.nearestAlly, this.player.nearestFood, this.player);
    this.ui.updateDamageOverlay(this.player.envDamageColor, this.player.envDamageIntensity || 0);
    this.ui.updateMinimap(this.player, this.npcMgr, this.food, dt);

    // Camera shake
    const shake = this.ui.getCameraShakeOffset(dt);
    if (shake.x !== 0) {
      this.camera.position.x += shake.x;
      this.camera.position.z += shake.y;
    }

    // Threat check: nearby large predator
    const threat = this.npcMgr.findNearestThreat(this.player.x, this.player.z, this.player.radius, 200);
    if (threat && threat.radius > this.player.radius * 1.5) {
      this.audio.playDanger();
    }
  }
}

// Start game
new Game();
