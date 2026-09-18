/**
 * top-k / top-p — 꼬리를 "몇 개" 로 자르는 것과 "얼마만큼" 으로 자르는 것.
 *
 * 두 문맥(뾰족 · 평평)에 같은 손잡이를 건다. k 는 두 분포에서 **같은 수**를 남기고, p 는
 * **같은 몫**을 남긴다. 둘을 함께 걸면 k 가 먼저 자르고 p 는 남은 것 안에서 다시 나눈
 * 분포로 잰다 (Hugging Face 의 TopK → TopP 워퍼, vLLM 의 `apply_top_k_top_p` 순서).
 *
 * ## 예로 정한 값
 *
 * 두 문맥의 후보 확률(천분율 정수, 합 1000)은 **예로 정한 값**이다. 실제 모형이 낸 수가
 * 아니다. 생성 제어 조각들은 로짓을 주고 소프트맥스로 셈하지만, 이 완제품은 확률을 바로
 * 준다 — 누적과 p 를 정수 곱 둘로 견주어 부동소수점 경계를 없애려는 것이다.
 *
 * ## 규약 (`cutContext`)
 *
 * 후보는 확률 큰 차례로 적혀 있다 (동률 없음).
 * 1. k 남김 n = min(k, 후보 수). 그 앞 n 개의 천분율 합 = M
 * 2. 앞에서부터 누적 천분율 c 가 처음으로 `c × 100 ≥ p × M` 이 되는 후보까지 남긴다
 *    (그 후보도 남는다 — "p 이상"). 끝까지 안 닿으면 n 그대로
 * 3. 잘린 몫 % = `((합 − 남은 합) × 100 + 합 // 2) // 합` (합 = 1000)
 *
 * **동률 규칙** — 확률에 동률은 없다. 견줌은 `≥` 라 `c × 100 = p × M` 에서 멈춘다 ("p 이상").
 * 이 등호가 이 데이터에서 실제로 걸리는 자리는 둘이다 (검사가 센다).
 * - p = 100 의 마지막 후보(c = M) — "끝까지 안 닿으면 n 그대로" 와 같은 답이다
 * - 평평 · k 5 · p 50 — M = 840, toast + eggs = 420 이 정확히 절반이다. `≥` 라 eggs 에서 멈춰
 *   둘이 남는다 (초과로 읽으면 셋)
 *
 * ## 이벤트 (payload 배열은 `contexts` 순서)
 *
 * - `phase`   (silent) `{ phase: 'top-k' | 'accumulate' | 'cut' | 'measure' }`
 * `frames` 는 문맥마다 `ContextFrame` (`{ share: number[]; cutPermille; total; cutPercent }`) —
 * 화면에 읽히는 몫 % 와 잘린 몫은 모두 여기서 셈해 싣는다.
 *
 * - `round`   `{ topK: number; topP: number; topPLabel: string; frames }` — 한 판의 시작. 두 분포가 온전한 모양으로 돌아온다
 * - `k-cut`   `{ topK: number; kept: number[]; dropped: number[]; mass: number[]; frames }`
 *             — k 칼날 아래가 떨어지고 남은 것이 M 으로 다시 나뉜다
 * - `p-check` `{ rank: number; run: number[]; status: ('stay' | 'reach' | 'closed')[]; frames }`
 *             — 순위 rank(0 부터) 후보의 몫을 누적에 더해 p 선과 견준다. `reach` 이면 그 아래가 떨어지고
 *             그 문맥의 몫은 곧바로 남은 합으로 다시 나뉜다
 * - `p-cut`   `{ kept: number[]; keptSum: number[]; frames }` — 남은 것이 다시 나뉘어 칸을 채운다
 * - `measure` `{ kept: number[]; cutPercent: number[]; cutter: ('none' | 'k' | 'p' | 'renorm-p')[] }`
 *
 * ## phase 어휘 (irs.ts 와 같다)
 *
 * `'top-k' | 'accumulate' | 'cut' | 'measure'`
 *
 * ## 메트릭 (지금 보이는 값 — 차이만 보낸다)
 *
 * `peaked-kept-count` · `flat-kept-count` · `peaked-cut-percent` · `flat-cut-percent`
 *
 * ## 손잡이
 *
 * `topK` (사다리 `topKLadder`) · `topP` (사다리 `topPLadder`, 백분율 정수). 값은 number 이고
 * 사다리 소속을 확인하고 받는다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type TopKTopPContextData = {
  /** 식별자 — 표시 이름은 messages (`label.peaked` · `label.flat`) */
  id: 'peaked' | 'flat';
  /** 소재 텍스트 — 번역하지 않는다 */
  prompt: string;
  tokens: string[];
  /** 천분율 정수, 큰 차례, 합 1000. 예로 정한 값 */
  permille: number[];
};

