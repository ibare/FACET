/**
 * 임계 구역 장면.
 *
 * 바탕   — 프로그램 줄 · 스레드 · 공유 값 이름 (initialData 에서 베낀다)
 * 자취   — 표가 붙은 줄 · 구간 · 스레드마다 선 자리 · 구간 안의 스레드 · 공유 값 · 보인 값
 * 이번 걸음 — step (움직임의 출발 자리를 계기값 from 으로 싣는다)
 *
 * 셈은 알고리즘이 한다. 이 장면은 이벤트 payload 를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 스레드가 선 자리 */
export type Spot =
  | { at: 'start' }
  | { at: 'line'; line: number }
  /** 입구 바깥 — 막혀 잠든 자리 */
  | { at: 'gate-out' }
  /** 입구 안쪽 — 들어왔으나 구간 첫 줄을 아직 실행하지 않은 자리 */
  | { at: 'gate-in' }
  /** 출구 바깥 — 구간 끝 줄을 실행하고 나온 자리 */
  | { at: 'exit' };

export type CriticalSectionStep =
  | { kind: 'mark'; lines: number[] }
  | { kind: 'enclose'; from: number; to: number }
  | {
      kind: 'run';
      tick: number;
      thread: string;
      line: number;
      from: Spot;
      enters: boolean;
      exits: boolean;
      admitted: string | null;
      admittedFrom: Spot | null;
      shown: number | null;
    }
  | { kind: 'wait'; tick: number; thread: string; holder: string; from: Spot };

export type CriticalSectionScene = {
  // 바탕
  program: string[];
  threads: string[];
  sharedName: string;
  /** 구간 경계 (init 이 알고리즘의 셈을 얹는다). 자리 잡기에만 쓴다 */
  bounds: { from: number; to: number } | null;
  // 자취
  marked: number[];
  section: { from: number; to: number } | null;
  spots: Spot[];
  asleep: boolean[];
  inside: string | null;
  value: number;
  shown: Array<number | null>;
  // 이번 걸음
  step: CriticalSectionStep | null;
};

function readInitial(initialData: unknown): {
  program: string[];
  threads: string[];
  sharedName: string;
  value: number;
} {
  const empty = { program: [], threads: [], sharedName: '', value: 0 };
  if (typeof initialData !== 'object' || initialData === null) return empty;
  const d = initialData as Record<string, unknown>;
  const program = Array.isArray(d.program) ? d.program.filter((x): x is string => typeof x === 'string') : [];
  const threads = Array.isArray(d.threads) ? d.threads.filter((x): x is string => typeof x === 'string') : [];
  const s = d.shared;
  let sharedName = '';
  let value = 0;
  if (typeof s === 'object' && s !== null) {
    const r = s as Record<string, unknown>;
    if (typeof r.name === 'string') sharedName = r.name;
    if (typeof r.value === 'number') value = r.value;
  }
  return { program: [...program], threads: [...threads], sharedName, value };
}

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function num(r: Record<string, unknown>, k: string): number {
  const v = r[k];
  if (typeof v !== 'number') throw new Error(`critical-section scene: payload.${k} is not a number`);
  return v;
}

function str(r: Record<string, unknown>, k: string): string {
  const v = r[k];
  if (typeof v !== 'string') throw new Error(`critical-section scene: payload.${k} is not a string`);
  return v;
}

function strOrNull(r: Record<string, unknown>, k: string): string | null {
  const v = r[k];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`critical-section scene: payload.${k} is not a string or null`);
  return v;
}

function indexOfThread(scene: CriticalSectionScene, th: string): number {
  const i = scene.threads.indexOf(th);
  if (i < 0) throw new Error(`critical-section scene: unknown thread ${th}`);
  return i;
}

export const criticalSectionScene: ScenePlan<CriticalSectionScene> = {
  initial(initialData: unknown): CriticalSectionScene {
    const d = readInitial(initialData);
    return {
      program: d.program,
      threads: d.threads,
      sharedName: d.sharedName,
      bounds: null,
      marked: [],
      section: null,
      spots: d.threads.map(() => ({ at: 'start' as const })),
      asleep: d.threads.map(() => false),
      inside: null,
      value: d.value,
      shown: d.threads.map(() => null),
      step: null,
    };
  },

  reduce(scene: CriticalSectionScene, event: FacetRuntimeEvent): CriticalSectionScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        return { ...scene, bounds: { from: num(p, 'from'), to: num(p, 'to') }, step: null };
      }
      case 'mark': {
        const raw = p.lines;
        if (!Array.isArray(raw)) throw new Error('critical-section scene: mark.lines missing');
        const lines = raw.filter((x): x is number => typeof x === 'number');
        return { ...scene, marked: [...lines], step: { kind: 'mark', lines: [...lines] } };
      }
      case 'enclose': {
        const from = num(p, 'from');
        const to = num(p, 'to');
        return { ...scene, section: { from, to }, step: { kind: 'enclose', from, to } };
      }
      case 'run': {
        const thread = str(p, 'thread');
        const line = num(p, 'line');
        const exits = p.exits === true;
        const admitted = strOrNull(p, 'admitted');
        const shownRaw = p.shown;
        const shownVal = typeof shownRaw === 'number' ? shownRaw : null;
        const ti = indexOfThread(scene, thread);
        const spots = scene.spots.slice();
        const asleep = scene.asleep.slice();
        const shown = scene.shown.slice();
        const from = scene.spots[ti] ?? { at: 'start' as const };
        spots[ti] = exits ? { at: 'exit' } : { at: 'line', line };
        let admittedFrom: Spot | null = null;
        if (admitted !== null) {
          const ai = indexOfThread(scene, admitted);
          admittedFrom = scene.spots[ai] ?? null;
          spots[ai] = { at: 'gate-in' };
          asleep[ai] = false;
        }
        if (shownVal !== null) shown[ti] = shownVal;
        return {
          ...scene,
          spots,
          asleep,
          shown,
          inside: strOrNull(p, 'inside'),
          value: num(p, 'value'),
          step: {
            kind: 'run',
            tick: num(p, 'tick'),
            thread,
            line,
            from,
            enters: p.enters === true,
            exits,
            admitted,
            admittedFrom,
            shown: shownVal,
          },
        };
      }
      case 'wait': {
        const thread = str(p, 'thread');
        const ti = indexOfThread(scene, thread);
        const spots = scene.spots.slice();
        const asleep = scene.asleep.slice();
        const from = scene.spots[ti] ?? { at: 'start' as const };
        spots[ti] = { at: 'gate-out' };
        asleep[ti] = true;
        return {
          ...scene,
          spots,
          asleep,
          step: { kind: 'wait', tick: num(p, 'tick'), thread, holder: str(p, 'holder'), from },
        };
      }
      default:
        return scene;
    }
  },
};
