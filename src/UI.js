import { CONFIG, GENE_DEFS, GENE_CATEGORIES } from './config.js';
import { getZoneAt } from './noise.js';

export class UI {
  constructor() {
    this._dnaFill    = document.getElementById('dna-bar-fill');
    this._dnaTokens  = document.getElementById('dna-tokens');
    this._healthFill = document.getElementById('health-fill');
    this._energyFill = document.getElementById('energy-fill');
    this._hint       = document.getElementById('interaction-hint');
    this._dmgOverlay = document.getElementById('damage-overlay');
    this._evoMenu    = document.getElementById('evo-menu');
    this._geneList   = document.getElementById('evo-gene-list');
    this._dnaAvail   = document.getElementById('evo-dna-available');
    this._evoClose   = document.getElementById('evo-close');
    this._deathScr   = document.getElementById('death-screen');
    this._matingFlash= document.getElementById('mating-flash');
    this._sizeInd    = document.getElementById('size-indicator');

    this._zoneEls = {
      temperature: { fill: document.getElementById('zone-temp-fill'), val: document.getElementById('zone-temp-val'), row: document.getElementById('zone-temp') },
      pressure:    { fill: document.getElementById('zone-pres-fill'), val: document.getElementById('zone-pres-val'), row: document.getElementById('zone-pres') },
      radiation:   { fill: document.getElementById('zone-rad-fill'),  val: document.getElementById('zone-rad-val'),  row: document.getElementById('zone-rad') },
      acidity:     { fill: document.getElementById('zone-acid-fill'), val: document.getElementById('zone-acid-val'), row: document.getElementById('zone-acid') },
    };

    this._evoOpen   = false;
    this._onEvolve  = null;
    this._onClose   = null;
    this._camShake  = 0;
    this._shakeX    = 0;
    this._shakeY    = 0;

    this._evoClose.addEventListener('click', () => this.closeEvoMenu());

    this._dmgPulse = 0;
    this._lastDNA  = 0;

    // Minimap
    this._minimapCanvas = document.getElementById('minimap-canvas');
    this._minimapCtx = this._minimapCanvas.getContext('2d');
    this._minimapCoords = document.getElementById('minimap-coords');
    this._minimapScale = 4;   // world units per pixel
    this._minimapTrail = [];  // trail of visited positions
    this._minimapTrailTimer = 0;
  }

  updateStats(player) {
    // DNA bar
    const hasAll = player.dna.hasAllEvolutions();
    const pct = hasAll ? 100 : (player.dna.points % CONFIG.DNA_PER_EVOLUTION) / CONFIG.DNA_PER_EVOLUTION * 100;
    this._dnaFill.style.width = pct + '%';
    
    if (hasAll) {
      this._dnaTokens.textContent = "Ápice da Evolução Atingido!";
      this._dnaFill.style.boxShadow = '0 0 16px #00ff88, 0 0 6px #44ffaa';
    } else {
      const tokens = player.dna.tokens;
      this._dnaTokens.textContent = tokens > 0
        ? `${tokens} token${tokens > 1 ? 's' : ''} — [ESC] evoluir`
        : `${Math.floor(player.dna.points % CONFIG.DNA_PER_EVOLUTION)} / ${CONFIG.DNA_PER_EVOLUTION} DNA`;
      if (tokens > 0) {
        this._dnaFill.style.boxShadow = '0 0 16px #00ff88, 0 0 6px #44ffaa';
      } else {
        this._dnaFill.style.boxShadow = '0 0 8px #00ff44';
      }
    }

    // Health & Energy
    this._healthFill.style.width = (player.health / player.maxHealth * 100) + '%';
    this._energyFill.style.width = (player.energy / player.maxEnergy * 100) + '%';

    // Size indicator
    const sz = player.dna.getSizeMultiplier().toFixed(1);
    this._sizeInd.textContent = `Tamanho: ${sz}×`;
  }

  updateZone(zone, playerDNA) {
    const params = ['temperature', 'pressure', 'radiation', 'acidity'];
    for (const param of params) {
      const val = zone[param];
      const el = this._zoneEls[param];
      el.fill.style.width = (val / 10 * 100) + '%';
      el.val.textContent  = val.toFixed(1);

      const resist  = playerDNA.getResistance(param);
      const margin  = CONFIG.ZONE_SAFE_MARGIN + resist;
      const isDanger = val > 5 + margin || val < 5 - margin;
      el.row.querySelector('.zone-fill').classList.toggle('zone-danger', isDanger);
    }
  }

  updateInteractionHint(nearestAlly, nearestFood, player) {
    const hints = [];
    if (nearestAlly && player.mateCooldown <= 0 && player.energy >= CONFIG.MATE_ENERGY_REQUIRED) {
      hints.push(`<span class="key-hint">SPACE</span> Acoplar`);
    }
    if (nearestFood && player.dna.canEat(nearestFood.type)) {
      const foodNames = { vegetal: 'Vegetal', iron: 'Ferro', sulfur: 'Enxofre', radiation: 'Radiação', decomposed: 'Matéria', animal: 'Animal' };
      hints.push(`<span class="key-hint">E</span> Comer ${foodNames[nearestFood.type] || nearestFood.type}`);
    }
    if (player.dna.tokens > 0 && !player.dna.hasAllEvolutions()) {
      hints.push(`<span class="key-hint">ESC</span> Evoluir`);
    }
    if (hints.length > 0) {
      this._hint.innerHTML = hints.join(' &nbsp;·&nbsp; ');
      this._hint.classList.add('show');
    } else {
      this._hint.classList.remove('show');
    }
  }

