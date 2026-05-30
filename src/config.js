export const CONFIG = {
  WORLD_SIZE: 8000,
  CHUNK_SIZE: 200,
  CHUNK_LOAD_RADIUS: 3,      // chunks ao redor do jogador
  CHUNK_UNLOAD_RADIUS: 5,    // distância para descarregar

  CAMERA_HEIGHT: 350,
  CAMERA_VIEW_WIDTH: 800,    // unidades de mundo visíveis (ortho)

  // Jogador
  PLAYER_BASE_SPEED: 120,
  PLAYER_BASE_RADIUS: 8,
  PLAYER_BASE_HEALTH: 100,
  PLAYER_BASE_ENERGY: 100,
  PLAYER_ENERGY_DECAY: 2.0,  // energia/s ao se mover
  PLAYER_ENERGY_IDLE: 0.3,   // energia/s parado
  PLAYER_HEALTH_REGEN: 0.5,  // saúde/s com energia > 60
  PLAYER_ATTACK_RANGE: 18,
  PLAYER_ATTACK_DAMAGE: 20,
  PLAYER_ATTACK_COOLDOWN: 0.5,

  // DNA
  DNA_PER_EVOLUTION: 100,
  DNA_SPAWN_WITH: 0,          // DNA inicial
  RESPAWN_GENE_KEEP: 0.5,    // fração dos genes mantidos ao morrer

  // Zona segura (5 = neutro, ±1 = seguro base)
  ZONE_SAFE_MARGIN: 1.5,
  ZONE_DAMAGE_PER_UNIT: 1.2, // dano de energia por unidade fora da zona

  // Alimentos
  FOOD: {
    vegetal:     { dna: 10, energy: 20, radius: 5,  color: 0x33cc55, emissive: 0x005511 },
    iron:        { dna: 15, energy: 25, radius: 4,  color: 0xcc5500, emissive: 0x441100 },
    sulfur:      { dna: 15, energy: 25, radius: 4,  color: 0xddcc00, emissive: 0x443300 },
    radiation:   { dna: 20, energy: 15, radius: 5,  color: 0xaaff00, emissive: 0x44aa00 },
    decomposed:  { dna: 8,  energy: 15, radius: 4,  color: 0x886633, emissive: 0x221100 },
    animal:      { dna: 25, energy: 30, radius: 6,  color: 0xff5533, emissive: 0x441100 },
  },
  FOOD_DECOMPOSE_TIME: 300,   // segundos até item de decomposição aparecer
  FOOD_EAT_RANGE: 22,
  MAX_FOOD_PER_CHUNK: 12,

  // NPCs
  NPC_BASE_SPEED: 80,
  NPC_DETECTION_RADIUS: 160,
  MAX_NPC_PER_CHUNK: 4,
  NPC_SPAWN_EDGE_DISTANCE: 420, // spawna fora da tela
  NPC_PREDATOR_CHASE_RANGE: 350,
  NPC_FLEE_RANGE: 300,
  NPC_ABANDON_CHASE: 380,

  // Acasalamento
  MATE_RANGE: 80,
  MATE_ENERGY_REQUIRED: 30,
  MATE_DNA_BONUS: 30,
  MATE_COOLDOWN: 60,         // segundos

  // Espécies
  PLAYER_SPECIES_ID: 'species_player',
};

