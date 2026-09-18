/**
 * 제어 해저드 — 분기의 판정이 늦을수록 무엇을 얼마나 버리는가.
 *
 * 다섯 단계 파이프라인(IF · ID · EX · MEM · WB)이 한 박자에 명령어 하나씩 가져온다.
 * 짐작은 늘 "안 탄다" — 분기 다음 주소를 이어 가져온다. 판정 단계 s 의 끝에서
 * 분기가 판정되고, 탔으면 그 사이 가져온 s − 1 개를 버린 뒤 다음 박자에 목표를
 * 가져온다. 안 탔으면 잃는 것이 없다.
 *
 * 데이터 해저드는 다루지 않는다 — 포워딩이 완비되어 판정 단계가 필요한 값을 늦지
 * 않게 받는다고 본다.
 *
 * ── 손잡이
 *   `resolve` — payload `{ value, segmentIndex }`. value 는 판정 단계 번호
 *   (IF 1 · ID 2 · EX 3 · MEM 4) 이고 `resolveLadder` 에 들어 있어야 받는다.
 *
 * ── 이벤트 (전부 await, 순차)
 *   round-start  { resolveStage: number, penalty: number }
 *                한 판의 시작. 판정 자리와 벌칙(분기 하나가 버리는 수)을 알린다.
 *   cycle        { cycle: number, slots: ({ id, pc, spec } | null)[5] }
 *                한 박자의 파이프라인. slots[0] 이 IF, slots[4] 가 WB.
 *                id 는 가져온 순번, pc 는 명령어 자리, spec 은 판정 전인 분기 뒤에서
 *                짐작으로 가져왔는가.
 *   resolve      { cycle, branchId, pc, stage, taken: boolean,
 *                  flushed: { id, pc }[], target: number }
 *                분기가 판정 단계의 끝에서 판정됐다. taken 이면 flushed 가 버려진다
 *                (되뜀은 다음 jump 이벤트). 아니면 flushed 는 빈 배열이다.
 *   jump         { cycle, from: number, target: number }
 *                탄 분기 뒤, 목표로 되뛴다. resolve 와 걸음을 갈라 코드 패널이
 *                flush 줄과 jump 줄을 각각 짚게 한다.
 *   round-end    { cycles, flushed, taken, penalty, executed }
 *                한 판이 끝났다. 셈한 값 전부.
 *   phase        { phase } — silent. 코드 패널 하이라이트용.
 *
 * ── phase 어휘 (irs.ts 와 같은 집합)
 *   'fetch' | 'resolve' | 'flush' | 'jump' | 'done'
 *
 * ── 메트릭
 *   cycle-count  지금까지 흐른 박자. 판이 끝나면 전체 박자
 *   flush-count  버린 명령어 수
 *   taken-count  탄 분기 수 (늘 3 — 벌칙만 움직인다는 것을 보인다)
 *   판이 바뀌면 0 으로 되돌린다 (gauge — 누적 채널에 차이만 보낸다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ControlHazardData = {
  type: 'control-hazard';
  /** 명령어 글. 자료라 번역하지 않는다. */
  program: string[];
  /** 자리마다 분기인가 (1/0). */
  isBranch: number[];
  /** 분기의 목표 자리. 분기가 아니면 -1. */
  target: number[];
  /** 반복 횟수 — 분기는 처음 trips − 1 번 타고 마지막에 안 탄다. */
  trips: number;
  /** 손잡이 사다리 (판정 단계 번호). facet.ts 의 segments[].value 와 같다. */
  resolveLadder: number[];
  /** 처음 판정 단계. */
  resolveStage: number;
  /** 박자 사이 간격 (ms). */
  stepMs: number;
};

/** 파이프라인 단계 수. */
export const STAGE_COUNT = 5;

export type SlotToken = { id: number; pc: number; spec: boolean };

export type HazardFrame = {
  cycle: number;
  slots: (SlotToken | null)[];
  resolve: {
    branchId: number;
    pc: number;
    taken: boolean;
    flushed: { id: number; pc: number }[];
    target: number;
  } | null;
};

export type HazardRun = {
  frames: HazardFrame[];
  cycles: number;
  flushed: number;
  taken: number;
  executed: number;
};

/**
 * 한 판을 박자 단위로 셈한다 — 순수 함수.
 *
 * 판정 단계 s 에 든 분기를 그 박자의 끝에서 판정한다. 탔으면 앞 단계들
 * (IF .. s − 1) 에 든 것을 버리고 다음 박자에 목표를 가져온다.
 */
