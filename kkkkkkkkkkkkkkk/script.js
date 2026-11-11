"use strict";

const statusText = document.getElementById("status");
const announcer = document.getElementById("announcer");
const settingsDialog = document.getElementById("settingsDialog");
const tutorialDialog = document.getElementById("tutorialDialog");
const victoryDialog = document.getElementById("victoryDialog");
const keyBindingsContainer = document.getElementById("keyBindings");
const worldScene = document.getElementById("worldScene");
const worldViewport = document.getElementById("worldViewport");
const playerObject = document.getElementById("playerObject");
const sceneryObjects = Array.from(worldScene.querySelectorAll(".dead-tree-object, .tower-object, .pond"));

const plantTypes = {
  tree: { name: "Árvore", income: 2 },
  flower: { name: "Flor", income: 4 },
  apple: { name: "Macieira", income: 10 }
};

const worldWidth = 1200;
const worldHeight = 800;
const DAY_DURATION = 30;
const NIGHT_DURATION = 30;
const player = { x: 580, y: 420, speed: 280 };
const playerHitbox = { radius: 11 };
const banditScareRange = 72;
const pond = { x: 962, y: 190, radius: 98 };
const deadTrees = Array.from(worldScene.querySelectorAll(".dead-tree-object")).map((element) => ({
  x: Number(element.dataset.x),
  y: Number(element.dataset.y),
  radius: Number(element.dataset.radius),
  maxSize: Number(element.dataset.maxSize),
  growthStage: 0,
  growthProgress: 0,
  pendingGrowth: 0,
  banditHits: 0,
  spreadElapsed: 0,
  spreadCount: 0,
  maxGrowth: Number(element.dataset.maxGrowth),
  watered: false,
  nextIncome: 0,
  collidable: true,
  isSceneryTree: true,
  element,
  sprite: element.querySelector(".dead-tree-sprite"),
  label: createTreeLabel(element),
  deadImage: element.dataset.dead,
  aliveImage: element.dataset.alive,
  currentImage: element.dataset.dead
}));
const towerElement = worldScene.querySelector(".tower-object");
const tower = {
  x: Number(towerElement.dataset.x),
  y: Number(towerElement.dataset.y),
  radius: Number(towerElement.dataset.radius),
  element: towerElement
};
const worldHitboxes = [
  ...deadTrees.map((tree) => ({ x: tree.x, y: tree.y, radius: tree.radius, tree })),
  { x: pond.x, y: pond.y, radius: 74 },
  { x: tower.x, y: tower.y, radius: tower.radius, tower: true }
];
const state = {
  money: 0,
  easyMode: false,
  forestPercent: 0,
  victoryAchieved: false,
  capacity: 5,
  water: 5,
  seeds: { tree: 5, flower: 0, apple: 0 },
  plants: [],
  grassPatches: [],
  bandits: [],
  nightCount: 0,
  paused: false,
  calm: false,
  isNight: false,
  phaseElapsed: 0,
  lastPhaseSecond: -1,
  lastDisplayedNight: null,
  lastFrame: 0,
  moveTarget: null,
  capturingBinding: null,
  waterEffectTimer: 0,
  camera: { x: 0, y: 0, scale: 1 }
};

const bindingNames = {
  up: "Andar para cima",
  down: "Andar para baixo",
  left: "Andar para a esquerda",
  right: "Andar para a direita",
  plant: "Plantar semente",
  water: "Regar planta",
  refill: "Encher regador",
  scare: "Afastar bandidos",
  pause: "Pausar / continuar"
};

const bindings = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  plant: "KeyP",
  water: "KeyG",
  refill: "KeyR",
  scare: "KeyE",
  pause: "Escape"
};

const heldKeys = new Set();
const crowbar = document.getElementById("crowbar");
let crowbarTimer = 0;
let plantedTreeVariant = 0;
const treeVariants = [
  { maxGrowth: 2, maxSize: 0.8 },
  { maxGrowth: 3, maxSize: 0.95 },
  { maxGrowth: 4, maxSize: 1.1 },
  { maxGrowth: 5, maxSize: 1.3 },
  { maxGrowth: 6, maxSize: 1.5 }
];

function createTreeLabel(element) {
  const label = document.createElement("div");
  label.className = "plant-label tree-label";
  label.textContent = "regue para crescer";
  element.appendChild(label);
  return label;
}

function treeIncome(tree) {
  if (tree.kind === "flower") return plantTypes.flower.income;
  const baseIncome = tree.kind === "apple" ? plantTypes.apple.income : plantTypes.tree.income;
  const size = tree.maxSize * tree.growthStage / tree.maxGrowth;
  return tree.growthStage + Math.floor(size * 8 * baseIncome / 2);
}

function announce(message) {
  announcer.textContent = "";
  window.setTimeout(() => { announcer.textContent = message; }, 20);
}

