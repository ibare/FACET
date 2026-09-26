import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 시간축에 떨어진 메시지 하나와 그 끝 — 기다림 · draw 가 가져감 · 박자 전에 덮어쓰임 */
export type ArrivedMessage = {
  index: number;
  at: number;
  value: number;
  fate: 'waiting' | 'taken' | 'lost';
};

export type JustBeforePaintStep =
  | { kind: 'start' }
  | { kind: 'message'; index: number; at: number; was: number; lost: number | null; from: number }
  | { kind: 'call'; beat: number; at: number; gathered: number; next: number; from: number }
  | { kind: 'paint'; beat: number; at: number; last: boolean; unseen: number[] };

export type JustBeforePaintScene = {
  // 바탕
  code: string[];
  roles: { handler: number; write: number; request: number; kickoff: number };
  names: { latest: string; box: string; draw: string };
  beats: { beat: number; at: number }[];
  until: number;
  // 자취
  now: number;
  latest: number;
  box: number | null;
  screen: { beat: number; value: number }[];
  arrived: ArrivedMessage[];
  /** 걸린 draw 가 불릴 박자 (없으면 null) */
  pending: number | null;
  /** 이번 박자에 불린 draw 가 선 박자 (콜백 단계가 아니면 null) */
  calling: number | null;
  counts: { messages: number; calls: number; paints: number };
  // 이번 걸음
  step: JustBeforePaintStep;
};

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`just-before-paint 장면: ${what} 이 객체가 아니다`);
  return value as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`just-before-paint 장면: ${key} 가 수가 아니다`);
  return v;
}

function numOrNull(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (v === null) return null;
  return num(p, key);
}

function numList(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`just-before-paint 장면: ${key} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`just-before-paint 장면: ${key}[${i}] 가 수가 아니다`);
    return x;
  });
}

function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`just-before-paint 장면: ${key} 가 참거짓이 아니다`);
  return v;
}

function text(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`just-before-paint 장면: ${key} 가 글자가 아니다`);
  return v;
}

function beatAt(scene: JustBeforePaintScene, beat: number): number {
  const b = scene.beats.find((x) => x.beat === beat);
  if (b === undefined) throw new Error(`just-before-paint 장면: 바탕에 박자 ${beat} 가 없다`);
  return b.at;
}

export const justBeforePaintScene: ScenePlan<JustBeforePaintScene> = {
  initial(initialData: unknown): JustBeforePaintScene {
    const d = typeof initialData === 'object' && initialData !== null ? (initialData as Record<string, unknown>) : {};
    const code = Array.isArray(d.code) ? d.code.filter((l): l is string => typeof l === 'string') : [];
    const r = typeof d.roles === 'object' && d.roles !== null ? (d.roles as Record<string, unknown>) : null;
    const n = typeof d.names === 'object' && d.names !== null ? (d.names as Record<string, unknown>) : null;
    const start = typeof d.start === 'number' ? d.start : 0;
    return {
      code: [...code],
      roles: r
        ? { handler: num(r, 'handler'), write: num(r, 'write'), request: num(r, 'request'), kickoff: num(r, 'kickoff') }
        : { handler: -1, write: -1, request: -1, kickoff: -1 },
      names: n
        ? { latest: text(n, 'latest'), box: text(n, 'box'), draw: text(n, 'draw') }
        : { latest: '', box: '', draw: '' },
      beats: [],
      until: 0,
      now: 0,
      latest: start,
      box: null,
      screen: [],
      arrived: [],
      pending: 1,
      calling: null,
      counts: { messages: 0, calls: 0, paints: 0 },
      step: { kind: 'start' },
    };
  },

  reduce(scene: JustBeforePaintScene, event: FacetRuntimeEvent): JustBeforePaintScene {
    if (event.type === 'init') {
      const p = record(event.payload, 'init');
      if (!Array.isArray(p.beats)) throw new Error('just-before-paint 장면: init 의 beats 가 목록이 아니다');
      const beats = p.beats.map((b, i) => {
        const r = record(b, `beats[${i}]`);
        return { beat: num(r, 'beat'), at: num(r, 'at') };
      });
      return { ...scene, beats, until: num(p, 'until'), pending: num(p, 'pending'), step: { kind: 'start' } };
    }
    if (event.type === 'message') {
      const p = record(event.payload, 'message');
      const index = num(p, 'index');
      const at = num(p, 'at');
      const lost = numOrNull(p, 'lost');
      const arrived: ArrivedMessage[] = scene.arrived.map((m) => (m.index === lost ? { ...m, fate: 'lost' } : { ...m }));
      arrived.push({ index, at, value: num(p, 'value'), fate: 'waiting' });
      return {
        ...scene,
        now: at,
        latest: num(p, 'value'),
        arrived,
        calling: null,
        counts: { ...scene.counts, messages: num(p, 'messages') },
        step: { kind: 'message', index, at, was: num(p, 'was'), lost, from: scene.now },
      };
    }
    if (event.type === 'call') {
      const p = record(event.payload, 'call');
      const beat = num(p, 'beat');
      const took = numOrNull(p, 'took');
      return {
        ...scene,
        now: num(p, 'at'),
        box: num(p, 'value'),
        arrived: scene.arrived.map((m) => (m.index === took ? { ...m, fate: 'taken' } : { ...m })),
        pending: num(p, 'next'),
        calling: beat,
        counts: { ...scene.counts, calls: num(p, 'calls') },
        step: { kind: 'call', beat, at: num(p, 'at'), gathered: num(p, 'gathered'), next: num(p, 'next'), from: scene.now },
      };
    }
    if (event.type === 'paint') {
      const p = record(event.payload, 'paint');
      const beat = num(p, 'beat');
      return {
        ...scene,
        screen: [...scene.screen.map((s) => ({ ...s })), { beat, value: num(p, 'value') }],
        calling: null,
        counts: { ...scene.counts, paints: num(p, 'paints') },
        step: { kind: 'paint', beat, at: beatAt(scene, beat), last: bool(p, 'last'), unseen: numList(p, 'unseen') },
      };
    }
    throw new Error(`just-before-paint 장면: 모르는 이벤트 ${event.type}`);
  },
};
