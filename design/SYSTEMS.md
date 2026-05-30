# SPLORE — Systems Reference

## Gene Definitions (completo)

```
ID                  | Tipo        | Custo DNA | Efeito Principal            | Visual no Mesh
--------------------|-------------|-----------|-----------------------------|---------------------------------
cilia               | mobilidade  | 30        | velocidade ×1.3             | 24 cílios ao redor do equador
flagellum           | mobilidade  | 60        | velocidade ×1.8             | 1-2 caudas longas ondulantes
pseudopod           | mobilidade  | 40        | vel ×1.1 + versatilidade    | 3-4 protuberâncias amebóides
herbivore           | alimentação | 20        | come: vegetal, decomp       | —
carnivore           | alimentação | 50        | come: animal, ataque ×1.5   | mandíbulas pequenas (meia-lua)
decomposer          | alimentação | 25        | come: decomp, vegetal       | —
photosynthetic      | alimentação | 35        | come: radiação              | pontos emissivos brilhantes
chemosynthetic      | alimentação | 40        | come: iron, sulfur          | granulado metálico
spines              | defesa      | 45        | defesa ×1.5, reflete dano   | 6-12 cones pontiagudos
chemical_defense    | defesa      | 40        | 20% chance veneno           | 8 esferas translúcidas
carapace            | defesa      | 55        | defesa ×1.8, vel ×0.7       | meia-esfera rígida no topo
heat_resist         | resistência | 30        | tolera temp ±3 extra        | tons avermelhados no corpo
pressure_resist     | resistência | 30        | tolera pressão ±3 extra     | tons mais escuros/densos
radiation_resist    | resistência | 30        | tolera radiação ±3 extra    | meia-transparência brilhante
acid_resist         | resistência | 30        | tolera acidez ±3 extra      | tonalidade verde
```

## Cálculo de Cor do Organismo

```
cor_base = cor_da_espécie (derivada de um hue seed)

modificadores:
  + heat_resist    → shift para vermelho (+hue 0-30°)
  + acid_resist    → shift para verde (+hue 90-130°)
  + pressure_adapt → mais escuro (lightness -20%)
  + radiation_adapt→ mais claro + brilhante (emissive +)
  + photosynthetic → amarelo-âmbar
  + chemosynthetic → cinza-metálico

profundidade (worldY):
  shallow (Y > 500)  → lightness +30%, mais saturado
  deep    (Y < -500) → lightness -40%, desaturado, bioluminescente
```

## Fórmula de Dano Ambiental

```
Para cada parâmetro P (temp, pressão, radiação, acidez):
  tolerância_base = [4, 6]  (neutro ± 1)
  tolerância_com_gene = expandida pelo gene de resistência (+3)

  desvio = max(0, valor_P - tolerância_max) + max(0, tolerância_min - valor_P)
  dano_por_segundo += desvio × 1.0   // 1 ponto de energia por unidade de desvio por segundo

energia -= total_dano_por_segundo × deltaTime
```

## Comportamento de NPC (State Machine)

```
Estados:
  WANDERING → movimento aleatório com bias (random walk suave)
  HUNTING   → perseguindo presa (jogador ou NPC menor)
  FLEEING   → fugindo de ameaça maior
  MATING    → se aproximando de parceiro (same species)
  EATING    → parado consumindo alimento detectado

Transições:
  WANDERING → HUNTING   se (carnívoro) e (presa detectada no raio de 300u) e (presa < 0.8× meu tamanho)
  WANDERING → FLEEING   se (predador detectado no raio de 200u) e (predador > 1.3× meu tamanho)
  WANDERING → MATING    se (same species detectado) e (tenho energia > 50) e (random < 0.1/frame)
  WANDERING → EATING    se (alimento compatível detectado no raio de 150u)
  HUNTING   → WANDERING se (presa perdida por > 5s) ou (presa muito longe > 600u)
  FLEEING   → WANDERING se (ameaça sumiu ou > 500u de distância)
  EATING    → WANDERING após consumir alimento
  MATING    → WANDERING após acasalamento completado ou parceiro fugiu

Detecção:
  Raio de "visão/olfato": 300 unidades (ajustado por tamanho do organismo)
  NPCs maiores têm raio maior de detecção
```

## Mecânica de Acasalamento

```
Condição:
  Jogador pressiona W
  Mesma espécie (species_id igual) a menos de 80 unidades
  Jogador tem energia > 30

Processo:
  1. Animação de aproximação (NPC move para jogador)
  2. Timer de 2 segundos (acasalamento em andamento)
  3. Troca genética:
     - NPC doa 1-2 genes aleatórios que jogador NÃO tem
     - Jogador doa 1-2 genes aleatórios que NPC não tem
  4. Chance de mutação (10%): um gene doado sofre mutação minor (efeito +/- 10%)
  5. Bônus: +30 DNA para o jogador
  6. Cooldown: mesma célula não pode acoplar novamente por 60s

Se jogador ganhar gene novo:
  → Notificação na tela
  → Menu de evolução NÃO abre (gene entra no "banco genético")
  → Pode ser usado no próximo menu de evolução ou descartado
```

## Mecânica de Combate

