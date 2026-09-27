/**
 * number-theory 알고리즘 — m 칸 시계에서 0 부터 a 칸씩 뛰어 0 에 돌아올 때까지 밟은 칸을 센다.
 *
 * 두 수를 **따로** 셈한다. 뜀 수(= 밟은 칸 수)는 0 에 돌아올 때까지 실제로 뛰어 세고, gcd(a, m) 은
 * 빼기꼴(두 수가 같아지면 멈춘다)로 셈한다. 끝 걸음에 m ÷ gcd 가 뜀 수와 같음을 함께 싣는다 —
 * 지름길(m ÷ gcd 로 뜀을 줄이기 · `%` 로 gcd)을 쓰지 않는다. IR(`orbitLength` · `gcdSub`)과 같은 길이다.
 *
 * 자리 = 0..m−1, 출발은 늘 0, 한 뜀: 자리 ← (자리 + a) mod m. 두 변은 늘 음이 아니다.
 * 한 판 = 판 머리(silent) → 처음 → 뜀 (m ÷ gcd 번, 마지막은 돌아오는 뜀) → 끝 = m ÷ gcd + 2 걸음.
 * 판이 끝나면 손잡이 `modulus` · `stride` 를 기다렸다가 받은 값으로 다시 뛴다.
 *
 * 이벤트:
 *   round  { m, a, motionMs }                            silent — 판 머리. 앞 판의 줄이 0 쪽으로 접히고 칸이 새 m 의
 *                                                        자리로 옮겨 간다. 뒤에 sleep(stepMs + motionMs)
 *   start  { m, a, pos, count }                          걸음 0 — 말이 0, 밟은 칸 1 (pos = 0, count = 1)
 *   jump   { m, a, from, to, count }                     말이 from 에서 앞으로 a 칸 뛰어 새 칸 to 에 선다. count = 밟은 칸 수
 *   back   { m, a, from, to, count }                     돌아오는 뜀 — to = 0, 새 칸 없음, 별이 닫힌다. count = 뜀 수 = 밟은 칸 수
 *   gcd    { m, a, g, len, jumps, visited }              끝 — g = 빼기꼴 gcd(a, m), len = m ÷ g, jumps = 실제로 뛴 수,
 *                                                        visited = 밟은 칸 (작은 수부터)
 *   phase  { phase }                                     silent — 코드 패널 줄. 그 걸음의 발신 **앞에** 보낸다
 *
 * phase 어휘 (irs.ts 와 정확히 같다): start · jump · back · gcd
 *   jump 는 마지막 앞의 뜀, back 은 0 에 돌아오는 뜀. 한 뜀에 제자리인 판(a = m)에는 jump 가 없다.
 *
 * 계기 (지금 값을 들고 차이만 보낸다 · 처음 한 번은 차이 0 이어도 보낸다):
 *   visited-cells  지금까지 밟은 칸 수 — 걸음 0 에 1, 새 칸에 설 때마다 +1, 돌아오는 뜀은 그대로 (판 끝 m ÷ gcd)
 *   gcd            끝 걸음에 gcd(a, m), 그 전 0
 *
 * 동률 규칙 — 견주는 것은 정수의 같음뿐이다 (뜀 수 = m ÷ gcd). 실수를 쓰지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NumberTheoryData = {
  type: 'number-theory';
  stepMs: number;
  /** 법 m 사다리 — facet.ts 의 segments[].value 와 같다. */
  mLadder: number[];
  /** 걸음 a 사다리 — facet.ts 의 segments[].value 와 같다. */
  aLadder: number[];
  /** 첫 판의 m · a — segments 의 default 와 같다. */
  m: number;
  a: number;
};

/** 한 판의 셈 결과 — 검사가 IR 과 견준다. */
export type NumberTheoryRound = {
  m: number;
  a: number;
  /** 밟은 차례 (0 부터, 돌아온 0 은 넣지 않는다). */
  order: number[];
  jumps: number;
  g: number;
  len: number;
};

/** 운동 길이 — 판 머리의 접힘 · 칸 옮김과 뜀 한 번. projector 는 round payload 로 받는다. */
const MOTION_MS = 400;

function readLadder(data: NumberTheoryData, key: 'mLadder' | 'aLadder', min: number): number[] {
  const ladder = data[key];
  if (!Array.isArray(ladder) || ladder.length === 0) throw new Error(`number-theory: ${key} 가 비었다`);
  for (const v of ladder) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      throw new Error(`number-theory: ${key} 에 ${min} 이상 정수가 아닌 값이 있다 (${String(v)})`);
    }
  }
  return ladder;
}

function readStepMs(data: NumberTheoryData): number {
  const ms = data.stepMs;
  if (typeof ms !== 'number' || !(ms > 0)) throw new Error('number-theory: stepMs 가 양수가 아니다');
  return ms;
}

