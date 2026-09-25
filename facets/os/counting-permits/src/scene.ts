/**
 * countingPermits 의 장면.
 *
 * 바탕: 세마포어 이름 · 처음 표 수 · 스레드와 프로그램 줄 (initialData 에서 베낀다).
 * 자취: 표 수 · 스레드마다 다음 줄 · 자리(시작 전 / 줄 / 안 / 끝남) · 줄 차례 · 안의 자리 칸.
 * 이번 걸음: 무엇이 일어났는가와 그 계기값(was = 틱 앞의 표 수, slot = 드나든 칸).
 *
 * 셈(누가 달리는가 · 표 수 · 줄)은 알고리즘이 한다. 장면은 이벤트의 값을 옮겨 적고,
 * 안에 든 스레드를 표 수만큼 있는 칸에 앉히는 것만 한다 — 칸은 그림이 제자리를 지키게 하는 장부다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PermitPlace = 'out' | 'queue' | 'in' | 'done';

export type PermitThread = { id: string; lines: string[] };

export type PermitStep =
  | { kind: 'take' | 'block' | 'work' | 'back'; tick: number; who: string; line: number; slot: number; was: number }
  | { kind: 'hand'; tick: number; who: string; line: number; slot: number; was: number; to: string; fromLine: number };

export type CountingPermitsScene = {
  sem: string;
  permits: number;
  threads: PermitThread[];
  count: number;
  pc: Record<string, number>;
  place: Record<string, PermitPlace>;
  queue: string[];
  /** 안의 칸 — 길이는 처음 표 수. 칸마다 앉은 스레드 또는 null */
  slots: (string | null)[];
  step: PermitStep | null;
};

function readThreads(raw: unknown): PermitThread[] {
  if (!Array.isArray(raw)) return [];
  const out: PermitThread[] = [];
  for (const th of raw as unknown[]) {
    if (typeof th !== 'object' || th === null) continue;
    const id = (th as { id?: unknown }).id;
    const lines = (th as { lines?: unknown }).lines;
    if (typeof id !== 'string' || !Array.isArray(lines)) continue;
    out.push({ id, lines: lines.filter((l): l is string => typeof l === 'string') });
  }
  return out;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`countingPermitsScene: ${type} 의 ${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`countingPermitsScene: ${type} 의 ${key} 가 글자가 아니다`);
  return v;
}

function strList(p: Record<string, unknown>, key: string, type: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`countingPermitsScene: ${type} 의 ${key} 가 글자 목록이 아니다`);
  }
  return [...v];
}

export const countingPermitsScene: ScenePlan<CountingPermitsScene> = {
  initial(initialData: unknown): CountingPermitsScene {
    const d = (typeof initialData === 'object' && initialData !== null ? initialData : {}) as Record<
      string,
      unknown
    >;
    const threads = readThreads(d.threads).map((th) => ({ id: th.id, lines: [...th.lines] }));
    const permits = typeof d.permits === 'number' ? d.permits : 0;
    const pc: Record<string, number> = {};
    const place: Record<string, PermitPlace> = {};
    for (const th of threads) {
      pc[th.id] = 0;
      place[th.id] = 'out';
    }
    return {
      sem: typeof d.sem === 'string' ? d.sem : '',
      permits,
      threads,
      count: permits,
      pc,
      place,
      queue: [],
      slots: Array.from({ length: Math.max(0, permits) }, () => null),
      step: null,
    };
  },

  reduce(scene: CountingPermitsScene, event: FacetRuntimeEvent): CountingPermitsScene {
    const type = event.type;
    if (type !== 'take' && type !== 'block' && type !== 'work' && type !== 'hand' && type !== 'back') {
      return scene;
    }
    if (typeof event.payload !== 'object' || event.payload === null) {
      throw new Error(`countingPermitsScene: ${type} 에 payload 가 없다`);
    }
    const p = event.payload as Record<string, unknown>;
    const tick = num(p, 'tick', type);
    const who = str(p, 'who', type);
    const line = num(p, 'line', type);
    const count = num(p, 'count', type);
    const queue = strList(p, 'queue', type);
    const was = scene.count;

    const pc = { ...scene.pc };
    const place = { ...scene.place };
    const slots = [...scene.slots];

    if (type === 'take') {
      const slot = slots.indexOf(null);
      if (slot < 0) throw new Error(`countingPermitsScene: 틱 ${tick} — 안에 빈 칸이 없다`);
      slots[slot] = who;
      pc[who] = line + 1;
      place[who] = 'in';
      return { ...scene, count, pc, place, queue, slots, step: { kind: 'take', tick, who, line, slot, was } };
    }
    if (type === 'block') {
      place[who] = 'queue';
      return { ...scene, count, pc, place, queue, slots, step: { kind: 'block', tick, who, line, slot: -1, was } };
    }
    if (type === 'work') {
      pc[who] = line + 1;
      const slot = slots.indexOf(who);
      return { ...scene, count, pc, place, queue, slots, step: { kind: 'work', tick, who, line, slot, was } };
    }
    const slot = slots.indexOf(who);
    if (slot < 0) throw new Error(`countingPermitsScene: 틱 ${tick} — ${who} 가 안에 없다`);
    pc[who] = line + 1;
    place[who] = 'done';
    if (type === 'hand') {
      const to = str(p, 'to', type);
      const resume = num(p, 'resume', type);
      const fromLine = scene.pc[to];
      if (fromLine === undefined) throw new Error(`countingPermitsScene: 모르는 스레드 ${to}`);
      slots[slot] = to;
      pc[to] = resume;
      place[to] = 'in';
      return {
        ...scene,
        count,
        pc,
        place,
        queue,
        slots,
        step: { kind: 'hand', tick, who, line, slot, was, to, fromLine },
      };
    }
    slots[slot] = null;
    return { ...scene, count, pc, place, queue, slots, step: { kind: 'back', tick, who, line, slot, was } };
  },
};
