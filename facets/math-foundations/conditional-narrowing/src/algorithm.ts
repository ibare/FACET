/**
 * conditional-narrowing — 조건은 세상을 좁힌다.
 *
 * 주사위 한 개를 두 번 던진 결과 (a, b) 를 모두 나열하고, 사건 A(두 눈의 합이 문턱 이상) 의
 * 몫을 먼저 센 뒤, 사건 B(첫 눈이 문턱 이상) 를 알게 되면 B 밖의 결과가 세상을 떠난다.
 * 남은 세상 안에서 A 를 다시 세어 분모가 바뀐 몫 P(A | B) 를 낸다.
 *
 * 결과의 번호: i = (a − 1) × faces + (b − 1). 차례는 a 먼저, 같은 a 에서 b 가 작은 것부터.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   markA   payload { members: number[]; count: number; total: number; pct: number }
 *           A 에 드는 결과 번호(차례대로) · 그 수 · 세상의 크기 · 100 × count / total
 *   leave   payload { leaving: number[]; leavingA: number[]; from: number; to: number }
 *           B 밖이라 떠나는 결과 번호(차례대로) · 그 가운데 A 였던 것 · 떠나기 전 세상 크기 · 뒤 크기
 *   recount payload { members: number[]; count: number; total: number }
 *           남은 세상 안의 A 번호(차례대로) · 그 수 · 남은 세상 크기
 *   answer  payload { num: number; den: number; pct: number; prevNum: number; prevDen: number; prevPct: number }
 *           P(A | B) = num / den 과 앞의 P(A) = prevNum / prevDen. pct 는 100 × 분자 / 분모
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConditionalNarrowingFacetData = {
  type: 'conditional-narrowing';
  stepMs: number;
  /** 주사위 눈의 수 (눈은 1..faces). */
  faces: number;
  /** 사건 A: a + b ≥ sumAtLeast. symbol 은 번역하지 않는 수식 기호. */
  eventA: { symbol: string; sumAtLeast: number };
  /** 사건 B: a ≥ firstAtLeast. */
  eventB: { symbol: string; firstAtLeast: number };
};

export type Outcome = { a: number; b: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function posInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`conditional-narrowing: ${path} 는 양의 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

function symbolOf(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`conditional-narrowing: ${path} 는 빈 문자열이 아닌 기호여야 한다`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘 · 장면 · 무대가 같은 규칙으로 받는다. */
export function narrowConditionalNarrowingData(raw: unknown): ConditionalNarrowingFacetData {
  if (!isRecord(raw)) throw new Error('conditional-narrowing: initialData 가 객체가 아니다');
  if (raw.type !== 'conditional-narrowing') {
    throw new Error(`conditional-narrowing: initialData.type 이 어긋났다 (${String(raw.type)})`);
  }
  const stepMs = posInt(raw.stepMs, 'initialData.stepMs');
  const faces = posInt(raw.faces, 'initialData.faces');
  if (faces < 2) throw new Error('conditional-narrowing: initialData.faces 는 2 이상이어야 한다');
  if (!isRecord(raw.eventA)) throw new Error('conditional-narrowing: initialData.eventA 가 객체가 아니다');
  if (!isRecord(raw.eventB)) throw new Error('conditional-narrowing: initialData.eventB 가 객체가 아니다');
  const sumAtLeast = posInt(raw.eventA.sumAtLeast, 'initialData.eventA.sumAtLeast');
  const firstAtLeast = posInt(raw.eventB.firstAtLeast, 'initialData.eventB.firstAtLeast');
  if (sumAtLeast < 2 || sumAtLeast > 2 * faces) {
    throw new Error(`conditional-narrowing: initialData.eventA.sumAtLeast 가 2..${2 * faces} 밖이다`);
  }
  if (firstAtLeast < 2 || firstAtLeast > faces) {
    // 1 이면 떠나는 것이 없고, faces 를 넘으면 세상이 비어 몫을 셀 수 없다
    throw new Error(`conditional-narrowing: initialData.eventB.firstAtLeast 가 2..${faces} 밖이다`);
  }
  return {
    type: 'conditional-narrowing',
    stepMs,
    faces,
    eventA: { symbol: symbolOf(raw.eventA.symbol, 'initialData.eventA.symbol'), sumAtLeast },
    eventB: { symbol: symbolOf(raw.eventB.symbol, 'initialData.eventB.symbol'), firstAtLeast },
  };
}

/** 같은 가능성의 결과 전부 — 번호 i 가 (a − 1) × faces + (b − 1) 이 되는 차례. 바탕 구조라 장면도 부른다. */
export function enumerateOutcomes(faces: number): Outcome[] {
  const out: Outcome[] = [];
  for (let a = 1; a <= faces; a += 1) {
    for (let b = 1; b <= faces; b += 1) out.push({ a, b });
  }
  return out;
}

export async function conditionalNarrowing(
  context: FacetContext<ConditionalNarrowingFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ConditionalNarrowingFacetData>;
  const data = narrowConditionalNarrowingData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const outcomes = enumerateOutcomes(data.faces);
  const inA = (o: Outcome): boolean => o.a + o.b >= data.eventA.sumAtLeast;
  const inB = (o: Outcome): boolean => o.a >= data.eventB.firstAtLeast;

  const aMembers: number[] = [];
  const leaving: number[] = [];
  const leavingA: number[] = [];
  const aInB: number[] = [];
  outcomes.forEach((o, i) => {
    if (inA(o)) aMembers.push(i);
    if (!inB(o)) {
      leaving.push(i);
      if (inA(o)) leavingA.push(i);
    } else if (inA(o)) {
      aInB.push(i);
    }
  });

  const total = outcomes.length;
  const kept = total - leaving.length;
  if (aMembers.length === 0) throw new Error('conditional-narrowing: 사건 A 에 드는 결과가 없다');

  // 걸음 0 (세상 전체) 을 읽을 틈
  if (!(await pause())) return;
  const pA = (100 * aMembers.length) / total;
  await ctx.emit({
    type: 'markA',
    payload: { members: aMembers, count: aMembers.length, total, pct: pA },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'leave',
    payload: { leaving, leavingA, from: total, to: kept },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'recount',
    payload: { members: aInB, count: aInB.length, total: kept },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'answer',
    payload: {
      num: aInB.length,
      den: kept,
      pct: (100 * aInB.length) / kept,
      prevNum: aMembers.length,
      prevDen: total,
      prevPct: pA,
    },
  });
}
