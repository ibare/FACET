// @vitest-environment happy-dom
/**
 * 청킹 완제품 검사.
 *
 * 1. 사양 표 아홉 칸을 셈으로 되찾는다 (덩이 · 잘린 문장 · 담은 낱말 · 채움 %)
 * 2. IR 이 아홉 칸 전부에서 algorithm 과 같은 답을 낸다 (덩이 버퍼 · 덩이 수 · 잘린 문장 · 담은 낱말)
 * 3. phase 집합 — algorithm = IR, 그리고 걸음 경계마다 켜진 phase 를 모은 집합 = IR (덮이는 phase)
 * 4. mechanismKind 가 reactive
 * 5. 회차별 계기 — 손잡이를 A → B → A 로 돌려 판마다 사양 표와 견준다 (누적 붕괴)
 * 6. 1차 데이터의 사다리가 segments[].value 와 같다
 * 7. mountView 를 거쳐 띄우고 이벤트를 먹여도 던지지 않고, 캡션의 수가 셈한 수와 같다
 */

import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
} from '@ffacet/core/runtime';
import {
  chunkingAlgorithm,
  chunkingFacet,
  chunkingImperativeIR,
  chunkingProjector,
  chunkingStageView,
  computeChunkingResult,
  registerChunking,
  sentenceSpans,
  splitWords,
  type ChunkingData,
} from '../src/index.js';

const data = chunkingFacet.initialData as unknown as ChunkingData;
const words = splitWords(data.text);
const sentences = sentenceSpans(words);

/** 사양 표 — 대조용. [법, 창, 덩이, 잘린 문장, 담은 낱말, 채움 %] */
const TABLE: Array<[number, number, number, number, number, number]> = [
  [0, 16, 8, 6, 121, 95],
  [0, 24, 6, 4, 121, 84],
  [0, 32, 4, 3, 121, 95],
  [1, 16, 15, 4, 233, 97],
  [1, 24, 10, 2, 229, 95],
  [1, 32, 7, 1, 217, 97],
  [2, 16, 11, 2, 121, 69],
  [2, 24, 7, 1, 121, 72],
  [2, 32, 5, 0, 121, 76],
];

/** IR 이 받는 덩이 버퍼 길이 — 부르는 쪽이 만든다. */
const BUFFER = 40;

function row(rule: number, size: number): [number, number, number, number] {
  const r = TABLE.find(([a, b]) => a === rule && b === size);
  if (!r) throw new Error(`표에 없는 칸: ${rule} ${size}`);
  return [r[2], r[3], r[4], r[5]];
}

describe('청킹 — 사양 표', () => {
  it('낱말 121, 문장 9 (8 · 16 · 7 · 26 · 10 · 19 · 14 · 13 · 8)', () => {
    expect(words.length).toBe(121);
    expect(sentences.map((s) => s.end - s.start)).toEqual([8, 16, 7, 26, 10, 19, 14, 13, 8]);
  });

  it('아홉 칸이 표와 같다', () => {
    for (const [rule, size, chunks, broken, stored, fill] of TABLE) {
      const r = computeChunkingResult(data.text, rule, size);
      expect([r.chunks.length, r.broken.length, r.stored, r.fill], `${rule}/${size}`).toEqual([chunks, broken, stored, fill]);
    }
  });

  it('문장 경계 · 창 24 의 덩이 구간', () => {
    const r = computeChunkingResult(data.text, 2, 24);
    expect(r.chunks.map((c) => [c.start, c.end])).toEqual([
      [0, 24], [24, 31], [31, 55], [55, 67], [67, 86], [86, 100], [100, 121],
    ]);
    // 남는 잘림은 26 낱말짜리 넷째 문장 하나
    expect(r.broken).toEqual([3]);
    // 창 16 에서는 여섯째 19 낱말도
    expect(computeChunkingResult(data.text, 2, 16).broken).toEqual([3, 5]);
  });
});

