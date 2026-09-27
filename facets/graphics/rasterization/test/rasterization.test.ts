// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  rasterizationAlgorithm,
  rasterizationFacet,
  rasterizationImperativeIR,
  rasterizationProjector,
  rasterizationStageView,
  rasterizeRound,
  readRasterizationData,
  type RasterizationData,
} from '../src/index.js';

const data = readRasterizationData(rasterizationFacet.initialData);

/** 사양 실측표 — 대조용 */
const TABLE: Record<string, { bMin: string; bMax: string; cB: string; dbB: number; dbA: number; pB: number; pWrong: number; line: string }> = {
  '0.05': { bMin: '0.103', bMax: '0.753', cB: '0.350', dbB: 22, dbA: 9, pB: 31, pWrong: 9, line: '6.80,8.03,4.48,6.10' },
  '0.15': { bMin: '0.180', bMax: '0.754', cB: '0.383', dbB: 20, dbA: 11, pB: 31, pWrong: 11, line: '7.00,7.86,4.92,5.55' },
  '0.35': { bMin: '0.207', bMax: '0.757', cB: '0.450', dbB: 16, dbA: 15, pB: 31, pWrong: 15, line: '7.58,7.39,6.40,3.70' },
  '0.45': { bMin: '0.209', bMax: '0.758', cB: '0.483', dbB: 11, dbA: 20, pB: 31, pWrong: 20, line: '8.04,7.02,7.77,1.99' },
  '0.6': { bMin: '0.211', bMax: '0.761', cB: '0.533', dbB: 3, dbA: 28, pB: 0, pWrong: 3, line: '9.15,6.11,10.28,2.67' },
  '0.7': { bMin: '0.212', bMax: '0.769', cB: '0.567', dbB: 0, dbA: 31, pB: 0, pWrong: 0, line: '10.52,4.98,11.16,3.86' },
};

/** 꼭짓점 차례를 돌린 데이터 (방향은 그대로) */
function rotated(d: RasterizationData, rot: number): RasterizationData {
  return {
    ...d,
    triangles: d.triangles.map((tr) => ({
      ...tr,
      vertices: [0, 1, 2].map((j) => tr.vertices[(j + rot) % 3]),
      depths: [0, 1, 2].map((j) => tr.depths[(j + rot) % 3]),
    })),
    knob: { ...d.knob, vertex: (d.knob.vertex - rot + 3) % 3 },
  };
}

function irArgs(d: RasterizationData, zb: number, mode: number): unknown[] {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const tr of d.triangles) {
    tr.vertices.forEach((v, j) => {
      xs.push(v[0]);
      ys.push(v[1]);
      zs.push(tr.id === d.knob.triangle && j === d.knob.vertex ? zb : tr.depths[j]);
    });
  }
  const n = d.width * d.height;
  return [xs, ys, zs, mode, d.width, d.height, new Array(n).fill(0), new Array(n).fill(0), new Array(n).fill(0)];
}