```
Ataque do jogador:
  Clique esquerdo → ataque na direção do mouse
  Dano = base_damage × (1 + carnivore_bonus) × (1 + spines_multiplier)
  Alcance: raio_corpo × 1.5

Ataque de NPC predador:
  Colisão corpo a corpo
  Dano por segundo enquanto em contato
  Predador com espinhos: dano adicional ao jogador que toca

Fuga:
  WASD para mover. Predadores perseguem até 600 unidades.
  Se jogador sair do raio de 600u por > 5s: NPC abandona a caça.
  Flagelo (gene) dá vantagem de fuga decisiva.

Resultado do combate:
  Organismo com saúde 0 morre
  Body permanece no mundo como food de Decomposição (timer 5 min)
  Matador ganha energia imediatamente se carnívoro
```

## Sistema de Chunks (técnico)

```
Chunk Key: `${Math.floor(worldX / CHUNK_SIZE)},${Math.floor(worldY / CHUNK_SIZE)}`

Ao entrar em chunk novo:
  1. Gera seed do chunk: hash(chunkX, chunkY)
  2. Calcula bioma médio do chunk (sample noise no centro)
  3. Spawna food items:
     - Vegetais: bioma.radiação > 3 → spawn 3-8 vegetais
     - Químicos: bioma.temp > 7 && bioma.pressão > 7 → spawn 2-4 iron/sulfur
     - Radiação food: bioma.radiação > 7 → spawn 2-5 radiation particles
  4. Spawna NPCs:
     - 1-3 da mesma espécie do jogador (wandering)
     - 0-2 de espécie predadora (se bioma perigoso)
     - 0-5 herbívoros neutros

Cleanup:
  Chunks além de 3 chunks do jogador → marked for removal
  NPCs em chunk removido → despawnam
  Foods em chunk removido → despawnam
  Timer de grace: 15s antes de remover (evita pop-in/out)
```

## World Shader (GLSL outline)

```glsl
// Fragment shader do plano de fundo

uniforms:
  uTime: float           // tempo em segundos
  uPlayerPos: vec2       // posição do jogador no mundo
  uNoiseOffset: vec4     // offsets para os 4 campos de noise

// 4 campos de noise com FBM (6 octaves cada):
  temperature  = fbm(worldPos * 0.001 + vec2(0.0, 0.0))    // biomas grandes
  pressure     = fbm(worldPos * 0.0008 + vec2(100.0, 50.0)) // zonas de profundidade
  radiation    = fbm(worldPos * 0.0015 + vec2(200.0, 150.0)) // pockets de luz
  acidity      = fbm(worldPos * 0.002 + vec2(300.0, 250.0)) // microhabitats

// Cor base por profundidade (worldPos.y):
  depth_factor = clamp((worldPos.y + 1000.0) / 2000.0, 0.0, 1.0)
  // profundo: dark blue; raso: cyan/light blue

// Efeito de caustics (luz da água):
  caustic = sin(worldPos.x * 0.1 + uTime * 0.5) * sin(worldPos.y * 0.12 + uTime * 0.3)
  caustic *= depth_factor * 0.15

// Modificadores de cor por zona:
  + temperatura alta → shift para vermelho/laranja (deep vents)
  + radiação alta    → shift para amarelo/branco (superfície)
  + acidez alta      → shift para verde
  + pressão alta     → mais escuro

// Bioluminescência sutil em áreas profundas:
  biolum = fbm(worldPos * 0.05 + uTime * 0.02) * (1.0 - depth_factor)
  color += biolum * vec3(0.0, 0.2, 0.8) * 0.3
```

## Partículas do Ambiente

```
Plâncton/Detritos:
  - Pool de 500 partículas (sprites pequenos)
  - Spawn ao redor do jogador (raio 800u)
  - Movimento: deriva lenta com componente sinusoidal
  - Tamanho: 2-8 unidades
  - Opacidade: 0.3-0.7
  - Cor: baseada na zona (verde-claro em zonas de luz, azul em profundidade)
  - Velocidade: muito lenta (0.1-0.5 u/s) para criar sensação de fluido

Bolhas (zonas de calor):
  - Spawn em zonas de alta temperatura
  - Sobem lentamente (y+)
  - Raio 1-3u, semi-transparentes

Partículas de DNA (ao comer):
  - Burst de 10-20 partículas verdes no ponto de coleta
  - Se dispersam em 0.5s e desaparecem

Partículas de dano:
  - Burst de 5-10 partículas vermelhas ao sofrer ataque
```

## Estrutura de Arquivos

```
splore/
├── index.html
├── design/
│   ├── GDD.md          (este documento + GDD.md)
│   └── SYSTEMS.md
└── src/
    ├── config.js        (constantes globais)
    ├── noise.js         (implementação JS de FBM/noise para CPU-side)
    ├── Genetics.js      (classe DNA, genes, evolução)
    ├── World.js         (chunks, zones, background mesh com shader)
    ├── OrganismRenderer.js (cria/atualiza meshes Three.js por genes)
    ├── Organism.js      (classe base: pos, vel, saúde, energia, DNA)
    ├── FoodManager.js   (pool e spawn de alimentos)
    ├── NPC.js           (IA: state machine, comportamento)
    ├── Player.js        (input, camera follow, interações)
    ├── ParticleSystem.js(partículas de ambiente e efeitos)
    ├── UI.js            (HUD + menu evolução)
    ├── Audio.js         (WebAudio API, sons e música)
    └── main.js          (init Three.js, game loop)
```
