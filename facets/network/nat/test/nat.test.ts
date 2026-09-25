// @vitest-environment happy-dom
/**
 * nat 고유의 주장 — IR ↔ algorithm 열두 조합 · 사양 표 · 회차별 계기 · 사다리 · 화면에 남는 수.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  natAlgorithm,
  natFacet,
  natImperativeIR,
  natPlay,
  natProjector,
  natStageView,
  REMOTE_SERVER,
  REMOTE_STRANGER,
  type NatData,
} from '../src/index.js';

const data = natFacet.initialData as NatData;

/** 사양 표 — [rewrite][key][기기 수 - 1] = sent-out · blocked · replies-back · stray-in */
const SPEC: number[][][][] = [
  [
    [[1, 0, 1, 1], [1, 1, 1, 1], [1, 2, 1, 1]],
    [[1, 0, 1, 0], [1, 1, 1, 0], [1, 2, 1, 0]],
  ],
  [
    [[1, 0, 1, 1], [2, 0, 2, 1], [3, 0, 3, 1]],
    [[1, 0, 1, 0], [2, 0, 2, 0], [3, 0, 3, 0]],
  ],
];
/** 사양의 got — [rewrite][key][기기 수 - 1] */
const SPEC_GOT: number[][][][] = [
  [
    [[2], [2, 0], [2, 0, 0]],
    [[1], [1, 0], [1, 0, 0]],
  ],
  [
    [[2], [2, 1], [2, 1, 1]],
    [[1], [1, 1], [1, 1, 1]],
  ],
];

const combos: [number, number, number][] = [];
for (const mode of [0, 1]) for (const key of [0, 1]) for (const n of data.deviceLadder) combos.push([mode, key, n]);

function irRun(mode: number, key: number, n: number) {
  const zeros = () => new Array<number>(n).fill(0);
  const devPort = data.devices.slice(0, n).map((d) => d.port);
  const devRemote = new Array<number>(n).fill(REMOTE_SERVER);
  const rowPub = zeros();
  const rowDev = zeros();
  const rowRemote = zeros();
  const got = zeros();
  const tally = [0, 0, 0, 0, 0];
  const rows = runIR(natImperativeIR, 'natRun', [
    mode,
    key,
    devPort,
    devRemote,
    rowPub,
    rowDev,
    rowRemote,
    got,
    REMOTE_STRANGER,
    data.firstPort,
    tally,
  ]);
  return { rows, rowPub, rowDev, rowRemote, got, tally };
}

describe('nat — IR 과 알고리즘', () => {
  it.each(combos)('rewrite %i · key %i · 기기 %i — out 다섯 · 줄 수 · 공인 포트 열 · got 이 같다', (mode, key, n) => {
    const play = natPlay(data, mode, key, n);
    const ir = irRun(mode, key, n);
    expect(ir.rows).toBe(play.rowPub.length);
    expect(ir.tally).toEqual(play.tally);
    expect(ir.rowPub.slice(0, play.rowPub.length)).toEqual(play.rowPub);
    expect(ir.rowDev.slice(0, play.rowDev.length)).toEqual(play.rowDev);
    expect(ir.got).toEqual(play.got);
    // 사양 표와도
    const m = SPEC[mode]?.[key]?.[n - 1];
    expect([play.tally[0], play.tally[1], play.tally[2], play.tally[3]]).toEqual(m);
    expect(play.tally[3]! + play.tally[4]!).toBe(1);
    expect(play.got).toEqual(SPEC_GOT[mode]?.[key]?.[n - 1]);
    // 걸음 수 = 나감 n + 줄 수 + 낯선 것 1
    expect(play.steps.length).toBe(n + play.rowPub.length + 1);
  });

  it('공인 포트 열 — 주소만이면 51000 한 줄, 주소+포트면 40001 부터', () => {
    expect(natPlay(data, 0, 0, 3).rowPub).toEqual([51000]);
    expect(natPlay(data, 1, 1, 3).rowPub).toEqual([40001, 40002, 40003]);
    expect(natPlay(data, 1, 0, 2).rowPub).toEqual([40001, 40002]);
  });

  it('기본 판의 걸음 차례가 사양과 같다', () => {
    const steps = natPlay(data, 0, 0, 3).steps;
    expect(steps.map((s) => (s.kind === 'out' ? `${s.kind}:${s.outcome}` : `${s.kind}:${s.found}`))).toEqual([
      'out:write',
      'out:block',
      'out:block',
      'reply:0',
      'stray:0',
    ]);
  });

  it('사다리가 segments 와 같고 매개변수 배열 길이가 사다리 끝값이다', () => {
    const controls = (natFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const values = (name: string) => controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(values('devices')).toEqual(data.deviceLadder);
    expect(values('rewrite')).toEqual(data.modes.map((_, i) => i));
    expect(values('key')).toEqual(data.keys.map((_, i) => i));
    expect(data.deviceLadder[data.deviceLadder.length - 1]).toBe(data.devices.length);
    expect(data.devices.length).toBe(3);
  });
});

type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 돌려 판마다 계기의 지금 값을 모은다 */
async function drive(inputs: Input[]): Promise<{ metrics: Record<string, number>[]; events: FacetRuntimeEvent[][] }> {
  const totals: Record<string, number> = {};
  const metrics: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[][] = [[]];
  const queue = [...inputs];
  let cancelled = false;
  let finish!: () => void;
  const idle = new Promise<void>((r) => (finish = r));
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as NatData,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events[events.length - 1]!.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      metrics.push({ ...totals });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        finish();
        return new Promise<never>(() => {});
      }
      events.push([]);
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<NatData>;
  void natAlgorithm(ctx);
  await idle;
  return { metrics, events };
}

