/**
 * 배치와 패딩 — 요청 여덟을 자리 몇 개에 나눠 한꺼번에 돌린다.
 *
 * 두 손잡이가 있다.
 *   policy  0 = 묶어서 기다림 (도착 차례로 자리 수만큼 묶고, 묶음의 가장 긴 요청이 끝날 때까지 돈다)
 *           1 = 빈자리 채움   (끝난 자리를 다음 걸음 처음에 대기열 맨 앞 요청으로 채운다)
 *   slots   자리 수 1 · 2 · 4 · 8
 *
 * 한 판을 끝까지 재생하고 손잡이 입력을 기다린다. 입력이 오면 그 값으로 처음부터 다시 돈다.
 *
 * ## 예로 정한 값
 *
 * 요청마다 만들 토큰 수(3 · 12 · 5 · 7 · 2 · 9 · 4 · 6)는 **예로 정한 값**이다. 모형이 실제로 낸
 * 길이가 아니다. 요청의 글은 자료로만 싣는다.
 *
 * ## 규약
 *
 * - 칸-걸음 = 자리 하나 × 걸음 하나. 프롬프트 읽기는 셈하지 않는다.
 * - 걸음마다 요청이 든 자리는 토큰 하나를 낸다. 요청이 없거나 이미 다 낸 자리는 빈칸이다.
 * - 묶어서 기다림: 묶음의 모든 요청은 묶음이 끝나는 걸음에 함께 돌려받는다. 다음 묶음은 그 다음 걸음에 시작한다.
 * - 빈자리 채움: 다 낸 요청은 그 걸음 끝에 자리를 비우고 그 걸음이 끝난 걸음이다. 빈자리는 다음 걸음 처음에
 *   **자리 번호가 작은 것부터** 채운다 (동률 규칙 — 같은 걸음에 둘이 비면 번호 작은 자리가 대기열 맨 앞을 받는다).
 * - 걸음 · 자리 번호는 화면에서 1 부터. payload 의 색인은 0 부터다.
 *
 * ## 이벤트 (silent 는 phase 만)
 *
 * | type | payload | 뜻 |
 * | --- | --- | --- |
 * | `setup` | `{ policy: number; slots: number; ghost: number[] }` | 한 판의 시작. 모든 요청이 대기열로 돌아간다. `ghost` 는 앞 판의 끝난 걸음 (없으면 빈 배열) |
 * | `batch-formed` | `{ batch: number; moves: { req: number; slot: number }[]; longest: number; len: number }` | 묶어서 기다림 — 묶음 하나가 자리에 앉는다. `batch` 는 0 부터, `longest` 는 묶음에서 가장 긴 요청의 색인, `len` 은 그 토큰 수 (= 묶음이 도는 걸음) |
 * | `refill` | `{ moves: { req: number; slot: number }[] }` | 빈자리 채움 — 대기열 맨 앞이 빈자리로 들어온다 |
 * | `step` | `{ step: number; lanes: { req: number; done: number; pad: number }[]; active: number; idle: number; used: number; cells: number; pct: number }` | 한 걸음. `lanes[s].req` 는 요청 색인(없으면 -1), `done` 은 낸 토큰, `pad` 는 그 자리에 쌓인 빈칸. `idle` · `used` 는 판 누계, `cells` = 자리 × 걸음, `pct` = 가동 % |
 * | `batch-returned` | `{ step: number; items: { req: number; slot: number; finish: number }[] }` | 묶어서 기다림 — 묶음을 함께 돌려받는다 |
 * | `release` | `{ step: number; items: { req: number; slot: number; finish: number }[] }` | 빈자리 채움 — 다 낸 요청이 자리를 비우고 나간다 |
 * | `done` | `{ steps: number; idle: number; cells: number; pct: number; finishSum: number }` | 한 판의 끝 |
 * | `phase` (silent) | `{ phase: string }` | 코드 패널 하이라이트 |
 *
 * ## phase
 *
 * `'setup' | 'form-batch' | 'decode' | 'return-batch' | 'refill' | 'release'` — irs.ts 와 같은 집합이다 (C3).
 * 모든 phase 뒤에 걸음 경계(`sleep`)가 온다.
 *
 * ## 메트릭
 *
 * - `step-count` — 지금까지의 걸음
 * - `idle-cell-count` — 지금까지 쌓인 빈 칸-걸음
 * - `finish-step-sum` — 지금까지 끝난 요청의 끝난 걸음 합
 *
 * 계기는 누적 채널이라 판마다 0 으로 되돌린다 (`gauge`).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BatchingAndPaddingRequest = {
  /** 식별자 (R1 … R8). 화면의 이름은 문안이 만든다. */
  id: string;
  /** 요청의 글 — 자료. 번역하지 않는다. */
  prompt: string;
  /** 만들 토큰 수 — 예로 정한 값. */
  tokens: number;
};

