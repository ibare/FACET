/**
 * 손잡이 네 값에서 화면이 말하는 수를 잠근다.
 *
 * 잠그는 것은 끝 상태가 아니라 **회차마다**다. `ctx.metric` 은 누적 채널이고
 * 러너는 되감기 때만 계기를 비우므로, 차이를 보내지 않고 값을 그대로 보내면
 * 회차를 거듭할수록 수가 쌓인다. 그 붕괴는 마지막 회차만 보면 안 잡히고
 * (층 4 의 값이 층 1~3 의 합만큼 부풀어도 "큰 수" 로 보일 뿐이다) 회차별로
 * 떠야 드러난다.
 *
 * 표는 좌표에서 셈한 것이다 — 사양이 준 수를 옮겨 적은 것이 아니라, 같은
 * 규칙으로 독립으로 돌려 나온 값과 맞댔다.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { FacetContext, MetricDelta, ReactiveInputEvent } from '@ffacet/core/runtime';
import { clearRegistry, mountView, runFacet } from '@ffacet/core/runtime';
import { registerHnsw } from '../src/index.js';
import { computeHnswRound, hnswAlgorithm, type HnswData } from '../src/algorithm.js';
import { hnswFacet } from '../src/facet.js';
import {
  hnswStageView,
  type HnswStageFrame,
  type HnswStageScene,
  type HnswStageWalker,
} from '../src/hnsw-stage.js';

/** 선언을 그대로 쓴다 — 좌표가 바뀌면 이 검사가 먼저 깨져야 한다. */
const DATA = hnswFacet.initialData as unknown as HnswData;

/**
 * 표를 첫 칸부터 훑으려면 층 1 에서 시작해야 한다. 선언의 기본값은 3 이고
 * (화면은 다 맞히는 자리에서 열린다) 그것이 슬라이더의 기본 구간과 같은지는
 * 아래 따로 잰다.
 */
const FROM_ONE = { ...DATA, levels: 1 } as HnswData;

const ENTRIES = ['v0', 'v4', 'v8', 'v12', 'v16', 'v20'];

const TABLE = [
  { levels: 1, hits: 1, seenSum: 34, seen: [6, 5, 5, 6, 6, 6], landed: ['v5', 'v5', 'v8', 'v13', 'v13', 'v18'] },
  { levels: 2, hits: 2, seenSum: 49, seen: [9, 9, 8, 8, 8, 7], landed: ['v13', 'v13', 'v18', 'v13', 'v13', 'v18'] },
  { levels: 3, hits: 6, seenSum: 65, seen: [11, 11, 11, 11, 11, 10], landed: ['v18', 'v18', 'v18', 'v18', 'v18', 'v18'] },
  { levels: 4, hits: 6, seenSum: 66, seen: [11, 11, 11, 11, 11, 11], landed: ['v18', 'v18', 'v18', 'v18', 'v18', 'v18'] },
];

const TRUTH = 'v18';

type Emitted = { type: string; payload: unknown };
type MetricCall = { round: number; name: string; delta: number; value: number };

type Recorded = {
  events: Emitted[];
  metrics: MetricCall[];
  /** 회차별 이벤트 — `layers-set` 에서 `round-done` 까지. */
  rounds: Emitted[][];
};

/**
 * 러너의 reactive 메커니즘을 대신한다. 잠자기는 곧바로 깨우고, 입력은 미리
 * 정해 둔 층 수를 차례로 준다. 다 떨어지면 취소로 접는다 —
 * `ReactiveMechanism.waitForInput` 이 취소 때 그렇게 reject 한다.
 */
async function play(data: HnswData, sequence: number[]): Promise<Recorded> {
  const events: Emitted[] = [];
  const metrics: MetricCall[] = [];
  const state = new Map<string, number>();
  const queue = [...sequence];
  let cancelled = false;
  let round = 0;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown }): Promise<void> {
      if (cancelled) return;
      if (event.type === 'layers-set') round += 1;
      events.push({ type: event.type, payload: event.payload });
    },
    metric(name: string, delta: MetricDelta): void {
      const step = delta === 'inc' ? 1 : delta;
      const value = (state.get(name) ?? 0) + step;
      state.set(name, value);
      metrics.push({ round, name, delta: step, value });
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    async waitForInput<T extends ReactiveInputEvent>(): Promise<T> {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'levels', payload: { value: next } } as T;
    },
    pollInput(): null {
      return null;
    },
  };

  await hnswAlgorithm(ctx as unknown as FacetContext<HnswData>);

  const rounds: Emitted[][] = [];
  for (const e of events) {
    if (e.type === 'layers-set') rounds.push([]);
    rounds[rounds.length - 1]?.push(e);
  }
  return { events, metrics, rounds };
}

