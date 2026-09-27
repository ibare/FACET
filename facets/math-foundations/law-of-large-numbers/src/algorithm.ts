/**
 * 큰 수의 법칙 — 동전을 던질수록 앞면 비율이라는 수 하나가 흔들리다 1/2 둘레로 붙는다.
 *
 * 생성기(mulberry32)는 재생 처음에 씨앗으로 한 번 만든다. 던지기 하나 = u 하나,
 * u < 앞면 확률이면 앞면(1), 아니면 뒷면(0). 걸음 하나는 `checkpoints` 의 다음 던진 수까지 던진다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData(참값 · 던진 수 수열)에서 세운다 — 발신 없음.
 * 걸음 0 에 읽을 것(축 · 참값 · 구간 이름)이 있어 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트
 * - `toss` (silent 아님) — 한 구간을 던졌다
 *   payload: {
 *     index: number      // 걸음 번호 (1..checkpoints.length − 1)
 *     from: number       // 이 구간의 첫 던진 수 (앞 걸음의 던진 수 + 1)
 *     to: number         // 이 구간의 끝 던진 수
 *     faces: number[]    // from..to 의 던지기 (1 앞면 · 0 뒷면), 길이 to − from + 1
 *     ratios: number[]   // from..to 각 던진 수에서의 앞면 비율 (지금까지 앞면 수 / 던진 수)
 *     heads: number      // to 까지의 앞면 수
 *     ratio: number      // heads / to
 *     diff: number       // ratio − 참값 (부호 있음)
 *     width: number      // 흔들림의 폭 = 이 구간 안에서 |비율 − 참값| 의 가장 큰 값
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Fraction = { num: number; den: number };

export type LawOfLargeNumbersFacetData = {
  type: 'law-of-large-numbers';
  stepMs: number;
  /** mulberry32 씨앗 — 한 번의 뽑기를 정하는 1차 데이터 */
  seed: number;
  /** 앞면 확률(참값). 던지기의 문턱이자 비율이 붙는 곳 */
  headsProbability: Fraction;
  /** 보는 던진 수. 0 에서 시작해 엄격히 늘어난다 */
  checkpoints: number[];
};

export type TossPayload = {
  index: number;
  from: number;
  to: number;
  faces: number[];
  ratios: number[];
  heads: number;
  ratio: number;
  diff: number;
  width: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function readLawOfLargeNumbersData(raw: unknown): LawOfLargeNumbersFacetData {
  if (!isRecord(raw)) throw new Error('law-of-large-numbers: initialData 가 객체가 아니다');
  if (raw.type !== 'law-of-large-numbers') {
    throw new Error(`law-of-large-numbers: initialData.type 이 'law-of-large-numbers' 가 아니다 (${String(raw.type)})`);
  }
  const { stepMs, seed, headsProbability, checkpoints } = raw;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('law-of-large-numbers: initialData.stepMs 는 양수여야 한다');
  }
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new Error('law-of-large-numbers: initialData.seed 는 정수여야 한다');
  }
  if (!isRecord(headsProbability)) {
    throw new Error('law-of-large-numbers: initialData.headsProbability 가 객체가 아니다');
  }
  const { num, den } = headsProbability;
  if (typeof num !== 'number' || typeof den !== 'number' || !Number.isInteger(num) || !Number.isInteger(den)) {
    throw new Error('law-of-large-numbers: initialData.headsProbability.num · den 은 정수여야 한다');
  }
  if (!(den > 0) || !(num > 0) || !(num < den)) {
    throw new Error('law-of-large-numbers: initialData.headsProbability 는 0 과 1 사이여야 한다');
  }
  if (!Array.isArray(checkpoints) || checkpoints.length < 2) {
    throw new Error('law-of-large-numbers: initialData.checkpoints 는 둘 이상의 수 배열이어야 한다');
  }
  const cps: number[] = [];
  checkpoints.forEach((c, i) => {
    if (typeof c !== 'number' || !Number.isInteger(c)) {
      throw new Error(`law-of-large-numbers: initialData.checkpoints[${i}] 가 정수가 아니다`);
    }
    if (i === 0 && c !== 0) throw new Error('law-of-large-numbers: initialData.checkpoints[0] 은 0 이어야 한다');
    if (i > 0 && !(c > cps[i - 1]!)) {
      throw new Error(`law-of-large-numbers: initialData.checkpoints[${i}] 가 앞 값보다 크지 않다`);
    }
    cps.push(c);
  });
  return {
    type: 'law-of-large-numbers',
    stepMs,
    seed,
    headsProbability: { num, den },
    checkpoints: cps,
  };
}

/** 공통 안내문의 mulberry32 — [0, 1) 수를 차례로 내놓는다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export async function lawOfLargeNumbers(
  context: FacetContext<LawOfLargeNumbersFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LawOfLargeNumbersFacetData>;
  const data = readLawOfLargeNumbersData(ctx.data);
  const { stepMs, checkpoints } = data;
  const p = data.headsProbability.num / data.headsProbability.den;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const draw = mulberry32(data.seed);
  let heads = 0;

  for (let index = 1; index < checkpoints.length; index += 1) {
    // 걸음 0(축 · 참값)을 읽을 틈을 주고, 걸음 사이도 같은 문으로 간다
    if (!(await pause())) return;
    const from = checkpoints[index - 1]! + 1;
    const to = checkpoints[index]!;
    const faces: number[] = [];
    const ratios: number[] = [];
    let width = 0;
    for (let n = from; n <= to; n += 1) {
      if (ctx.cancelled) return;
      const face = draw() < p ? 1 : 0;
      heads += face;
      const ratio = heads / n;
      faces.push(face);
      ratios.push(ratio);
      width = Math.max(width, Math.abs(ratio - p));
    }
    const ratio = heads / to;
    const payload: TossPayload = {
      index,
      from,
      to,
      faces,
      ratios,
      heads,
      ratio,
      diff: ratio - p,
      width,
    };
    await ctx.emit({ type: 'toss', payload });
  }
}
