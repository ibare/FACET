/**
 * shrink-to-smallest — 성질을 깨는 입력을 깨짐이 남는 가장 작은 입력으로 깎는다.
 *
 * 성질: decode(encode(list)) == list
 *   encode = 수마다 십진 글자를 사이 표시 없이 잇는다
 *   decode = 글자 하나를 수 하나로 읽는다
 *
 * 줄이기 규칙 (한 바퀴):
 *   ① 지우기 — 앞 칸부터 한 칸을 지운 후보. 받으면 같은 자리를 다시, 버리면 다음 자리로.
 *   ② 값 줄이기 — 앞 칸부터, 값 v 의 후보를 0 · v div 2 · v - 1 차례로 (v 보다 작고 0 이상, 겹치면 한 번).
 *      처음 깨지는 후보를 받고 그 칸을 다시 줄인다. 셋 다 버려지면 다음 칸.
 *   바퀴에서 받은 것이 있으면 다음 바퀴. 없으면 멈춘다.
 *   이미 돌려 본 입력은 다시 돌리지 않는다 — 건너뛴 후보는 걸음이 아니다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   try   { round: number; op: 'delete' | 'value'; index: number; from: number; to: number;
 *           before: number[]; candidate: number[]; broke: boolean; skipped: number[][] }
 *         아직 안 돌려 본 후보 하나를 돌렸다. broke 가 참이면 받음(후보가 새 입력), 거짓이면 버림.
 *         op 가 'delete' 면 from 은 지운 칸의 값이고 to 는 -1. skipped 는 이 후보에 이르기 전에
 *         돌려 본 입력이라 건너뛴 후보들.
 *   done  { input: number[]; skipped: number[][]; run: number; kept: number; dropped: number }
 *         새 후보가 없어 멈췄다. input 이 가장 작은 입력. run · kept · dropped 는 돌려 본 후보의 수.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 처음 입력으로 채운다 (바탕이 이미 읽을 것이라
 * 첫 발신 앞에 stepMs 를 둔다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShrinkToSmallestFacetData = {
  type: 'shrink-to-smallest';
  /** 화면에 두는 성질 한 줄 (자료) */
  property: string;
  /** 생성기가 찾은 처음 입력 — 0 이상의 정수 목록 */
  input: number[];
  stepMs: number;
};

/** 수마다 십진 글자를 사이 표시 없이 잇는다. */
export function encodeList(list: readonly number[]): string {
  return list.map((v) => String(v)).join('');
}

/** 글자 하나를 수 하나로 읽는다. 숫자가 아닌 글자는 던진다. */
export function decodeText(text: string): number[] {
  return Array.from(text).map((ch, i) => {
    if (!/^[0-9]$/.test(ch)) throw new Error(`shrink-to-smallest: ${i}번 글자 '${ch}' 는 숫자가 아니다`);
    return Number(ch);
  });
}

/** 성질 decode(encode(list)) == list 가 깨지는가. */
export function breaksProperty(list: readonly number[]): boolean {
  const back = decodeText(encodeList(list));
  if (back.length !== list.length) return true;
  return back.some((v, i) => v !== list[i]);
}

/** 값 줄이기 후보 — 0 · v div 2 · v - 1 차례, v 보다 작고 0 이상, 겹치면 한 번. */
export function valueCandidates(v: number): number[] {
  const out: number[] = [];
  for (const c of [0, Math.floor(v / 2), v - 1]) {
    if (c >= 0 && c < v && !out.includes(c)) out.push(c);
  }
  return out;
}

/** 자료를 좁힌다. 모양이 틀리면 던진다. */
export function readShrinkData(raw: unknown): ShrinkToSmallestFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('shrink-to-smallest: initialData 가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'shrink-to-smallest') throw new Error(`shrink-to-smallest: type 이 다르다 (${String(r.type)})`);
  if (typeof r.property !== 'string' || r.property === '') throw new Error('shrink-to-smallest: property 가 없다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('shrink-to-smallest: stepMs 가 없다');
  if (!Array.isArray(r.input) || r.input.length === 0) throw new Error('shrink-to-smallest: input 이 빈 목록이다');
  const input = r.input.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new Error(`shrink-to-smallest: input 의 ${i}번 칸이 0 이상의 정수가 아니다 (${String(v)})`);
    }
    return v;
  });
  return { type: 'shrink-to-smallest', property: r.property, input, stepMs: r.stepMs };
}

const ROUND_LIMIT = 50;

export async function shrinkToSmallest(context: FacetContext<ShrinkToSmallestFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ShrinkToSmallestFacetData>;
  const data = readShrinkData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let cur = [...data.input];
  if (!breaksProperty(cur)) throw new Error('shrink-to-smallest: 처음 입력이 성질을 깨지 않는다 — 줄일 것이 없다');

  // 돌려 본 입력 → 깨졌는가
  const tried = new Map<string, boolean>();
  tried.set(cur.join(','), true);
  let skipped: number[][] = [];
  let run = 0;
  let kept = 0;

  type Attempt = 'broke' | 'held' | 'cancel';
  async function attempt(
    round: number,
    op: 'delete' | 'value',
    index: number,
    from: number,
    to: number,
    candidate: number[],
  ): Promise<Attempt> {
    const key = candidate.join(',');
    const known = tried.get(key);
    if (known !== undefined) {
      skipped.push(candidate);
      return known ? 'broke' : 'held';
    }
    if (!(await pause())) return 'cancel';
    const broke = breaksProperty(candidate);
    tried.set(key, broke);
    run += 1;
    if (broke) kept += 1;
    const before = [...cur];
    const payloadSkipped = skipped;
    skipped = [];
    await ctx.emit({
      type: 'try',
      payload: { round, op, index, from, to, before, candidate, broke, skipped: payloadSkipped },
    });
    return broke ? 'broke' : 'held';
  }

  let changed = true;
  let round = 0;
  while (changed) {
    if (ctx.cancelled) return;
    round += 1;
    if (round > ROUND_LIMIT) throw new Error(`shrink-to-smallest: ${ROUND_LIMIT} 바퀴를 넘어도 멈추지 않는다`);
    changed = false;

    // ① 지우기
    let i = 0;
    while (i < cur.length) {
      if (ctx.cancelled) return;
      const candidate = [...cur.slice(0, i), ...cur.slice(i + 1)];
      const res = await attempt(round, 'delete', i, cur[i] as number, -1, candidate);
      if (res === 'cancel') return;
      if (res === 'broke') {
        cur = candidate;
        changed = true;
      } else {
        i += 1;
      }
    }

    // ② 값 줄이기
    for (let k = 0; k < cur.length; k += 1) {
      if (ctx.cancelled) return;
      let took = true;
      while (took) {
        if (ctx.cancelled) return;
        took = false;
        const v = cur[k] as number;
        for (const c of valueCandidates(v)) {
          if (ctx.cancelled) return;
          const candidate = [...cur.slice(0, k), c, ...cur.slice(k + 1)];
          const res = await attempt(round, 'value', k, v, c, candidate);
          if (res === 'cancel') return;
          if (res === 'broke') {
            cur = candidate;
            changed = true;
            took = true;
            break;
          }
        }
      }
    }
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: { input: [...cur], skipped, run, kept, dropped: run - kept },
  });
}