describe('청킹 — IR 과 algorithm 이 같은 답을 낸다', () => {
  const sentStart = sentences.map((s) => s.start);
  const sentEnd = sentences.map((s) => s.end);

  it('32비트 잠금 — 데이터가 커지면 여기가 먼저 깨진다', () => {
    expect(words.length).toBeLessThanOrEqual(121);
    expect(Math.max(...data.sizes)).toBeLessThanOrEqual(32);
    let most = 0;
    for (const [rule, size] of TABLE) most = Math.max(most, computeChunkingResult(data.text, rule, size).chunks.length);
    expect(most).toBe(15);
    expect(most).toBeLessThanOrEqual(BUFFER);
  });

  for (const [rule, size] of TABLE) {
    it(`법 ${rule} · 창 ${size}`, () => {
      const want = computeChunkingResult(data.text, rule, size);
      const chunkStart = new Array<number>(BUFFER).fill(0);
      const chunkEnd = new Array<number>(BUFFER).fill(0);
      const count =
        rule === 2
          ? runIR(chunkingImperativeIR, 'cutBySentences', [sentStart, sentEnd, size, chunkStart, chunkEnd])
          : runIR(chunkingImperativeIR, 'cutByWords', [words.length, size, rule === 1 ? Math.floor(size / 2) : 0, chunkStart, chunkEnd]);
      expect(count).toBe(want.chunks.length);
      const n = count as number;
      expect(chunkStart.slice(0, n)).toEqual(want.chunks.map((c) => c.start));
      expect(chunkEnd.slice(0, n)).toEqual(want.chunks.map((c) => c.end));
      let stored = 0;
      for (let k = 0; k < n; k += 1) stored += chunkEnd[k]! - chunkStart[k]!;
      expect(stored).toBe(want.stored);
      const broken = runIR(chunkingImperativeIR, 'countBroken', [sentStart, sentEnd, chunkStart, chunkEnd, n]);
      expect(broken).toBe(want.broken.length);
      // 표와도 같다
      expect([n, broken, stored]).toEqual(row(rule, size).slice(0, 3));
    });
  }
});

// ── 알고리즘을 러너 없이 돌리는 가짜 ctx

type Input = { type: string; payload?: unknown };

type Trace = {
  events: FacetRuntimeEvent[];
  /** 걸음 경계마다 켜져 있던 phase */
  lit: string[];
  /** 판 끝(입력 대기)마다 계기 값 */
  rounds: Array<Record<string, number>>;
};

async function drive(inputs: Input[]): Promise<Trace> {
  const events: FacetRuntimeEvent[] = [];
  const lit: string[] = [];
  const rounds: Array<Record<string, number>> = [];
  const metrics: Record<string, number> = {};
  let current: string | null = null;
  let cancelled = false;
  const queue = inputs.slice();
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const p = (e.payload as { phase?: unknown } | undefined)?.phase;
        if (typeof p === 'string') current = p;
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      if (current) lit.push(current);
      return !cancelled;
    },
    async waitForInput() {
      if (current) lit.push(current);
      rounds.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await chunkingAlgorithm(ctx as never);
  return { events, lit, rounds };
}

function irPhases(): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind === 'comment') continue;
      if (s.phase) out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const f of chunkingImperativeIR.functions) walk(f.body);
  return out;
}

const knob = (type: 'rule' | 'size', value: number, segmentIndex: number): Input => ({
  type,
  payload: { value, segmentIndex },
});