  updateDamageOverlay(damageColor, intensity) {
    if (damageColor && intensity > 0) {
      this._dmgOverlay.style.background =
        `radial-gradient(ellipse at center, transparent 30%, rgba(${damageColor}, ${intensity * 0.5}) 100%)`;
      this._dmgOverlay.style.opacity = '1';
    } else {
      this._dmgOverlay.style.opacity = '0';
    }
  }

  showMatingFlash() {
    this._matingFlash.classList.add('show');
    setTimeout(() => this._matingFlash.classList.remove('show'), 600);
  }

  showDeath() {
    this._deathScr.classList.add('show');
  }

  hideDeath() {
    this._deathScr.classList.remove('show');
  }

  openEvoMenu(dna, onEvolve) {
    this._evoOpen = true;
    this._onEvolve = onEvolve;
    this._evoMenu.classList.add('open');
    this._dnaAvail.textContent = `DNA disponível: ${Math.floor(dna.points)} pts — ${dna.tokens} token(s)`;
    this._buildGeneList(dna);

    // Close on ESC or button
    this._escHandler = (e) => { if (e.code === 'Escape') this.closeEvoMenu(); };
    window.addEventListener('keydown', this._escHandler);
  }

  closeEvoMenu() {
    this._evoOpen = false;
    this._evoMenu.classList.remove('open');
    if (this._escHandler) window.removeEventListener('keydown', this._escHandler);
  }

  isEvoMenuOpen() { return this._evoOpen; }

  _buildGeneList(dna) {
    this._geneList.innerHTML = '';
    for (const cat of GENE_CATEGORIES) {
      const catDiv = document.createElement('div');
      catDiv.className = 'evo-category';
      catDiv.innerHTML = `<div class="evo-category-title">${cat.label}</div>`;

      const genesDiv = document.createElement('div');
      genesDiv.className = 'evo-genes';

      for (const geneId of cat.genes) {
        const gene = GENE_DEFS[geneId];
        const owned  = dna.genes.has(geneId);
        const inBank = [...dna.geneBank].some(g => g.startsWith(geneId));
        const canBuy = !owned && dna.tokens >= 1;

        const card = document.createElement('div');
        card.className = 'evo-gene' + (owned ? ' owned' : '') + (!canBuy && !owned ? ' locked' : '');

        card.innerHTML = `
          <div class="gene-name">${gene.name}${inBank ? ' ★' : ''}</div>
          <div class="gene-desc">${gene.desc}</div>
          ${owned
            ? '<div class="gene-owned-badge">✓ ADQUIRIDO</div>'
            : `<div class="gene-cost">Custo: ${gene.cost} DNA pts</div>`
          }
        `;

        if (!owned && canBuy) {
          card.addEventListener('click', () => {
            if (this._onEvolve) this._onEvolve(geneId);
            this._buildGeneList(dna); // refresh
            this._dnaAvail.textContent = `DNA disponível: ${Math.floor(dna.points)} pts — ${dna.tokens} token(s)`;
          });
        }

        genesDiv.appendChild(card);
      }
      catDiv.appendChild(genesDiv);
      this._geneList.appendChild(catDiv);
    }
  }

  // Camera shake on big predator arrival
  triggerShake(intensity = 5, duration = 0.5) {
    this._camShake = duration;
    this._shakeIntensity = intensity;
  }

  getCameraShakeOffset(dt) {
    if (this._camShake <= 0) return { x: 0, y: 0 };
    this._camShake -= dt;
    const intensity = this._shakeIntensity * (this._camShake / 0.5);
    return {
      x: (Math.random() - 0.5) * intensity,
      y: (Math.random() - 0.5) * intensity,
    };
  }

