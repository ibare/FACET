/**
 * 파이프라인 거품의 장면.
 *
 * 바탕: 명령어 목록(init 이 한 번 정한다).
 * 자취: 지금 사이클 · 기다리는 줄 · 다섯 단계의 자리 · WB 를 떠난 것들.
 * 이번 걸음(step): 무엇이 어느 자리에서 어느 자리로 옮겼는가 · 머문 것.
 *
 * 자리는 좌표가 아니라 논리 자리다 — 줄(queue) 몇째 · 단계(pipe) 몇째 · 떠난 줄(out) 몇째.
 * 떠난 줄은 WB 아래 칸이 가장 최근 사이클이고 한 사이클마다 왼쪽으로 한 칸 밀린다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PipelineInstrView = { op: string; rd: string; rs: string[]; imm: number | null };

export type Place = { row: 'queue' | 'pipe' | 'out'; idx: number };

export type Move = { who: string; from: Place; to: Place };

export type Caption =
  | { kind: 'ready'; n: number }
  | { kind: 'flow'; c: number }
  | { kind: 'stall'; c: number; prod: number; cons: number; reg: string; behind: boolean }
  | { kind: 'forward'; c: number; reg: string; value: number | null; cons: number; rd: string; result: number | null }
  | { kind: 'bubbleWb'; c: number }
  | { kind: 'bubbleOut'; c: number; gap: number }
  | { kind: 'done'; n: number; end: number; ideal: number; lost: number };

export type Retired = { who: string; cycle: number };

export type Forward = { reg: string; value: number | null };

export type PipelineBubbleScene = {
  instrs: PipelineInstrView[];
  /** 지난 전이 수. init 0, 사이클 c 에서 c, 끝난 뒤 마지막 사이클 + 1 */
  tick: number;
  queue: string[];
  slots: (string | null)[];
  out: Retired[];
  held: string[];
  /** 이번 사이클에 MEM/WB → EX 로 건너간 값 */
  forward: Forward | null;
  caption: Caption | null;
  step: { moves: Move[]; bump: string[] } | null;
};

const STAGES = 5;

/** 떠난 줄에서 사이클 cycle 의 칸 — WB 아래(4)가 tick − 1. */
export function outIndex(tick: number, cycle: number): number {
  return STAGES - 1 - (tick - 1 - cycle);
}

function placesOf(s: PipelineBubbleScene): Map<string, Place> {
  const m = new Map<string, Place>();
  s.queue.forEach((who, i) => m.set(who, { row: 'queue', idx: i }));
  s.slots.forEach((who, i) => {
    if (who !== null) m.set(who, { row: 'pipe', idx: i });
  });
  for (const r of s.out) m.set(r.who, { row: 'out', idx: outIndex(s.tick, r.cycle) });
  return m;
}

function movesBetween(prev: PipelineBubbleScene, next: PipelineBubbleScene): Move[] {
  const before = placesOf(prev);
  const after = placesOf(next);
  const moves: Move[] = [];
  for (const [who, to] of after) {
    const was = before.get(who);
    // 처음 나타난 빈 칸은 바로 앞 단계(ID)에서 밀려 나온다
    const from = was ?? { row: to.row, idx: to.idx - 1 };
    if (from.row !== to.row || from.idx !== to.idx) moves.push({ who, from, to });
  }
  return moves;
}

const num = (who: string): number => Number(who.slice(1));

type CyclePayload = {
  cycle: number;
  slots: (string | null)[];
  queue: string[];
  stalled: boolean;
  held: string[];
  hazard: { prod: string; cons: string; reg: string } | null;
  forward: { prod: string; cons: string; reg: string; value: number | null; rd: string; result: number | null } | null;
  retired: Retired | null;
};

type DonePayload = { retired: Retired | null; end: number; ideal: number; stalls: number };

// ── 좁히개. 모양이 어긋난 payload 는 null — 장면은 그대로 둔다.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isSlots = (v: unknown): v is (string | null)[] =>
  Array.isArray(v) && v.length === STAGES && v.every((x) => x === null || isStr(x));

function asRetired(v: unknown): Retired | null | undefined {
  if (v === null) return null;
  if (isObj(v) && isStr(v['who']) && isNum(v['cycle'])) return { who: v['who'], cycle: v['cycle'] };
  return undefined;
}

function asInit(v: unknown): PipelineInstrView[] | null {
  if (!isObj(v) || !Array.isArray(v['instrs'])) return null;
  const out: PipelineInstrView[] = [];
  for (const i of v['instrs'] as unknown[]) {
    if (!isObj(i) || !isStr(i['op']) || !isStr(i['rd']) || !isStrs(i['rs']) || !isNumOrNull(i['imm'])) return null;
    out.push({ op: i['op'], rd: i['rd'], rs: [...i['rs']], imm: i['imm'] });
  }
  return out;
}

