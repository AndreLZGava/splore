# SPLORE — Game Design Document

## Conceito
Simulação de evolução de organismo microscópico, inspirado na fase célula do Spore.
Motor: Three.js (top-down 2D com sensação de 3D via iluminação, sombras e partículas).

---

## Câmera e Perspectiva
- **Top-down puro ortogonal (90°)** — câmera olhando diretamente para baixo.
- **Jogador SEMPRE no centro da tela.** O mundo se move ao redor dele.
- O mapa flui como em Spore Cell Stage — você não sente que anda, sente que o mundo flui.
- Leve zoom-out conforme o organismo cresce de tamanho.

---

## Mapa
- **Infinito** — geração procedural contínua por chunks.
- Chunks novos são gerados conforme o jogador explora. Chunks distantes são descartados.
- Tamanho do chunk: 200 unidades de mundo.
- Chunk gera: zonas ambientais, food spawns, NPCs iniciais.

### Profundidade do Mar (eixo Y do mundo)
- O mapa simula o oceano: coordenada Y positiva = mais raso (próximo à superfície), Y negativa = mais profundo.
- Luminosidade: mais Y positivo = mais claro/luminoso, mais Y negativo = mais escuro.
- Cor de fundo:
  - Superfície (Y alto): azul claro, ciano, com efeito de luz solar penetrando.
  - Profundidade (Y baixo): azul escuro, quase preto. Bioluminescência de organismos.
- Partículas de plâncton/detritos flutuando em todas as profundidades.
- Efeito de ondas de luz (caustics) no fundo — linhas onduladas de luz como água real.

---

## Parâmetros Ambientais do Mapa (Zones)
Cada ponto do mundo tem 4 atributos, escala **0 a 10** (5 = neutro/seguro para todos).

| Parâmetro     | 0 = mínimo         | 5 = neutro    | 10 = máximo          |
|---------------|-------------------|---------------|----------------------|
| Temperatura   | Gelado             | Temperado     | Fervendo (fumarola)  |
| Pressão       | Superfície (baixa) | Intermediária | Abismo (altíssima)   |
| Radiação      | Escuridão total    | Moderada      | Alta exposição solar |
| Acidez        | Básico (alcalino)  | Neutro        | Ácido corrosivo       |

### Correlações zona-profundidade
- Alta Pressão + Alta Temperatura → Fumarola Profunda (quimiossintética).
- Baixa Pressão + Alta Radiação → Zona de Superfície (fotossintética/radiação).
- Baixa Temperatura + Alta Pressão → Abismo frio.
- Alta Acidez + Profundidade média → Vents químicos.

### Geração das Zones (Noise)
- Cada parâmetro é gerado com Fractal Brownian Motion (FBM) com offsets diferentes.
- Transições suaves entre zonas (sem corte abrupto).
- Escalas diferentes: temperatura varia devagar (biomas grandes), acidez varia mais rápido (microhabitats).

---

## Alimentação — Tipos de Comida

| Tipo             | Spawn em            | Correlação ambiental                       | DNA ganho | Energia |
|------------------|--------------------|--------------------------------------------|-----------|---------|
| Vegetal (algas)  | Mod. luz, qualquer pressão | Radiação 3-7, temperatura 3-7       | 10        | 20      |
| Animal           | Em qualquer zona (outros organismos) | —                       | 25        | 30      |
| Decomposição     | Onde organismos morrem (5 min timer) | Qualquer zona            | 8         | 15      |
| Radiação         | Zonas de alta radiação (7+)           | Radiação alta, pressão baixa | 20   | 15      |
| Ferro (químico)  | Fumarolas profundas | Temperatura 7+, Pressão 7+               | 15        | 25      |
| Enxofre (químico)| Fumarolas profundas | Temperatura 8+, Pressão 6+               | 15        | 25      |

### Spawning
- Vegetais: spawn periódico nas zonas de luz moderada. Aumentam com radiação.
- Químicos: fixos próximos a vents (temperatura/pressão alta).
- Radiação food: partículas que flutuam em zonas de alta radiação.
- Decomposição: spawn automático quando vegetal/animal morre (timer 5 min de existência).

---

## Organismo do Jogador

### Controles
- **WASD / Arrow Keys** → Mover.
- **Mouse (direção)** → Orientação do organismo.
- **Click esquerdo** → Atacar (se tiver genes de carnívoro/espinhos).
- **W** (perto de mesmo-espécie) → Iniciar acasalamento.
- **E** → Comer alimento mais próximo (se compatível com dieta).

