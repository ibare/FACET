// @vitest-environment happy-dom
/**
 * three-way-merge — facet 고유의 주장.
 *
 * 1. 열두 칸에서 runIR 의 반환 · stats = algorithm 의 계기 = 사양 표 (덩이 · 결과 파일까지)
 * 2. 같은 길로 세는가 — 조각 셋의 파일과 칸끼리 ours/theirs 를 바꿔 넣은 432 벌에서 IR = algorithm
 * 3. 회차별 계기 — theirs 4 → 2 → 4 (한 줄 고침)
 * 4. 사다리 = segments, theirsLines 길이 = base 길이 = 사다리 끝값
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  conflictBlocks,
  keepArray,
  mergeThree,
  oursFile,
  theirsFile,
  threeWayMergeAlgorithm,
  threeWayMergeFacet,
  threeWayMergeImperativeIR,
  threeWayMergeStageView,
  type Chunk,
  type ThreeWayMergeData,
  type ThreeWayMergeStage,
} from '../src/index.js';

const data = threeWayMergeFacet.initialData as ThreeWayMergeData;

function idsOf(...files: string[][]): number[][] {
  const table = new Map<string, number>();
  return files.map((f) =>
    f.map((line) => {
      if (!table.has(line)) table.set(line, table.size);
      return table.get(line)!;
    }),
  );
}

function irCount(base: string[], ours: string[], theirs: string[]): [number, number, number] {
  const [b, o, t] = idsOf(base, ours, theirs);
  const stats = [0, 0];
  const conflicts = runIR(threeWayMergeImperativeIR, 'mergeChunks', [b!, o!, t!, keepArray(b!, o!), keepArray(b!, t!), stats]);
  return [conflicts as number, stats[0]!, stats[1]!];
}

function algoCount(base: string[], ours: string[], theirs: string[]): [number, number, number] {
  const m = mergeThree(base, ours, theirs, data.markers);
  return [m.conflicts, m.lines.length, m.stable.length];
}

function spans(chunks: Chunk[]): string {
  let p = 1;
  return chunks
    .map((c) => {
      const n = c.baseEnd - c.baseStart;
      const span = n > 1 ? `${p}..${p + n - 1}` : n === 1 ? `${p}` : `(${p - 1}|${p})`;
      p += n;
      return `${span}:${c.verdict}`;
    })
    .join(' ');
}

// 사양 실측표 — [act, t, stable-lines, conflicts, result-lines, 덩이]
const TABLE: [number, number, number, number, number, string][] = [
  [0, 1, 4, 0, 6, '1:theirs 2..3:stable 4:ours 5..6:stable'],
  [0, 2, 4, 0, 6, '1:stable 2:theirs 3:stable 4:ours 5..6:stable'],
  [0, 3, 4, 1, 11, '1..2:stable 3..4:conflict 5..6:stable'],
  [0, 4, 5, 1, 10, '1..3:stable 4:conflict 5..6:stable'],
  [0, 5, 4, 1, 11, '1..3:stable 4..5:conflict 6:stable'],
  [0, 6, 4, 0, 6, '1..3:stable 4:ours 5:stable 6:theirs'],
  [1, 1, 4, 1, 11, '1..2:conflict 3..5:stable (5|6):ours 6:stable'],
  [1, 2, 4, 1, 11, '1..2:conflict 3..5:stable (5|6):ours 6:stable'],
  [1, 3, 3, 1, 12, '1..3:conflict 4..5:stable (5|6):ours 6:stable'],
  [1, 4, 3, 0, 6, '1..2:ours 3:stable 4:theirs 5:stable (5|6):ours 6:stable'],
  [1, 5, 3, 1, 10, '1..2:ours 3..4:stable 5:conflict 6:stable'],
  [1, 6, 3, 1, 10, '1..2:ours 3..5:stable 6:conflict'],
];

type Input = { type: string; payload: { value: number } };

/** 알고리즘을 입력 차례대로 돌려 판마다 계기 (누적 = 화면에 보이는 값) 를 모은다. */
async function rounds(inputs: Input[]): Promise<Map<string, number>[]> {
  const totals = new Map<string, number>();
  const out: Map<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as ThreeWayMergeData,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(_e: FacetRuntimeEvent) {},
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      out.push(new Map(totals));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: '__end' };
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await threeWayMergeAlgorithm(ctx as unknown as FacetContext<ThreeWayMergeData>);
  return out;
}

