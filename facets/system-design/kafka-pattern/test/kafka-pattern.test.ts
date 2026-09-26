// @vitest-environment happy-dom
/**
 * Kafka 패턴 — facet 고유 검수.
 *   ① IR ↔ algorithm 10 조합 (사양 실측표 대조)
 *   ② 걸음마다 대표 phase 가 그 걸음 이벤트 바로 앞
 *   ③ retention −1 · every 0 → IR −1, TS 는 던진다
 *   ④ 틱 24 · 사다리 끝값 · 사다리 = segments
 *   ⑤ 회차별 계기 (손잡이 A → B → A)
 *   ⑥ 첫 그림을 두 번 먹여도 무대 요소 수가 같다
 * 섞기 검수는 해당 없음 — IR 이 받는 배열은 result 버퍼 하나뿐이고 기록 값을 받지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  kafkaPatternAlgorithm,
  kafkaPatternFacet,
  kafkaPatternImperativeIR,
  kafkaPatternProjector,
  kafkaPatternStageView,
  narrowKafkaPatternData,
  runKafka,
  type KafkaPatternData,
} from '../src/index.js';

const data = narrowKafkaPatternData(kafkaPatternFacet.initialData);

/** 사양 실측표: 보존 → [batch 잃음, 첫 튕김 틱(0 = 없음), 되감아 다시 읽을 수, batch 밀림, 끝 로그 앞] */
const TABLE: Record<number, Record<number, [number, number, number, number, number]>> = {
  2: {
    4: [9, 8, 4, 3, 20],
    8: [5, 16, 8, 7, 16],
    12: [1, 24, 12, 11, 12],
    16: [0, 0, 16, 12, 8],
    0: [0, 0, 24, 12, 0],
  },
  3: {
    4: [13, 6, 4, 3, 20],
    8: [9, 12, 8, 7, 16],
    12: [5, 18, 12, 11, 12],
    16: [1, 24, 16, 15, 8],
    0: [0, 0, 24, 16, 0],
  },
};

type Recorded = { events: FacetRuntimeEvent[]; runEnds: Record<string, number>[]; order: string[] };