describe('청킹 — phase 와 계기', () => {
  it('phase 집합 — algorithm = IR, 걸음 경계마다 켜진 것 = IR', async () => {
    const ir = irPhases();
    expect([...ir].sort()).toEqual(['check', 'cut', 'done']);
    const t = await drive([knob('rule', 1, 1), knob('rule', 2, 2)]);
    const emitted = new Set(
      t.events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...ir].sort());
    for (const e of t.events) if (e.type === 'phase') expect(e.silent).toBe(true);
    expect([...new Set(t.lit)].sort()).toEqual([...ir].sort());
    // 판마다 셋 다 켜진다 — 판 하나만 돌려도 같다
    const one = await drive([]);
    expect([...new Set(one.lit)].sort()).toEqual([...ir].sort());
  });

  it('회차별 계기 — A → B → A, 그리고 아홉 칸 전부', async () => {
    // (0,24) → 법 2 → 법 0 → 창 32 → 창 24 → 창 16 → 법 1 → 창 32 → 창 24 → 법 2 → 창 16 → 창 32
    const t = await drive([
      knob('rule', 2, 2),
      knob('rule', 0, 0),
      knob('size', 32, 2),
      knob('size', 24, 1),
      knob('size', 16, 0),
      knob('rule', 1, 1),
      knob('size', 32, 2),
      knob('size', 24, 1),
      knob('rule', 2, 2),
      knob('size', 16, 0),
      knob('size', 32, 2),
    ]);
    const seq: Array<[number, number]> = [
      [0, 24], [2, 24], [0, 24], [0, 32], [0, 24], [0, 16], [1, 16], [1, 32], [1, 24], [2, 24], [2, 16], [2, 32],
    ];
    expect(t.rounds.length).toBe(seq.length);
    seq.forEach(([rule, size], i) => {
      const [chunks, broken, stored] = row(rule, size);
      expect(t.rounds[i], `회차 ${i + 1}: 법 ${rule} · 창 ${size}`).toEqual({
        'chunk-count': chunks,
        'broken-sentence-count': broken,
        'stored-word-count': stored,
      });
    });
  });

  it('사다리 밖의 값 · 남의 입력은 흘린다', async () => {
    const t = await drive([
      { type: 'size', payload: { value: 20 } },
      { type: 'rule', payload: { value: '1' } },
      { type: 'advance' },
      knob('size', 16, 0),
    ]);
    // 첫 판 + 창 16 한 판. 흘린 입력은 판을 새로 돌리지 않는다
    const plans = t.events.filter((e) => e.type === 'plan');
    expect(plans.length).toBe(2);
    expect(t.rounds[t.rounds.length - 1]).toEqual({
      'chunk-count': 8,
      'broken-sentence-count': 6,
      'stored-word-count': 121,
    });
  });

  it('mechanismKind 가 reactive', () => {
    clearRegistry();
    registerChunking();
    expect(getAlgorithmMechanismKind('chunking')).toBe('reactive');
  });

  it('1차 데이터의 사다리가 손잡이 segments 와 같다', () => {
    const controls = (chunkingFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (action: string): number[] =>
      ((controls.find((c) => c.action === action)?.segments ?? []) as Array<{ value: number }>).map((s) => s.value);
    expect(seg('rule')).toEqual(data.rules);
    expect(seg('size')).toEqual(data.sizes);
    const def = (action: string): number | undefined =>
      ((controls.find((c) => c.action === action)?.segments ?? []) as Array<{ value: number; default?: boolean }>).find(
        (s) => s.default,
      )?.value;
    expect(def('rule')).toBe(0);
    expect(def('size')).toBe(24);
    // 구간 라벨과 화면 캡션의 법 이름이 글자까지 같다
    const labels = ((controls.find((c) => c.action === 'rule')?.segments ?? []) as Array<{ label: unknown }>).map(
      (s) => s.label,
    );
    const m = chunkingFacet.messages ?? {};
    expect(labels).toEqual([m['rule.words'], m['rule.half'], m['rule.sentence']]);
  });
});

