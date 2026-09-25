/**
 * page-replacement — 페이지 교체 (FIFO · LRU · Clock) × 프레임 수 × 참조열.
 *
 * 한 판 = (참조열, 정책, 프레임 수) 한 조합. 참조 하나가 한 걸음이다. 판을 시작할 때 지금 정책 · 지금 참조열로
 * 프레임 1..5 의 폴트 수(막대 다섯)를 `countFaults` 로 셈해 함께 보낸다.
 *
 * 규약 (조각 evict-oldest · evict-least-recent · recency-reorder · second-chance 와 같다):
 *   - 적중 = 이미 프레임에 있다. FIFO 는 아무것도 바꾸지 않고, LRU 는 마지막 쓴 때를 지금(참조 색인 i)으로,
 *     Clock 은 표시를 1 로 (바늘은 그대로)
 *   - 폴트면 빈 프레임(번호 낮은 것부터). 없으면 FIFO: 들어온 때가 가장 이른 것 · LRU: 마지막 쓴 때가 가장 이른 것 ·
 *     Clock: 바늘 자리부터 돌며 표시 1 은 0 으로 지우고 넘어가고 표시 0 에 닿으면 그것. 그 프레임에 새 페이지.
 *     새 페이지는 때 = i, 표시 1. Clock 의 바늘은 내보낸 칸의 다음 칸으로. 빈 프레임을 채우는 동안 바늘은 칸 0
 *   - 동률: 때는 참조 색인이라 차 있는 프레임끼리 늘 다르다 — FIFO · LRU 에 동률이 없다. 그래도 같으면 번호 낮은
 *     프레임(`<` 로 견줘 앞 것이 남는다). 이 데이터에서 걸린 적 없음 (test 가 센다)
 *   - 프레임 · 칸 번호는 하드웨어 식별자라 0 부터, 참조 차례(걸음)는 1 부터
 *
 * 이벤트:
 *   round-start  { refString: number, refs: number[], policy: number, policyId: string, frames: number,
 *                  frameLadder: number[], bars: number[], scale: number }
 *                — 걸음 #0. bars[k] = 프레임 frameLadder[k] 의 폴트 수. scale = 가장 긴 참조열의 길이(막대 눈금의 끝 —
 *                  참조열을 바꿔도 눈금이 그대로라 막대 높이를 견줄 수 있다)
 *   reference    { step: number (1..), page: number, kind: 'hit' | 'fill' | 'evict', frame: number,
 *                  evicted: number | null, swept: number[], hand: number,
 *                  pages: number[], stamps: number[], marks: number[], faults: number }
 *                — 걸음 #1..#N. pages · stamps · marks 는 그 걸음 뒤의 프레임 상태 (길이 frames, 빈 프레임 page -1).
 *                  swept = Clock 이 표시를 지운 프레임 차례, hand = 걸음 뒤 바늘 자리
 *   phase        { phase } silent — 걸음마다 마지막에 하나
 *
 * phase 어휘 (irs.ts 와 같다): hit-fifo · hit-lru · hit-clock · fill · evict-stamp · evict-clock
 *
 * 계기: faults (폴트 걸음마다 +1) · hits (적중 걸음마다 +1) · evictions (내보낸 걸음마다 +1).
 *   판을 시작할 때 셋 다 0 으로 되돌린다 (처음 한 번은 차이 0 이어도 보낸다).
 *
 * 손잡이: policy (policyLadder) · frames (frameLadder) · refString (refLadder). 한 판을 끝까지 재생 → 입력 대기 →
 *   받은 값으로 다시 재생.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface PageReplacementData {
  type: 'page-replacement';
  stepMs: number;
  /** 걸음 안의 운동 길이 (속도 1). 걸음 간격 = stepMs + motionMs */
  motionMs: number;
  refStrings: number[][];
  refLadder: number[];
  /** 정책 식별자 — 차례가 policyLadder 의 값이다 (0 FIFO · 1 LRU · 2 Clock) */
  policies: string[];
  policyLadder: number[];
  frameLadder: number[];
  refString: number;
  policy: number;
  frames: number;
}

/** 한 참조의 자취 — 걸음 하나. */
export interface PageStep {
  index: number;
  page: number;
  kind: 'hit' | 'fill' | 'evict';
  frame: number;
  evicted: number | null;
  swept: number[];
  hand: number;
  pages: number[];
  stamps: number[];
  marks: number[];
  faults: number;
}