/** 빼기꼴 gcd — 조각 euclid-gcd 와 같은 셈. 두 수가 같아지면 멈춘다. 0 · 음수는 받지 않는다. */
export function gcdSubtract(x0: number, y0: number): number {
  if (!Number.isInteger(x0) || !Number.isInteger(y0) || x0 < 1 || y0 < 1) {
    throw new Error(`number-theory: gcd 는 1 이상 정수만 받는다 (${x0}, ${y0})`);
  }
  let x = x0;
  let y = y0;
  while (x !== y) {
    if (x > y) x = x - y;
    else y = y - x;
  }
  return x;
}

export async function numberTheoryAlgorithm(ctx: FacetContext<NumberTheoryData>): Promise<void> {
  const rc = ctx as ReactiveContext<NumberTheoryData>;
  const mLadder = readLadder(ctx.data, 'mLadder', 1);
  const aLadder = readLadder(ctx.data, 'aLadder', 1);
  const stepMs = readStepMs(ctx.data);
  if (!mLadder.includes(ctx.data.m)) throw new Error(`number-theory: m ${String(ctx.data.m)} 가 사다리 밖이다`);
  if (!aLadder.includes(ctx.data.a)) throw new Error(`number-theory: a ${String(ctx.data.a)} 가 사다리 밖이다`);
  let m = ctx.data.m;
  let a = ctx.data.a;

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 이름은 부르는 자리에서 리터럴.
  const shown = new Map<string, number>();
  const meter = (name: string, value: number): void => {
    const before = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - before);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rc.sleep(stepMs + MOTION_MS);

  /** 판 하나. 취소되면 null. */
  async function playRound(mod: number, stride: number): Promise<NumberTheoryRound | null> {
    await ctx.emit({ type: 'round', payload: { m: mod, a: stride, motionMs: MOTION_MS }, silent: true });
    // 판 머리의 운동(줄 접힘 · 칸 옮김)이 끝날 때까지 첫 걸음을 보내지 않는다
    if (!(await pause())) return null;

    // 걸음 0 — 말이 0, 밟은 칸 {0}
    let pos = 0;
    let count = 0;
    const seen = new Set<number>([0]);
    const order: number[] = [0];
    meter('visited-cells', seen.size);
    meter('gcd', 0);
    await phase('start');
    await ctx.emit({ type: 'start', payload: { m: mod, a: stride, pos, count: seen.size } });
    if (!(await pause())) return null;

    // 뜀 — 0 에 돌아올 때까지 실제로 뛴다
    while (count === 0 || pos !== 0) {
      if (ctx.cancelled) return null;
      const from = pos;
      pos = (pos + stride) % mod;
      count = count + 1;
      if (pos === 0) {
        await phase('back');
        await ctx.emit({ type: 'back', payload: { m: mod, a: stride, from, to: pos, count } });
      } else {
        if (seen.has(pos)) throw new Error(`number-theory: 0 에 돌아오기 전에 ${pos} 칸을 다시 밟았다`);
        seen.add(pos);
        order.push(pos);
        meter('visited-cells', seen.size);
        await phase('jump');
        await ctx.emit({ type: 'jump', payload: { m: mod, a: stride, from, to: pos, count: seen.size } });
      }
      if (!(await pause())) return null;
    }
    if (count !== seen.size) throw new Error(`number-theory: 뜀 수 ${count} 와 밟은 칸 ${seen.size} 가 다르다`);

    // 끝 — gcd 는 따로 빼기꼴로
    const g = gcdSubtract(stride, mod);
    if (mod % g !== 0) throw new Error(`number-theory: ${mod} 가 gcd ${g} 로 나누어떨어지지 않는다`);
    const len = mod / g;
    const visited = [...seen].sort((x, y) => x - y);
    meter('gcd', g);
    await phase('gcd');
    await ctx.emit({ type: 'gcd', payload: { m: mod, a: stride, g, len, jumps: count, visited } });
    return { m: mod, a: stride, order, jumps: count, g, len };
  }

  /** 손잡이 하나를 받는다 — 우리 것이 아닌 입력은 흘리고, 제 것인데 사다리 밖이면 던진다. */
  async function nextInput(): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await rc.waitForInput();
      if (ctx.cancelled) return false;
      if (input.type !== 'modulus' && input.type !== 'stride') continue;
      const payload = input.payload;
      const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
      const ladder = input.type === 'modulus' ? mLadder : aLadder;
      if (typeof value !== 'number' || !ladder.includes(value)) {
        throw new Error(`number-theory: 손잡이 ${input.type} 의 값 ${String(value)} 가 사다리 밖이다`);
      }
      if (input.type === 'modulus') m = value;
      else a = value;
      return true;
    }
  }

  try {
    while (!ctx.cancelled) {
      const round = await playRound(m, a);
      if (round === null) return;
      if (!(await nextInput())) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
