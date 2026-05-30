import { GENE_DEFS, CONFIG } from './config.js';

export class DNA {
  constructor() {
    this.points = 0;          // DNA acumulado (total lifetime)
    this.tokens = 0;          // tokens de evolução disponíveis
    this.genes = new Set();   // genes adquiridos (ids)
    this.geneBank = new Set();// genes recebidos via acasalamento, aguardando uso
    this.totalCollected = 0;  // total histórico para tamanho
  }

  addPoints(amount) {
    this.points += amount;
    this.totalCollected += amount;
    const tokensEarned = Math.floor(this.points / CONFIG.DNA_PER_EVOLUTION);
    const newTokens = tokensEarned - Math.floor((this.points - amount) / CONFIG.DNA_PER_EVOLUTION);
    if (newTokens > 0) {
      this.tokens += newTokens;
      return true; // evolution available
    }
    return false;
  }

  canEvolve(geneId) {
    if (this.genes.has(geneId)) return false; // already owned
    if (this.tokens < 1) return false;
    return true;
  }

  evolve(geneId) {
    if (!this.canEvolve(geneId)) return false;
    this.genes.add(geneId);
    this.tokens--;
    return true;
  }

  addToBank(geneId) {
    if (!this.genes.has(geneId)) this.geneBank.add(geneId);
  }

  getSpeedMultiplier() {
    let mult = 1.0;
    for (const gid of this.genes) {
      const g = GENE_DEFS[gid];
      if (g?.speedMult) mult *= g.speedMult;
    }
    return mult;
  }

  getDefenseMultiplier() {
    let mult = 1.0;
    for (const gid of this.genes) {
      const g = GENE_DEFS[gid];
      if (g?.defenseMult) mult *= g.defenseMult;
    }
    return mult;
  }

  getAttackBonus() {
    let bonus = 1.0;
    for (const gid of this.genes) {
      const g = GENE_DEFS[gid];
      if (g?.attackBonus) bonus *= g.attackBonus;
    }
    return bonus;
  }

  canEat(foodType) {
    for (const gid of this.genes) {
      const g = GENE_DEFS[gid];
      if (g?.canEat?.includes(foodType)) return true;
    }
    return false;
  }

  getResistance(param) {
    // Returns extra tolerance for the given environmental parameter
    for (const gid of this.genes) {
      const g = GENE_DEFS[gid];
      if (g?.resistParam === param) return g.resistBonus;
    }
    return 0;
  }

  // Zone damage: energy lost per second from hostile environment
  computeEnvironmentalDamage(zone) {
    const safeMargin = CONFIG.ZONE_SAFE_MARGIN;
    let totalDamage = 0;

    const params = ['temperature','pressure','radiation','acidity'];
    for (const param of params) {
      const val = zone[param];
      const resist = this.getResistance(param);
      const low  = 5 - safeMargin - resist;
      const high = 5 + safeMargin + resist;
      const deviation = Math.max(0, val - high) + Math.max(0, low - val);
      totalDamage += deviation * CONFIG.ZONE_DAMAGE_PER_UNIT;
    }
    return totalDamage;
  }

  // Size multiplier based on DNA collected
  getSizeMultiplier() {
    return 1.0 + Math.min(3.0, this.totalCollected / 500) * 0.8;
  }

  // Export a subset of genes for respawn / mating
  getRandomGeneSubset(fraction) {
    const arr = [...this.genes];
    const count = Math.max(1, Math.floor(arr.length * fraction));
    const shuffled = arr.sort(() => Math.random() - 0.5);
    return new Set(shuffled.slice(0, count));
  }

  // Create from partial genes (respawn scenario)
  static fromGeneSubset(geneSet) {
    const dna = new DNA();
    dna.genes = new Set(geneSet);
    return dna;
  }

  // Mating: merge genes from partner
  receiveGenesFromPartner(partnerGenes, mutationChance = 0.1) {
    const partnerArr = [...partnerGenes].filter(g => !this.genes.has(g));
    if (partnerArr.length === 0) return [];

    const count = Math.min(2, partnerArr.length);
    const received = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * partnerArr.length);
      const geneId = partnerArr.splice(idx, 1)[0];

      // Mutation: minor variation (for NPC stats, not gene ID — gene itself is added as-is)
      if (Math.random() < mutationChance) {
        // Gene is marked as mutated (stored in bank with a flag — kept simple here)
        this.geneBank.add(geneId + ':mutated');
      } else {
        this.geneBank.add(geneId);
      }
      received.push(geneId);
    }
    return received;
  }
}

// Generate a random NPC gene set based on its "type profile"
export function generateNPCGenes(profile) {
  const genes = new Set();

  if (profile.includes('herbivore')) genes.add('herbivore');
  if (profile.includes('carnivore')) { genes.add('carnivore'); if (Math.random() > 0.5) genes.add('spines'); }
  if (profile.includes('chemosynthetic')) { genes.add('chemosynthetic'); genes.add('pressure_resist'); genes.add('heat_resist'); }
  if (profile.includes('photosynthetic')) { genes.add('photosynthetic'); genes.add('radiation_resist'); }
  if (profile.includes('decomposer')) genes.add('decomposer');

  // Random mobility
  const mob = ['cilia','flagellum','pseudopod'];
  genes.add(mob[Math.floor(Math.random() * mob.length)]);

  // Random defense chance
  if (Math.random() > 0.6) genes.add(['spines','chemical_defense','carapace'][Math.floor(Math.random() * 3)]);

  return genes;
}
