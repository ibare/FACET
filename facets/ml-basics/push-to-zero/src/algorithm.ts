/**
 * push-to-zero — L1 벌점이 작은 무게를 0 에 붙이는 갱신.
 *
 * 손실 = ½·Σ(wᵢ − aᵢ)² + λ·Σ|wᵢ|. 갱신 한 번은 두 마디다 (차례 고정):
 *   ① 데이터 걸음  hᵢ = wᵢ − η·(wᵢ − aᵢ)
 *   ② L1 끌기     |hᵢ| > η·λ 이면 wᵢ ← hᵢ − sign(hᵢ)·η·λ, 아니면 wᵢ ← 0 (부호 없는 0)
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (시작 무게 = a). 첫 발신 앞에
 * stepMs 를 한 번 두어 걸음 0 을 읽을 틈을 준다.
 *
 * 이벤트 (모두 silent 아님, 갱신 하나가 걸음 하나):
 *   update  payload {
 *     t: number            — 몇 번째 갱신인가 (1 부터)
 *     from: number[]       — 갱신 앞 무게
 *     half: number[]       — 데이터 걸음 뒤 hᵢ
 *     to: number[]         — L1 끌기 뒤 새 무게
 *     l1: number[]         — 무게마다 L1 끌기 몫 |hᵢ| − |새 wᵢ|
 *     livePull: number     — 0 이 아닌 채 남은 무게가 모두 끌린 폭 (= η·λ, 셈해서 확인한 값)
 *     newlyZero: number[]  — 이번 갱신에 처음 0 에 닿은 무게의 자리
 *     held: number[]       — 갱신 앞에 이미 0 이었고 그대로 0 에 붙어 있는 무게의 자리
 *     zeroCount: number    — 갱신 뒤 0 인 무게의 개수
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PushToZeroFacetData = {
  type: 'push-to-zero';
  /** 무게 식별자 (w1 ~ w6) */
  ids: string[];
  /** 벌점 없이 맞춘 무게 a — 데이터 손실의 바닥이자 시작 무게 */
  fitted: number[];
  /** 학습률 η */
  eta: number;
  /** 벌점 세기 λ */
  lambda: number;
  /** 갱신 횟수 */
  updates: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

function finiteNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`push-to-zero: ${path} 는 유한한 수여야 한다 (${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function readPushToZeroData(raw: unknown): PushToZeroFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('push-to-zero: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'push-to-zero') {
    throw new Error(`push-to-zero: initialData.type 이 'push-to-zero' 가 아니다 (${String(r.type)})`);
  }
  if (!Array.isArray(r.ids) || r.ids.length === 0) {
    throw new Error('push-to-zero: initialData.ids 는 비지 않은 배열이어야 한다');
  }
  const ids = r.ids.map((id, i) => {
    if (typeof id !== 'string' || id === '') {
      throw new Error(`push-to-zero: initialData.ids[${i}] 는 비지 않은 문자열이어야 한다`);
    }
    return id;
  });
  if (!Array.isArray(r.fitted) || r.fitted.length !== ids.length) {
    throw new Error('push-to-zero: initialData.fitted 는 ids 와 길이가 같은 배열이어야 한다');
  }
  const fitted = r.fitted.map((v, i) => finiteNumber(v, `initialData.fitted[${i}]`));
  const eta = finiteNumber(r.eta, 'initialData.eta');
  const lambda = finiteNumber(r.lambda, 'initialData.lambda');
  if (eta <= 0 || eta >= 1) throw new Error(`push-to-zero: initialData.eta 는 0 과 1 사이여야 한다 (${eta})`);
  if (lambda <= 0) throw new Error(`push-to-zero: initialData.lambda 는 양수여야 한다 (${lambda})`);
  const updates = finiteNumber(r.updates, 'initialData.updates');
  if (!Number.isInteger(updates) || updates < 1) {
    throw new Error(`push-to-zero: initialData.updates 는 1 이상의 정수여야 한다 (${updates})`);
  }
  const stepMs = finiteNumber(r.stepMs, 'initialData.stepMs');
  if (stepMs < 0) throw new Error(`push-to-zero: initialData.stepMs 는 음수일 수 없다 (${stepMs})`);
  return { type: 'push-to-zero', ids, fitted, eta, lambda, updates, stepMs };
}

/** 한 갱신에 L1 이 끄는 폭 η·λ — 바탕에서 정해진다. */
export function pullWidth(eta: number, lambda: number): number {
  return eta * lambda;
}

/** 0 인 무게의 개수. */
export function countZeros(w: readonly number[]): number {
  let n = 0;
  for (const x of w) if (x === 0) n += 1;
  return n;
}

/**
 * 가로축 범위 — 무게는 0 과 a 사이를 벗어나지 않으므로(|w| ≤ |a|, 부호 같음) 바탕 a 와
 * 0 에서 정해진다.
 */
export function axisSpan(fitted: readonly number[]): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (const v of fitted) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo <= 0) throw new Error('push-to-zero: 무게가 모두 0 이라 축을 세울 수 없다');
  return { lo, hi };
}

/** 갱신 한 번 — 데이터 걸음 뒤 L1 끌기 (soft-threshold). */
export function l1Update(
  w: readonly number[],
  a: readonly number[],
  eta: number,
  lambda: number,
): { half: number[]; next: number[]; l1: number[] } {
  if (w.length !== a.length) throw new Error('push-to-zero: 무게와 a 의 길이가 다르다');
  const pull = pullWidth(eta, lambda);
  const half = w.map((wi, i) => wi - eta * (wi - a[i]!));
  // 0 을 건너지 않는다. 닿으면 리터럴 0 (부호 없는 0) 을 둔다 — sign(h)·0 은 -0 이 된다
  const next = half.map((h) => (Math.abs(h) > pull ? Math.sign(h) * (Math.abs(h) - pull) : 0));
  const l1 = half.map((h, i) => Math.abs(h) - Math.abs(next[i]!));
  return { half, next, l1 };
}

export async function pushToZero(context: FacetContext<PushToZeroFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PushToZeroFacetData>;
  const data = readPushToZeroData(ctx.data);
  const { fitted, eta, lambda, updates, stepMs } = data;
  const pull = pullWidth(eta, lambda);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let w = fitted.slice();
  for (let t = 1; t <= updates; t += 1) {
    // 걸음 0 이 이미 무게 여섯을 보이므로 첫 갱신 앞에도 머문다
    if (!(await pause())) return;
    const { half, next, l1 } = l1Update(w, fitted, eta, lambda);
    const newlyZero: number[] = [];
    const held: number[] = [];
    for (let i = 0; i < next.length; i += 1) {
      if (w[i] === 0 && next[i] !== 0) {
        throw new Error(`push-to-zero: 갱신 ${t} 에서 w[${i}] 가 0 에서 떨어졌다`);
      }
      if (next[i] !== 0 && Math.abs(l1[i]! - pull) > 1e-12) {
        throw new Error(`push-to-zero: 갱신 ${t} 에서 살아 있는 w[${i}] 의 끌기가 η·λ 와 다르다`);
      }
      if (w[i] !== 0 && next[i] === 0) newlyZero.push(i);
      if (w[i] === 0) held.push(i);
    }
    await ctx.emit({
      type: 'update',
      payload: {
        t,
        from: w.slice(),
        half,
        to: next.slice(),
        l1,
        livePull: pull,
        newlyZero,
        held,
        zeroCount: countZeros(next),
      },
    });
    w = next;
  }
}
