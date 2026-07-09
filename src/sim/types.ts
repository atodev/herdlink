export type Behaviour = 'grazing' | 'walking' | 'resting' | 'ruminating';

/** Ground-truth health condition, injected via the demo controls. */
export type Condition = 'healthy' | 'lame' | 'ill' | 'oestrus';

/** One collar telemetry sample, recorded every SAMPLE_INTERVAL_MIN sim-minutes. */
export interface TelemetrySample {
  /** sim-minute of the sample */
  t: number;
  x: number;
  y: number;
  /** m/s, 5-min average */
  speed: number;
  behaviour: Behaviour;
  /** body temperature, °C */
  temperature: number;
  /** fraction of recent time spent ruminating, 0–1 */
  rumination: number;
}

export interface Cow {
  id: number;
  name: string;
  /** position in paddock metres */
  x: number;
  y: number;
  /** current velocity, m/s */
  vx: number;
  vy: number;
  heading: number;
  behaviour: Behaviour;
  /** sim-minute at which the current behaviour ends */
  behaviourUntil: number;
  /** per-cow preferred offset from the herd focal point, metres */
  homeOffsetX: number;
  homeOffsetY: number;
  /** individual pace multiplier (healthy variation between cows) */
  paceFactor: number;
  /** rolling average speed over the last few sim-minutes, m/s */
  avgSpeed: number;

  condition: Condition;
  /** sim-minute the current condition started, null when healthy */
  conditionSince: number | null;
  /** body temperature, °C */
  temperature: number;
  /** EWMA fraction of time spent ruminating over the last ~2 h */
  ruminationRate: number;
  /** telemetry ring buffer, oldest first, capped at HISTORY_SAMPLES */
  history: TelemetrySample[];
  /** sim-minute at which the next telemetry sample is due */
  nextSampleAt: number;
}

export interface Paddock {
  width: number;
  height: number;
  /** fence inset from the edge, metres */
  fenceMargin: number;
  /** shaded area (trees) cows gather under in hot sun */
  shadeX: number;
  shadeY: number;
  shadeRadius: number;
}

export type WeatherMode = 'auto' | 'sunny' | 'heatwave' | 'rain' | 'windy';

export interface Weather {
  mode: WeatherMode;
  /** ambient air temperature, °C */
  ambientTemp: number;
  /** m/s */
  windSpeed: number;
  /** radians, direction the wind blows TOWARDS */
  windDir: number;
  /** rain intensity 0–1 */
  rain: number;
  /** cloud cover 0–1 */
  cloud: number;
  /** sim-minute at which auto mode picks a new front */
  nextFrontAt: number;
  /** targets the current values relax towards */
  target: { ambientTemp: number; windSpeed: number; rain: number; cloud: number };
}

export interface SimState {
  cows: Cow[];
  paddock: Paddock;
  weather: Weather;
  /** minutes since midnight of day 0 */
  timeMin: number;
  /** point the herd is currently drawn towards */
  focusX: number;
  focusY: number;
  /** sim-minute at which the herd picks a new focal point */
  focusUntil: number;
}

export const SAMPLE_INTERVAL_MIN = 5;
/** 24 h of history at one sample per 5 min */
export const HISTORY_SAMPLES = (24 * 60) / SAMPLE_INTERVAL_MIN;