function walkersOf(e: Emitted): Array<{ at: string; seen: string[]; done: boolean }> {
  const p = e.payload as { walkers?: unknown };
  return Array.isArray(p.walkers)
    ? (p.walkers as Array<{ at: string; seen: string[]; done: boolean }>)
    : [];
}

describe('HNSW 한 회차의 셈', () => {
  it('층 네 값에서 정답 수와 본 점이 표와 같다', () => {
    const got = TABLE.map(({ levels }) => {
      const r = computeHnswRound(DATA, levels);
      return {
        levels,
        hits: r.hits,
        seenSum: r.seenSum,
        seen: r.walks.map((w) => w.seenCount),
        landed: r.walks.map((w) => w.landed),
      };
    });
    expect(got).toEqual(TABLE);
  });

  it('참 최근접은 v18 이고 진입점은 여섯이다', () => {
    const r = computeHnswRound(DATA, 3);
    expect(r.truth).toBe(TRUTH);
    expect(r.walks.map((w) => w.entry)).toEqual(ENTRIES);
  });

  it('층을 쌓으면 정답은 오르고 본 점도 늘어난다 — 덜 보는 것이 아니다', () => {
    const rows = [1, 2, 3, 4].map((n) => computeHnswRound(DATA, n));
    const hits = rows.map((r) => r.hits);
    const seen = rows.map((r) => r.seenSum);
    expect(hits).toEqual([1, 2, 6, 6]);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i], `층 ${i + 1} 의 본 점이 앞 층보다 적다`).toBeGreaterThan(seen[i - 1]!);
    }
    // 평균으로 보면 5.67 → 11.00.
    expect(seen.map((s) => Math.round((s / 6) * 100) / 100)).toEqual([5.67, 8.17, 10.83, 11]);
  });

  it('동률 규칙이 정해져 있어 같은 입력이 같은 화면을 낸다', () => {
    const a = computeHnswRound(DATA, 3);
    const b = computeHnswRound(DATA, 3);
    expect(a.walks.map((w) => w.steps.map((s) => s.at))).toEqual(
      b.walks.map((w) => w.steps.map((s) => s.at)),
    );
  });
});