export function simulateControlHazard(data: ControlHazardData, resolveStage: number): HazardRun {
  const n = data.program.length;
  let slots: (SlotToken | null)[] = Array.from({ length: STAGE_COUNT }, () => null);
  const resolved = new Set<number>();
  const frames: HazardFrame[] = [];
  let pc = 0;
  let left = data.trips - 1;
  let nextId = 0;
  let cycle = 0;
  let flushed = 0;
  let taken = 0;

  for (;;) {
    // 판정 전인 분기가 파이프라인에 있으면 지금 가져오는 것은 짐작이다.
    const inFlight = slots.some(
      (s) => s !== null && data.isBranch[s.pc] === 1 && !resolved.has(s.id),
    );
    const fetched: SlotToken | null = pc < n ? { id: nextId, pc, spec: inFlight } : null;
    const shifted = [fetched, ...slots.slice(0, STAGE_COUNT - 1)];
    if (shifted.every((s) => s === null)) break;
    if (fetched) {
      nextId += 1;
      pc += 1; // 짐작 — 안 탄다
    }
    slots = shifted;
    cycle += 1;

    let resolve: HazardFrame['resolve'] = null;
    const b = slots[resolveStage - 1];
    if (b && data.isBranch[b.pc] === 1 && !resolved.has(b.id)) {
      resolved.add(b.id);
      const tgt = data.target[b.pc] ?? -1;
      if (left > 0) {
        left -= 1;
        const gone: { id: number; pc: number }[] = [];
        // 가져온 차례대로 — 판정 단계 바로 앞(먼저 들어온 것)부터 IF 까지.
        for (let i = resolveStage - 2; i >= 0; i -= 1) {
          const s = slots[i];
          if (s) gone.push({ id: s.id, pc: s.pc });
        }
        taken += 1;
        flushed += gone.length;
        resolve = { branchId: b.id, pc: b.pc, taken: true, flushed: gone, target: tgt };
        // 프레임에는 판정 직전의 모습을 남기고, 버림은 다음 박자부터 반영한다.
        frames.push({ cycle, slots: slots.map((s) => (s ? { ...s } : null)), resolve });
        slots = slots.map((s, i) => (i < resolveStage - 1 ? null : s));
        pc = tgt;
        continue;
      }
      resolve = { branchId: b.id, pc: b.pc, taken: false, flushed: [], target: tgt };
      frames.push({ cycle, slots: slots.map((s) => (s ? { ...s } : null)), resolve });
      slots = slots.map((s) => (s ? { ...s, spec: false } : null));
      continue;
    }
    frames.push({ cycle, slots: slots.map((s) => (s ? { ...s } : null)), resolve });
  }
  return { frames, cycles: cycle, flushed, taken, executed: countExecuted(frames) };
}

/** WB 에 닿은 명령어 수 — 버리지 않은 동적 명령어. */
function countExecuted(frames: HazardFrame[]): number {
  let count = 0;
  for (const f of frames) if (f.slots[STAGE_COUNT - 1]) count += 1;
  return count;
}

function readStage(payload: unknown, ladder: number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number' || !ladder.includes(v)) return null;
  return v;
}

export async function controlHazardAlgorithm(baseCtx: FacetContext<ControlHazardData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<ControlHazardData>;
  const data = ctx.data;
  const ladder = data.resolveLadder;
  let stage = ladder.includes(data.resolveStage) ? data.resolveStage : (ladder[0] ?? 3);
  const stepMs = data.stepMs;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  async function playRound(resolveStage: number): Promise<boolean> {
    const run = simulateControlHazard(data, resolveStage);
    const penalty = resolveStage - 1;
    gauge('cycle-count', 0);
    gauge('flush-count', 0);
    gauge('taken-count', 0);
    await ctx.emit({ type: 'round-start', payload: { resolveStage, penalty } });
    if (!(await ctx.sleep(stepMs))) return false;

    let flushedSoFar = 0;
    let takenSoFar = 0;
    for (const frame of run.frames) {
      if (ctx.cancelled) return false;
      if (frame.slots[0]) await phase('fetch');
      gauge('cycle-count', frame.cycle);
      await ctx.emit({
        type: 'cycle',
        payload: { cycle: frame.cycle, slots: frame.slots },
      });
      if (!(await ctx.sleep(stepMs))) return false;

      const r = frame.resolve;
      if (!r) continue;
      // 코드 패널은 앞 phase 를 덮으므로 걸음(sleep) 하나에 phase 하나만 둔다.
      // 탔으면 버림(flush) → 걸음 → 되뜀(jump) → 걸음, 안 탔으면 판정(resolve) → 걸음.
      if (r.taken) {
        takenSoFar += 1;
        flushedSoFar += r.flushed.length;
        await phase('flush');
        gauge('taken-count', takenSoFar);
        gauge('flush-count', flushedSoFar);
      } else {
        await phase('resolve');
      }
      await ctx.emit({
        type: 'resolve',
        payload: {
          cycle: frame.cycle,
          branchId: r.branchId,
          pc: r.pc,
          stage: resolveStage,
          taken: r.taken,
          flushed: r.flushed,
          target: r.target,
        },
      });
      if (!(await ctx.sleep(stepMs))) return false;
      if (!r.taken) continue;
      await phase('jump');
      await ctx.emit({ type: 'jump', payload: { cycle: frame.cycle, from: r.pc, target: r.target } });
      if (!(await ctx.sleep(stepMs))) return false;
    }

    await phase('done');
    await ctx.emit({
      type: 'round-end',
      payload: {
        cycles: run.cycles,
        flushed: run.flushed,
        taken: run.taken,
        penalty,
        executed: run.executed,
      },
    });
    return true;
  }

  /** 손잡이 입력을 기다린다. 취소면 null — 값과 겹치지 않는다. */
  async function waitStage(): Promise<number | null> {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'resolve') continue;
      const v = readStage(input.payload, ladder);
      if (v === null) continue;
      return v;
    }
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(stage))) return;
      const next = await waitStage();
      if (next === null) return;
      stage = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
