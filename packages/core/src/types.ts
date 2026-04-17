export type FacetIdentifier = { ns: 'facet'; name: string };

export type FacetExpr = {
  container: FacetIdentifier;
  bodies: FacetIdentifier[];
  raw: string;
};

export type FacetExprMatch = {
  expr: FacetExpr;
  start: number;
  end: number;
};

export type Container = {
  id: string;
  init(params?: Record<string, unknown>): ContainerInstance;
};

export type ContainerInstance = {
  start(): void;
  stop(): void;
  reset(): void;
  signalComplete(): void;
  onTick(cb: () => void): () => void;
  onComplete(cb: () => void): () => void;
  setSpeed(multiplier: number): void;
  getState(): { tickCount: number; running: boolean; complete: boolean };
};

export type Algorithm = {
  id: string;
  description: string;
  phases: string[];
  category?: string;
  complexity?: { time: string; space: string };
  related?: string[];
};

export type BodyControl =
  | {
      type: 'preset';
      id: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | {
      type: 'range';
      id: string;
      label: string;
      min: number;
      max: number;
      default: number;
      step?: number;
    };

export type Body = {
  id: string;
  algorithm: string;
  available_irs: string[];
  default_ir: string;
  controls: BodyControl[];
  init(params?: Record<string, unknown>): BodyInstance;
};

export type BodyInstance = {
  tick(): void;
  reset(): void;
  setControl(id: string, value: unknown): void;
  setSpeed(multiplier: number): void;
  onPhase(cb: (phase: string) => void): () => void;
  onComplete(cb: () => void): () => void;
  onStateChange(cb: (state: Record<string, unknown>) => void): () => void;
  getState(): Record<string, unknown>;
  render(mount: HTMLElement): void;
  destroy(): void;
};

export type IR = {
  id: string;
  algorithm: string;
  paradigm: string;
};

export type TranspileLine = { code: string; phase: string | null };

export type TranspileResult = {
  lines: TranspileLine[];
};

export type Transpiler = {
  id: string;
  paradigm: string;
  target: string;
  targetLabel: string;
  transpile(ir: IR): TranspileResult;
};

export type Catalog = {
  containers: Map<string, Container>;
  algorithms: Map<string, Algorithm>;
  bodies: Map<string, Body>;
  irs: Map<string, IR>;
  transpilers: Map<string, Transpiler>;
};

export type UIOptions = {
  paradigms: { id: string; irId: string }[];
  languages: string[];
  phases: string[];
  controls: BodyControl[];
};

export type FacetEvent =
  | { type: 'container:tick'; tickCount: number }
  | { type: 'container:complete' }
  | { type: 'body:phase'; phase: string }
  | { type: 'body:state-changed'; state: Record<string, unknown> }
  | { type: 'ui:speed-changed'; multiplier: number }
  | { type: 'ui:control-changed'; bodyId: string; controlId: string; value: unknown }
  | { type: 'ui:reset' }
  | { type: 'ui:start' }
  | { type: 'ui:stop' };
