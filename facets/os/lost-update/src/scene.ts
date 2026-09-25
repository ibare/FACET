/**
 * 갱신 손실의 장면.
 *
 * 바탕  shared · local · threads — initialData 에서 베낀다
 * 자취  cards (공유 값 칸에 쌓인 값. 아래 → 위, 맨 위가 지금 값) · mine · done · result
 * 이번  step — 방금 실행된 줄, 또는 견줌
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { LostUpdateLine } from './algorithm.js';

export type LostUpdateCard = {
  value: number;
  /** 쓴 스레드. 처음 값이면 null */
  by: string | null;
  /** 읽어 둔 옛 값에서 셈한 쓰기가 이 값을 덮었다 — 이 값에 담긴 몫이 사라졌다 */
  lost: boolean;
};

export type LostUpdateStep =
  | { kind: 'start' }
  | { kind: 'read'; thread: string; line: number; value: number }
  | {
      kind: 'write';
      thread: string;
      line: number;
      before: number;
      mine: number;
      add: number;
      after: number;
      stale: boolean;
    }
  | { kind: 'compare'; final: number; expected: number; lost: number };

export type LostUpdateScene = {
  shared: string;
  /** 스레드마다 따로 있는 칸의 이름 */
  local: string;
  threads: { id: string; lines: LostUpdateLine[] }[];
  cards: LostUpdateCard[];
  /** 스레드 차례대로 — 제 mine 칸의 값. 아직 읽지 않았으면 null */
  mine: (number | null)[];
  /** 스레드 차례대로 — 실행을 마친 줄 수 */
  done: number[];
  result: { final: number; expected: number; lost: number } | null;
  step: LostUpdateStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`장면: ${key} 가 글자가 아니다`);
  return v;
}

function readLine(x: unknown): LostUpdateLine {
  if (!isRecord(x)) throw new Error('장면: 줄이 객체가 아니다');
  if (x.kind === 'read') return { kind: 'read' };
  if (x.kind === 'write') return { kind: 'write', add: num(x, 'add') };
  throw new Error(`장면: 모르는 줄 모양 ${JSON.stringify(x)}`);
}

function threadIndex(scene: LostUpdateScene, id: string): number {
  const i = scene.threads.findIndex((th) => th.id === id);
  if (i < 0) throw new Error(`장면: 모르는 스레드 ${id}`);
  return i;
}

function replaceAt<T>(xs: readonly T[], i: number, v: T): T[] {
  return xs.map((x, k) => (k === i ? v : x));
}

export const lostUpdateScene: ScenePlan<LostUpdateScene> = {
  initial(initialData: unknown): LostUpdateScene {
    if (!isRecord(initialData)) throw new Error('장면: initialData 가 없다');
    const shared = str(initialData, 'shared');
    const local = str(initialData, 'local');
    const start = num(initialData, 'start');
    const raw = initialData.threads;
    if (!Array.isArray(raw)) throw new Error('장면: threads 가 배열이 아니다');
    const threads = raw.map((th: unknown) => {
      if (!isRecord(th)) throw new Error('장면: 스레드가 객체가 아니다');
      const lines = th.lines;
      if (!Array.isArray(lines)) throw new Error('장면: lines 가 배열이 아니다');
      return { id: str(th, 'id'), lines: lines.map(readLine) };
    });
    return {
      shared,
      local,
      threads,
      cards: [{ value: start, by: null, lost: false }],
      mine: threads.map(() => null),
      done: threads.map(() => 0),
      result: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LostUpdateScene, event: FacetRuntimeEvent): LostUpdateScene {
    const p = event.payload;
    if (event.type === 'read') {
      if (!isRecord(p)) throw new Error('장면: read 의 payload 가 없다');
      const thread = str(p, 'thread');
      const line = num(p, 'line');
      const value = num(p, 'value');
      const i = threadIndex(scene, thread);
      return {
        ...scene,
        mine: replaceAt(scene.mine, i, value),
        done: replaceAt(scene.done, i, line + 1),
        step: { kind: 'read', thread, line, value },
      };
    }
    if (event.type === 'write') {
      if (!isRecord(p)) throw new Error('장면: write 의 payload 가 없다');
      const thread = str(p, 'thread');
      const line = num(p, 'line');
      const stale = p.stale;
      if (typeof stale !== 'boolean') throw new Error('장면: stale 이 참거짓이 아니다');
      const step: LostUpdateStep = {
        kind: 'write',
        thread,
        line,
        before: num(p, 'before'),
        mine: num(p, 'mine'),
        add: num(p, 'add'),
        after: num(p, 'after'),
        stale,
      };
      const i = threadIndex(scene, thread);
      const below = scene.cards.map((c, k) =>
        k === scene.cards.length - 1 && stale ? { ...c, lost: true } : { ...c },
      );
      return {
        ...scene,
        cards: [...below, { value: step.after, by: thread, lost: false }],
        done: replaceAt(scene.done, i, line + 1),
        step,
      };
    }
    if (event.type === 'compare') {
      if (!isRecord(p)) throw new Error('장면: compare 의 payload 가 없다');
      const result = { final: num(p, 'final'), expected: num(p, 'expected'), lost: num(p, 'lost') };
      return { ...scene, result, step: { kind: 'compare', ...result } };
    }
    throw new Error(`장면: 모르는 이벤트 ${event.type}`);
  },
};