describe('three-way-merge', () => {
  it('열두 칸 — runIR = algorithm = 사양 표 (덩이까지)', async () => {
    for (const [act, t, stable, conflicts, resultLines, chunkText] of TABLE) {
      const ours = oursFile(data, act);
      const theirs = theirsFile(data, t);
      const m = mergeThree(data.base, ours, theirs, data.markers);
      expect(spans(m.chunks), `act ${act} t ${t}`).toBe(chunkText);
      expect(algoCount(data.base, ours, theirs)).toEqual([conflicts, resultLines, stable]);
      expect(irCount(data.base, ours, theirs)).toEqual([conflicts, resultLines, stable]);
    }
    // 알고리즘이 실제로 내는 계기 — 칸마다 손잡이로 옮겨 가며
    const inputs: Input[] = [];
    for (const [act, t] of TABLE) {
      inputs.push({ type: 'ours', payload: { value: act } });
      inputs.push({ type: 'theirs', payload: { value: t } });
    }
    const got = await rounds(inputs);
    TABLE.forEach(([, , stable, conflicts, resultLines], i) => {
      const r = got[2 * (i + 1)]!;
      expect([r.get('stable-lines'), r.get('conflicts'), r.get('result-lines')]).toEqual([stable, conflicts, resultLines]);
    });
  });

  it('기본 칸의 결과 파일', () => {
    const m = mergeThree(data.base, oursFile(data, 0), theirsFile(data, 4), data.markers);
    expect(m.lines.map((l) => l.text)).toEqual([
      'let rate = 2',
      'let fee = 5',
      'function cost(n)',
      '<<<<<<< ours',
      '    let c = n * rate * 2',
      '=======',
      '    let c = n + rate',
      '>>>>>>> theirs',
      '    return c + fee',
      'show cost(3)',
    ]);
    expect(new Set(m.lines.map((l) => l.key)).size).toBe(m.lines.length);
  });

  it('같은 길로 센다 — 조각 셋의 파일', () => {
    const B = data.base;
    expect(
      algoCount(
        B,
        ['let rate = 2', 'let fee = 7', 'function cost(n)', '    let c = n * rate', '    return c + fee', 'show cost(4)'],
        ['let rate = 2', 'let fee = 5', 'function cost(n)', '    let c = n + rate', '    return c + fee', 'show cost(3)'],
      ),
    ).toEqual([0, 6, 3]);
    const sets: [string[], string[], string[], [number, number, number] | null][] = [
      [
        ['let limit = 10', 'let step = 2', 'function next(n)', '    return n + step', 'show next(1)'],
        ['let limit = 20', 'let step = 2', 'function next(n)', '    return n * step', 'show next(1)'],
        ['let limit = 10', 'let step = 2', 'function next(n)', '    return n - step', 'show next(1)'],
        [1, 9, 3],
      ],
      [
        ['let w = 4', 'let h = 2', 'let area = w * h', 'show w', 'show area'],
        ['let w = 4', 'let h = 5', 'let area = w * h', 'show w', 'show area'],
        ['let w = 4', 'let h = 2', 'let area = w * h', 'show area', 'show h'],
        [0, 5, 3],
      ],
    ];
    for (const [b, o, t, want] of sets) {
      expect(algoCount(b, o, t)).toEqual(want);
      expect(irCount(b, o, t)).toEqual(want);
    }
  });

  it('같은 길로 센다 — 칸끼리 바꿔 넣은 432 벌 (same 포함)', () => {
    const cells = TABLE.map(([act, t]) => ({ ours: oursFile(data, act), theirs: theirsFile(data, t) }));
    let n = 0;
    let sameSeen = 0;
    for (const c1 of cells) {
      for (const c2 of cells) {
        for (const [o, th] of [
          [c1.theirs, c1.ours],
          [c1.ours, c2.theirs],
          [c2.theirs, c1.theirs],
        ] as [string[], string[]][]) {
          expect(irCount(data.base, o, th)).toEqual(algoCount(data.base, o, th));
          if (mergeThree(data.base, o, th, data.markers).chunks.some((c) => c.verdict === 'same')) sameSeen += 1;
          n += 1;
        }
      }
    }
    expect(n).toBe(432);
    expect(sameSeen).toBeGreaterThan(0);
  });

  it('회차별 계기 — theirs 4 → 2 → 4', async () => {
    const got = await rounds([
      { type: 'theirs', payload: { value: 2 } },
      { type: 'theirs', payload: { value: 4 } },
    ]);
    const seq = got.map((r) => [r.get('stable-lines'), r.get('conflicts'), r.get('result-lines')]);
    expect(seq).toEqual([
      [5, 1, 10],
      [4, 0, 6],
      [5, 1, 10],
    ]);
  });

  it('사다리 = segments, 매개변수 배열 길이', () => {
    const controls = (threeWayMergeFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const knob = (action: string) => controls.find((c) => c.action === action) as { segments: { value: number; default?: boolean }[] };
    expect(knob('theirs').segments.map((s) => s.value)).toEqual(data.theirsLadder);
    expect(knob('ours').segments.map((s) => s.value)).toEqual(data.oursActions.map((_, i) => i));
    expect(knob('theirs').segments.find((s) => s.default)?.value).toBe(data.defaultT);
    expect(knob('ours').segments.find((s) => s.default)?.value).toBe(data.defaultAct);
    expect(data.theirsLines.length).toBe(6);
    expect(data.base.length).toBe(6);
    expect(data.theirsLadder[data.theirsLadder.length - 1]).toBe(6);
    expect(data.oursFiles.length).toBe(data.oursActions.length);
    // 결과 자리 12 줄 = 열두 칸 결과의 가장 긴 것
    const longest = Math.max(...TABLE.map(([, , , , r]) => r));
    expect(longest).toBe(12);
  });

  it('무대 — 한 판을 받아 그린다', () => {
    const container = document.createElement('div');
    const stage = mountView(threeWayMergeStageView, container, {
      config: {},
      initialData: data,
      locale: 'ko',
      t: makeTranslator('ko'),
    }) as unknown as ThreeWayMergeStage;
    const ours = oursFile(data, 1);
    const theirs = theirsFile(data, 3);
    const m = mergeThree(data.base, ours, theirs, data.markers);
    stage.round({ act: 'move', line: 3, base: data.base, ours, theirs, theirsEdited: 2, move: data.oursMove }, 0);
    stage.touched(m, 0);
    stage.chunks(m.chunks, 0);
    stage.conflict(conflictBlocks(m), '1–3', 1, 3, 0);
    stage.result(m.lines, m.conflicts, 0);
    const texts = Array.from(container.querySelectorAll('text')).map((n) => n.textContent);
    expect(texts).toContain('>>>>>>> theirs');
    stage.destroy();
  });
});
