/**
 * adam — 축마다 제 크기로 나눈 보폭.
 *
 * 손실 L = 5a² + (5/r)·b², 기울기 g = (10a, (10/r)·b). 처음 (1, 1) 에서 갱신 20 번.
 * 경사 하강 `w ← w − η·g` (η 0.1) 과 Adam
 * `m ← β1·m + (1 − β1)·g ; v ← β2·v + (1 − β2)·g² ; m̂ = m/(1 − β1^t) ; v̂ = v/(1 − β2^t) ; w ← w − η·m̂/(√v̂ + ε)`
 * (η 0.05, β^t 는 반복 곱) 을 두 손잡이(갱신 규칙 · 축 비 r)로 돌린다.
 * 화면의 주인공은 **축마다 간 몫** = 1 − |x| / |x₀| 이다.
 *
 * 셈의 길은 하나다 — `adamPath` · `gdPath` 가 IR 의 `adamRun` · `gdRun` 과 같은 차례 · 같은 연산으로
 * path = [a0, b0, a1, b1, …] 를 채운다 (facet 테스트가 여덟 조합 모두에서 같음을 잠근다).
 *
 * ── 이벤트 (reactive · 판 하나 = 걸음 21) ─────────────────────────────────
 *   phase   silent  { phase: 'adam-step' | 'gd-step' }            갱신 걸음의 발신 바로 앞
 *   round           { rule: 'gd' | 'adam', ratio: number, eta: number, coefA: number,
 *                     coefB: number, coefBText: string, steps: number, a: number, b: number,
 *                     aShare: 0, bShare: 0, aFrac: 0, bFrac: 0 }
 *                   걸음 0 — 처음 (a0, b0). 앞 판의 결론을 걷고 막대를 비운다
 *   update          { t: number, steps: number, a: number, b: number,
 *                     aShare: number, bShare: number, aFrac: number, bFrac: number, last: boolean }
 *                   갱신 t 뒤의 (a, b). aFrac · bFrac 는 간 몫(0‥1, 전 정밀도),
 *                   aShare · bShare 는 그 몫의 `toFixed(0)` 백분율을 정수로 옮긴 값
 *
 * ── phase 어휘 (irs.ts 와 같다) ───────────────────────────────────────────
 *   adam-step · gd-step. 걸음 0 에는 phase 가 없다 (projector 가 코드 줄 강조를 끈다)
 *
 * ── 계기 ─────────────────────────────────────────────────────────────────
 *   steep-share   a 간 몫 (정수 %) — 지금 값과의 차이만 보낸다. 판 머리에 0 으로
 *   gentle-share  b 간 몫 (정수 %) — 같은 방식
 *
 * ── 동률 · 경계 ──────────────────────────────────────────────────────────
 *   비교가 없다. 간 몫 표시는 `toFixed(0)` — 이 데이터의 모든 걸음에서 …5 경계가 없음을 sim 이 단언했다.
 *   무작위는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AdamRuleId = 'gd' | 'adam';

export type AdamData = {
  type: 'adam';
  stepMs: number;
  ruleIds: AdamRuleId[];
  rule: number;
  ratioLadder: number[];
  ratio: number;
  steps: number;
  a0: number;
  b0: number;
  etaGd: number;
  etaAdam: number;
  beta1: number;
  beta2: number;
  eps: number;
};

/** 손실 L = 5a² + (5/r)·b² 의 두 기울기 계수 — g = (coefA·a, coefB·b). IR 과 같은 식 (10.0, 10.0 / r). */
export function axisCoefs(r: number): { coefA: number; coefB: number } {
  if (!(r > 0)) throw new Error(`adam: 축 비 r 은 양수여야 한다 (${r})`);
  return { coefA: 10.0, coefB: 10.0 / r };
}

/** 처음 자리를 담은 path 버퍼 — 길이 2·(steps + 1). IR 에 건네는 버퍼와 같은 모양. */
export function makePath(steps: number, a0: number, b0: number): number[] {
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`adam: 갱신 수가 잘못되었다 (${steps})`);
  const path = new Array<number>(2 * (steps + 1)).fill(0);
  path[0] = a0;
  path[1] = b0;
  return path;
}

/** 경사 하강 — IR `gdRun(path, r, eta)` 와 같은 길. path 를 채워 돌려준다. */
export function gdPath(path: number[], r: number, eta: number): number[] {
  let a = at(path, 0);
  let b = at(path, 1);
  const { coefA: ca, coefB: cb } = axisCoefs(r);
  const n = Math.floor(path.length / 2);
  for (let t = 1; t < n; t++) {
    a = a - eta * ca * a;
    b = b - eta * cb * b;
    path[2 * t] = a;
    path[2 * t + 1] = b;
  }
  return path;
}