### Stats do Organismo
- **Energia**: 0-100. Perde ao se mover, ao tomar dano ambiental. Recupera ao comer.
- **Saúde**: 0-100. Perde apenas em combate. Recupera lentamente com energia alta.
- **DNA**: Acumula ao comer. Ao atingir limiar, abre menu de evolução.
- **Tamanho**: Cresce lentamente com DNA total acumulado (reflete no mesh 3D).

### Morte e Respawn
- Ao chegar a 0 de saúde: morre e respawna.
- Respawna **com 50% dos genes já evoluídos** (como memória genética).
- Respawna no ponto de origem com energia e saúde cheias.
- O corpo morto vira um item de Decomposição.

---

## Sistema de DNA e Evolução

### Acúmulo
- Cada alimento comido concede DNA Points.
- Acasalamento: troca genes com parceiro + bonus de +30 DNA.

### Limiar de Evolução
- A cada **100 DNA points**, um token de evolução é liberado.
- O jogo pausa e abre o **Menu de Evolução** (árvore de genes).
- O jogador escolhe **1 gene** para adquirir.

### Menu de Evolução (Árvore)
Organizado em categorias:

**Mobilidade** (afeta velocidade e estilo de movimento)
- Cílio: +30% velocidade. Visual: anelzinhos de cílios ao redor do corpo.
- Flagelo: +80% velocidade. Visual: 1-2 caudas longas ondulantes.
- Pseudópodo: +10% velocidade + aderência. Visual: 2-4 protuberâncias amebóides.

**Alimentação** (determina o que pode ser consumido)
- Herbívoro: come Vegetal e Decomposição.
- Carnívoro: come Animais (outros organismos menores). Bonus de ataque.
- Decompositório: come Decomposição e Vegetal.
- Fotossintético: "come" Radiação (absorve energia de zonas de luz).
- Quimiossintético: come Ferro e Enxofre.

**Defesa** (proteção e ataque)
- Espinhos: +50% defesa física. Dano ao atacante por contato. Visual: cones pontiagudos.
- Defesa Química: chance 20% de envenenar atacante. Visual: bolinhas ao redor.
- Carapaça: -30% velocidade mas +80% defesa. Visual: placa rígida na parte superior.

**Resistência** (sobrevivência em zonas hostis)
- Resist. Temperatura: tolera até +3 de variação (3 → 8 em vez de 5 ± 2).
- Resist. Pressão: tolera até +3 de variação.
- Resist. Radiação: tolera até +3 de variação.
- Resist. Acidez: tolera até +3 de variação.

### Dano Ambiental
- Zona segura: valor entre **4 e 6** para cada parâmetro (±1 do neutro 5).
- Com resistência: zona segura aumenta (+3 de tolerância para o parâmetro específico).
- Fora da zona tolerada: perde **energia proporcional à distância** do valor tolerado.
  - Ex: temperatura 8, sem resistência → perda de 3 pontos/segundo (8 - 5 = 3 × 1/s).
- Debuff visual: borda da tela pulsa na cor da ameaça (vermelho = calor, azul = frio, etc).

---

## Visual dos Organismos

### Jogador e Mesma Espécie
- Cor base derivada dos genes:
  - Profundidade adaptado → mais claro (branco/ciano).
  - Superfície adaptado → mais escuro (azul escuro).
  - Resistente a química → verde.
  - Resistente a calor → avermelhado.
- Mesma espécie = mesma paleta de cores base (com variações de mutação).
- O jogador pode ver que é "parente" pela cor similar.

### Predadores (outras espécies)
- Cores e formas distintas — laranja/vermelho/marrom para carnívoros agressivos.
- Silhuetas pontiagudas (mais espinhos visíveis).
- Movem-se de forma diferente (ondulante, rápida, caçando).

### Escala de Tamanho e Perigo
- Predadores muito maiores: aparecem com fator de escala 2-5x o jogador.
- Sombra projetada no chão aumenta com o tamanho.
- Efeito visual de "intimidação": leve tremor de câmera quando predador gigante entra na tela.

