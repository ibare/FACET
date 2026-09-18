/**
 * KV 캐시 — 지난 토큰의 K · V 를 들고 있으면 무엇을 아끼고 무엇을 치르는가.
 *
 * 손잡이 둘(캐시 끔 · 켬, 만들 토큰 수)을 받아 한 판을 끝까지 재생하고, 입력을
 * 기다렸다가 받은 값으로 다시 재생한다 (reactive).
 *
 * ── 규약 (조각 `dont-recount-the-past` · `cache-keeps-growing` · `first-token-vs-rest` 와 같은 단위)
 *
 * - 낱말 하나 = 토큰 하나. 낱말은 공백으로 가른 덩이다. 프롬프트 낱말 수가 P 다.
 * - "K·V 자리" = 토큰 자리 하나의 K 와 V 를 셈하는 일 한 번. 층 · 머리는 두 쪽에
 *   같은 곱수라 세지 않는다.
 * - 걸음 t (1 부터, t = 1..N) 는 길이 L = P + t − 1 의 열을 보고 다음 토큰 하나를 낸다.
 *   - 캐시 끔: 그 걸음에 자리 1..L 의 K·V 를 모두 셈한다.
 *   - 캐시 켬: 걸음 1 은 프롬프트 P 자리를 한꺼번에, 걸음 t ≥ 2 는 걸음 t − 1 이 낸
 *     토큰 한 자리. 셈한 것은 캐시 끝에 붙는다.
 *   - 마지막에 낸 토큰의 K·V 는 셈하지 않는다 (더 낼 것이 없다). 그래서 끝의 캐시는
 *     P + N − 1 이다.
 * - "주의 점수 셈" = 질의 한 줄과 키 한 줄의 곱 한 번. 인과 가림 — 자리 i 의 질의는
 *   자리 1..i 의 키만 본다.
 *   - 캐시 끔: 걸음마다 열 전체를 다시 → L(L + 1)/2
 *   - 캐시 켬: 걸음 1 은 P(P + 1)/2, 걸음 t ≥ 2 는 새 질의 하나가 L 개 키를 본다.
 *   K·V 자리와 단위가 달라 두 수를 더하지 않는다.
 * - 아낀 몫 % = ((끔 − 켬) × 100 + 끔 // 2) // 끔 (셈한 K·V 자리, 반올림).
 * - 동률 규칙은 없다 — 견주어 고르는 자리가 없다. 모든 셈이 정수다.
 *
 * ── 예로 정한 값
 *
 * 이어서 낼 토큰(`continuation`)은 **예로 정한 이어짐**이다. 모형이 낸 것이 아니고,
 * 어떤 낱말이 나오든 셈은 같다 — 세는 것은 자리 수이지 낱말이 아니다. 시간 · 바이트는
 * 지어내지 않는다.
 *
 * ── 이벤트 (발신 순서: 판마다 board → step × N → finish)
 *
 * - `phase` (silent) `{ phase: string }` — 코드 패널 줄 맞춤
 * - `board`  `{ cache: 0 | 1; steps: number; prompt: number; plan: number[]; cacheFinal: number;
 *             maxSteps: number; maxCells: number; tokens: string[] }`
 *   새 판. `plan[t-1]` 은 걸음 t 에 새로 셈할 K·V 자리 수, `cacheFinal` 은 끝의 캐시 자리.
 *   `maxSteps` · `maxCells` 는 사다리의 가장 큰 판의 걸음 수 · 자리 수(P + 가장 큰 N − 1) —
 *   stage 가 칸 높이를 이 값으로 정한다. `tokens` 는 자리 순서의 낱말(프롬프트 + 이어짐).
 * - `step`   `{ t: number; cache: 0 | 1; computed: number; cachedBefore: number; read: number; length: number }`
 *   걸음 t. `computed` 는 이번에 셈한 K·V 자리, `cachedBefore` 는 이번 걸음 앞의 캐시
 *   자리(끔이면 0), `read` 는 캐시에서 읽은 자리, `length` 는 이번 걸음이 보는 열의 길이 L.
 * - `finish` `{ cache: 0 | 1; steps: number; kv: number; cacheSize: number; kvWithout: number; savedPct: number }`
 *   판의 끝. `kvWithout` 은 같은 길이에서 캐시가 없을 때의 K·V 자리, `savedPct` 는 아낀 몫.
 *
 * ── phase 어휘 (irs.ts 와 같은 집합)
 *
 * `setup` · `recompute` · `prefill` · `append-one` · `done`
 * 모두 뒤에 걸음 경계(`sleep`)가 있어 코드 패널에서 한 번씩 켜진다.
 *
 * ── 계기 (C5)
 *
 * - `kv-compute-count` — 지금까지 셈한 K·V 자리
 * - `score-count`      — 지금까지 셈한 주의 점수(질의 · 키 곱)
 * - `cache-size`       — 지금 캐시가 들고 있는 자리 (끔이면 0)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KvCacheData = {
  type: 'kv-cache';
  /** 프롬프트 (자료). 낱말 = 공백으로 가른 덩이 */
  prompt: string;
  /** 예로 정한 이어짐. 걸음 t 가 낸 토큰이 t 번째 낱말이다 */
  continuation: string;
  /** 손잡이 `cache` 의 사다리 — 0 끔 · 1 켬 */
  cacheLadder: number[];
  /** 손잡이 `steps` 의 사다리 — 만들 토큰 수 */
  stepsLadder: number[];
  /** 처음 판의 캐시 값 */
  cache: number;
  /** 처음 판의 만들 토큰 수 */
  steps: number;
  /** 걸음 하나 뒤에 머무는 ms */
  stepMs: number;
};

