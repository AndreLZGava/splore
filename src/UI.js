import { CONFIG, GENE_DEFS, GENE_CATEGORIES } from './config.js';

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
  }

  updateStats(player) {
    // DNA bar
    const pct = (player.dna.points % CONFIG.DNA_PER_EVOLUTION) / CONFIG.DNA_PER_EVOLUTION * 100;
    this._dnaFill.style.width = pct + '%';
    const tokens = player.dna.tokens;
    this._dnaTokens.textContent = tokens > 0
      ? `${tokens} token${tokens > 1 ? 's' : ''} — [ESC] evoluir`
      : `${Math.floor(player.dna.points % CONFIG.DNA_PER_EVOLUTION)} / ${CONFIG.DNA_PER_EVOLUTION} DNA`;
    if (tokens > 0) {
      this._dnaFill.style.boxShadow = '0 0 16px #00ff88, 0 0 6px #44ffaa';
    } else {
      this._dnaFill.style.boxShadow = '0 0 8px #00ff44';
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
      hints.push(`<span class="key-hint">W</span> Acoplar`);
    }
    if (nearestFood && player.dna.canEat(nearestFood.type)) {
      const foodNames = { vegetal: 'Vegetal', iron: 'Ferro', sulfur: 'Enxofre', radiation: 'Radiação', decomposed: 'Matéria', animal: 'Animal' };
      hints.push(`<span class="key-hint">E</span> Comer ${foodNames[nearestFood.type] || nearestFood.type}`);
    }
    if (player.dna.tokens > 0) {
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
}