// ── 가짜 reactive ctx — 입력을 차례로 내주고, 다 쓰면 취소한다 ──
type Rec = { kind: 'emit'; e: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'metric'; name: string; delta: number };
async function play(inputs: { type: string; payload: unknown }[], raw: unknown = rasterizationFacet.initialData) {
  const log: Rec[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: raw as RasterizationData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      log.push({ kind: 'emit', e });
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      log.push({ kind: 'metric', name, delta });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return !cancelled;
    },
    async waitForInput() {
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
  await rasterizationAlgorithm(ctx as never);
  return log;
}

/** 판마다 끝의 계기 값 (누적을 풀어 지금 값으로) */
function metricsPerRound(log: Rec[]) {
  const now = new Map<string, number>();
  const rounds: { b: number; wrong: number }[] = [];
  for (const r of log) {
    if (r.kind === 'metric') now.set(r.name, (now.get(r.name) ?? 0) + r.delta);
    if (r.kind === 'emit' && r.e.type === 'count') rounds.push({ b: now.get('b-wins') ?? NaN, wrong: now.get('wrong-cells') ?? NaN });
  }
  return rounds;
}

describe('rasterization — 셈이 사양 표와 같다', () => {
  it('덮는 칸 · 깊이 범위 · 무게중심 · 이긴 칸 · 틀린 칸 · 만나는 선', () => {
    for (const zb of data.depthLadder) {
      const row = TABLE[String(zb)];
      const db = rasterizeRound(data, zb, 0);
      const pt = rasterizeRound(data, zb, 1);
      expect(db.cells.map((c) => c.cells.length)).toEqual([68, 55]);
      expect(db.overlap.length).toBe(31);
      expect(db.range[1].min.toFixed(3)).toBe(row.bMin);
      expect(db.range[1].max.toFixed(3)).toBe(row.bMax);
      expect(db.centroids[1].depth.toFixed(3)).toBe(row.cB);
      expect([db.countedWins, db.otherWins, db.wrong.length]).toEqual([row.dbB, row.dbA, 0]);
      expect([pt.countedWins, pt.wrong.length]).toEqual([row.pB, row.pWrong]);
      const l = db.line;
      expect(l).not.toBeNull();
      if (l) expect([l.x1, l.y1, l.x2, l.y2].map((v) => v.toFixed(2)).join(',')).toBe(row.line);
      // 깊이 버퍼는 A 다음 B 와 B 다음 A 의 끝 그림이 같다
      const swapped = rasterizeRound({ ...data, triangles: [data.triangles[1], data.triangles[0]], knob: data.knob }, zb, 0);
      expect([...swapped.truth.entries()].sort((a, b) => a[0] - b[0])).toEqual([...db.truth.entries()].sort((a, b) => a[0] - b[0]));
    }
  });

  it('겹친 칸의 깊이 차는 모두 0.005 이상 — 동률이 걸리지 않는다', () => {
    for (const zb of data.depthLadder) {
      const r = rasterizeRound(data, zb, 0);
      const za = new Map(r.cells[0].cells.map((c) => [c.k, c.z]));
      let min = Infinity;
      for (const c of r.cells[1].cells) {
        const a = za.get(c.k);
        if (a !== undefined) min = Math.min(min, Math.abs(a - c.z));
      }
      expect(min).toBeGreaterThanOrEqual(0.005);
      expect(r.centroids[0].depth).not.toBe(r.centroids[1].depth);
    }
  });

  it('사다리가 손잡이 segments 와 같다 · 격자 끝값', () => {
    const controls = (rasterizationFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const depthKnob = controls.find((c) => c.name === 'set-vertex-depth');
    const hidingKnob = controls.find((c) => c.name === 'set-hiding');
    expect(depthKnob?.segments?.map((s) => s.value)).toEqual(data.depthLadder);
    expect(hidingKnob?.segments?.map((s) => s.value)).toEqual(data.hidingModes.map((_, i) => i));
    expect(data.depthLadder).toEqual([0.05, 0.15, 0.35, 0.45, 0.6, 0.7]);
    expect(data.width * data.height).toBe(192);
  });
});

describe('rasterization — IR 이 화면과 같은 답을 낸다', () => {
  it('사다리 6 × 방식 2 × 꼭짓점 차례 돌림 3', () => {
    for (const rot of [0, 1, 2]) {
      const d = rotated(data, rot);
      for (const zb of data.depthLadder) {
        for (const mode of [0, 1]) {
          const ts = rasterizeRound(d, zb, mode).countedWins;
          const ir = runIR(rasterizationImperativeIR, 'render', irArgs(d, zb, mode) as never);
          expect(ir).toBe(ts);
          expect(ts).toBe(rasterizeRound(data, zb, mode).countedWins);
        }
      }
    }
  });

  it('TS 는 던지고 IR 은 표지를 돌려준다', () => {
    // −5 모르는 방식
    expect(runIR(rasterizationImperativeIR, 'render', irArgs(data, 0.45, 2) as never)).toBe(-5);
    expect(() => rasterizeRound(data, 0.45, 2)).toThrow();
    // −3 무게중심 동률 (0.5 는 사다리에서 뺐다)
    expect(runIR(rasterizationImperativeIR, 'render', irArgs(data, 0.5, 1) as never)).toBe(-3);
    expect(() => rasterizeRound(data, 0.5, 1)).toThrow(/무게중심/);
    // −2 깊이 동률 — B 를 A 와 같은 평면(0.5)에 둔다
    const flatB: RasterizationData = { ...data, triangles: [data.triangles[0], { ...data.triangles[1], depths: [0.5, 0.5, 0.5] }] };
    expect(runIR(rasterizationImperativeIR, 'render', irArgs(flatB, 0.5, 0) as never)).toBe(-2);
    expect(() => rasterizeRound(flatB, 0.5, 0)).toThrow(/동률/);
    // −4 꼭짓점 차례를 뒤집는다
    const flipped: RasterizationData = {
      ...data,
      triangles: [{ ...data.triangles[0], vertices: [...data.triangles[0].vertices].reverse() }, data.triangles[1]],
    };
    expect(runIR(rasterizationImperativeIR, 'render', irArgs(flipped, 0.45, 0) as never)).toBe(-4);
    expect(() => rasterizeRound(flipped, 0.45, 0)).toThrow(/차례/);
    // −1 칸 중심이 모서리 위 — A 의 한 꼭짓점을 칸 중심에 둔다
    const onEdge: RasterizationData = {
      ...data,
      triangles: [{ ...data.triangles[0], vertices: [[0.5, 0.5], [13.5, 0.5], [2.8, 11.3]] }, data.triangles[1]],
    };
    expect(runIR(rasterizationImperativeIR, 'render', irArgs(onEdge, 0.45, 0) as never)).toBe(-1);
    expect(() => rasterizeRound(onEdge, 0.45, 0)).toThrow(/모서리/);
  });
});

describe('rasterization — 알고리즘의 걸음', () => {
  it('판 머리: init → sleep(stepMs + motionMs) → 첫 phase cover, 걸음 이벤트마다 바로 앞이 그 phase', async () => {
    const log = await play([{ type: 'set-hiding', payload: { value: 1 } }]);
    const emits = log.filter((r) => r.kind !== 'metric');
    const firstInit = emits.findIndex((r) => r.kind === 'emit' && r.e.type === 'init');
    expect(firstInit).toBe(0);
    const after = emits[firstInit + 1];
    expect(after).toEqual({ kind: 'sleep', ms: data.stepMs + data.motionMs });
    const next = emits[firstInit + 2];
    expect(next.kind === 'emit' && next.e.type === 'phase' && (next.e.payload as { phase: string }).phase).toBe('cover');

    const want: Record<string, string> = { cover: 'cover', interpolate: 'interpolate', 'depth-insert': 'depth-test', order: 'order', paint: 'paint', count: 'count' };
    const events = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    const phases: string[][] = [[], []];
    let round = -1;
    events.forEach((e, i) => {
      if (e.type === 'init') {
        round += 1;
        expect(e.silent).toBe(true);
        return;
      }
      if (e.type === 'phase') {
        expect(e.silent).toBe(true);
        phases[round].push((e.payload as { phase: string }).phase);
        return;
      }
      expect(e.silent).toBeFalsy();
      const prev = events[i - 1];
      expect(prev.type).toBe('phase');
      expect((prev.payload as { phase: string }).phase).toBe(want[e.type]);
    });
    expect(phases[0]).toEqual(['cover', 'interpolate', 'depth-test', 'depth-test', 'count']);
    expect(phases[1]).toEqual(['cover', 'order', 'paint', 'paint', 'count']);
    // 재생 길이 = 2200 + 4 × 1600
    const firstRoundSleeps = log.slice(0, log.findIndex((r) => r.kind === 'emit' && r.e.type === 'count')).flatMap((r) => (r.kind === 'sleep' ? [r.ms] : []));
    expect(firstRoundSleeps.reduce((a, b) => a + b, 0)).toBe(8600);
  });

  it('계기는 회차마다 다시 센다 — 깊이 A → B → A · 방식 A → B → A', async () => {
    const log = await play([
      { type: 'set-vertex-depth', payload: { value: 0.05 } },
      { type: 'set-vertex-depth', payload: { value: 0.45 } },
      { type: 'set-hiding', payload: { value: 1 } },
      { type: 'set-vertex-depth', payload: { value: 0.6 } },
      { type: 'set-hiding', payload: { value: 0 } },
      { type: 'set-vertex-depth', payload: { value: 0.7 } },
    ]);
    expect(metricsPerRound(log)).toEqual([
      { b: 11, wrong: 0 },
      { b: 22, wrong: 0 },
      { b: 11, wrong: 0 },
      { b: 31, wrong: 20 },
      { b: 0, wrong: 3 },
      { b: 3, wrong: 0 },
      { b: 0, wrong: 0 },
    ]);
    // 첫 판에 두 계기가 모두 실린다
    const names = new Set(log.flatMap((r) => (r.kind === 'metric' ? [r.name] : [])));
    expect([...names].sort()).toEqual(['b-wins', 'wrong-cells']);
  });

  it('제 손잡이의 사다리 밖 값은 던지고, 남의 입력은 흘린다', async () => {
    await expect(play([{ type: 'set-vertex-depth', payload: { value: 0.5 } }])).rejects.toThrow(/사다리/);
    await expect(play([{ type: 'set-hiding', payload: { value: 2 } }])).rejects.toThrow(/가림 방식/);
    const log = await play([{ type: 'someone-else', payload: { value: 1 } }]);
    expect(log.filter((r) => r.kind === 'emit' && r.e.type === 'count')).toHaveLength(1);
  });
});

describe('rasterization — 무대', () => {
  async function mountAndFeed() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(rasterizationStageView, container, { config: { type: 'rasterization-stage' }, locale: 'ko', t: makeTranslator('ko', rasterizationFacet.messages) });
    const proj = rasterizationProjector({ stage });
    const log = await play([{ type: 'set-hiding', payload: { value: 1 } }]);
    const events = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    return { container, stage, proj, events };
  }

  it('첫 그림을 두 번 먹여도 요소 수가 같다 (멱등)', async () => {
    const { container, proj, events } = await mountAndFeed();
    const init = events[0];
    proj.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    // 한 판을 끝까지 그린 뒤 되감고 다시 먹여도 같다
    for (const e of events.slice(0, events.findIndex((e) => e.type === 'count') + 1)) proj.onEvent(e);
    proj.onReset?.();
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
  });

  it('두 판을 끝까지 그린다 — 틀린 칸 표지 수가 계기와 같다', async () => {
    const { container, proj, events } = await mountAndFeed();
    for (const e of events) proj.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('화가 알고리즘');
    // 화가 판 (0.45): 틀린 칸 20 에 표지
    const wrongMarks = container.querySelectorAll('[data-mark="wrong"]');
    expect(wrongMarks).toHaveLength(20);
  });

  it('화가 판 끝 캡션은 틀린 칸 수로 갈린다 — 0.45 는 선이 가른다, 0.70 은 다른 칸이 없다', async () => {
    const container = document.createElement('div');
    const stage = mountView(rasterizationStageView, container, { config: { type: 'rasterization-stage' }, locale: 'ko', t: makeTranslator('ko', rasterizationFacet.messages) });
    const proj = rasterizationProjector({ stage });
    const log = await play([
      { type: 'set-hiding', payload: { value: 1 } },
      { type: 'set-vertex-depth', payload: { value: 0.7 } },
    ]);
    const events = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    const counts = events.map((e, i) => (e.type === 'count' ? i : -1)).filter((i) => i >= 0);
    for (const e of events.slice(0, counts[1] + 1)) proj.onEvent(e);
    expect(container.textContent).toContain('실선은 깊이 버퍼가 가르는 자리다');
    for (const e of events.slice(counts[1] + 1)) proj.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('깊이 버퍼와 다른 칸이 없다.');
    expect(text).not.toContain('실선은');
    expect(container.querySelectorAll('[data-mark="wrong"]')).toHaveLength(0);
  });

  it('모르는 이벤트와 빈 payload 는 던진다', async () => {
    const { proj } = await mountAndFeed();
    expect(() => proj.onEvent({ type: 'mystery' })).toThrow();
    expect(() => proj.onEvent({ type: 'cover', payload: {} })).toThrow();
  });
});