function setStatus(message) {
  statusText.textContent = message;
  announce(message);
}

function updateStats() {
  document.getElementById("money").textContent = state.money;
  document.getElementById("seeds").textContent =
    state.seeds.tree + state.seeds.flower + state.seeds.apple;
  document.getElementById("water").textContent = state.water;
  document.getElementById("capacity").textContent = state.capacity;
  updateForestProgress();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function growthFraction(tree) {
  return Math.min(1, Math.max(0, (tree.growthStage + tree.growthProgress) / tree.maxGrowth));
}

function plantHitboxRadius(plant) {
  return 16 * Math.max(0.5, plant.maxSize * growthFraction(plant));
}

function updateForestProgress() {
  const treeArea = [...deadTrees, ...state.plants].reduce((total, tree) => {
    const growth = growthFraction(tree);
    if (tree.kind === "flower") return total + 1.5 * growth;
    return total + (tree.isSceneryTree ? 8 : tree.kind === "apple" ? 7 : 6) * growth;
  }, 0);
  const grassArea = state.grassPatches.reduce(
    (total, patch) => total + 0.35 * patch.growthStage / patch.maxGrowth,
    0
  );
  const percent = Math.min(100, Math.round(treeArea + grassArea));
  const goal = state.easyMode ? 10 : 60;
  state.forestPercent = percent;
  document.getElementById("forestPercent").textContent = String(percent);
  document.getElementById("forestGoal").textContent = String(goal);
  const progress = document.getElementById("forestProgress");
  progress.value = percent;
  progress.setAttribute("aria-valuetext", `${percent}% de 100%; meta ${goal}%`);

  if (
    percent >= goal &&
    !state.victoryAchieved &&
    !settingsDialog.open &&
    !tutorialDialog.open &&
    !victoryDialog.open
  ) {
    state.victoryAchieved = true;
    document.getElementById("victoryMessage").textContent =
      `Você atingiu ${percent}% de reflorestamento e concluiu o jogo!`;
    victoryDialog.showModal();
    setStatus("Meta de reflorestamento alcançada. Você venceu!");
  }
}

function plantSeed() {
  if (state.paused) {
    setStatus("Continue o jogo nas configurações para plantar.");
    return;
  }
  const kind = ["tree", "flower", "apple"].find((type) => state.seeds[type] > 0);
  if (!kind) {
    setStatus("Você está sem sementes.");
    return;
  }
  if (state.plants.some((plant) => distance(player, plant) < 38)) {
    setStatus("Ande um pouco para escolher outro lugar para plantar.");
    return;
  }
  if (kind !== "flower" && overlapsTreeAt(player.x, player.y, 20)) {
    setStatus("Esse lugar está muito perto de outra árvore.");
    return;
  }

  const isTree = kind !== "flower";
  const variant = isTree
    ? treeVariants[plantedTreeVariant++ % treeVariants.length]
    : { maxGrowth: 1, maxSize: 1 };
  const plant = {
    x: player.x,
    y: player.y,
    kind,
    growthStage: 0,
    growthProgress: 0,
    pendingGrowth: 0,
    banditHits: 0,
    spreadElapsed: 0,
    spreadCount: 0,
    maxGrowth: variant.maxGrowth,
    maxSize: variant.maxSize,
    watered: false,
    nextIncome: 0,
    collidable: false,
    element: createPlantElement(kind)
  };
  state.seeds[kind] -= 1;
  state.plants.push(plant);
  updateStats();
  updateWorld();
  setStatus(`${plantTypes[kind].name} plantada.`);
}

function nearestWaterTarget() {
  const targets = [...state.plants, ...deadTrees];
  let nearest = null;
  let nearestDistance = Infinity;

  for (const target of targets) {
    if (target.growthStage + target.pendingGrowth >= target.maxGrowth) continue;
    const currentDistance = distance(player, target);
    if (currentDistance < nearestDistance) {
      nearest = target;
      nearestDistance = currentDistance;
    }
  }

  return { target: nearest, distance: nearestDistance };
}

function waterPlant() {
  if (state.paused) {
    setStatus("Continue o jogo nas configurações para regar.");
    return;
  }

  const { target, distance: targetDistance } = nearestWaterTarget();
  if (!target || targetDistance > 76) {
    const alreadyGrowingNearby = [...state.plants, ...deadTrees].some(
      (item) => item.pendingGrowth > 0 && distance(player, item) <= 76
    );
    if (alreadyGrowingNearby) {
      setStatus("Essa planta já está preparada para crescer durante a noite.");
      return;
    }
    growGrassAtPlayer();
    return;
  }
  if (state.water < 1) {
    setStatus("O regador está vazio.");
    return;
  }

  state.water -= 1;
  target.pendingGrowth += 1;
  if (!target.watered) {
    target.watered = true;
    target.nextIncome = performance.now() + DAY_DURATION * 1000;
  }
  showWateringEffect();
  updateStats();
  updateWorld();

  const name = target.isSceneryTree ? "Árvore morta recuperada" : plantTypes[target.kind].name;
  setStatus(`${name} regada. Vai começar a crescer durante a noite.`);
}

function growGrassAtPlayer() {
  if (state.water < 1) {
    setStatus("O regador está vazio.");
    return;
  }

  let patch = null;
  let closestDistance = Infinity;
  for (const grass of state.grassPatches) {
    const currentDistance = distance(player, grass);
    if (grass.growthStage < grass.maxGrowth && currentDistance < closestDistance && currentDistance <= 76) {
      patch = grass;
      closestDistance = currentDistance;
    }
  }

  if (!patch) {
    patch = createGrassPatch(player.x, player.y);
    state.grassPatches.push(patch);
  }

  state.water -= 1;
  patch.growthStage += 1;
  patch.element.style.setProperty("--grass-growth", String(patch.growthStage / patch.maxGrowth));
  patch.element.style.zIndex = String(Math.round(patch.y));
  for (let index = 0; index < patch.sprouts.length; index += 1) {
    patch.sprouts[index].style.visibility = index < patch.growthStage * 2 ? "visible" : "hidden";
  }

  showWateringEffect();
  updateStats();
  updateWorld();
  setStatus(`A grama está crescendo: etapa ${patch.growthStage} de ${patch.maxGrowth}.`);
}

function createGrassPatch(x, y) {
  const element = document.createElement("div");
  element.className = "grass-regrowth";
  element.setAttribute("aria-hidden", "true");
  const sprouts = [];
  const offsets = [
    [-26, -8], [-12, 6], [4, -10], [19, 4],
    [-21, 17], [-3, 18], [15, 17], [30, -12]
  ];

  for (const [left, top] of offsets) {
    const sprout = document.createElement("img");
    sprout.src = "assets/grama.png";
    sprout.alt = "";
    sprout.draggable = false;
    sprout.style.left = `${left}px`;
    sprout.style.top = `${top}px`;
    sprout.style.visibility = "hidden";
    element.appendChild(sprout);
    sprouts.push(sprout);
  }

  worldScene.appendChild(element);
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  return { x, y, growthStage: 0, maxGrowth: 4, element, sprouts };
}

function spreadGreenAroundTree(tree) {
  const angle = tree.spreadCount * 2.4;
  const distanceFromTree = 48 + (tree.spreadCount % 3) * 18;
  const x = Math.max(35, Math.min(worldWidth - 35, tree.x + Math.cos(angle) * distanceFromTree));
  const y = Math.max(35, Math.min(worldHeight - 35, tree.y + Math.sin(angle) * distanceFromTree));
  tree.spreadCount += 1;

  if (state.grassPatches.some((patch) => distance({ x, y }, patch) < 38)) return;

  const patch = createGrassPatch(x, y);
  patch.growthStage = 1;
  patch.element.style.setProperty("--grass-growth", String(patch.growthStage / patch.maxGrowth));
  for (let index = 0; index < patch.sprouts.length; index += 1) {
    patch.sprouts[index].style.visibility = index < patch.growthStage * 2 ? "visible" : "hidden";
  }
  state.grassPatches.push(patch);
}

function spawnBandits() {
  const starts = [
    { x: 70, y: 80 },
    { x: worldWidth - 70, y: 90 },
    { x: worldWidth - 80, y: worldHeight - 80 }
  ];

  state.bandits = starts.map(({ x, y }, index) => {
    const element = document.createElement("div");
    element.className = "bandit-object";
    element.setAttribute("aria-label", `Bandido ${index + 1}`);
    element.setAttribute("aria-hidden", "true");
    const sprite = document.createElement("img");
    sprite.className = "bandit-sprite";
    sprite.src = "assets/by_undead.png";
    sprite.alt = "";
    sprite.draggable = false;
    element.appendChild(sprite);
    const health = document.createElement("div");
    health.className = "bandit-health";
    health.setAttribute("role", "meter");
    health.setAttribute("aria-label", `Vida do bandido ${index + 1}`);
    health.setAttribute("aria-valuemin", "0");
    health.setAttribute("aria-valuemax", "4");
    health.setAttribute("aria-valuenow", "4");
    const healthFill = document.createElement("span");
    healthFill.className = "bandit-health-fill";
    health.appendChild(healthFill);
    element.appendChild(health);
    worldScene.appendChild(element);
    return {
      x,
      y,
      element,
      healthFill,
      health,
      healthPoints: 4,
      maxHealth: 4,
      attackTimer: 0,
      wanderTarget: null,
      defeated: false
    };
  });
}

function clearBandits() {
  for (const bandit of state.bandits) bandit.element.remove();
  state.bandits = [];
}

function scareBandits() {
  if (state.paused) {
    setStatus("Continue o jogo para afastar os bandidos.");
    return;
  }
  const activeBandits = state.bandits.filter((bandit) => !bandit.defeated);
  if (activeBandits.length === 0) {
    setStatus("Não há bandidos para afastar agora.");
    return;
  }

  const nearbyBandits = activeBandits.filter(
    (bandit) => !bandit.defeated && distance(player, bandit) <= banditScareRange
  );
  if (nearbyBandits.length === 0) {
    setStatus("Chegue perto de um bandido para afastá-lo.");
    return;
  }

  for (const bandit of nearbyBandits) {
    bandit.healthPoints -= 1;
    bandit.healthFill.style.width = `${bandit.healthPoints / bandit.maxHealth * 100}%`;
    bandit.health.setAttribute("aria-valuenow", String(bandit.healthPoints));
    if (bandit.healthPoints <= 0) {
      bandit.defeated = true;
      bandit.element.classList.add("is-defeated");
      bandit.health.hidden = true;
    }
  }
  playerObject.classList.add("is-swinging");
  window.clearTimeout(crowbarTimer);
  crowbarTimer = window.setTimeout(() => playerObject.classList.remove("is-swinging"), 550);
  const defeatedCount = nearbyBandits.filter((bandit) => bandit.defeated).length;
  setStatus(
    defeatedCount
      ? `${defeatedCount} bandido${defeatedCount === 1 ? "" : "s"} derrotado${defeatedCount === 1 ? "" : "s"}. Ficará caído até amanhecer.`
      : `Você acertou ${nearbyBandits.length === 1 ? "um bandido" : `${nearbyBandits.length} bandidos`}. Continue dando tapas para derrotá-los.`
  );
}

function killTree(tree) {
  tree.growthStage = 0;
  tree.growthProgress = 0;
  tree.pendingGrowth = 0;
  tree.banditHits = 0;
  tree.watered = false;
  tree.nextIncome = 0;
  if (tree.isSceneryTree) updateSceneryTreeGrowth(tree);
  else updatePlantGrowth(tree);
  setStatus("Um bandido destruiu uma árvore! Regue-a para começar de novo.");
}

function damageGrassAlongPath(x, y) {
  for (const patch of state.grassPatches) {
    if (patch.growthStage > 0 && distance({ x, y }, patch) < 34) {
      patch.growthStage = 0;
      patch.element.style.setProperty("--grass-growth", "0");
      for (const sprout of patch.sprouts) sprout.style.visibility = "hidden";
    }
  }
}

function nearestGrowingTree(x, y) {
  return [...deadTrees, ...state.plants]
    .filter((tree) =>
      tree.kind !== "flower" &&
      (tree.watered || tree.growthStage > 0 || tree.growthProgress > 0)
    )
    .sort((a, b) => distance({ x, y }, a) - distance({ x, y }, b))[0] || null;
}

function updateBandits(seconds) {
  for (const bandit of state.bandits) {
    if (bandit.defeated) continue;
    let target = nearestGrowingTree(bandit.x, bandit.y);
    if (!target) {
      if (!bandit.wanderTarget || distance(bandit, bandit.wanderTarget) < 12) {
        bandit.wanderTarget = {
          x: 60 + Math.random() * (worldWidth - 120),
          y: 60 + Math.random() * (worldHeight - 120)
        };
      }
      target = bandit.wanderTarget;
    } else {
      bandit.wanderTarget = null;
    }

    const dx = target.x - bandit.x;
    const dy = target.y - bandit.y;
    const distanceToTarget = Math.hypot(dx, dy);
    const attackRange = "isSceneryTree" in target ? target.radius + 22 : 34;

    if (distanceToTarget > attackRange) {
      const step = Math.min(48 * seconds, distanceToTarget - attackRange);
      bandit.x += dx / distanceToTarget * step;
      bandit.y += dy / distanceToTarget * step;
      damageGrassAlongPath(bandit.x, bandit.y);
      bandit.attackTimer = 0;
    } else if ("isSceneryTree" in target || target.kind !== undefined) {
      bandit.attackTimer += seconds;
      if (bandit.attackTimer >= 1) {
        bandit.attackTimer -= 1;
        target.banditHits += 1;
        if (target.banditHits >= 10) killTree(target);
      }
    }
  }
}

function showWateringEffect() {
  playerObject.classList.add("is-watering");
  window.clearTimeout(state.waterEffectTimer);
  state.waterEffectTimer = window.setTimeout(() => {
    playerObject.classList.remove("is-watering");
  }, 700);
}

function updateSceneryTreeGrowth(tree) {
  const progress = growthFraction(tree);
  const hasGrown = progress > 0;
  tree.element.classList.toggle("is-regrown", hasGrown);
  tree.element.classList.toggle("is-growing", hasGrown);
  tree.element.style.setProperty("--growth-scale", String(tree.maxSize * progress || 0.05));
  tree.element.querySelector(".regrowth-patch").style.opacity = String(progress);
  tree.label.textContent = tree.pendingGrowth > 0
    ? (state.isNight ? "crescendo à noite" : "cresce à noite")
    : tree.banditHits > 0 ? `⚠️ ${tree.banditHits}/10 tapas`
      : tree.watered ? `+${treeIncome(tree)} moedas / 30s` : "regue para crescer";
  const hitbox = worldHitboxes.find((item) => item.tree === tree);
  if (hitbox) hitbox.radius = tree.radius * Math.max(1, tree.maxSize * progress);
  const image = hasGrown ? tree.aliveImage : tree.deadImage;
  if (tree.currentImage !== image) {
    tree.sprite.src = image;
    tree.currentImage = image;
  }
}

function updatePlantGrowth(plant) {
  const progress = growthFraction(plant);
  const hasGrown = progress > 0;
  plant.element.classList.toggle("is-regrown", hasGrown);
  plant.element.classList.toggle("is-growing", hasGrown);
  plant.element.classList.toggle("is-mature", plant.growthStage >= plant.maxGrowth);
  const sizeScale = plant.maxSize * progress;
  plant.element.style.setProperty("--growth-scale", String(sizeScale));
  plant.element.querySelector(".regrowth-patch").style.opacity = String(progress);
  plant.element.querySelector(".plant-label").textContent = plant.pendingGrowth > 0
    ? (state.isNight ? "crescendo à noite" : "cresce à noite")
    : plant.banditHits > 0 ? `⚠️ ${plant.banditHits}/10 tapas`
      : `+${treeIncome(plant)} moedas / 30s`;
  if (plant.kind !== "flower") {
    plant.element.querySelector(".plant-tree-image").style.setProperty("--growth-scale", String(sizeScale));
  }
}

function growDuringNight(seconds) {
  for (const tree of [...state.plants, ...deadTrees]) {
    if (tree.pendingGrowth > 0) {
      tree.growthProgress += seconds / NIGHT_DURATION;
      while (tree.growthProgress >= 1 - 1e-9 && tree.pendingGrowth > 0) {
        tree.growthStage += 1;
        tree.pendingGrowth -= 1;
        tree.growthProgress = Math.max(0, tree.growthProgress - 1);
      }
      if (tree.pendingGrowth === 0) tree.growthProgress = 0;
    }

    if (tree.kind !== "flower" && growthFraction(tree) > 0) {
      tree.spreadElapsed += seconds;
      while (tree.spreadElapsed >= 8) {
        tree.spreadElapsed -= 8;
        spreadGreenAroundTree(tree);
      }
    }

    if (tree.isSceneryTree) updateSceneryTreeGrowth(tree);
    else updatePlantGrowth(tree);
  }
  updateForestProgress();
}

function advanceDayNight(seconds) {
  let remaining = seconds;
  while (remaining > 0) {
    const duration = state.isNight ? NIGHT_DURATION : DAY_DURATION;
    const phaseRemaining = duration - state.phaseElapsed;
    const step = Math.min(remaining, phaseRemaining);

    if (state.isNight) growDuringNight(step);

    state.phaseElapsed += step;
    remaining -= step;

    if (state.phaseElapsed >= duration) {
      state.phaseElapsed = 0;
      state.isNight = !state.isNight;
      worldViewport.classList.toggle("night-mode", state.isNight);
      if (state.isNight) {
        state.nightCount += 1;
        if (state.nightCount % 2 === 1) {
          spawnBandits();
          setStatus("A noite chegou! Três bandidos estão rondando. Use E para afastá-los.");
        } else {
          clearBandits();
          setStatus("A noite chegou. As plantas começam a crescer.");
        }
      } else {
        clearBandits();
        setStatus("O dia amanheceu.");
      }
      updateStats();
    }
  }

  const duration = state.isNight ? NIGHT_DURATION : DAY_DURATION;
  const secondsLeft = Math.ceil(duration - state.phaseElapsed);
  if (state.lastPhaseSecond !== secondsLeft || state.lastDisplayedNight !== state.isNight) {
    state.lastPhaseSecond = secondsLeft;
    state.lastDisplayedNight = state.isNight;
    document.getElementById("phaseName").textContent = state.isNight ? "🌙 Noite" : "☀️ Dia";
    document.getElementById("dayNight").setAttribute("aria-label",
      `${state.isNight ? "Noite" : "Dia"}; faltam ${secondsLeft} segundos para a próxima fase`);
    document.getElementById("phaseTime").textContent = secondsLeft;
  }
}

function refillWater() {
  if (state.paused) {
    setStatus("Continue o jogo nas configurações para encher o regador.");
    return;
  }
  if (distance(player, pond) > pond.radius + 22) {
    setStatus("Chegue perto do lago para encher o regador.");
    return;
  }
  if (state.water === state.capacity) {
    setStatus("O regador já está cheio.");
    return;
  }

  state.water = state.capacity;
  updateStats();
  setStatus("Regador cheio.");
}

function buySeeds(kind) {
  const offers = {
    flower: { price: 12, amount: 3, label: "sementes de flores" },
    apple: { price: 30, amount: 2, label: "sementes de macieira" }
  };
  const offer = offers[kind];
  if (!offer) {
    setStatus("Essa semente não está disponível na loja.");
    return;
  }
  if (state.money < offer.price) {
    setStatus(`Faltam ${offer.price - state.money} moedas.`);
    return;
  }

  state.money -= offer.price;
  state.seeds[kind] += offer.amount;
  updateStats();
  setStatus(`Compra realizada: ${offer.amount} ${offer.label}.`);
}

function upgradeWateringCan() {
  if (state.money < 25) {
    setStatus(`Faltam ${25 - state.money} moedas.`);
    return;
  }

  state.money -= 25;
  state.capacity += 3;
  state.water += 3;
  updateStats();
  setStatus(`Regador melhorado. Capacidade: ${state.capacity} unidades de água.`);
}

function togglePause() {
  state.paused = !state.paused;
  const button = document.getElementById("pauseButton");
  button.textContent = state.paused ? "▶ Continuar jogo" : "⏸ Pausar jogo";
  button.setAttribute("aria-pressed", String(state.paused));
  state.moveTarget = null;
  heldKeys.clear();
  setStatus(state.paused ? "Jogo pausado." : "Jogo continuado.");
}

function createPlantElement(kind) {
  const element = document.createElement("div");
  element.className = `plant-object plant-${kind}`;
  element.setAttribute("aria-hidden", "true");

  const patch = document.createElement("div");
  patch.className = "regrowth-patch";
  element.appendChild(patch);

  const shadow = document.createElement("div");
  shadow.className = "plant-shadow";
  element.appendChild(shadow);

  const seed = document.createElement("div");
  seed.className = "plant-seed";
  element.appendChild(seed);

  if (kind === "flower") {
    const flower = document.createElement("div");
    flower.className = "plant-flower";
    flower.textContent = "🌼";
    element.appendChild(flower);
  } else {
    const tree = document.createElement("img");
    tree.className = "plant-tree-image";
    tree.src = state.plants.length % 2 === 0 ? "assets/Arvore 1.png" : "assets/Arvore 2.png";
    tree.alt = "";
    element.appendChild(tree);
    if (kind === "apple") {
      const fruit = document.createElement("span");
      fruit.className = "plant-fruit";
      fruit.textContent = "🍎";
      element.appendChild(fruit);
    }
  }

  const label = document.createElement("div");
  label.className = "plant-label";
  label.textContent = "precisa de água";
  element.appendChild(label);
  worldScene.appendChild(element);
  return element;
}

function updateWorld() {
  const width = worldViewport.clientWidth;
  const height = worldViewport.clientHeight;
  const scale = Math.max(width / worldWidth, height / worldHeight);
  state.camera.scale = scale;
  state.camera.x = Math.min(0, Math.max(width - worldWidth * scale, width / 2 - player.x * scale));
  state.camera.y = Math.min(0, Math.max(height - worldHeight * scale, height / 2 - player.y * scale));

  const { x, y } = state.camera;
  worldScene.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  for (const object of sceneryObjects) {
    const tree = deadTrees.find((item) => item.element === object);
    const scenery = tree || (object === towerElement ? tower : null);
    object.style.transform = scenery
      ? `translate3d(${scenery.x}px, ${scenery.y}px, 0)`
      : "";
    object.style.zIndex = String(Math.round(scenery ? scenery.y : object.offsetTop + object.offsetHeight));
  }
  playerObject.style.transform = `translate3d(${player.x}px, ${player.y}px, 0)`;
  playerObject.style.zIndex = String(Math.round(player.y));

  for (const plant of state.plants) {
    plant.element.style.transform = `translate3d(${plant.x}px, ${plant.y}px, 0)`;
    plant.element.style.zIndex = String(Math.round(plant.y));
    plant.element.querySelector(".plant-label").textContent = plant.banditHits > 0
      ? `⚠️ ${plant.banditHits}/10 tapas`
      : plant.pendingGrowth > 0
      ? (state.isNight ? "crescendo à noite" : "cresce à noite")
      : plant.watered ? `+${treeIncome(plant)} moedas / 30s`
      : "precisa de água";
  }

  for (const tree of deadTrees) {
    tree.label.textContent = tree.banditHits > 0
      ? `⚠️ ${tree.banditHits}/10 tapas`
      : tree.pendingGrowth > 0
      ? (state.isNight ? "crescendo à noite" : "cresce à noite")
      : tree.watered ? `+${treeIncome(tree)} moedas / 30s`
      : "regue para crescer";
  }

  for (const bandit of state.bandits) {
    bandit.element.style.transform = `translate3d(${bandit.x}px, ${bandit.y}px, 0)`;
    bandit.element.style.zIndex = String(Math.round(bandit.y));
  }

  for (const patch of state.grassPatches) {
    patch.element.style.zIndex = String(Math.round(patch.y));
  }
}

function overlapsTreeAt(x, y, radius) {
  const sceneryCollision = worldHitboxes.some((hitbox) =>
    distance({ x, y }, hitbox) < radius + hitbox.radius
  );
  const plantCollision = state.plants.some((plant) =>
    plant.kind !== "flower" &&
    distance({ x, y }, plant) < radius + plantHitboxRadius(plant)
  );
  return sceneryCollision || plantCollision;
}

function canOccupy(x, y) {
  if (
    x < playerHitbox.radius ||
    x > worldWidth - playerHitbox.radius ||
    y < playerHitbox.radius ||
    y > worldHeight - playerHitbox.radius
  ) return false;

  for (const hitbox of worldHitboxes) {
    if (blocksMovement(x, y, hitbox, hitbox.radius)) return false;
  }

  for (const plant of state.plants) {
    if (
      plant.collidable &&
      plant.kind !== "flower" &&
      blocksMovement(x, y, plant, plantHitboxRadius(plant))
    ) return false;
  }
  return true;
}

function blocksMovement(x, y, obstacle, obstacleRadius) {
  const collisionDistance = playerHitbox.radius + obstacleRadius;
  const currentDistance = distance(player, obstacle);
  const nextDistance = distance({ x, y }, obstacle);
  if (nextDistance >= collisionDistance) return false;
  return currentDistance >= collisionDistance || nextDistance < currentDistance;
}

function resizeWorld() {
  updateWorld();
}

function isDirectionPressed(direction) {
  return heldKeys.has(bindings[direction]);
}

function updateMovement(seconds) {
  let dx = Number(isDirectionPressed("right")) - Number(isDirectionPressed("left"));
  let dy = Number(isDirectionPressed("down")) - Number(isDirectionPressed("up"));

  if (dx || dy) {
    state.moveTarget = null;
  } else if (state.moveTarget) {
    dx = state.moveTarget.x - player.x;
    dy = state.moveTarget.y - player.y;
    if (Math.hypot(dx, dy) < 5) {
      state.moveTarget = null;
      dx = 0;
      dy = 0;
    }
  }

  if (dx && dy) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
  } else {
    dx = Math.sign(dx);
    dy = Math.sign(dy);
  }

  const moveX = dx * player.speed * seconds;
  const moveY = dy * player.speed * seconds;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)) / 4));
  const stepX = moveX / steps;
  const stepY = moveY / steps;

  for (let step = 0; step < steps; step += 1) {
    if (canOccupy(player.x + stepX, player.y)) player.x += stepX;
    if (canOccupy(player.x, player.y + stepY)) player.y += stepY;
  }

  for (const plant of state.plants) {
    if (
      !plant.collidable &&
      plant.kind !== "flower" &&
      distance(player, plant) >= playerHitbox.radius + plantHitboxRadius(plant)
    ) plant.collidable = true;
  }
}

