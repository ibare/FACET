/**
 * RSA (비대칭 암호) facet 알고리즘 — ReactiveMechanism.
 *
 * 시그니처 행동: 두 소수에서 태어난 한 짝의 키 중 한쪽으로만 잠기고 다른
 * 쪽으로만 풀리며, 잠근 쪽으로는 결코 되돌릴 수 없다.
 *
 * 진행 모델: 시간 진행형 — mount 직후 (A) 키 생성 → (B) 암호화 → (C) 복호화
 * 가 한 호흡 자동 재생된 뒤 waitForInput 으로 다음 사용자 액션을 대기한다.
 * 거꾸로 시도 토글이 ON 이면 (C) 직전에 짧은 거부 시연이 한 박자 끼어든다.
 *
 * 입력 (모두 facet 로컬):
 *   - replay              payload?: unknown
 *                         시퀀스를 처음부터 다시 재생.
 *   - next-p              p 후보 다음 소수로 순환 후 키 재출생.
 *   - next-q              q 후보 다음 소수로 순환 후 키 재출생.
 *   - input               payload: { name: 'm', value: '<int>' }
 *                         평문 m 변경. 1 ≤ m < min(p, q) 로 클램프.
 *   - toggle-reverse      거꾸로 시도 ON/OFF 토글.
 *
 * 식별자 (C1):
 *   - `prime:p` `prime:q`             — 키 생성 시퀀스 영역의 소수 카드.
 *   - `product:n`                     — 합성수 n 카드 (키 생성 + 외부 관찰자 영역).
 *   - `lock:public-yard`              — Bob 공개 마당의 자물쇠.
 *   - `lock:alice`                    — Alice 책상의 자물쇠 사본.
 *   - `lock:envelope`                 — 봉투 위에 얹힌 자물쇠.
 *   - `key:private`                   — Bob 비밀 방의 비밀 열쇠.
 *   - `envelope:c`                    — 채널을 건너는 잠긴 봉투.
 *   - `plaintext:m`                   — Alice 의 평문 / Bob 에서 복원된 평문.
 *   - `factor:arrow`                  — 외부 관찰자 영역의 막힌 인수분해 화살표.
 *
 * 이벤트 어휘 (모두 facet 로컬):
 *   - init                payload: { p, q, n, e, d, m, c, primes, reverseAttempt }
 *                         mount 즉시 + reset 시 1회. 키 짝이 이미 출생을 마친
 *                         정적 상태를 통보 (기획 §9 초기 상태).
 *   - prime-seat          target: prime:p | prime:q
 *                         payload: { id, value }
 *                         소수 카드가 좌측 자리에 슬라이드인.
 *   - product-form        target: product:n
 *                         payload: { p, q, n }
 *                         가벼운 곱셈 화살표 + n 카드 안착.
 *   - keypair-birth       payload: { n, e, d }
 *                         n 위에 자물쇠와 열쇠 한 짝이 동시에 떠오름.
 *   - keypair-distribute  payload?: unknown
 *                         자물쇠 사본이 채널 건너 Alice / 공개 마당으로,
 *                         비밀 열쇠가 비밀 방으로 미끄러져 들어감.
 *   - factoring-block     target: factor:arrow
 *                         payload?: unknown
 *                         외부 관찰자 영역의 n→(p,q) 점선 화살표가 짧게
 *                         그어졌다 빨간 격벽에 부딪혀 멈추는 운동.
 *   - envelope-fill       payload: { m }
 *                         Alice 의 평문 m 카드가 봉투 안으로 들어감.
 *   - lock-engage         target: lock:envelope
 *                         payload?: unknown
 *                         자물쇠가 봉투 위에 얹혀 빗장이 닫히는 잠금.
 *   - channel-cross       target: envelope:c
 *                         payload: { c }
 *                         잠긴 봉투가 채널을 좌→우 로 건너감.
 *   - reverse-attempt     payload?: unknown
 *                         같은 공개 자물쇠로 풀려는 시도 → 빨간 흔들림.
 *   - unlock              target: lock:envelope
 *                         payload?: unknown
 *                         비밀 열쇠가 자물쇠 옆구리에 미끄러져 들어가 회전.
 *   - decrypted           target: plaintext:m
 *                         payload: { m }
 *                         봉투에서 평문 m 이 다시 꺼내져 Bob 출력 자리에 안착.
 *   - done                시퀀스 한 호흡 종료.
 *
 *   상태 변경 (입력 직후):
 *   - prime-set           payload: { which: 'p' | 'q', value, p, q, n, e, d, m, c }
 *   - plaintext-set       payload: { m, c }
 *   - reverse-toggled     payload: { on: boolean }
 *   - invalid-input       payload: { op, raw }
 *
 *   메타 (silent):
 *   - phase               payload: { phase: 'sequence' | 'idle' }
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type RsaPrimeId = 'p' | 'q';

export type RsaParams = {
  p: number;
  q: number;
  n: number;
  /** 학습용 작은 e (보통 3). gcd(e, φ(n)) = 1 인 가장 작은 홀수. */
  e: number;
  /** d ≡ e^{-1} (mod φ(n)). */
  d: number;
  /** φ(n) = (p-1)(q-1). 검산용. */
  phi: number;
};