/** 가짜 reactive ctx — 입력 목록을 다 쓰면 취소한다 */
async function play(inputs: { type: string; value: number }[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const totals: Record<string, number> = {};
  const runEnds: Record<string, number>[] = [];
  const order: string[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      order.push(e.type);
      if (e.type === 'rewind') runEnds.push({ ...totals });
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      totals[name] = (totals[name] ?? 0) + delta;
    },
    async sleep() {
      order.push('sleep');
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<KafkaPatternData>;
  await kafkaPatternAlgorithm(ctx);
  return { events, runEnds, order };
}

describe('kafkaPattern — IR ↔ algorithm ↔ 사양 표', () => {
  for (const every of data.everies) {
    for (const retention of data.retentions) {
      it(`보존 ${retention} · 간격 ${every}`, () => {
        const run = runKafka(data.values, retention, every, data.rewindTo);
        const buf = [0, 0, 0, 0];
        const ret = runIR(kafkaPatternImperativeIR, 'kafkaRun', [data.values.length, retention, every, buf]);
        expect(buf).toEqual(run.result);
        expect(ret).toBe(run.result[0]);

        const row = TABLE[every]?.[retention];
        if (!row) throw new Error('표에 없는 조합');
        const [lost, firstSkip, replay, lag, start] = row;
        const last = run.ticks[run.ticks.length - 1];
        if (!last) throw new Error('틱 없음');
        const skips = run.ticks.filter((s) => s.skipped > 0);
        expect(run.result).toEqual([lost, 0, replay, lag]);
        expect(skips.length).toBe(lost); // 튕김은 늘 1 칸
        expect(skips.every((s) => s.skipped === 1)).toBe(true);
        expect(skips[0]?.tick ?? 0).toBe(firstSkip);
        expect(last.start).toBe(start);
        expect(last.end).toBe(24);
        expect(run.replayFrom).toBe(start);
      });
    }
  }

  it('벗어난 손잡이 값 — TS 는 던지고 IR 은 −1', () => {
    expect(() => runKafka(data.values, -1, 2, 0)).toThrow();
    expect(() => runKafka(data.values, 8, 0, 0)).toThrow();
    expect(runIR(kafkaPatternImperativeIR, 'kafkaRun', [24, -1, 2, [0, 0, 0, 0]])).toBe(-1);
    expect(runIR(kafkaPatternImperativeIR, 'kafkaRun', [24, 8, 0, [0, 0, 0, 0]])).toBe(-1);
  });

  it('데이터 크기 · 사다리 끝값 · 사다리 = segments', () => {
    expect(data.values).toHaveLength(24);
    expect(data.retentions).toEqual([4, 8, 12, 16, 0]);
    expect(data.everies).toEqual([2, 3]);
    const controls = (kafkaPatternFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments;
    expect(seg('retention')?.map((s) => s.value)).toEqual(data.retentions);
    expect(seg('every')?.map((s) => s.value)).toEqual(data.everies);
    expect(seg('retention')?.find((s) => s.default)?.value).toBe(data.retention);
    expect(seg('every')?.find((s) => s.default)?.value).toBe(data.every);
  });
});

describe('kafkaPattern — algorithm 재생', () => {
  it('걸음마다 대표 phase 가 바로 앞 · 기본 판에서 phase 다섯이 켜진다 · 25 걸음', async () => {
    const { events } = await play([]);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(25);
    const seen = new Set<string>();
    events.forEach((e, i) => {
      if (e.silent) return;
      const before = events[i - 1];
      expect(before?.type).toBe('phase');
      seen.add((before?.payload as { phase: string }).phase);
    });
    expect([...seen].sort()).toEqual(['append', 'read', 'rewind', 'skip', 'trim']);
    // IR 의 phase 집합과 같다
    const irPhases = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) {
        const o = x as Record<string, unknown>;
        if (typeof o.phase === 'string') irPhases.add(o.phase);
        Object.values(o).forEach(walk);
      }
    };
    walk(kafkaPatternImperativeIR.functions);
    expect([...irPhases].sort()).toEqual([...seen].sort());
    // 기본 판의 튕김 틱
    const skipTicks = steps
      .filter((e) => e.type === 'tick' && (e.payload as { skipped: number }).skipped > 0)
      .map((e) => (e.payload as { tick: number }).tick);
    expect(skipTicks).toEqual([16, 18, 20, 22, 24]);
    const rewind = steps[24]?.payload as { offset: number };
    expect(rewind.offset).toBe(16);
  });

  it('판 머리 init 뒤 첫 틱 전에 걸음 경계가 있다 — 보존 틀 폭 운동이 끊기지 않는다', async () => {
    const { order } = await play([{ type: 'retention', value: 4 }]);
    const inits = order.flatMap((type, i) => (type === 'init' ? [i] : []));
    expect(inits).toHaveLength(2);
    for (const i of inits) {
      expect(order[i + 1]).toBe('sleep');
      expect(order[i + 2]).toBe('phase');
      expect(order[i + 3]).toBe('tick');
    }
  });

  it('회차별 계기 — 보존 8 → 4 → 8, 간격 3', async () => {
    const { runEnds } = await play([
      { type: 'retention', value: 4 },
      { type: 'retention', value: 8 },
      { type: 'every', value: 3 },
      { type: 'retention', value: 0 },
    ]);
    const expected: [number, number][] = [
      [2, 8],
      [2, 4],
      [2, 8],
      [3, 8],
      [3, 0],
    ];
    expect(runEnds).toHaveLength(expected.length);
    runEnds.forEach((m, i) => {
      const pair = expected[i];
      if (!pair) throw new Error('회차 없음');
      const row = TABLE[pair[0]]?.[pair[1]];
      if (!row) throw new Error('표 없음');
      expect(m).toEqual({ 'batch-lost': row[0], 'live-lost': 0, 'batch-lag': row[3], retained: row[2] });
    });
  });

  it('사다리 밖 입력과 남의 입력은 흘린다', async () => {
    const { runEnds } = await play([
      { type: 'retention', value: 5 },
      { type: 'speed', value: 2 },
      { type: 'every', value: 3 },
    ]);
    expect(runEnds).toHaveLength(2);
    expect(runEnds[1]?.['batch-lost']).toBe(9);
  });
});

describe('kafkaPattern — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, 한 판을 끝까지 그린다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(kafkaPatternStageView, container, { config: {}, initialData: kafkaPatternFacet.initialData, locale: 'ko' });
    const projector = kafkaPatternProjector({ stage }, { getSpeed: () => 1, t: (_k, fallback) => fallback });
    const { events } = await play([]);
    const init = events.find((e) => e.type === 'init');
    if (!init) throw new Error('init 없음');
    await projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of events) await projector.onEvent(e);
    const lostMarks = container.querySelectorAll('line[stroke]').length;
    expect(lostMarks).toBeGreaterThan(0);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });

  it('모르는 이벤트 · 빈 payload 는 던진다', () => {
    const container = document.createElement('div');
    const stage = mountView(kafkaPatternStageView, container, { config: {} });
    const projector = kafkaPatternProjector({ stage });
    expect(() => projector.onEvent({ type: 'what' })).toThrow();
    expect(() => projector.onEvent({ type: 'tick', payload: {} })).toThrow();
    stage.destroy();
  });
});