  // Notification flash (brief text in center)
  notify(text, color = '#88ffcc', duration = 2000) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      color: ${color}; font-size: 18px; letter-spacing: 3px;
      text-shadow: 0 0 20px ${color}; pointer-events: none;
      z-index: 50; animation: fadeUpNotify ${duration}ms ease forwards;
      font-family: 'Segoe UI', Arial, sans-serif;
    `;
    el.textContent = text;

    // Add keyframe style
    if (!document.getElementById('notify-style')) {
      const style = document.createElement('style');
      style.id = 'notify-style';
      style.textContent = `
        @keyframes fadeUpNotify {
          0%   { opacity: 0; transform: translate(-50%, -40%); }
          20%  { opacity: 1; transform: translate(-50%, -50%); }
          70%  { opacity: 1; transform: translate(-50%, -55%); }
          100% { opacity: 0; transform: translate(-50%, -65%); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // Minimap rendering
  updateMinimap(player, npcManager, foodManager, dt) {
    const canvas = this._minimapCanvas;
    const ctx = this._minimapCtx;
    const w = canvas.width;
    const h = canvas.height;
    const scale = this._minimapScale;
    const cx = w / 2;
    const cy = h / 2;
    const px = player.x;
    const pz = player.z;

    // Record trail
    this._minimapTrailTimer += dt;
    if (this._minimapTrailTimer > 0.3) {
      this._minimapTrailTimer = 0;
      this._minimapTrail.push({ x: px, z: pz });
      // Keep last 500 trail points
      if (this._minimapTrail.length > 500) this._minimapTrail.shift();
    }

    // Clear & Render environmental zone background
    const sampleStep = 4;
    for (let x = 0; x < w; x += sampleStep) {
      for (let y = 0; y < h; y += sampleStep) {
        const wx = px + (x - cx) * scale;
        const wz = pz + (y - cy) * scale;
        const zone = getZoneAt(wx, wz);
        
        let r = 8, g = 14, b = 32;

        // Temperature (Orange-Red vs Deep Indigo)
        if (zone.temperature > 5.5) {
          const t = (zone.temperature - 5.5) / 4.5;
          r += t * 90;
          g += t * 25;
        } else if (zone.temperature < 4.5) {
          const t = (4.5 - zone.temperature) / 4.5;
          g += t * 20;
          b += t * 50;
        }

        // Pressure (Purple)
        if (zone.pressure > 5.5) {
          const p = (zone.pressure - 5.5) / 4.5;
          r += p * 40;
          b += p * 60;
        }

        // Radiation (Yellowish Glow)
        if (zone.radiation > 5.5) {
          const rad = (zone.radiation - 5.5) / 4.5;
          r += rad * 45;
          g += rad * 45;
        }

        // Acidity (Bright Green)
        if (zone.acidity > 5.5) {
          const a = (zone.acidity - 5.5) / 4.5;
          g += a * 60;
        }

        ctx.fillStyle = `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
        ctx.fillRect(x, y, sampleStep, sampleStep);
      }
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 200; // chunk size
    const gridPixels = gridSize / scale;
    const offsetX = ((px % gridSize) + gridSize) % gridSize / scale;
    const offsetY = ((pz % gridSize) + gridSize) % gridSize / scale;
    for (let gx = -offsetX; gx < w; gx += gridPixels) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = -offsetY; gy < h; gy += gridPixels) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Draw trail (fading breadcrumbs)
    const trail = this._minimapTrail;
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const sx = cx + (t.x - px) / scale;
      const sy = cy + (t.z - pz) / scale;
      if (sx < -2 || sx > w + 2 || sy < -2 || sy > h + 2) continue;
      const alpha = 0.05 + (i / trail.length) * 0.2;
      ctx.fillStyle = `rgba(100, 200, 255, ${alpha})`;
      ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1);
    }

    // Draw food
    if (foodManager) {
      const foodColors = {
        vegetal: '#33cc55', iron: '#cc5500', sulfur: '#ddcc00',
        radiation: '#aaff00', decomposed: '#886633', animal: '#ff5533'
      };
      const items = foodManager.getAll ? foodManager.getAll() : [];
      for (const food of items) {
        const sx = cx + (food.x - px) / scale;
        const sy = cy + (food.z - pz) / scale;
        if (sx < -2 || sx > w + 2 || sy < -2 || sy > h + 2) continue;
        ctx.fillStyle = foodColors[food.type] || '#666666';
        ctx.globalAlpha = 0.5;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
        ctx.globalAlpha = 1;
      }
    }

    // Draw NPCs
    if (npcManager) {
      const npcs = npcManager.getAll();
      for (const npc of npcs) {
        if (npc.isDead) continue;
        const sx = cx + (npc.x - px) / scale;
        const sy = cy + (npc.z - pz) / scale;
        if (sx < -2 || sx > w + 2 || sy < -2 || sy > h + 2) continue;
        const isAlly = npc.speciesId === player.speciesId;
        const isThreat = npc.radius > player.radius * 1.3;
        if (isAlly) {
          ctx.fillStyle = '#44ff88';
        } else if (isThreat) {
          ctx.fillStyle = '#ff4444';
        } else {
          ctx.fillStyle = '#ffaa44';
        }
        const r = Math.max(1.5, npc.radius / scale);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw player (center, pulsing)
    const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
    ctx.fillStyle = `rgba(100, 200, 255, ${pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(100, 200, 255, ${pulse * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.stroke();

    // Draw direction indicator
    const dirLen = 8;
    const dirX = cx + Math.sin(player.angle) * dirLen;
    const dirY = cy + Math.cos(player.angle) * dirLen;
    ctx.strokeStyle = `rgba(100, 200, 255, ${pulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(dirX, dirY);
    ctx.stroke();

    // Draw crosshair lines (cardinal directions)
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.stroke();

    // Update coords text
    this._minimapCoords.textContent = `${Math.round(px)}, ${Math.round(pz)}`;
  }
}