/**
 * IR `countFaults` 와 같은 셈. 돌려주는 값: 폴트 수. `trace` 를 주면 참조마다 자취를 남긴다 (IR 에는 없다).
 * 버퍼 셋은 부르는 쪽이 frames 이상 길이로 만든다.
 */
export function countFaults(
  refs: readonly number[],
  frames: number,
  policy: number,
  slotPage: number[],
  slotStamp: number[],
  slotMark: number[],
  trace?: PageStep[],
): number {
  if (!Number.isInteger(frames) || frames < 1) throw new Error(`프레임 수가 1 이상의 정수가 아니다: ${frames}`);
  if (policy !== 0 && policy !== 1 && policy !== 2) throw new Error(`모르는 정책 번호: ${policy}`);
  if (slotPage.length < frames || slotStamp.length < frames || slotMark.length < frames) {
    throw new Error(`버퍼가 프레임 수 ${frames} 보다 짧다`);
  }
  for (let s = 0; s < frames; s += 1) {
    slotPage[s] = -1;
    slotStamp[s] = 0;
    slotMark[s] = 0;
  }
  let faults = 0;
  let hand = 0;
  const snap = (): Pick<PageStep, 'pages' | 'stamps' | 'marks'> => ({
    pages: slotPage.slice(0, frames),
    stamps: slotStamp.slice(0, frames),
    marks: slotMark.slice(0, frames),
  });
  for (let i = 0; i < refs.length; i += 1) {
    const page = refs[i];
    if (page === undefined || !Number.isInteger(page) || page < 0) throw new Error(`참조 #${i + 1} 의 페이지가 음이 아닌 정수가 아니다`);
    let at = -1;
    for (let s = 0; s < frames; s += 1) {
      if (slotPage[s] === page) at = s;
    }
    if (at >= 0) {
      if (policy === 1) slotStamp[at] = i;
      if (policy === 2) slotMark[at] = 1;
      trace?.push({ index: i, page, kind: 'hit', frame: at, evicted: null, swept: [], hand, ...snap(), faults });
      continue;
    }
    faults += 1;
    let victim = -1;
    for (let s = 0; s < frames; s += 1) {
      if (victim === -1 && slotPage[s] === -1) victim = s;
    }
    let evicted: number | null = null;
    const swept: number[] = [];
    if (victim === -1) {
      if (policy === 2) {
        // 한 바퀴 돌면 표시가 다 지워진다 — frames + 1 번 안에 끝난다
        while (slotMark[hand] === 1) {
          if (swept.length > frames) throw new Error(`바늘이 ${frames + 1} 칸을 넘게 돌았다 — 표시 0 이 없다`);
          slotMark[hand] = 0;
          swept.push(hand);
          hand = (hand + 1) % frames;
        }
        victim = hand;
        hand = (hand + 1) % frames;
      } else {
        victim = 0;
        for (let s = 1; s < frames; s += 1) {
          if ((slotStamp[s] as number) < (slotStamp[victim] as number)) victim = s;
        }
      }
      evicted = slotPage[victim] as number;
    }
    slotPage[victim] = page;
    slotStamp[victim] = i;
    slotMark[victim] = 1;
    trace?.push({ index: i, page, kind: evicted === null ? 'fill' : 'evict', frame: victim, evicted, swept, hand, ...snap(), faults });
  }
  return faults;
}

function assertData(d: PageReplacementData): void {
  if (d.type !== 'page-replacement') throw new Error(`initialData.type 이 page-replacement 가 아니다: ${String(d.type)}`);
  if (d.refStrings.length !== d.refLadder.length) throw new Error('참조열 수와 refLadder 길이가 다르다');
  if (d.policies.length !== d.policyLadder.length) throw new Error('정책 수와 policyLadder 길이가 다르다');
  if (!d.refLadder.includes(d.refString)) throw new Error(`첫 참조열 ${d.refString} 이 사다리에 없다`);
  if (!d.policyLadder.includes(d.policy)) throw new Error(`첫 정책 ${d.policy} 이 사다리에 없다`);
  if (!d.frameLadder.includes(d.frames)) throw new Error(`첫 프레임 수 ${d.frames} 이 사다리에 없다`);
}