/** 공백으로 가른 낱말들. 빈 덩이는 버린다. */
export function splitWords(text: string): string[] {
  return text.split(' ').filter((w) => w.length > 0);
}

export type KvCacheCount = {
  /** 걸음 t 에 새로 셈한 K·V 자리 (색인 t − 1) */
  perStep: number[];
  /** 걸음 t 의 주의 점수 셈 (색인 t − 1) */
  perStepScores: number[];
  kv: number;
  scores: number;
  cacheSize: number;
};

/** 한 판의 셈. 알고리즘 · 검사가 같은 함수를 부른다. */
export function countKvCache(prompt: number, steps: number, cache: number): KvCacheCount {
  const perStep: number[] = [];
  const perStepScores: number[] = [];
  let kv = 0;
  let scores = 0;
  for (let t = 1; t <= steps; t++) {
    const seen = prompt + t - 1;
    let c: number;
    let s: number;
    if (cache === 1) {
      if (t === 1) {
        c = prompt;
        s = (prompt * (prompt + 1)) / 2;
      } else {
        c = 1;
        s = seen;
      }
    } else {
      c = seen;
      s = (seen * (seen + 1)) / 2;
    }
    perStep.push(c);
    perStepScores.push(s);
    kv += c;
    scores += s;
  }
  return { perStep, perStepScores, kv, scores, cacheSize: cache === 1 ? prompt + steps - 1 : 0 };
}

/** 아낀 몫 % — 반올림 정수. 끔이 0 이면 0. */
export function savedPercent(without: number, withCache: number): number {
  if (without <= 0) return 0;
  return Math.floor(((without - withCache) * 100 + Math.floor(without / 2)) / without);
}

function pickNumber(v: unknown, ladder: number[], fallback: number): number {
  return typeof v === 'number' && ladder.includes(v) ? v : fallback;
}

export async function kvCacheAlgorithm(rawCtx: FacetContext<KvCacheData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<KvCacheData>;
  const data = ctx.data;
  const cacheLadder = Array.isArray(data.cacheLadder) ? data.cacheLadder : [0, 1];
  const stepsLadder = Array.isArray(data.stepsLadder) ? data.stepsLadder : [2, 4, 8, 16];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 600;
  const promptWords = splitWords(typeof data.prompt === 'string' ? data.prompt : '');
  const prompt = promptWords.length;
  const tokens = [
    ...promptWords,
    ...splitWords(typeof data.continuation === 'string' ? data.continuation : ''),
  ];
  /** 사다리의 가장 큰 판 — stage 가 처음부터 이만큼의 자리를 잡는다 */
  const maxSteps = stepsLadder.reduce((m, x) => (typeof x === 'number' && x > m ? x : m), 0);
  const maxCells = prompt + maxSteps - 1;

  let cache = pickNumber(data.cache, cacheLadder, cacheLadder[0] ?? 0);
  let steps = pickNumber(data.steps, stepsLadder, stepsLadder[0] ?? 2);

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 계기는 더하기만 한다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판을 끝까지 재생한다. 끝까지 갔으면 true, 취소됐으면 false. */
  async function playBoard(): Promise<boolean> {
    const count = countKvCache(prompt, steps, cache);
    gauge('kv-compute-count', 0);
    gauge('score-count', 0);
    gauge('cache-size', 0);

    await phase('setup');
    await ctx.emit({
      type: 'board',
      payload: {
        cache,
        steps,
        prompt,
        plan: [...count.perStep],
        cacheFinal: count.cacheSize,
        maxSteps,
        maxCells,
        tokens,
      },
    });
    if (!(await ctx.sleep(stepMs))) return false;

    let kv = 0;
    let scores = 0;
    let cached = 0;
    for (let t = 1; t <= steps; t++) {
      if (ctx.cancelled) return false;
      const computed = count.perStep[t - 1];
      const length = prompt + t - 1;
      if (cache === 1) {
        if (t === 1) await phase('prefill');
        else await phase('append-one');
      } else {
        await phase('recompute');
      }
      await ctx.emit({
        type: 'step',
        payload: {
          t,
          cache,
          computed,
          cachedBefore: cached,
          read: cache === 1 ? cached : 0,
          length,
        },
      });
      kv += computed;
      scores += count.perStepScores[t - 1];
      if (cache === 1) cached += computed;
      gauge('kv-compute-count', kv);
      gauge('score-count', scores);
      gauge('cache-size', cached);
      if (!(await ctx.sleep(stepMs))) return false;
    }

    const without = countKvCache(prompt, steps, 0).kv;
    await phase('done');
    await ctx.emit({
      type: 'finish',
      payload: {
        cache,
        steps,
        kv,
        cacheSize: cached,
        kvWithout: without,
        savedPct: savedPercent(without, kv),
      },
    });
    return ctx.sleep(stepMs);
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard())) return;

      // 손잡이를 기다린다. 우리 것이 아니거나 사다리 밖의 값은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p: unknown = input.payload;
        const value =
          p !== null && typeof p === 'object' ? (p as Record<string, unknown>).value : undefined;
        if (input.type === 'cache') {
          if (typeof value !== 'number' || !cacheLadder.includes(value)) continue;
          cache = value;
          break;
        }
        if (input.type === 'steps') {
          if (typeof value !== 'number' || !stepsLadder.includes(value)) continue;
          steps = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