export type RsaFacetData = {
  type: 'asymmetric-rsa';
  /** p, q 가 선택될 작은 소수 후보. */
  primes: number[];
  /** 초기 p 인덱스. */
  initialPIndex: number;
  /** 초기 q 인덱스. */
  initialQIndex: number;
  /** 초기 평문 m. 1 ≤ m < min(p, q) 로 클램프됨. */
  initialPlaintext: number;
  /** 초기 거꾸로 시도 토글 상태. */
  initialReverseAttempt: boolean;
  /** 시퀀스 박자 (ms) — 기획 §9. */
  timings: {
    keyGenStepMs: number;     // 600
    lockMs: number;           // 500
    channelMs: number;        // 700
    unlockMs: number;         // 500
    reverseMs: number;        // 400
    interStageMs: number;     // 220
    factoringBlockMs: number; // 480
    endHoldMs: number;        // 1100
  };
};

export type RsaInputEvent =
  | { type: 'replay'; payload?: unknown }
  | { type: 'next-p'; payload?: unknown }
  | { type: 'next-q'; payload?: unknown }
  | { type: 'input'; payload?: { name?: string; value?: string } }
  | { type: 'toggle-reverse'; payload?: unknown };

// ── 산수 헬퍼 ─────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/** 확장 유클리드: a·x + m·y = gcd. x 가 a 의 모듈러 역. */
function modInverse(a: number, m: number): number {
  let [oldR, r] = [a, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  // gcd = oldR; oldR 이 1 이어야 역이 존재.
  const inv = ((oldS % m) + m) % m;
  return inv;
}

/** 작은 정수 모듈러 거듭제곱 (학습용 — 안전한 범위 내). */
function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    e = Math.floor(e / 2);
    b = (b * b) % mod;
  }
  return result;
}

/**
 * (p, q) 에서 RSA 파라미터를 유도한다. e 는 3 부터 시작해 gcd(e, φ)=1 인
 * 가장 작은 홀수를 고른다 (학습용 — 5, 7, 11 등 fallback).
 */
function deriveParams(p: number, q: number): RsaParams {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const candidates = [3, 5, 7, 11, 13, 17];
  let e = 3;
  for (const c of candidates) {
    if (c < phi && gcd(c, phi) === 1) {
      e = c;
      break;
    }
  }
  const d = modInverse(e, phi);
  return { p, q, n, e, d, phi };
}