describe('청킹 — 화면', () => {
  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const c = document.createElement('div');
    const inst = mountView(chunkingStageView, c, { config: {} });
    expect(c.querySelector('svg')).toBeTruthy();
    inst.destroy();
  });

  it('이벤트를 먹이면 캡션의 수가 셈한 수와 같다 (A → B → A)', async () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const t = makeTranslator('en', chunkingFacet.messages);
    const stage = mountView(chunkingStageView, c, {
      config: { type: 'chunking-stage' },
      initialData: chunkingFacet.initialData,
      t,
    });
    const phases: Array<string | null> = [];
    const projector = chunkingProjector(
      {
        stage,
        codePanel: {
          destroy() {},
          highlightPhase: (p: string | null) => phases.push(p),
          clearHighlight: () => undefined,
        },
      },
      { getSpeed: () => 50, t },
    );
    projector.onInit?.(chunkingFacet.initialData);
    const svg = c.querySelector('svg')!;
    const text = (): string => svg.textContent ?? '';

    const trace = await drive([knob('rule', 2, 2), knob('rule', 0, 0), knob('size', 32, 2)]);
    const seq: Array<[number, number]> = [[0, 24], [2, 24], [0, 24], [0, 32]];
    let round = 0;
    for (const e of trace.events) {
      await projector.onEvent(e);
      if (e.type === 'done') {
        const [rule, size] = seq[round]!;
        const [chunks, broken, stored, fill] = row(rule, size);
        expect(text()).toContain(
          `Chunks ${chunks} · cut sentences ${broken} · words stored ${stored} · window filled ${fill}%`,
        );
        const plan = rule === 2 ? 'sentence end' : 'word count';
        expect(text()).toContain(`Cut by ${plan} · window ${size} words`);
        round += 1;
      }
    }
    expect(round).toBe(4);
    expect(phases).toContain('cut');
    expect(phases).toContain('check');
    expect(phases).toContain('done');
    // 낱말 121 이 다 서 있다 — 글은 번역하지 않은 원문 그대로
    expect(svg.querySelectorAll('text').length).toBeGreaterThanOrEqual(121);
    // 운동이 끝난 뒤: 칼자리 — 마지막 판(낱말 수 · 창 32)은 덩이 4, 칼 3
    await new Promise((r) => setTimeout(r, 120));
    expect(svg.querySelectorAll('path').length).toBe(3);
    stage.destroy();
  });

  it('판이 바뀌면 앞 판의 남는 덩이를 곧바로 물린다 (반 겹침 16 → 낱말 수 24)', async () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const t = makeTranslator('en', chunkingFacet.messages);
    const stage = mountView(chunkingStageView, c, {
      config: { type: 'chunking-stage' },
      initialData: chunkingFacet.initialData,
      t,
    });
    const projector = chunkingProjector({ stage }, { getSpeed: () => 50, t });
    projector.onInit?.(chunkingFacet.initialData);
    const svg = c.querySelector('svg')!;
    const count = (role: string): number => svg.querySelectorAll(`[data-role="${role}"]`).length;
    const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 60));

    const trace = await drive([knob('rule', 1, 1), knob('size', 16, 0)]);
    // 판 경계로 가른다 — (0,24) · (1,24) · (1,16)
    const rounds: FacetRuntimeEvent[][] = [];
    for (const e of trace.events) {
      if (e.type === 'plan') rounds.push([]);
      rounds[rounds.length - 1]!.push(e);
    }
    expect(rounds.length).toBe(3);
    expect(rounds[2]![0]!.payload).toMatchObject({ rule: 1, size: 16, count: 15 });
    for (const r of rounds) for (const e of r) await projector.onEvent(e);
    await settle();
    expect(count('cup')).toBe(15);
    expect(count('twice')).toBeGreaterThan(0);
    // 반 겹침 16 → 낱말 수 24. 첫 판의 발신을 그대로 다시 먹인다 (같은 손잡이 값이면 같은 발신이다)
    const fifth = rounds[0]!;
    expect(fifth[0]!.payload).toMatchObject({ rule: 0, size: 24, count: 6 });
    // plan 만 먹인 순간부터 컵은 6, 겹침은 없다 — 앞 판의 덩이를 세지 않는다
    await projector.onEvent(fifth[0]!);
    await settle();
    expect(count('cup')).toBe(6);
    expect(count('twice')).toBe(0);
    expect(count('knife')).toBeLessThanOrEqual(6);
    // 덩이가 하나씩 설 때도 계기 chunk-count 와 어긋나지 않는다
    for (const e of fifth.slice(1)) {
      await projector.onEvent(e);
      await settle();
      expect(count('cup')).toBe(6);
      expect(count('twice')).toBe(0);
    }
    expect(count('knife')).toBe(5);
    stage.destroy();
  });
});
