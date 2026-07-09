import type { Behaviour, Condition, Cow, SimState, Weather, WeatherMode } from './types';
import { HISTORY_SAMPLES, SAMPLE_INTERVAL_MIN } from './types';

const COW_NAMES = [
  'Bella', 'Daisy', 'Molly', 'Rosie', 'Buttercup', 'Clover', 'Maggie', 'Luna',
  'Dotty', 'Poppy', 'Hazel', 'Willow', 'Ruby', 'Pearl', 'Ginger', 'Olive',
  'Tilly', 'Nellie', 'Flora', 'Betsy', 'Marigold', 'Pip', 'Sage', 'Fern',
];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randn = () => {
  // Box–Muller, one sample
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Typical walking/grazing speeds in m/s */
const SPEED: Record<Behaviour, number> = {
  grazing: 0.12,
  walking: 1.0,
  resting: 0,
  ruminating: 0,
};

const BASE_TEMP = 38.6;

/** How each condition shifts pace, behaviour weights, body temp, and herd position. */
const CONDITION_EFFECTS: Record<Condition, {
  paceMult: number;
  weightMult: Partial<Record<Behaviour, number>>;
  tempOffset: number;
  /** multiplier on the cow's home offset — >1 drifts away from the herd */
  isolation: number;
}> = {
  healthy: { paceMult: 1, weightMult: {}, tempOffset: 0, isolation: 1 },
  // Lameness: painful to walk — slow, lags on herd moves, lies down more
  lame: {
    paceMult: 0.35,
    weightMult: { walking: 0.4, grazing: 0.7, resting: 1.8 },
    tempOffset: 0.2,
    isolation: 1.3,
  },
  // Illness: fever, appetite and rumination collapse, withdraws from the herd
  ill: {
    paceMult: 0.55,
    weightMult: { grazing: 0.35, ruminating: 0.3, resting: 2.2, walking: 0.5 },
    tempOffset: 1.4,
    isolation: 2.6,
  },
  // Oestrus: restless — more walking, less resting/ruminating, slight temp rise
  oestrus: {
    paceMult: 1.35,
    weightMult: { walking: 3.5, resting: 0.35, ruminating: 0.5, grazing: 0.9 },
    tempOffset: 0.4,
    isolation: 0.8,
  },
};

export function setCondition(cow: Cow, condition: Condition, timeMin: number): void {
  cow.condition = condition;
  cow.conditionSince = condition === 'healthy' ? null : timeMin;
  // Re-pick behaviour soon so the change shows quickly
  cow.behaviourUntil = Math.min(cow.behaviourUntil, timeMin + 2);
}

/** Presets the forced weather modes drive towards */
const WEATHER_PRESETS: Record<Exclude<WeatherMode, 'auto'>, Weather['target']> = {
  sunny: { ambientTemp: 20, windSpeed: 2, rain: 0, cloud: 0.15 },
  heatwave: { ambientTemp: 31, windSpeed: 1.5, rain: 0, cloud: 0.05 },
  rain: { ambientTemp: 13, windSpeed: 6, rain: 0.8, cloud: 0.95 },
  windy: { ambientTemp: 15, windSpeed: 12, rain: 0.1, cloud: 0.6 },
};

function createWeather(): Weather {
  return {
    mode: 'auto',
    ambientTemp: 17,
    windSpeed: 3,
    windDir: rand(0, Math.PI * 2),
    rain: 0,
    cloud: 0.3,
    nextFrontAt: 0,
    target: { ambientTemp: 17, windSpeed: 3, rain: 0, cloud: 0.3 },
  };
}

export function setWeatherMode(sim: SimState, mode: WeatherMode): void {
  const w = sim.weather;
  w.mode = mode;
  if (mode === 'auto') {
    w.nextFrontAt = sim.timeMin; // pick a fresh front immediately
  } else {
    w.target = { ...WEATHER_PRESETS[mode] };
  }
}

function updateWeather(sim: SimState, dtMin: number): void {
  const w = sim.weather;

  if (w.mode === 'auto' && sim.timeMin >= w.nextFrontAt) {
    // A new front every 3–8 h: mostly fair, occasionally wet or blustery
    const r = Math.random();
    if (r < 0.55) w.target = { ambientTemp: rand(14, 24), windSpeed: rand(1, 5), rain: 0, cloud: rand(0.1, 0.5) };
    else if (r < 0.75) w.target = { ambientTemp: rand(10, 15), windSpeed: rand(4, 9), rain: rand(0.4, 0.9), cloud: rand(0.8, 1) };
    else if (r < 0.9) w.target = { ambientTemp: rand(12, 18), windSpeed: rand(9, 14), rain: rand(0, 0.2), cloud: rand(0.4, 0.8) };
    else w.target = { ambientTemp: rand(27, 33), windSpeed: rand(1, 3), rain: 0, cloud: rand(0, 0.15) };
    w.nextFrontAt = sim.timeMin + rand(180, 480);
  }

  // Diurnal swing on top of the front's base temperature (peak mid-afternoon)
  const hourFrac = (sim.timeMin % (24 * 60)) / (24 * 60);
  const diurnal = 4 * Math.sin((hourFrac - 0.375) * 2 * Math.PI);

  const relax = Math.min(1, dtMin / 60);
  w.ambientTemp += (w.target.ambientTemp + diurnal - w.ambientTemp) * relax;
  w.windSpeed += (w.target.windSpeed - w.windSpeed) * relax;
  w.rain += (w.target.rain - w.rain) * relax;
  w.cloud += (w.target.cloud - w.cloud) * relax;
  w.windDir += randn() * 0.05 * Math.sqrt(dtMin);
}

/** Heat stress: hot, bright, mid-day. 0–1. */
function heatStress(sim: SimState): number {
  const w = sim.weather;
  const hour = Math.floor(sim.timeMin / 60) % 24;
  if (hour < 10 || hour >= 18) return 0;
  const sun = 1 - w.cloud;
  return Math.max(0, Math.min(1, ((w.ambientTemp - 24) / 8) * (0.4 + 0.6 * sun)));
}

export function createSim(cowCount = 80): SimState {
  const paddock = {
    width: 500,
    height: 350,
    fenceMargin: 15,
    shadeX: 420,
    shadeY: 70,
    shadeRadius: 45,
  };
  const focusX = paddock.width * 0.5;
  const focusY = paddock.height * 0.5;

  const cows: Cow[] = [];
  for (let i = 0; i < cowCount; i++) {
    // Cows keep loose, persistent positions within the herd (spatial social structure)
    const homeOffsetX = randn() * 35;
    const homeOffsetY = randn() * 25;
    cows.push({
      id: i,
      name: `${COW_NAMES[i % COW_NAMES.length]} #${String(i + 1).padStart(3, '0')}`,
      x: focusX + homeOffsetX + randn() * 10,
      y: focusY + homeOffsetY + randn() * 10,
      vx: 0,
      vy: 0,
      heading: rand(0, Math.PI * 2),
      behaviour: 'grazing',
      behaviourUntil: rand(0, 30),
      homeOffsetX,
      homeOffsetY,
      paceFactor: rand(0.85, 1.15),
      avgSpeed: SPEED.grazing,
      condition: 'healthy',
      conditionSince: null,
      temperature: BASE_TEMP + rand(-0.15, 0.15),
      ruminationRate: rand(0.3, 0.4),
      history: [],
      nextSampleAt: rand(0, SAMPLE_INTERVAL_MIN),
    });
  }

  return {
    cows,
    paddock,
    weather: createWeather(),
    timeMin: 7 * 60, // start at 07:00 — morning grazing bout
    focusX,
    focusY,
    focusUntil: 7 * 60 + rand(60, 150),
  };
}

/**
 * Behaviour mix by hour of day, adjusted for weather. Cattle graze in bouts
 * around dawn and dusk, ruminate/rest through midday and overnight; they
 * graze less in heavy rain, strong wind, and midday heat.
 */
function behaviourWeights(sim: SimState): Record<Behaviour, number> {
  const hour = Math.floor(sim.timeMin / 60) % 24;
  const dawn = hour >= 5 && hour < 10;
  const dusk = hour >= 15 && hour < 20;
  const night = hour >= 21 || hour < 5;
  let w: Record<Behaviour, number>;
  if (dawn || dusk) w = { grazing: 0.72, walking: 0.08, resting: 0.06, ruminating: 0.14 };
  else if (night) w = { grazing: 0.08, walking: 0.01, resting: 0.46, ruminating: 0.45 };
  else w = { grazing: 0.3, walking: 0.04, resting: 0.28, ruminating: 0.38 }; // midday

  const weather = sim.weather;
  if (weather.rain > 0.3) {
    // Wet cattle stand and wait it out — less grazing, far less lying down
    const wet = weather.rain;
    w.grazing *= 1 - 0.5 * wet;
    w.resting *= 1 - 0.6 * wet;
    w.ruminating *= 1 + 0.5 * wet; // standing rumination
    w.walking *= 1 - 0.4 * wet;
  }
  if (weather.windSpeed > 7) {
    const windy = Math.min(1, (weather.windSpeed - 7) / 7);
    w.grazing *= 1 - 0.3 * windy;
    w.ruminating *= 1 + 0.3 * windy;
  }
  const heat = heatStress(sim);
  if (heat > 0) {
    // Shade-seeking: grazing collapses, standing/resting in shade takes over
    w.grazing *= 1 - 0.7 * heat;
    w.walking *= 1 - 0.4 * heat;
    w.resting *= 1 + 1.2 * heat;
  }
  // Mild cold pushes energy demand up → more grazing (daytime only)
  if (weather.ambientTemp < 8 && !night) w.grazing *= 1.25;
  return w;
}

/** Typical bout length in sim-minutes for each behaviour */
function boutLength(b: Behaviour): number {
  switch (b) {
    case 'grazing': return rand(25, 70);
    case 'walking': return rand(3, 8);
    case 'resting': return rand(20, 50);
    case 'ruminating': return rand(30, 60);
  }
}

function pickBehaviour(sim: SimState, cow: Cow): Behaviour {
  const weights = behaviourWeights(sim);

  // Allelomimicry: cattle synchronise — bias towards what the herd is doing
  const counts: Record<Behaviour, number> = { grazing: 0, walking: 0, resting: 0, ruminating: 0 };
  for (const c of sim.cows) counts[c.behaviour]++;
  const n = sim.cows.length;
  for (const b of Object.keys(weights) as Behaviour[]) {
    weights[b] = weights[b] * 0.6 + (counts[b] / n) * 0.4;
  }

  const effects = CONDITION_EFFECTS[cow.condition];
  for (const b of Object.keys(weights) as Behaviour[]) {
    weights[b] *= effects.weightMult[b] ?? 1;
  }

  // If the cow has drifted far from the herd, walking back becomes likely
  const dx = sim.focusX + cow.homeOffsetX * effects.isolation - cow.x;
  const dy = sim.focusY + cow.homeOffsetY * effects.isolation - cow.y;
  if (Math.hypot(dx, dy) > 60) weights.walking += 0.5;

  let total = 0;
  for (const b of Object.keys(weights) as Behaviour[]) total += weights[b];
  let r = Math.random() * total;
  for (const b of Object.keys(weights) as Behaviour[]) {
    r -= weights[b];
    if (r <= 0) return b;
  }
  return 'grazing';
}

/** Advance the simulation by dtMin sim-minutes (call with small steps, ≤ ~0.5). */
export function stepSim(sim: SimState, dtMin: number): void {
  sim.timeMin += dtMin;
  const dtSec = dtMin * 60;

  updateWeather(sim, dtMin);
  const heat = heatStress(sim);
  const weather = sim.weather;
  // Herd bunches up in heavy rain or strong wind, and packs into shade in heat
  const bunch = 1
    - 0.45 * Math.max(weather.rain > 0.4 ? weather.rain : 0, Math.min(1, (weather.windSpeed - 7) / 7))
    - 0.55 * heat;
  const bunchFactor = Math.max(0.35, bunch);

  // In real heat the herd's focal point becomes the shade
  if (heat > 0.35 && Math.hypot(sim.focusX - sim.paddock.shadeX, sim.focusY - sim.paddock.shadeY) > 20) {
    sim.focusX = sim.paddock.shadeX;
    sim.focusY = sim.paddock.shadeY;
    sim.focusUntil = sim.timeMin + 120;
    for (const cow of sim.cows) {
      if (Math.random() < 0.8) {
        cow.behaviour = 'walking';
        cow.behaviourUntil = sim.timeMin + boutLength('walking');
      }
    }
  }

  // Periodically the herd shifts to fresh grazing
  if (sim.timeMin >= sim.focusUntil) {
    const { width, height, fenceMargin } = sim.paddock;
    const pad = fenceMargin + 60;
    sim.focusX = rand(pad, width - pad);
    sim.focusY = rand(pad, height - pad);
    sim.focusUntil = sim.timeMin + rand(90, 240);
    // A herd move pulls most cows into a walking bout
    for (const cow of sim.cows) {
      if (Math.random() < 0.8) {
        cow.behaviour = 'walking';
        cow.behaviourUntil = sim.timeMin + boutLength('walking');
      }
    }
  }

  for (const cow of sim.cows) {
    if (sim.timeMin >= cow.behaviourUntil) {
      cow.behaviour = pickBehaviour(sim, cow);
      cow.behaviourUntil = sim.timeMin + boutLength(cow.behaviour);
    }

    const effects = CONDITION_EFFECTS[cow.condition];

    // Desired velocity: drift towards personal spot in the herd, plus wander.
    // Isolation scales the home offset, so sick cows settle at the herd's edge;
    // bunchFactor compresses everyone in rain/wind/heat.
    const targetX = sim.focusX + cow.homeOffsetX * effects.isolation * bunchFactor;
    const targetY = sim.focusY + cow.homeOffsetY * effects.isolation * bunchFactor;
    const dx = targetX - cow.x;
    const dy = targetY - cow.y;
    const dist = Math.hypot(dx, dy) || 1;

    const baseSpeed = SPEED[cow.behaviour] * cow.paceFactor * effects.paceMult;
    let desiredVX = 0;
    let desiredVY = 0;
    if (baseSpeed > 0) {
      // Blend goal-seeking with a wandering heading (grazing is mostly wander)
      const goalWeight = cow.behaviour === 'walking' ? 0.9 : Math.min(0.5, dist / 120);
      cow.heading += randn() * 0.35 * Math.sqrt(dtMin);
      const wx = Math.cos(cow.heading);
      const wy = Math.sin(cow.heading);
      desiredVX = baseSpeed * (goalWeight * (dx / dist) + (1 - goalWeight) * wx);
      desiredVY = baseSpeed * (goalWeight * (dy / dist) + (1 - goalWeight) * wy);
    }

    // Smooth acceleration towards desired velocity
    const accel = 1 - Math.exp(-dtSec / 10);
    cow.vx += (desiredVX - cow.vx) * accel;
    cow.vy += (desiredVY - cow.vy) * accel;
  }

  // Separation: cows keep ~3m personal space (simple O(n²) pass — fine at herd scale)
  const cows = sim.cows;
  for (let i = 0; i < cows.length; i++) {
    for (let j = i + 1; j < cows.length; j++) {
      const a = cows[i];
      const b = cows[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001 && d < 3) {
        const push = ((3 - d) / d) * 0.5;
        a.x -= dx * push * 0.5;
        a.y -= dy * push * 0.5;
        b.x += dx * push * 0.5;
        b.y += dy * push * 0.5;
      }
    }
  }

  // Integrate and keep inside the virtual fence
  const { width, height, fenceMargin } = sim.paddock;
  for (const cow of sim.cows) {
    cow.x += cow.vx * dtSec;
    cow.y += cow.vy * dtSec;

    if (cow.x < fenceMargin) { cow.x = fenceMargin; cow.vx = Math.abs(cow.vx) * 0.3; }
    if (cow.x > width - fenceMargin) { cow.x = width - fenceMargin; cow.vx = -Math.abs(cow.vx) * 0.3; }
    if (cow.y < fenceMargin) { cow.y = fenceMargin; cow.vy = Math.abs(cow.vy) * 0.3; }
    if (cow.y > height - fenceMargin) { cow.y = height - fenceMargin; cow.vy = -Math.abs(cow.vy) * 0.3; }

    const speed = Math.hypot(cow.vx, cow.vy);
    if (speed > 0.05) cow.heading = Math.atan2(cow.vy, cow.vx);
    // EWMA over roughly the last 5 sim-minutes
    const alpha = Math.min(1, dtMin / 5);
    cow.avgSpeed += (speed - cow.avgSpeed) * alpha;

    // Body temperature relaxes towards baseline + diurnal cycle + condition
    // offset + heat stress (the whole herd shifts together in a heatwave, so
    // herd-relative detection stays clean)
    const hourFrac = (sim.timeMin % (24 * 60)) / (24 * 60);
    const diurnal = 0.25 * Math.sin((hourFrac - 0.3) * 2 * Math.PI);
    const targetTemp = BASE_TEMP + diurnal + CONDITION_EFFECTS[cow.condition].tempOffset + 0.4 * heat;
    cow.temperature += (targetTemp - cow.temperature) * Math.min(1, dtMin / 90)
      + randn() * 0.01 * Math.sqrt(dtMin);

    // Rumination fraction, EWMA over ~2 h
    const ruminating = cow.behaviour === 'ruminating' ? 1 : 0;
    cow.ruminationRate += (ruminating - cow.ruminationRate) * Math.min(1, dtMin / 120);

    // Collar telemetry sample every SAMPLE_INTERVAL_MIN sim-minutes
    if (sim.timeMin >= cow.nextSampleAt) {
      cow.history.push({
        t: sim.timeMin,
        x: cow.x,
        y: cow.y,
        speed: cow.avgSpeed,
        behaviour: cow.behaviour,
        temperature: cow.temperature,
        rumination: cow.ruminationRate,
      });
      if (cow.history.length > HISTORY_SAMPLES) cow.history.shift();
      cow.nextSampleAt = sim.timeMin + SAMPLE_INTERVAL_MIN;
    }
  }
}

/** Daylight factor 0 (night) – 1 (full day), with smooth dawn/dusk ramps. */
export function daylight(timeMin: number): number {
  const h = (timeMin / 60) % 24;
  const up = Math.min(1, Math.max(0, (h - 6) / 1.5));
  const down = Math.min(1, Math.max(0, (20.5 - h) / 1.5));
  return Math.min(up, down);
}

export function formatSimClock(timeMin: number): string {
  const day = Math.floor(timeMin / (24 * 60)) + 1;
  const h = Math.floor(timeMin / 60) % 24;
  const m = Math.floor(timeMin % 60);
  return `Day ${day}  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