// Definição de todos os genes
export const GENE_DEFS = {
  // ─── MOBILIDADE ───
  cilia: {
    id: 'cilia', type: 'mobility', cost: 30,
    name: 'Cílios',
    desc: 'Filamentos vibratórios ao redor do corpo. +30% velocidade.',
    speedMult: 1.3,
  },
  flagellum: {
    id: 'flagellum', type: 'mobility', cost: 60,
    name: 'Flagelo',
    desc: 'Cauda longa para propulsão. +80% velocidade.',
    speedMult: 1.8,
  },
  pseudopod: {
    id: 'pseudopod', type: 'mobility', cost: 40,
    name: 'Pseudópodo',
    desc: 'Projeções amebóides. +10% velocidade, muito versátil.',
    speedMult: 1.1,
  },

  // ─── ALIMENTAÇÃO ───
  herbivore: {
    id: 'herbivore', type: 'diet', cost: 20,
    name: 'Herbívoro',
    desc: 'Pode consumir vegetais e matéria em decomposição.',
    canEat: ['vegetal', 'decomposed'],
  },
  carnivore: {
    id: 'carnivore', type: 'diet', cost: 50,
    name: 'Carnívoro',
    desc: 'Pode predar outros organismos. +50% dano de ataque.',
    canEat: ['animal'],
    attackBonus: 1.5,
  },
  decomposer: {
    id: 'decomposer', type: 'diet', cost: 25,
    name: 'Decompositório',
    desc: 'Especializado em absorver matéria orgânica decomposta.',
    canEat: ['decomposed', 'vegetal'],
    decomposeBonusMult: 1.5,
  },
  photosynthetic: {
    id: 'photosynthetic', type: 'diet', cost: 35,
    name: 'Fotossintético',
    desc: 'Absorve energia de zonas de alta radiação luminosa.',
    canEat: ['radiation'],
  },
  chemosynthetic: {
    id: 'chemosynthetic', type: 'diet', cost: 40,
    name: 'Quimiossintético',
    desc: 'Metaboliza elementos químicos: ferro e enxofre.',
    canEat: ['iron', 'sulfur'],
  },

  // ─── DEFESA ───
  spines: {
    id: 'spines', type: 'defense', cost: 45,
    name: 'Espinhos',
    desc: 'Projeções rígidas. +50% defesa física. Dano de retorno ao atacante.',
    defenseMult: 1.5,
    reflectDamage: 8,
  },
  chemical_defense: {
    id: 'chemical_defense', type: 'defense', cost: 40,
    name: 'Defesa Química',
    desc: '20% de chance de envenenar o atacante (dano contínuo).',
    defenseMult: 1.3,
    poisonChance: 0.2,
    poisonDPS: 5,
    poisonDuration: 3,
  },
  carapace: {
    id: 'carapace', type: 'defense', cost: 55,
    name: 'Carapaça',
    desc: 'Proteção rígida. +80% defesa, -30% velocidade.',
    defenseMult: 1.8,
    speedMult: 0.7,
  },

  // ─── RESISTÊNCIA ───
  heat_resist: {
    id: 'heat_resist', type: 'resistance', cost: 30,
    name: 'Resist. Calor',
    desc: 'Tolera temperaturas extremas. Zona segura +3 para temperatura.',
    resistParam: 'temperature', resistBonus: 3,
  },
  pressure_resist: {
    id: 'pressure_resist', type: 'resistance', cost: 30,
    name: 'Resist. Pressão',
    desc: 'Suporta pressões profundas. Zona segura +3 para pressão.',
    resistParam: 'pressure', resistBonus: 3,
  },
  radiation_resist: {
    id: 'radiation_resist', type: 'resistance', cost: 30,
    name: 'Resist. Radiação',
    desc: 'Lida com alta exposição luminosa/radioativa. Zona segura +3.',
    resistParam: 'radiation', resistBonus: 3,
  },
  acid_resist: {
    id: 'acid_resist', type: 'resistance', cost: 30,
    name: 'Resist. Acidez',
    desc: 'Membrana resistente a ambientes ácidos. Zona segura +3.',
    resistParam: 'acidity', resistBonus: 3,
  },
};

export const GENE_CATEGORIES = [
  { id: 'mobility',   label: 'Mobilidade',  genes: ['cilia','flagellum','pseudopod'] },
  { id: 'diet',       label: 'Alimentação', genes: ['herbivore','carnivore','decomposer','photosynthetic','chemosynthetic'] },
  { id: 'defense',    label: 'Defesa',      genes: ['spines','chemical_defense','carapace'] },
  { id: 'resistance', label: 'Resistência', genes: ['heat_resist','pressure_resist','radiation_resist','acid_resist'] },
];

// Cor de organismo baseada em genes de resistência/dieta
export function getOrganismHue(geneSet, depth = 0) {
  // depth: positivo = raso, negativo = profundo
  let h = 210; // azul base
  let s = 70;
  let l = 50;

  // Profundidade: raso fica mais claro, profundo fica mais escuro
  const depthFactor = Math.max(-1, Math.min(1, depth / 800));
  l += depthFactor * 25; // raso: +25%, profundo: -25%

  if (geneSet.has('heat_resist'))      { h = (h + 20) % 360; s += 10; }  // vermelho
  if (geneSet.has('acid_resist'))      { h = (h + 80) % 360; }           // verde
  if (geneSet.has('radiation_resist')) { l += 15; s += 10; }             // mais brilhante
  if (geneSet.has('pressure_resist'))  { l -= 15; }                      // mais escuro
  if (geneSet.has('photosynthetic'))   { h = 45; s = 80; }               // âmbar
  if (geneSet.has('chemosynthetic'))   { s = 20; }                       // cinza metálico

  return { h: h % 360, s: Math.max(10, Math.min(100, s)), l: Math.max(15, Math.min(80, l)) };
}