/** m 을 1 ≤ m < min(p, q) 범위로 클램프. */
function clampPlaintext(raw: unknown, p: number, q: number, fallback: number): number {
  const upper = Math.max(2, Math.min(p, q)) - 1;
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) {
    return Math.max(1, Math.min(upper, fallback));
  }
  return Math.max(1, Math.min(upper, Math.round(n)));
}

function nextIndex(arr: number[], current: number, exclude: number): number {
  const len = arr.length;
  let idx = (current + 1) % len;
  let safety = len;
  while (arr[idx] === exclude && safety > 0) {
    idx = (idx + 1) % len;
    safety -= 1;
  }
  return idx;
}

// ── 알고리즘 본체 ─────────────────────────────────────────────────────────

export async function asymmetricRsa(
  ctxBase: FacetContext<RsaFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<RsaFacetData>;
  const {
    primes,
    initialPIndex,
    initialQIndex,
    initialPlaintext,
    initialReverseAttempt,
    timings,
  } = ctx.data;

  let pIndex = Math.max(0, Math.min(primes.length - 1, initialPIndex));
  let qIndex = Math.max(0, Math.min(primes.length - 1, initialQIndex));
  if (primes[pIndex] === primes[qIndex]) {
    qIndex = nextIndex(primes, qIndex, primes[pIndex]!);
  }
  let params = deriveParams(primes[pIndex]!, primes[qIndex]!);
  let m = clampPlaintext(initialPlaintext, params.p, params.q, 2);
  let c = modPow(m, params.e, params.n);
  let reverseAttempt = initialReverseAttempt;

  // 0. 초기 통보 — 키 짝이 이미 출생을 마친 정적 상태.
  await ctx.emit({
    type: 'init',
    payload: {
      p: params.p,
      q: params.q,
      n: params.n,
      e: params.e,
      d: params.d,
      m,
      c,
      primes,
      reverseAttempt,
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 1. 시퀀스 한 호흡 — (A) 키 생성 → (B) 암호화 → [거꾸로 시도] → (C) 복호화.
  async function runSequence(): Promise<void> {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });

    // (A1) 두 소수 카드 자리에 앉음.
    await ctx.emit({
      type: 'prime-seat',
      target: 'prime:p',
      payload: { id: 'p', value: params.p },
    });
    let ok = await ctx.sleep(timings.keyGenStepMs);
    if (!ok || ctx.cancelled) return;
    await ctx.emit({
      type: 'prime-seat',
      target: 'prime:q',
      payload: { id: 'q', value: params.q },
    });
    ok = await ctx.sleep(timings.keyGenStepMs);
    if (!ok || ctx.cancelled) return;

    // (A2) p·q → n 가벼운 곱셈 화살표.
    await ctx.emit({
      type: 'product-form',
      target: 'product:n',
      payload: { p: params.p, q: params.q, n: params.n },
    });
    ok = await ctx.sleep(timings.keyGenStepMs);
    if (!ok || ctx.cancelled) return;

    // (A3) 자물쇠/열쇠 출생 + 분배.
    await ctx.emit({
      type: 'keypair-birth',
      payload: { n: params.n, e: params.e, d: params.d },
    });
    ok = await ctx.sleep(timings.keyGenStepMs);
    if (!ok || ctx.cancelled) return;
    await ctx.emit({ type: 'keypair-distribute' });
    ok = await ctx.sleep(timings.keyGenStepMs);
    if (!ok || ctx.cancelled) return;

    // (A4) 외부 관찰자 영역 — 인수분해 막힘 운동 한 번.
    await ctx.emit({ type: 'factoring-block', target: 'factor:arrow' });
    ok = await ctx.sleep(timings.factoringBlockMs);
    if (!ok || ctx.cancelled) return;

    ok = await ctx.sleep(timings.interStageMs);
    if (!ok || ctx.cancelled) return;

    // (B1) Alice 평문 m 카드가 봉투 안으로.
    await ctx.emit({ type: 'envelope-fill', payload: { m } });
    ok = await ctx.sleep(timings.lockMs);
    if (!ok || ctx.cancelled) return;

    // (B2) 자물쇠로 봉투를 잠금.
    await ctx.emit({ type: 'lock-engage', target: 'lock:envelope' });
    ok = await ctx.sleep(timings.lockMs);
    if (!ok || ctx.cancelled) return;

    // (B3) 잠긴 봉투 c 가 채널을 건너감.
    await ctx.emit({
      type: 'channel-cross',
      target: 'envelope:c',
      payload: { c },
    });
    ok = await ctx.sleep(timings.channelMs);
    if (!ok || ctx.cancelled) return;

    // (선택) 거꾸로 시도 시연.
    if (reverseAttempt) {
      await ctx.emit({ type: 'reverse-attempt' });
      ok = await ctx.sleep(timings.reverseMs);
      if (!ok || ctx.cancelled) return;
      // 막힘 운동 한 번 더.
      await ctx.emit({ type: 'factoring-block', target: 'factor:arrow' });
      ok = await ctx.sleep(timings.factoringBlockMs);
      if (!ok || ctx.cancelled) return;
    }

    // (C1) 비밀 열쇠가 자물쇠 옆구리에 미끄러져 들어가 회전.
    await ctx.emit({ type: 'unlock', target: 'lock:envelope' });
    ok = await ctx.sleep(timings.unlockMs);
    if (!ok || ctx.cancelled) return;

    // (C2) 평문 m 이 Bob 출력 자리에 안착.
    await ctx.emit({
      type: 'decrypted',
      target: 'plaintext:m',
      payload: { m },
    });
    ok = await ctx.sleep(timings.endHoldMs);
    if (!ok || ctx.cancelled) return;

    await ctx.emit({ type: 'done' });
    await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  }

  // mount 직후 한 호흡 자동 재생.
  await runSequence();

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: RsaInputEvent;
    try {
      ev = await ctx.waitForInput<RsaInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'replay') {
      await runSequence();
      continue;
    }

    if (ev.type === 'next-p') {
      const newIdx = nextIndex(primes, pIndex, primes[qIndex]!);
      pIndex = newIdx;
      params = deriveParams(primes[pIndex]!, primes[qIndex]!);
      m = clampPlaintext(m, params.p, params.q, 2);
      c = modPow(m, params.e, params.n);
      await ctx.emit({
        type: 'prime-set',
        payload: {
          which: 'p',
          value: params.p,
          p: params.p,
          q: params.q,
          n: params.n,
          e: params.e,
          d: params.d,
          m,
          c,
        },
      });
      await runSequence();
      continue;
    }

    if (ev.type === 'next-q') {
      const newIdx = nextIndex(primes, qIndex, primes[pIndex]!);
      qIndex = newIdx;
      params = deriveParams(primes[pIndex]!, primes[qIndex]!);
      m = clampPlaintext(m, params.p, params.q, 2);
      c = modPow(m, params.e, params.n);
      await ctx.emit({
        type: 'prime-set',
        payload: {
          which: 'q',
          value: params.q,
          p: params.p,
          q: params.q,
          n: params.n,
          e: params.e,
          d: params.d,
          m,
          c,
        },
      });
      await runSequence();
      continue;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      if (name !== 'm') {
        await ctx.emit({
          type: 'invalid-input',
          payload: { op: 'input', raw: `unknown name ${String(name)}` },
        });
        continue;
      }
      const next = clampPlaintext(ev.payload?.value, params.p, params.q, m);
      if (next === m) continue;
      m = next;
      c = modPow(m, params.e, params.n);
      await ctx.emit({ type: 'plaintext-set', payload: { m, c } });
      await runSequence();
      continue;
    }

    if (ev.type === 'toggle-reverse') {
      reverseAttempt = !reverseAttempt;
      await ctx.emit({ type: 'reverse-toggled', payload: { on: reverseAttempt } });
      continue;
    }
  }
}