### Aparência por Gene
| Gene          | Elemento Visual adicionado ao mesh                    |
|---------------|------------------------------------------------------|
| Cílio         | Anel de 24 mini-cílios ao redor do equador do corpo |
| Flagelo       | 1-2 caudas longas ondulantes (TubeGeometry animada) |
| Pseudópodo    | 3-4 protuberâncias amebóides (esferas alongadas)    |
| Espinhos      | 6-12 cones apontados para fora                      |
| Def. Química  | 8 esferas translúcidas flutuando ao redor           |
| Carapaça      | Meia-esfera rígida no topo do corpo                 |
| Fotossintético| Pontos de bioluminescência (dots emissivos)         |
| Quimiossintético | Textura granulada, pontos metálicos              |

---

## NPCs — Outras Espécies

### Mesma Espécie (Amigos/Parceiros)
- Mesma cor que o jogador (com leve variação de mutação).
- Comportamento: wandering aleatório.
- Quando o jogador pressiona W próximo → inicia acasalamento.
- Acasalamento: troca 1-2 genes aleatórios → jogador pode absorver gene novo.
- O parceiro ganha genes do jogador também (bidirecional).

### Predadores
- Espécies diferentes → cores e formas distintas.
- **Spawn fora da tela**, entram no campo de visão.
- Comportamento baseado em razão de tamanho:
  - **Muito maior que jogador (2x+)**: persegue ativamente.
  - **Similar ao jogador**: aproximação cautelosa, ataca se jogador se aproximar.
  - **Menor que jogador**: foge do jogador carnívoro.
- Inteligência básica: detecção de cheiro (raio), perseguição, abandono se distância > threshold.

### Outros Herbívoros/Neutros
- Organismos vegetarianos não agressivos mas fogem de predadores.
- Podem ser caçados pelo jogador (se carnívoro).

---

## Interface (UI Minimalista)

### HUD Principal (sempre visível)
- **Barra de DNA** (topo): gradiente verde → brilhante conforme enche. Subtítulo: "XX / 100 DNA".
- **Barra de Energia** (canto inf. esq.): amarela/laranja.
- **Barra de Saúde** (canto inf. esq.): vermelha, abaixo da energia.
- **Ícone de zona atual** (canto inf. dir.): 4 mini-barras (temp, pressão, radiação, acidez) com valores 0-10. Zonas perigosas ficam piscando.

### Overlays Contextuais
- **Acasalamento disponível** (perto de mesma espécie): ícone de coração pulsando + "[W] Acoplar".
- **Alimento próximo**: ícone pequeno + "[E] Comer".
- **Predador detectado**: borda da tela pisca vermelho. Não há texto para manter imersão.
- **Morte**: fade para preto com "Célula destruída..." e respawn automático em 3 segundos.

### Menu de Evolução (pausa)
- Fundo semi-transparente escuro.
- Árvore de genes visual, categoria por categoria.
- Genes já adquiridos: destacados/coloridos.
- Genes disponíveis (com DNA suficiente): brilhando.
- Genes bloqueados: cinza.
- Click no gene → preview da mudança visual + confirmação.

---

## Áudio

### Música Ambiente
- Som de fundo tipo oceano profundo — baixo, sutil, orgânico.
- Varia com profundidade: raso = sons mais agudos e iluminados. Profundo = grave, misterioso.

### Efeitos Sonoros
- Comer alimento: som de absorção/sucção suave.
- Atacar: impacto orgânico.
- Ser atacado: som de dano, vibração.
- Evolução desbloqueada: som de "upgrade" bioluminescente.
- Morte: som de dissolução, fade out.
- Acasalamento: som calmo, de fusão.
- Entrar em zona hostil: som crescente de perigo (baixo contínuo).

---

## Performance e Chunks

### Chunk System
- Chunk size: 200 × 200 unidades de mundo.
- Raio de carga: 3 chunks ao redor do jogador = 7×7 grid ativo (máx ~49 chunks).
- Ao entrar em novo chunk: gera bioma, food, NPCs.
- Ao sair do raio: chunk é salvo em cache temporário (15s) e depois descartado.

### Object Pooling
- Pool de food items (max 200 ativos simultaneamente).
- Pool de NPCs (max 50 ativos simultaneamente).
- Pool de partículas de plâncton/detritos (max 500).

---

## Tecnologia

- **Three.js r160** via CDN/importmap.
- **ES6 Modules** (sem bundler).
- **OrthographicCamera** top-down.
- **ShaderMaterial** para o fundo (GLSL noise para zonas + efeito de água).
- **WebAudio API** para sons (gerados proceduralmente ou carregados).
- **Arquivos**: index.html + src/ com módulos separados.