type Selection = { refString: number; policy: number; frames: number };

export async function pageReplacementAlgorithm(base: FacetContext<PageReplacementData>): Promise<void> {
  const ctx = base as ReactiveContext<PageReplacementData>;
  const d = ctx.data;
  assertData(d);
  const cap = Math.max(...d.frameLadder);

  const shown = { faults: 0, hits: 0, evictions: 0 };
  let announced = false;
  const setFaults = (n: number): void => {
    const delta = n - shown.faults;
    if (delta !== 0 || !announced) ctx.metric('faults', delta);
    shown.faults = n;
  };
  const setHits = (n: number): void => {
    const delta = n - shown.hits;
    if (delta !== 0 || !announced) ctx.metric('hits', delta);
    shown.hits = n;
  };
  const setEvictions = (n: number): void => {
    const delta = n - shown.evictions;
    if (delta !== 0 || !announced) ctx.metric('evictions', delta);
    shown.evictions = n;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(d.stepMs + d.motionMs);

  const playRound = async (sel: Selection): Promise<boolean> => {
    const refs = d.refStrings[d.refLadder.indexOf(sel.refString)];
    if (!refs) throw new Error(`참조열 ${sel.refString} 이 없다`);
    const policyId = d.policies[d.policyLadder.indexOf(sel.policy)];
    if (policyId === undefined) throw new Error(`정책 ${sel.policy} 의 식별자가 없다`);
    const bars = d.frameLadder.map((f) =>
      countFaults(refs, f, sel.policy, new Array<number>(cap).fill(0), new Array<number>(cap).fill(0), new Array<number>(cap).fill(0)),
    );
    const trace: PageStep[] = [];
    countFaults(refs, sel.frames, sel.policy, new Array<number>(cap).fill(0), new Array<number>(cap).fill(0), new Array<number>(cap).fill(0), trace);

    setFaults(0);
    setHits(0);
    setEvictions(0);
    announced = true;
    await ctx.emit({
      type: 'round-start',
      payload: {
        refString: sel.refString,
        refs: [...refs],
        policy: sel.policy,
        policyId,
        frames: sel.frames,
        frameLadder: [...d.frameLadder],
        bars,
        scale: Math.max(...d.refStrings.map((r) => r.length)),
      },
    });
    if (!(await pause())) return false;

    let hits = 0;
    let evictions = 0;
    for (const step of trace) {
      if (ctx.cancelled) return false;
      if (step.kind === 'hit') hits += 1;
      if (step.kind === 'evict') evictions += 1;
      await ctx.emit({
        type: 'reference',
        payload: {
          step: step.index + 1,
          page: step.page,
          kind: step.kind,
          frame: step.frame,
          evicted: step.evicted,
          swept: step.swept,
          hand: step.hand,
          pages: step.pages,
          stamps: step.stamps,
          marks: step.marks,
          faults: step.faults,
        },
      });
      setFaults(step.faults);
      setHits(hits);
      setEvictions(evictions);
      if (step.kind === 'hit') {
        if (sel.policy === 0) await phase('hit-fifo');
        else if (sel.policy === 1) await phase('hit-lru');
        else await phase('hit-clock');
      } else if (step.kind === 'fill') {
        await phase('fill');
      } else if (sel.policy === 2) {
        await phase('evict-clock');
      } else {
        await phase('evict-stamp');
      }
      if (!(await pause())) return false;
    }
    return true;
  };

  let sel: Selection = { refString: d.refString, policy: d.policy, frames: d.frames };
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(sel))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'policy' && input.type !== 'frames' && input.type !== 'refString') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error(`손잡이 ${input.type} 의 입력에 payload 가 없다`);
        const value = (p as Record<string, unknown>).value;
        if (typeof value !== 'number') throw new Error(`손잡이 ${input.type} 의 value 가 수가 아니다: ${String(value)}`);
        const ladder = input.type === 'policy' ? d.policyLadder : input.type === 'frames' ? d.frameLadder : d.refLadder;
        if (!ladder.includes(value)) throw new Error(`손잡이 ${input.type} 의 값 ${value} 이 사다리에 없다`);
        sel = { ...sel, [input.type]: value };
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