function awardIncome(now) {
  let earned = 0;
  for (const tree of [...state.plants, ...deadTrees]) {
    if (tree.watered && now >= tree.nextIncome) {
      earned += treeIncome(tree);
      tree.nextIncome = now + 30000;
    }
  }
  if (earned > 0) {
    state.money += earned;
    updateStats();
    setStatus(`Você ganhou ${earned} moedas.`);
  }
}

function frame(now) {
  const elapsed = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0;
  state.lastFrame = now;
  if (!state.paused && !settingsDialog.open && !tutorialDialog.open) {
    advanceDayNight(elapsed);
    updateMovement(elapsed);
    updateBandits(elapsed);
    awardIncome(now);
  }
  updateWorld();
  window.requestAnimationFrame(frame);
}

function formatKey(code) {
  const namedKeys = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Space: "Espaço"
  };
  if (namedKeys[code]) return namedKeys[code];
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function renderKeyBindings() {
  keyBindingsContainer.replaceChildren();
  for (const [action, label] of Object.entries(bindingNames)) {
    const row = document.createElement("div");
    row.className = "key-binding-row";

    const name = document.createElement("span");
    name.textContent = label;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.binding = action;
    button.textContent = state.capturingBinding === action
      ? "Pressione uma tecla"
      : formatKey(bindings[action]);
    button.setAttribute("aria-label", `Alterar tecla: ${label}`);
    button.addEventListener("click", () => {
      state.capturingBinding = action;
      renderKeyBindings();
      keyBindingsContainer.querySelector(`[data-binding="${action}"]`)?.focus();
    });

    row.append(name, button);
    keyBindingsContainer.appendChild(row);
  }
}

