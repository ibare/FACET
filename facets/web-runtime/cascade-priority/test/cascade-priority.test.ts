// @vitest-environment happy-dom
/**
 * cascade-priority 고유 검수.
 *
 * 1. runIR(spec)/runIR(match_rtl) 이 사양의 실측표와 같은 답을 낸다(IR 자체를 표와 대조).
 * 2. 실제 algorithm 을 여덟 조합으로 몰아 후보·견줌·맞은 규칙·이긴 규칙·바꿈이 표와 같다.
 * 3. 동률(#2 vs #3, 둘 다 (0,1,1))이 p.note/div.card 에서 실제로 걸린다 — p.note/div 는
 *    #2 가 후보이되 조상 검사에서 떨어져 애초에 다투지 않는다(둘 다 확인한다).
 * 4. 사다리(segments[].value)가 데이터와 맞고, mountView 로 stage 가 던지지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { cascadePriorityAlgorithm, type CascadePriorityData } from '../src/algorithm.js';
import { cascadePriorityImperativeIR } from '../src/irs.js';
import { cascadePriorityFacet, RULES } from '../src/facet.js';
import { cascadePriorityStageView } from '../src/cascade-priority-stage.js';

type Input = { type: string; payload: { value: number } };
type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** whole-self-check.test.ts 의 drive() 와 같은 짜임 — 판 경계는 waitForInput. */
async function drive(inputs: Input[]): Promise<Round[]> {
  const initialData = clone(cascadePriorityFacet.initialData) as CascadePriorityData;
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { events: [], metrics: totals };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const close = (): void => {
    rounds.push({ events: current.events, metrics: new Map(totals) });
  };
  const ctx = {
    data: initialData,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      current.events.push(event);
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    async waitForInput(): Promise<Input> {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { events: [], metrics: totals };
      return next;
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('algorithm 이 5 초 안에 입력 대기에 닿지 않았다')), 5_000);
  });
  try {
    await Promise.race([cascadePriorityAlgorithm(ctx as never).then(() => close()), waiting, cap]);
  } finally {
    clearTimeout(timer);
    cancelled = true;
  }
  return rounds;
}

function judged(round: Round): { ruleId: number; matched: boolean }[] {
  return round.events
    .filter((e) => e.type === 'judge')
    .map((e) => e.payload as { ruleId: number; matched: boolean });
}

function candidatesOf(round: Round): number[] {
  const e = round.events.find((ev) => ev.type === 'filter');
  return ((e?.payload as { candidates: number[] } | undefined)?.candidates ?? []).slice();
}

function assignOf(round: Round): { ruleId: number; value: string } | undefined {
  const e = round.events.find((ev) => ev.type === 'assign');
  return e?.payload as { ruleId: number; value: string } | undefined;
}

function compareEvents(round: Round): { ruleId: number; heldBefore: number | null; heldAfter: number }[] {
  return round.events
    .filter((e) => e.type === 'compare')
    .map((e) => e.payload as { ruleId: number; heldBefore: number | null; heldAfter: number });
}

/** irs.ts 와 같은 명시도 셈 — id*100+class*10+tag. */
function specOf(parts: ('tag' | 'class' | 'id')[]): number {
  let id = 0;
  let cls = 0;
  let tag = 0;
  for (const p of parts) {
    if (p === 'id') id += 1;
    if (p === 'class') cls += 1;
    if (p === 'tag') tag += 1;
  }
  return id * 100 + cls * 10 + tag;
}

function elementFeatures(mark: number): string[] {
  const out = ['tag:p'];
  if (mark === 1 || mark === 3) out.push('class:note');
  if (mark === 2 || mark === 3) out.push('id:lead');
  return out;
}
function parentFeatures(parent: number): string[] {
  const out = ['tag:div'];
  if (parent === 1) out.push('class:card');
  return out;
}
function chainOf(mark: number, parent: number): string[][] {
  return [elementFeatures(mark), parentFeatures(parent), ['tag:body'], ['tag:html']];
}

/** 사양의 실측표 (그대로 옮김) — mark×parent 여덟 조합. */
const TABLE: Record<string, { candidates: number; comparisons: number; matched: number[]; winner: number; value: string; swaps: number }> = {
  '0,0': { candidates: 2, comparisons: 5, matched: [1], winner: 1, value: 'black', swaps: 0 },
  '0,1': { candidates: 2, comparisons: 3, matched: [1, 2], winner: 2, value: 'gray', swaps: 1 },
  '1,0': { candidates: 4, comparisons: 10, matched: [1, 3], winner: 3, value: 'green', swaps: 1 },
  '1,1': { candidates: 4, comparisons: 6, matched: [1, 2, 3, 5], winner: 5, value: 'teal', swaps: 3 },
  '2,0': { candidates: 3, comparisons: 6, matched: [1, 4], winner: 4, value: 'navy', swaps: 1 },
  '2,1': { candidates: 3, comparisons: 4, matched: [1, 2, 4], winner: 4, value: 'navy', swaps: 2 },
  '3,0': { candidates: 5, comparisons: 11, matched: [1, 3, 4], winner: 4, value: 'navy', swaps: 2 },
  '3,1': { candidates: 5, comparisons: 7, matched: [1, 2, 3, 4, 5], winner: 4, value: 'navy', swaps: 3 },
};