export type TopKTopPData = {
  type: 'top-k-top-p';
  stepMs: number;
  contexts: TopKTopPContextData[];
  topKLadder: number[];
  topPLadder: number[];
  topK: number;
  topP: number;
};

export type Cutter = 'none' | 'k' | 'p' | 'renorm-p';

export type ContextCut = {
  /** k 남김 = min(k, 후보 수) */
  n: number;
  /** 앞 n 개의 천분율 합 */
  mass: number;
  /** 최종 남김 (k 먼저, 그다음 다시 나눈 p) */
  kept: number;
  keptSum: number;
  total: number;
  /** k 만으로 잘린 몫 % */
  kCutPercent: number;
  /** 최종 잘린 몫 % */
  cutPercent: number;
  /** runs[i] = 앞 i+1 개의 누적 천분율 (i < n) */
  runs: number[];
  /** p 만 원래 분포에 걸었을 때 남김 */
  pAlone: number;
  cutter: Cutter;
};

/** 반올림 백분율 `(x × 100 + n // 2) // n` — IR 의 cutPercent 와 같은 식. */
export function roundPercent(x: number, n: number): number {
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

function keptOf(permille: readonly number[], topK: number, topP: number): { n: number; mass: number; kept: number; runs: number[] } {
  const n = Math.min(topK, permille.length);
  let mass = 0;
  for (let i = 0; i < n; i++) mass += permille[i];
  const runs: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += permille[i];
    runs.push(run);
  }
  let kept = n;
  for (let i = 0; i < n; i++) {
    const reached = runs[i] * 100;
    const need = topP * mass;
    if (reached >= need) {
      kept = i + 1;
      break;
    }
  }
  return { n, mass, kept, runs };
}

/** 한 문맥의 읽힐 값 — 남은 것 안의 몫 %(떨어진 것은 -1) · 잘린 천분율 · 잘린 몫 %. stage 는 받기만 한다. */
export type ContextFrame = { share: number[]; cutPermille: number; total: number; cutPercent: number };

/** 앞 count 개가 남았을 때의 읽힐 값. 몫의 분모는 남은 합이다 (다시 나눈 분포). */
export function frameOf(permille: readonly number[], count: number): ContextFrame {
  let total = 0;
  for (const x of permille) total += x;
  let left = 0;
  for (let i = 0; i < count; i++) left += permille[i];
  return {
    share: permille.map((x, r) => (r < count ? roundPercent(x, left) : -1)),
    cutPermille: total - left,
    total,
    cutPercent: roundPercent(total - left, total),
  };
}

/** 한 문맥에 k · p 를 건 결과. 알고리즘과 검사가 함께 쓰는 단일 출처. */
export function cutContext(permille: readonly number[], topK: number, topP: number): ContextCut {
  let total = 0;
  for (const x of permille) total += x;
  const { n, mass, kept, runs } = keptOf(permille, topK, topP);
  let keptSum = 0;
  for (let i = 0; i < kept; i++) keptSum += permille[i];
  const pAlone = keptOf(permille, permille.length, topP).kept;
  let cutter: Cutter = 'none';
  if (kept < n) cutter = kept < pAlone ? 'renorm-p' : 'p';
  else if (n < permille.length) cutter = 'k';
  return {
    n,
    mass,
    kept,
    keptSum,
    total,
    kCutPercent: roundPercent(total - mass, total),
    cutPercent: roundPercent(total - keptSum, total),
    runs,
    pAlone,
    cutter,
  };
}

function isNumArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function isContext(x: unknown): x is TopKTopPContextData {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    (r.id === 'peaked' || r.id === 'flat') &&
    typeof r.prompt === 'string' &&
    Array.isArray(r.tokens) &&
    r.tokens.every((s) => typeof s === 'string') &&
    isNumArray(r.permille) &&
    r.permille.length === r.tokens.length
  );
}