/** Adam — IR `adamRun(path, r, eta, beta1, beta2, eps)` 와 같은 길. */
export function adamPath(
  path: number[],
  r: number,
  eta: number,
  beta1: number,
  beta2: number,
  eps: number,
): number[] {
  let a = at(path, 0);
  let b = at(path, 1);
  const { coefA: ca, coefB: cb } = axisCoefs(r);
  let ma = 0;
  let mb = 0;
  let va = 0;
  let vb = 0;
  let p1 = 1;
  let p2 = 1;
  const n = Math.floor(path.length / 2);
  for (let t = 1; t < n; t++) {
    const ga = ca * a;
    const gb = cb * b;
    ma = beta1 * ma + (1 - beta1) * ga;
    mb = beta1 * mb + (1 - beta1) * gb;
    va = beta2 * va + (1 - beta2) * ga * ga;
    vb = beta2 * vb + (1 - beta2) * gb * gb;
    p1 = p1 * beta1;
    p2 = p2 * beta2;
    a = a - (eta * (ma / (1 - p1))) / (Math.sqrt(va / (1 - p2)) + eps);
    b = b - (eta * (mb / (1 - p1))) / (Math.sqrt(vb / (1 - p2)) + eps);
    path[2 * t] = a;
    path[2 * t + 1] = b;
  }
  return path;
}

/** 한 규칙 × 한 r 의 길 전체 — algorithm 과 테스트가 함께 쓴다. */
export function runPath(data: AdamData, rule: AdamRuleId, r: number): number[] {
  const path = makePath(data.steps, data.a0, data.b0);
  if (rule === 'gd') return gdPath(path, r, data.etaGd);
  if (rule === 'adam') return adamPath(path, r, data.etaAdam, data.beta1, data.beta2, data.eps);
  throw new Error(`adam: 모르는 갱신 규칙 (${String(rule)})`);
}

/** 간 몫 = 1 − |x| / |x₀| (전 정밀도). */
export function shareGone(x: number, x0: number): number {
  if (x0 === 0) throw new Error('adam: 처음 자리가 바닥이면 간 몫을 셀 수 없다');
  return 1 - Math.abs(x) / Math.abs(x0);
}

/** 간 몫의 백분율 — 표시 문자열 `toFixed(0)` 과 같은 정수. */
export function sharePercent(frac: number): number {
  return Number((frac * 100).toFixed(0));
}

/** 기울기 계수의 표시 글자 — 10 · 1 · 0.1 · 0.01 (끝의 0 을 걷는다). */
export function coefText(c: number): string {
  return String(Number(c.toFixed(4)));
}

function at(path: number[], i: number): number {
  const v = path[i];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`adam: path[${i}] 가 수가 아니다`);
  return v;
}

function ruleOf(data: AdamData, index: number): AdamRuleId {
  const id = data.ruleIds[index];
  if (id !== 'gd' && id !== 'adam') throw new Error(`adam: 갱신 규칙 색인이 목록 밖이다 (${index})`);
  return id;
}

export async function adamAlgorithm(baseCtx: FacetContext<AdamData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<AdamData>;
  const data = ctx.data;
  if (!data.ratioLadder.includes(data.ratio)) throw new Error(`adam: 기본 r 이 사다리 밖이다 (${data.ratio})`);
  let ruleIndex = data.rule;
  let ratio = data.ratio;
  ruleOf(data, ruleIndex);

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다
  let steepNow = 0;
  let gentleNow = 0;
  let metricsSent = false;
  const setShares = (steep: number, gentle: number) => {
    const force = !metricsSent;
    if (force || steep !== steepNow) ctx.metric('steep-share', steep - steepNow);
    if (force || gentle !== gentleNow) ctx.metric('gentle-share', gentle - gentleNow);
    steepNow = steep;
    gentleNow = gentle;
    metricsSent = true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const rule = ruleOf(data, ruleIndex);
      const path = runPath(data, rule, ratio);
      const { coefA, coefB } = axisCoefs(ratio);
      const a0 = at(path, 0);
      const b0 = at(path, 1);

      // 걸음 0 — 처음 모습
      setShares(0, 0);
      await ctx.emit({
        type: 'round',
        payload: {
          rule,
          ratio,
          eta: rule === 'adam' ? data.etaAdam : data.etaGd,
          coefA,
          coefB,
          coefBText: coefText(coefB),
          steps: data.steps,
          a: a0,
          b: b0,
          aShare: 0,
          bShare: 0,
          aFrac: 0,
          bFrac: 0,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      for (let t = 1; t <= data.steps; t++) {
        if (ctx.cancelled) return;
        if (rule === 'adam') await phase('adam-step');
        else await phase('gd-step');
        const a = at(path, 2 * t);
        const b = at(path, 2 * t + 1);
        const aFrac = shareGone(a, a0);
        const bFrac = shareGone(b, b0);
        const aShare = sharePercent(aFrac);
        const bShare = sharePercent(bFrac);
        setShares(aShare, bShare);
        await ctx.emit({
          type: 'update',
          payload: { t, steps: data.steps, a, b, aShare, bShare, aFrac, bFrac, last: t === data.steps },
        });
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null && 'value' in payload
            ? (payload as { value: unknown }).value
            : undefined;
        if (input.type === 'rule') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.ruleIds.length) {
            throw new Error(`adam: 갱신 규칙 값이 잘못되었다 (${String(value)})`);
          }
          ruleIndex = value;
          break;
        }
        if (input.type === 'ratio') {
          if (typeof value !== 'number' || !data.ratioLadder.includes(value)) {
            throw new Error(`adam: 축 비 값이 사다리 밖이다 (${String(value)})`);
          }
          ratio = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