const knob = (type: string, value: number): Input => ({ type, payload: { value } });

describe('nat — 회차별 계기', () => {
  it('rewrite 0 → 1 → 0 · key 0 → 1 → 0 · devices 3 → 1 → 2 → 3 가 판마다 사양 표와 같다', async () => {
    const plan: [Input | null, [number, number, number]][] = [
      [null, [0, 0, 3]],
      [knob('rewrite', 1), [1, 0, 3]],
      [knob('rewrite', 0), [0, 0, 3]],
      [knob('key', 1), [0, 1, 3]],
      [knob('rewrite', 1), [1, 1, 3]],
      [knob('devices', 1), [1, 1, 1]],
      [knob('devices', 2), [1, 1, 2]],
      [knob('key', 0), [1, 0, 2]],
      [knob('devices', 9), [1, 0, 2]], // 사다리 밖은 흘린다 — 판이 바뀌지 않고 계기도 그대로다
      [knob('rewrite', 0), [0, 0, 2]],
    ];
    const inputs = plan.map((p) => p[0]).filter((p): p is Input => p !== null);
    const { metrics } = await drive(inputs);
    // 입력 대기마다 한 번씩 찍힌다 — 흘린 입력 뒤의 대기도 한 번이다
    expect(metrics.length).toBe(plan.length);
    plan.forEach(([, [mode, key, n]], i) => {
      const m = metrics[i]!;
      expect([m['sent-out'], m['blocked'], m['replies-back'], m['stray-in']]).toEqual(SPEC[mode]?.[key]?.[n - 1]);
    });
  });

  it('첫 판에 계기 넷이 모두 실린다', async () => {
    const { metrics } = await drive([]);
    expect(Object.keys(metrics[0]!).sort()).toEqual(['blocked', 'replies-back', 'sent-out', 'stray-in']);
  });
});

describe('nat — 화면에 남는 수', () => {
  async function screenAfter(mode: number, key: number, n: number): Promise<string> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', natFacet.messages);
    const stage = mountView(natStageView, container, {
      config: { type: 'nat-stage' },
      initialData: natFacet.initialData,
      locale: 'en',
      t,
      isInstant: () => true,
    });
    const projector = natProjector({ stage }, { getSpeed: () => 1, t });
    const input: Input[] = [];
    if (mode !== 0) input.push(knob('rewrite', mode));
    if (key !== 0) input.push(knob('key', key));
    if (n !== 3) input.push(knob('devices', n));
    const { events } = await drive(input);
    for (const e of events[events.length - 1]!) await projector.onEvent(e);
    const text = container.textContent ?? '';
    stage.destroy();
    container.remove();
    return text;
  }

  it('주소만 × 받는 포트 × 기기 셋 — 막힘 표지 둘, 첫 기기가 둘을 받는다', async () => {
    const s = await screenAfter(0, 0, 3);
    expect(s.match(/✗ blocked/g)?.length).toBe(2);
    expect(s).toContain('Got: 2');
    expect(s).not.toContain('✗ dropped');
  });

  it('주소+포트 × 포트+먼 쪽 × 기기 셋 — 40001 · 40002 · 40003, 낯선 것은 버림', async () => {
    const s = await screenAfter(1, 1, 3);
    for (const p of ['40001', '40002', '40003']) expect(s).toContain(p);
    expect(s.match(/✗ dropped/g)?.length).toBe(1);
    expect(s).not.toContain('✗ blocked');
    expect(s.match(/Got: 1/g)?.length).toBe(3);
  });
});