describe('cascade-priority — IR 대조', () => {
  it('spec() 이 다섯 규칙의 명시도를 표와 같게 셈한다', () => {
    const expected = [1, 11, 11, 100, 20];
    RULES.forEach((rule, i) => {
      const got = runIR(cascadePriorityImperativeIR, 'spec', [rule.parts]);
      expect(got, `rule #${rule.id}`).toBe(expected[i]);
      expect(specOf(rule.parts)).toBe(expected[i]);
    });
  });

  it('match_rtl() 이 여덟 조합 전부에서 표의 맞은 규칙 집합과 같다', () => {
    for (const [key, row] of Object.entries(TABLE)) {
      const [mark, parent] = key.split(',').map(Number);
      const chain = chainOf(mark!, parent!);
      for (const rule of RULES) {
        const got = runIR(cascadePriorityImperativeIR, 'match_rtl', [rule.compounds, chain]);
        const expectMatched = row.matched.includes(rule.id);
        expect(got, `${key} rule #${rule.id}`).toBe(expectMatched ? 1 : 0);
      }
    }
  });
});

describe('cascade-priority — algorithm 대 사양 표', () => {
  // 뱀걸음(snake path) — 매 판 손잡이 하나만 바뀐다. round0 은 초깃값(mark0,parent0).
  const inputs: Input[] = [
    { type: 'parent', payload: { value: 1 } }, // round1: 0,1
    { type: 'mark', payload: { value: 1 } }, // round2: 1,1
    { type: 'parent', payload: { value: 0 } }, // round3: 1,0
    { type: 'mark', payload: { value: 2 } }, // round4: 2,0
    { type: 'parent', payload: { value: 1 } }, // round5: 2,1
    { type: 'mark', payload: { value: 3 } }, // round6: 3,1
    { type: 'parent', payload: { value: 0 } }, // round7: 3,0
  ];
  const ROUND_COMBO = ['0,0', '0,1', '1,1', '1,0', '2,0', '2,1', '3,1', '3,0'];

  it('여덟 판 모두 후보·견줌·맞은 규칙·이긴 규칙·바꿈이 표와 같다', async () => {
    const rounds = await drive(inputs);
    expect(rounds.length).toBe(8);
    rounds.forEach((round, i) => {
      const key = ROUND_COMBO[i]!;
      const row = TABLE[key]!;
      const cands = candidatesOf(round);
      expect(cands.length, `${key} 후보 수`).toBe(row.candidates);
      expect(round.metrics.get('candidates'), `${key} candidates 계기`).toBe(row.candidates);
      expect(round.metrics.get('comparisons'), `${key} comparisons 계기`).toBe(row.comparisons);
      expect(round.metrics.get('swaps'), `${key} swaps 계기`).toBe(row.swaps);
      const matchedIds = judged(round)
        .filter((j) => j.matched)
        .map((j) => j.ruleId);
      expect(matchedIds, `${key} 맞은 규칙`).toEqual(row.matched);
      const assign = assignOf(round);
      expect(assign?.ruleId, `${key} 이긴 규칙`).toBe(row.winner);
      expect(assign?.value, `${key} 값`).toBe(row.value);
    });
  });

  it('동률(#2 vs #3)은 p.note/div.card 에서 실제로 걸리고, p.note/div 에서는 다투지 않는다', async () => {
    const rounds = await drive(inputs);
    // round3 = mark1,parent0 (p.note, div) — #2 는 후보지만 조상 검사에서 떨어져 안 맞는다.
    const noTieRound = rounds[3]!;
    const noTieJudged = judged(noTieRound);
    const rule2 = noTieJudged.find((j) => j.ruleId === 2);
    expect(rule2?.matched, 'p.note/div 에서 #2 는 후보이되 맞지 않는다').toBe(false);
    expect(compareEvents(noTieRound).some((c) => c.ruleId === 2), 'p.note/div 는 #2 가 무게 다툼에 들어오지 않는다').toBe(false);

    // round2 = mark1,parent1 (p.note, div.card) — #2 #3 이 둘 다 맞고 무게가 같다(11=11).
    const tieRound = rounds[2]!;
    expect(specOf(RULES[1]!.parts)).toBe(specOf(RULES[2]!.parts)); // #2 와 #3 무게가 같다(둘 다 11)
    const compares = compareEvents(tieRound);
    const rule3Compare = compares.find((c) => c.ruleId === 3);
    expect(rule3Compare?.heldBefore, '#3 이 들어올 때 자리를 쥔 것은 #2 였다').toBe(2);
    expect(rule3Compare?.heldAfter, '무게가 같으면 나중 것(#3)이 자리를 가져간다').toBe(3);
  });
});

describe('cascade-priority — 사다리', () => {
  it('mark·parent 사다리가 데이터와 맞는다', () => {
    const controls = cascadePriorityFacet.blocks.controls as unknown as {
      controls: Array<{ action: string; segments: { value: number }[] }>;
    };
    const mark = controls.controls.find((c) => c.action === 'mark')!;
    const parent = controls.controls.find((c) => c.action === 'parent')!;
    expect(mark.segments.map((s) => s.value)).toEqual([0, 1, 2, 3]);
    expect(parent.segments.map((s) => s.value)).toEqual([0, 1]);
  });
});

describe('cascade-priority — stage 마운트', () => {
  it('mountView 로 마운트해도 던지지 않고 svg 를 낸다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(cascadePriorityStageView, container, {
      config: {},
      initialData: cascadePriorityFacet.initialData,
      locale: 'ko',
      theme: 'light',
    });
    expect(container.querySelectorAll('svg').length).toBe(1);
    instance.destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(cascadePriorityStageView, container, { config: {} });
    expect(container.querySelectorAll('svg').length).toBe(1);
    instance.destroy();
  });
});