function handleKeyDown(event) {
  if (state.capturingBinding) {
    event.preventDefault();
    const action = state.capturingBinding;
    const conflictingAction = Object.keys(bindings).find(
      (key) => key !== action && bindings[key] === event.code
    );
    if (conflictingAction) {
      setStatus(`Essa tecla já está configurada para ${bindingNames[conflictingAction]}.`);
      return;
    }

    bindings[action] = event.code;
    state.capturingBinding = null;
    renderKeyBindings();
    setStatus(`Tecla alterada: ${bindingNames[action]}: ${formatKey(event.code)}.`);
    return;
  }

  if (settingsDialog.open || tutorialDialog.open) return;

  if (Object.values(bindings).includes(event.code)) event.preventDefault();
  heldKeys.add(event.code);
  if (event.repeat) return;

  if (event.code === bindings.plant) plantSeed();
  if (event.code === bindings.water) waterPlant();
  if (event.code === bindings.refill) refillWater();
  if (event.code === bindings.scare) scareBandits();
  if (event.code === bindings.pause) togglePause();
}

function setMoveTarget(event) {
  if (state.paused || settingsDialog.open || tutorialDialog.open) return;
  const rect = worldViewport.getBoundingClientRect();
  const scale = state.camera.scale;
  state.moveTarget = {
    x: Math.max(25, Math.min(worldWidth - 25, (event.clientX - rect.left - state.camera.x) / scale)),
    y: Math.max(25, Math.min(worldHeight - 25, (event.clientY - rect.top - state.camera.y) / scale))
  };
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", (event) => heldKeys.delete(event.code));
window.addEventListener("blur", () => heldKeys.clear());
worldViewport.addEventListener("pointerdown", setMoveTarget);

document.getElementById("openSettings").addEventListener("click", () => {
  state.moveTarget = null;
  heldKeys.clear();
  settingsDialog.showModal();
});
document.getElementById("closeSettings").addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
settingsDialog.addEventListener("close", () => {
  state.capturingBinding = null;
  renderKeyBindings();
  updateForestProgress();
});

tutorialDialog.addEventListener("click", (event) => {
  if (event.target === tutorialDialog) tutorialDialog.close();
});
document.getElementById("startTutorialButton").addEventListener("click", () => tutorialDialog.close());
document.getElementById("skipTutorialButton").addEventListener("click", () => tutorialDialog.close());
document.getElementById("continueAfterVictoryButton").addEventListener("click", () => victoryDialog.close());
document.getElementById("easyModeButton").addEventListener("click", (event) => {
  state.easyMode = !state.easyMode;
  event.currentTarget.setAttribute("aria-pressed", String(state.easyMode));
  event.currentTarget.textContent = `Modo fácil: ${state.easyMode ? "ativado" : "desativado"}`;
  updateForestProgress();
  setStatus(`Modo fácil ${state.easyMode ? "ativado" : "desativado"}. Meta: ${state.easyMode ? 10 : 60}% de reflorestamento.`);
});

document.getElementById("plantButton").addEventListener("click", plantSeed);
document.getElementById("waterButton").addEventListener("click", waterPlant);
document.getElementById("refillButton").addEventListener("click", refillWater);
document.getElementById("scareBanditsButton").addEventListener("click", scareBandits);
document.getElementById("pauseButton").addEventListener("click", togglePause);
document.getElementById("wateringCanUpgradeButton").addEventListener("click", upgradeWateringCan);
document.querySelectorAll("[data-buy]").forEach((button) => {
  button.addEventListener("click", () => buySeeds(button.dataset.buy));
});

document.getElementById("textButton").addEventListener("click", (event) => {
  const enabled = document.body.classList.toggle("large-text");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "Texto normal" : "Aumentar texto";
});

document.getElementById("contrastButton").addEventListener("click", (event) => {
  const enabled = document.body.classList.toggle("high-contrast");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "Contraste normal" : "Alto contraste";
});

document.getElementById("calmButton").addEventListener("click", (event) => {
  state.calm = !state.calm;
  document.body.classList.toggle("calm-mode", state.calm);
  event.currentTarget.setAttribute("aria-pressed", String(state.calm));
  event.currentTarget.textContent = state.calm ? "Efeitos reduzidos" : "Reduzir efeitos visuais";
});

updateStats();
renderKeyBindings();
resizeWorld();
window.addEventListener("resize", resizeWorld);
updateWorld();
tutorialDialog.showModal();
window.requestAnimationFrame(frame);