describe('손잡이를 네 번 돌리는 동안', () => {
  it('회차마다 걸음의 끝자리와 본 점이 표와 같다', async () => {
    const rec = await play(FROM_ONE, [2, 3, 4]);
    expect(rec.rounds).toHaveLength(4);

    rec.rounds.forEach((events, i) => {
      const want = TABLE[i]!;
      const steps = events.filter((e) => e.type === 'walkers-step');
      expect(steps.length, `층 ${want.levels} 에 걸음이 없다`).toBeGreaterThan(0);

      const last = walkersOf(steps[steps.length - 1]!);
      expect(last.map((w) => w.at), `층 ${want.levels} 끝자리`).toEqual(want.landed);
      expect(last.map((w) => w.seen.length), `층 ${want.levels} 본 점`).toEqual(want.seen);
      expect(last.every((w) => w.done)).toBe(true);

      const done = events.find((e) => e.type === 'round-done');
      expect(done?.payload).toEqual({
        levels: want.levels,
        hits: want.hits,
        seenSum: want.seenSum,
        truth: TRUTH,
      });
    });
  });

  it('계기가 회차마다 그 회차의 값으로 선다 — 쌓이지 않는다', async () => {
    const rec = await play(FROM_ONE, [2, 3, 4]);

    for (let i = 0; i < TABLE.length; i += 1) {
      const want = TABLE[i]!;
      const mine = rec.metrics.filter((m) => m.round === i + 1);
      const lastOf = (name: string): number | undefined =>
        mine.filter((m) => m.name === name).at(-1)?.value;

      expect(lastOf('hit-count'), `층 ${want.levels} 의 hit-count`).toBe(want.hits);
      expect(lastOf('visit-sum'), `층 ${want.levels} 의 visit-sum`).toBe(want.seenSum);
    }
  });

  it('값이 그대로인 회차에도 계기 이름이 실린다', async () => {
    // 층 3 과 4 는 정답이 둘 다 6 이다. 델타가 0 이라고 안 보내면 그 회차에
    // 이름이 통째로 빠져 "선언한 계기가 없는 것" 과 구별되지 않는다.
    const rec = await play(FROM_ONE, [2, 3, 4]);
    for (let round = 1; round <= 4; round += 1) {
      const names = new Set(rec.metrics.filter((m) => m.round === round).map((m) => m.name));
      expect([...names].sort(), `${round} 회차`).toEqual(['hit-count', 'visit-sum']);
    }
    expect(rec.metrics.some((m) => m.delta === 0), '델타 0 을 실제로 보낸다').toBe(true);
  });

  it('선언한 계기 이름만 쓴다 (C5)', async () => {
    const declared = new Set(
      ((hnswFacet.blocks.controls as { metrics?: Array<{ name: string }> }).metrics ?? []).map(
        (m) => m.name,
      ),
    );
    const rec = await play(DATA, [2]);
    for (const m of rec.metrics) expect(declared.has(m.name), `${m.name} 미선언`).toBe(true);
  });

  it('구간 슬라이더의 기본 구간과 처음 층 수가 같다', () => {
    const controls = (hnswFacet.blocks.controls as {
      controls: Array<{ action?: string; segments?: Array<{ value: number; default?: boolean }> }>;
    }).controls;
    const slider = controls.find((c) => c.action === 'levels');
    const fallback = slider?.segments?.find((s) => s.default === true);
    expect(fallback?.value).toBe(DATA.levels);
  });
});

/** stage 가 내주는 표면 — projector 가 부르는 것과 같다. */
type StageApi = {
  setScene(scene: HnswStageScene): void;
  showStep(frame: HnswStageFrame): Promise<void>;
  destroy(): void;
};

/** 그 층의 마지막 걸음. 화면이 멎었을 때 서 있는 자리다. */
function lastFrame(levels: number): {
  scene: HnswStageScene;
  frame: HnswStageFrame;
  seenSum: number;
} {
  const round = computeHnswRound(DATA, levels);
  const walkers: HnswStageWalker[] = round.walks.map((w) => {
    const last = w.steps[w.steps.length - 1]!;
    return {
      entry: w.entry,
      at: last.at,
      level: last.level,
      probed: last.probed,
      seen: last.seen,
      done: true,
    };
  });
  return {
    scene: { levels: round.levels, members: round.members, truth: round.truth },
    frame: { tick: walkers.length, levels: round.levels, walkers },
    seenSum: round.seenSum,
  };
}

function mountStage(): { api: StageApi; svg: SVGSVGElement; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = mountView(hnswStageView, container, {
    config: {},
    initialData: DATA as unknown as Record<string, unknown>,
    locale: 'en',
    theme: 'light',
  }) as unknown as StageApi;
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('캔버스가 붙지 않았다');
  return { api, svg, container };
}

const marks = (svg: SVGSVGElement, cls: string): SVGCircleElement[] => [
  ...svg.querySelectorAll<SVGCircleElement>(`circle.${cls}`),
];

/** 여섯 표가 가장 멀리 떨어진 거리. */
function spread(tokens: SVGCircleElement[]): number {
  let max = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      const dx = Number(tokens[i]!.getAttribute('cx')) - Number(tokens[j]!.getAttribute('cx'));
      const dy = Number(tokens[i]!.getAttribute('cy')) - Number(tokens[j]!.getAttribute('cy'));
      max = Math.max(max, Math.hypot(dx, dy));
    }
  }
  return max;
}