export type BatchingAndPaddingData = {
  type: 'batching-and-padding';
  /** 걸음 하나 뒤에 머무는 ms. */
  stepMs: number;
  /** 도착 차례. 모두 처음부터 대기열에 있다. */
  requests: BatchingAndPaddingRequest[];
  /** 묶는 법 사다리 — 0 묶어서 기다림, 1 빈자리 채움. */
  policies: number[];
  /** 자리 수 사다리. */
  slotLadder: number[];
  /** 처음 묶는 법 (손잡이 기본값과 같다). */
  policy: number;
  /** 처음 자리 수 (손잡이 기본값과 같다). */
  slots: number;
};

export type BatchLane = { req: number; done: number; pad: number };
export type BatchMove = { req: number; slot: number };
export type BatchFinish = { req: number; slot: number; finish: number };

/** 손잡이 payload 에서 값을 꺼낸다. 수가 아니면 null. */
function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 가동 % — 반올림. (used × 100 + cells // 2) // cells. 칸이 0 이면 0. */
export function busyPercent(used: number, cells: number): number {
  if (cells <= 0) return 0;
  return Math.floor((used * 100 + Math.floor(cells / 2)) / cells);
}

export async function batchingAndPaddingAlgorithm(
  base: FacetContext<BatchingAndPaddingData>,
): Promise<void> {
  const ctx = base as ReactiveContext<BatchingAndPaddingData>;
  const data = ctx.data;
  const requests = Array.isArray(data.requests) ? data.requests : [];
  const lengths = requests.map((r) => r.tokens);
  const n = lengths.length;
  const policies = Array.isArray(data.policies) ? data.policies : [0, 1];
  const ladder = Array.isArray(data.slotLadder) ? data.slotLadder : [1, 2, 4, 8];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 400;

  let policy = policies.includes(data.policy) ? data.policy : 0;
  let slots = ladder.includes(data.slots) ? data.slots : ladder[0] ?? 1;
  let ghost: number[] = [];

  /** 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 걸음 사이의 문. 끝까지 지났으면 true, 취소됐으면 false. */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 한 판을 돈다. 끝난 걸음 배열을 돌려주거나, 취소됐으면 'cancelled'. */
  async function play(): Promise<number[] | 'cancelled'> {
    const finish: number[] = lengths.map(() => 0);
    let lanes: BatchLane[] = Array.from({ length: slots }, () => ({ req: -1, done: 0, pad: 0 }));
    let step = 0;
    let idle = 0;
    let used = 0;
    let finishSum = 0;

    // 판의 처음도 걸음이다 — 앞 판의 release/return-batch 강조가 남지 않게 IR 첫 줄에 묶는다.
    await phase('setup');
    await ctx.emit({ type: 'setup', payload: { policy, slots, ghost: [...ghost] } });
    gauge('step-count', 0);
    gauge('idle-cell-count', 0);
    gauge('finish-step-sum', 0);
    if (!(await pause())) return 'cancelled';

    /** 한 걸음 — 요청이 든 자리는 토큰 하나를 내고, 나머지는 빈칸을 하나 쌓는다. */
    const advance = (): number => {
      step += 1;
      let active = 0;
      lanes = lanes.map((lane) => {
        if (lane.req >= 0 && lane.done < lengths[lane.req]) {
          active += 1;
          return { ...lane, done: lane.done + 1 };
        }
        return { ...lane, pad: lane.pad + 1 };
      });
      idle += slots - active;
      used += active;
      return active;
    };

    const stepPayload = (active: number) => ({
      step,
      lanes: lanes.map((l) => ({ ...l })),
      active,
      idle,
      used,
      cells: slots * step,
      pct: busyPercent(used, slots * step),
    });

    if (policy === 0) {
      // 묶어서 기다림 — 도착 차례로 자리 수만큼 묶는다.
      for (let g = 0; g < n; g += slots) {
        if (ctx.cancelled) return 'cancelled';
        const hi = Math.min(g + slots, n);
        let longest = 0;
        // 가장 긴 요청 — 같은 길이면 앞 요청 (이 자료에는 같은 길이가 없어 걸리지 않는다).
        let longestReq = g;
        const moves: BatchMove[] = [];
        lanes = Array.from({ length: slots }, () => ({ req: -1, done: 0, pad: 0 }));
        for (let i = g; i < hi; i++) {
          if (ctx.cancelled) return 'cancelled';
          if (lengths[i] > longest) longestReq = i;
          longest = Math.max(longest, lengths[i]);
          lanes[i - g] = { req: i, done: 0, pad: 0 };
          moves.push({ req: i, slot: i - g });
        }
        await phase('form-batch');
        await ctx.emit({ type: 'batch-formed', payload: { batch: g / slots, moves, longest: longestReq, len: longest } });
        if (!(await pause())) return 'cancelled';

        // 묶음은 가장 긴 요청이 끝날 때까지 돈다.
        for (let t = 0; t < longest; t++) {
          if (ctx.cancelled) return 'cancelled';
          const active = advance();
          await phase('decode');
          await ctx.emit({ type: 'step', payload: stepPayload(active) });
          gauge('step-count', step);
          gauge('idle-cell-count', idle);
          if (!(await pause())) return 'cancelled';
        }

        // 묶음의 모든 요청을 이 걸음에 함께 돌려받는다.
        const items: BatchFinish[] = [];
        for (let i = g; i < hi; i++) {
          if (ctx.cancelled) return 'cancelled';
          finish[i] = step;
          finishSum += step;
          items.push({ req: i, slot: i - g, finish: step });
        }
        lanes = Array.from({ length: slots }, () => ({ req: -1, done: 0, pad: 0 }));
        await phase('return-batch');
        await ctx.emit({ type: 'batch-returned', payload: { step, items } });
        gauge('finish-step-sum', finishSum);
        if (!(await pause())) return 'cancelled';
      }
    } else {
      // 빈자리 채움 — 걸음 처음에 빈 자리를 번호 작은 것부터 대기열 맨 앞으로 채운다.
      let waiting = 0;
      let busy = 0;
      while (waiting < n || busy > 0) {
        if (ctx.cancelled) return 'cancelled';
        const moves: BatchMove[] = [];
        for (let s = 0; s < slots; s++) {
          if (ctx.cancelled) return 'cancelled';
          if (lanes[s].req === -1 && waiting < n) {
            lanes[s] = { req: waiting, done: 0, pad: 0 };
            moves.push({ req: waiting, slot: s });
            waiting += 1;
            busy += 1;
          }
        }
        if (moves.length > 0) {
          await phase('refill');
          await ctx.emit({ type: 'refill', payload: { moves } });
          if (!(await pause())) return 'cancelled';
        }

        const active = advance();
        await phase('decode');
        await ctx.emit({ type: 'step', payload: stepPayload(active) });
        gauge('step-count', step);
        gauge('idle-cell-count', idle);
        if (!(await pause())) return 'cancelled';

        // 다 낸 요청은 이 걸음 끝에 자리를 비운다 — 같은 걸음 안에서 다시 채우지 않는다.
        const items: BatchFinish[] = [];
        for (let s = 0; s < slots; s++) {
          if (ctx.cancelled) return 'cancelled';
          const lane = lanes[s];
          if (lane.req >= 0 && lane.done === lengths[lane.req]) {
            finish[lane.req] = step;
            finishSum += step;
            items.push({ req: lane.req, slot: s, finish: step });
            lanes[s] = { req: -1, done: 0, pad: 0 };
            busy -= 1;
          }
        }
        if (items.length > 0) {
          await phase('release');
          await ctx.emit({ type: 'release', payload: { step, items } });
          gauge('finish-step-sum', finishSum);
          if (!(await pause())) return 'cancelled';
        }
      }
    }

    const cells = slots * step;
    await ctx.emit({
      type: 'done',
      payload: { steps: step, idle, cells, pct: busyPercent(used, cells), finishSum },
    });
    return finish;
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const result = await play();
      if (result === 'cancelled') return;
      ghost = result;

      // 손잡이를 기다린다. 우리 것이 아닌 입력과 사다리 밖의 값은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const value = readValue(input.payload);
        if (value === null) continue;
        if (input.type === 'policy' && policies.includes(value)) {
          policy = value;
          break;
        }
        if (input.type === 'slots' && ladder.includes(value)) {
          slots = value;
          break;
        }
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