export async function topKTopPAlgorithm(ctxBase: FacetContext<TopKTopPData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TopKTopPData>;
  const data = ctx.data;
  if (
    !Array.isArray(data.contexts) ||
    !data.contexts.every(isContext) ||
    data.contexts.length !== 2 ||
    !isNumArray(data.topKLadder) ||
    !isNumArray(data.topPLadder) ||
    data.topKLadder.length === 0 ||
    data.topPLadder.length === 0
  ) {
    return;
  }
  const contexts = data.contexts;
  const kLadder = data.topKLadder;
  const pLadder = data.topPLadder;
  const stepMs = typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : 900;

  let topK = kLadder.includes(data.topK) ? data.topK : kLadder[kLadder.length - 1];
  let topP = pLadder.includes(data.topP) ? data.topP : pLadder[pLadder.length - 1];

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const was = shown.get(name);
    if (was === undefined || was !== value) ctx.metric(name, value - (was ?? 0));
    shown.set(name, value);
  };

  /** 걸음 사이의 문 — 취소를 함께 진다. */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function playRound(): Promise<boolean> {
    const k = topK;
    const p = topP;
    const cuts = contexts.map((c) => cutContext(c.permille, k, p));
    const [peaked, flat] = cuts;

    // ── 판의 시작: 온전한 분포, 칼날이 자리로 내려온다
    await phase('top-k');
    gauge('peaked-kept-count', contexts[0].permille.length);
    gauge('flat-kept-count', contexts[1].permille.length);
    gauge('peaked-cut-percent', 0);
    gauge('flat-cut-percent', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        topK: k,
        topP: p,
        topPLabel: String(p / 100),
        frames: contexts.map((c) => frameOf(c.permille, c.permille.length)),
      },
    });
    if (!(await pause())) return false;

    // ── k: 칼날 아래가 떨어지고 남은 것이 M 으로 다시 나뉜다
    gauge('peaked-kept-count', peaked.n);
    gauge('flat-kept-count', flat.n);
    gauge('peaked-cut-percent', peaked.kCutPercent);
    gauge('flat-cut-percent', flat.kCutPercent);
    await ctx.emit({
      type: 'k-cut',
      payload: {
        topK: k,
        kept: cuts.map((c) => c.n),
        dropped: cuts.map((c, i) => contexts[i].permille.length - c.n),
        mass: cuts.map((c) => c.mass),
        frames: cuts.map((c, i) => frameOf(contexts[i].permille, c.n)),
      },
    });
    if (!(await pause())) return false;

    // ── p: 다시 나눈 분포에서 누적이 p 선에 닿는 자리를 찾는다
    const steps = Math.max(...cuts.map((c) => c.kept));
    for (let i = 0; i < steps; i++) {
      if (ctx.cancelled) return false;
      const status = cuts.map((c) => (i < c.kept - 1 ? 'stay' : i === c.kept - 1 ? 'reach' : 'closed'));
      const run = cuts.map((c) => c.runs[Math.min(i, c.kept - 1)]);
      await phase('accumulate');
      if (status[0] === 'reach') {
        gauge('peaked-kept-count', peaked.kept);
        gauge('peaked-cut-percent', peaked.cutPercent);
      }
      if (status[1] === 'reach') {
        gauge('flat-kept-count', flat.kept);
        gauge('flat-cut-percent', flat.cutPercent);
      }
      await ctx.emit({
        type: 'p-check',
        // 닿은 문맥은 곧바로 남은 합으로 다시 나눈 몫을 싣는다 — 아직 견주는 문맥은 k 가 남긴 M 으로
        payload: {
          rank: i,
          run,
          status,
          frames: cuts.map((c, j) => frameOf(contexts[j].permille, status[j] === 'stay' ? c.n : c.kept)),
        },
      });
      if (!(await pause())) return false;
    }

    // ── 남은 것이 다시 나뉘어 칸을 채운다 (`return kept`)
    await phase('cut');
    await ctx.emit({
      type: 'p-cut',
      payload: {
        kept: cuts.map((c) => c.kept),
        keptSum: cuts.map((c) => c.keptSum),
        frames: cuts.map((c, i) => frameOf(contexts[i].permille, c.kept)),
      },
    });
    if (!(await pause())) return false;

    // ── 잘린 몫을 잰다
    await phase('measure');
    gauge('peaked-kept-count', peaked.kept);
    gauge('flat-kept-count', flat.kept);
    gauge('peaked-cut-percent', peaked.cutPercent);
    gauge('flat-cut-percent', flat.cutPercent);
    await ctx.emit({
      type: 'measure',
      payload: {
        kept: cuts.map((c) => c.kept),
        cutPercent: cuts.map((c) => c.cutPercent),
        cutter: cuts.map((c) => c.cutter),
      },
    });
    return pause();
  }

  /** 손잡이 입력이면 반영하고 true. 우리 것이 아니거나 사다리 밖이면 false (취소와는 무관). */
  function apply(input: ReactiveInputEvent): boolean {
    const payload = input.payload;
    const value =
      typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
    if (typeof value !== 'number') return false;
    if (input.type === 'topK' && kLadder.includes(value)) {
      topK = value;
      return true;
    }
    if (input.type === 'topP' && pLadder.includes(value)) {
      topP = value;
      return true;
    }
    return false;
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 손잡이를 기다린다. 재생 중에 여러 번 돌렸으면 쌓인 것을 모두 반영하고 한 판만 돈다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (!apply(input)) continue;
        for (;;) {
          if (ctx.cancelled) return;
          const more = ctx.pollInput();
          if (more === null) break;
          apply(more);
        }
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    if (!ctx.cancelled) throw err;
  }
}