describe('화면이 말하는 수와 화면이 그린 것', () => {
  it('본 점은 셈한 수만큼 실제로 찍힌다', async () => {
    for (const levels of [1, 3]) {
      const { api, svg, container } = mountStage();
      const { scene, frame, seenSum } = lastFrame(levels);
      api.setScene(scene);
      await api.showStep(frame);
      // 세는 배열과 그리는 배열이 같은 것이므로 둘이 어긋날 자리가 없다.
      expect(marks(svg, 'hnsw-seen'), `층 ${levels}`).toHaveLength(seenSum);
      api.destroy();
      container.remove();
    }
  }, 20_000);

  it('층을 쌓으면 여섯 끝자리가 한 점으로 모인다', async () => {
    const shallow = mountStage();
    const one = lastFrame(1);
    shallow.api.setScene(one.scene);
    await shallow.api.showStep(one.frame);
    const scattered = spread(marks(shallow.svg, 'hnsw-walker'));

    const deep = mountStage();
    const three = lastFrame(3);
    deep.api.setScene(three.scene);
    await deep.api.showStep(three.frame);
    const gathered = spread(marks(deep.svg, 'hnsw-walker'));

    expect(marks(deep.svg, 'hnsw-walker')).toHaveLength(6);
    // 한 점에 모이면 여섯이 그 점 둘레의 고리에만 선다 — 고리 지름 남짓이 상한이다.
    expect(gathered, '층 셋에서 모이지 않는다').toBeLessThan(20);
    expect(scattered, '층 하나에서 흩어지지 않는다').toBeGreaterThan(100);

    shallow.api.destroy();
    shallow.container.remove();
    deep.api.destroy();
    deep.container.remove();
  }, 20_000);

  it('마운트한 뒤 viewBox 가 바뀌지 않는다', async () => {
    const { api, svg, container } = mountStage();
    const before = svg.getAttribute('viewBox');
    const four = lastFrame(4);
    api.setScene(four.scene);
    await api.showStep(four.frame);
    expect(svg.getAttribute('viewBox')).toBe(before);
    api.destroy();
    container.remove();
  }, 20_000);

  it('러너로 띄워도 던지지 않고 손잡이가 붙는다', async () => {
    // 손잡이가 붙은 완제품은 reactive 여야 한다 — coroutine 이면 러너의
    // `assertControlsSupported` 가 마운트 시점에 던진다. 그 배선을 여기서 실제로
    // 지나 본다.
    clearRegistry();
    registerHnsw();
    const swallowed: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      swallowed.push(args.map((a) => String(a)).join(' '));
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(hnswFacet, host, { locale: 'ko', theme: 'light' });
    try {
      await new Promise((r) => setTimeout(r, 1_200));
      const svg = host.querySelector('svg');
      expect(svg, '캔버스가 붙어 있다').not.toBeNull();
      expect(svg!.childNodes.length, '빈 캔버스가 아니다').toBeGreaterThan(0);
      expect(marks(svg!, 'hnsw-walker'), '여섯 걸음이 서 있다').toHaveLength(6);
      expect(host.querySelector('[role="slider"]'), '손잡이가 떠 있다').not.toBeNull();
      expect(host.querySelector('.facet-control-bar__metric--hit-count')).not.toBeNull();
      expect(host.querySelector('.facet-control-bar__metric--visit-sum')).not.toBeNull();
      // 캡션이 저작 문안에서 온다 — 코드의 en 원본이 아니라 선언의 ko 가 떠야 한다.
      const captions = [...svg!.querySelectorAll('text')].map((n) => n.textContent ?? '');
      expect(captions.some((c) => c.includes('층')), '캡션이 선언 문안으로 뜬다').toBe(true);
      expect(swallowed, '러너가 삼킨 오류가 없다').toEqual([]);
    } finally {
      handle.destroy();
      console.error = original;
      host.remove();
    }
  }, 20_000);

  it('걷는 도중 접어도 기다리던 것이 풀린다', async () => {
    const { api, container } = mountStage();
    const three = lastFrame(3);
    api.setScene(three.scene);
    // 애니메이션이 도는 중에 접는다. 안 풀리면 `await ctx.emit` 이 영영 안 돌아온다.
    const pending = api.showStep(three.frame);
    api.destroy();
    await expect(pending).resolves.toBeUndefined();
    container.remove();
  }, 20_000);
});