function asCycle(v: unknown): CyclePayload | null {
  if (!isObj(v)) return null;
  const { cycle, slots, queue, stalled, held, hazard, forward } = v;
  const retired = asRetired(v['retired']);
  if (!isNum(cycle) || !isSlots(slots) || !isStrs(queue) || typeof stalled !== 'boolean' || !isStrs(held)) return null;
  if (retired === undefined) return null;
  let hz: CyclePayload['hazard'] = null;
  if (hazard !== null) {
    if (!isObj(hazard) || !isStr(hazard['prod']) || !isStr(hazard['cons']) || !isStr(hazard['reg'])) return null;
    hz = { prod: hazard['prod'], cons: hazard['cons'], reg: hazard['reg'] };
  }
  let fw: CyclePayload['forward'] = null;
  if (forward !== null) {
    if (
      !isObj(forward) ||
      !isStr(forward['prod']) ||
      !isStr(forward['cons']) ||
      !isStr(forward['reg']) ||
      !isNumOrNull(forward['value']) ||
      !isStr(forward['rd']) ||
      !isNumOrNull(forward['result'])
    ) {
      return null;
    }
    fw = {
      prod: forward['prod'],
      cons: forward['cons'],
      reg: forward['reg'],
      value: forward['value'],
      rd: forward['rd'],
      result: forward['result'],
    };
  }
  return { cycle, slots: [...slots], queue: [...queue], stalled, held: [...held], hazard: hz, forward: fw, retired };
}

function asDone(v: unknown): DonePayload | null {
  if (!isObj(v)) return null;
  const retired = asRetired(v['retired']);
  const { end, ideal, stalls } = v;
  if (retired === undefined || !isNum(end) || !isNum(ideal) || !isNum(stalls)) return null;
  return { retired, end, ideal, stalls };
}

function empty(): PipelineBubbleScene {
  return {
    instrs: [],
    tick: 0,
    queue: [],
    slots: Array.from({ length: STAGES }, () => null),
    out: [],
    held: [],
    forward: null,
    caption: null,
    step: null,
  };
}

export const pipelineBubbleScene: ScenePlan<PipelineBubbleScene> = {
  initial(): PipelineBubbleScene {
    return empty();
  },

  reduce(scene: PipelineBubbleScene, event: FacetRuntimeEvent): PipelineBubbleScene {
    if (event.type === 'init') {
      const instrs = asInit(event.payload);
      if (instrs === null) return scene;
      return {
        ...empty(),
        instrs,
        queue: instrs.map((_, i) => `i${i}`),
        caption: { kind: 'ready', n: instrs.length },
        // 기다리는 줄은 왼쪽 바깥에서 흘러 들어와 선다
        step: {
          moves: instrs.map((_, i) => ({
            who: `i${i}`,
            from: { row: 'queue' as const, idx: -1 },
            to: { row: 'queue' as const, idx: i },
          })),
          bump: [],
        },
      };
    }

    if (event.type === 'cycle') {
      const p = asCycle(event.payload);
      if (p === null) return scene;
      const out = p.retired ? [...scene.out, { ...p.retired }] : [...scene.out];
      const bubbleOut = p.retired !== null && p.retired.who.startsWith('b') ? p.retired : null;
      let caption: Caption;
      if (p.stalled && p.hazard) {
        const cons = p.hazard.cons;
        caption = {
          kind: 'stall',
          c: p.cycle,
          prod: num(p.hazard.prod),
          cons: num(cons),
          reg: p.hazard.reg,
          // 값을 기다리는 명령어 말고도 머문 것이 있는가 — IF 가 비어 있으면 없다
          behind: p.held.some((w) => w !== cons),
        };
      } else if (p.forward) {
        caption = {
          kind: 'forward',
          c: p.cycle,
          reg: p.forward.reg,
          value: p.forward.value,
          cons: num(p.forward.cons),
          rd: p.forward.rd,
          result: p.forward.result,
        };
      } else if (bubbleOut) {
        caption = { kind: 'bubbleOut', c: p.cycle, gap: bubbleOut.cycle };
      } else if ((p.slots[STAGES - 1] ?? '').startsWith('b')) {
        caption = { kind: 'bubbleWb', c: p.cycle };
      } else {
        caption = { kind: 'flow', c: p.cycle };
      }
      const next: PipelineBubbleScene = {
        instrs: scene.instrs,
        tick: p.cycle,
        queue: [...p.queue],
        slots: [...p.slots],
        out,
        held: [...p.held],
        forward: p.forward ? { reg: p.forward.reg, value: p.forward.value } : null,
        caption,
        step: null,
      };
      return { ...next, step: { moves: movesBetween(scene, next), bump: [...p.held] } };
    }

    if (event.type === 'done') {
      const p = asDone(event.payload);
      if (p === null) return scene;
      const next: PipelineBubbleScene = {
        instrs: scene.instrs,
        tick: p.end + 1,
        queue: [],
        slots: Array.from({ length: STAGES }, () => null),
        out: p.retired ? [...scene.out, { ...p.retired }] : [...scene.out],
        held: [],
        forward: null,
        caption: { kind: 'done', n: scene.instrs.length, end: p.end, ideal: p.ideal, lost: p.stalls },
        step: null,
      };
      return { ...next, step: { moves: movesBetween(scene, next), bump: [] } };
    }

    return scene;
  },
};
