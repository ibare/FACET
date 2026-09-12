/**
 * IR 과 화면이 세 정책 전부에서 같은 답을 내는가.
 *
 * 이 완제품의 주장은 "정책만 바꿨는데 미스가 5·6·7 로 갈린다" 이다. 그 수를
 * 내는 자리가 둘이라 — 화면을 굴리는 `algorithm.ts` 와 코드 패널이 보이는
 * `irs.ts` — 둘이 어긋나면 **코드 패널이 화면과 다른 이야기를 한다.** 타입도
 * 검사도 통과하고, 두 곳을 나란히 놓고 세어 본 사람만 안다.
 *
 * 그래서 미스 수뿐 아니라 **축출된 줄의 차례까지** 견준다. 미스 수만 맞추면
 * 우연히 같아질 수 있지만, 어느 칸을 어느 차례로 버렸는지까지 같으면 두 구현이
 * 같은 정책을 말하고 있다는 뜻이다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR, IRInterpreter } from '@ffacet/ir-interpreter';
import { mountView, runFacet, clearRegistry } from '@ffacet/core/runtime';

import {
  cacheReplacementAlgorithm,
  computeCacheReplacementResult,
  POLICY_RULES,
  type CacheReplacementData,
} from '../src/algorithm.js';
import { cacheReplacementImperativeIR } from '../src/irs.js';
import { cacheReplacementFacet } from '../src/facet.js';
import { cacheReplacementStageView } from '../src/cache-replacement-stage.js';
import { registerCacheReplacement } from '../src/index.js';

const data = cacheReplacementFacet.initialData as unknown as CacheReplacementData;

/** 사양이 실측으로 못박은 답. 여기가 이 facet 의 주장 그 자체다. */
const EXPECTED: Record<string, { misses: number; evicted: number[] }> = {
  lru: { misses: 5, evicted: [2] },
  mru: { misses: 6, evicted: [1, 0] },
  fifo: { misses: 7, evicted: [0, 1, 2] },
};

type Ev = { type: string; target?: string | string[]; payload?: unknown; silent?: boolean };

/**
 * stage view 의 계약. `ViewInstance` 는 설계상 오픈 타입이라 메서드가 `unknown`
 * 으로 오므로 구체형을 여기 한 곳에 모으고 쓰는 자리에서 한 번만 좁힌다 (C9).
 */
type StageInstance = {
  destroy(): void;
  setPolicy(clock: string, rule: string): void;
};

/** 화면이 실제로 보는 것 — 알고리즘이 발신한 이벤트열. */
async function drive(policyId: string): Promise<Ev[]> {
  const events: Ev[] = [];
  let cancelled = false;
  const ctx = {
    data: { ...data, policy: policyId },
    get cancelled() {
      return cancelled;
    },
    async emit(e: Ev) {
      events.push(e);
    },
    metric() {
      /* 메트릭 값은 다른 검사가 본다 */
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      // 한 바퀴를 다 돈 뒤 알고리즘은 다음 정책을 기다린다. 취소로 끝낸다.
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await cacheReplacementAlgorithm(ctx as never);
  return events;
}

const axes = (id: string): { useLoad: number; pickMax: number } => {
  const rule = POLICY_RULES.find((p) => p.id === id)!;
  return { useLoad: rule.clock === 'loaded' ? 1 : 0, pickMax: rule.pick === 'max' ? 1 : 0 };
};

const fresh = (fill: number): number[] => new Array<number>(data.slotCount).fill(fill);

/** IR 의 entry 를 통째로 돌린 미스 수. */
function irMisses(id: string): number {
  const { useLoad, pickMax } = axes(id);
  return runIR(cacheReplacementImperativeIR, 'countMisses', [
    [...data.sequence],
    fresh(-1),
    fresh(0),
    fresh(0),
    useLoad,
    pickMax,
  ]) as number;
}

/**
 * IR 의 결정 함수(`findSlot` · `chooseVictim`)를 그대로 몰아 축출 차례를 뽑는다.
 * entry 는 미스 수만 돌려주므로, **어느 줄을 버렸는지** 는 이렇게 봐야 한다.
 */
function irEvictions(id: string): number[] {
  const { useLoad, pickMax } = axes(id);
  const interp = new IRInterpreter(cacheReplacementImperativeIR);
  const tag = fresh(-1);
  const used = fresh(0);
  const loaded = fresh(0);
  const evicted: number[] = [];
  for (let t = 0; t < data.sequence.length; t += 1) {
    const line = data.sequence[t]!;
    const slot = interp.call('findSlot', [tag, line]) as number;
    if (slot < 0) {
      const victim = interp.call('chooseVictim', [tag, used, loaded, useLoad, pickMax]) as number;
      if (tag[victim] !== -1) evicted.push(tag[victim]!);
      tag[victim] = line;
      loaded[victim] = t;
      used[victim] = t;
    } else {
      used[slot] = t;
    }
  }
  return evicted;
}

function phasesOf(stmts: unknown[], out: Set<string>): void {
  for (const s of stmts as Array<Record<string, unknown>>) {
    if (typeof s.phase === 'string') out.add(s.phase);
    for (const key of ['body', 'then', 'else']) {
      const b = s[key];
      if (Array.isArray(b)) phasesOf(b, out);
    }
  }
}

describe('캐시 교체 정책', () => {
  it('세 정책이 서로 다른 미스 수를 낸다 — 손잡이가 논증을 진다', async () => {
    const seen: Record<string, number> = {};
    for (const id of Object.keys(EXPECTED)) {
      const events = await drive(id);
      const done = events.find((e) => e.type === 'done');
      seen[id] = (done?.payload as { misses: number }).misses;
    }
    // 셋이 갈린다는 것 자체가 이 facet 의 주장이다.
    expect(seen).toEqual({ lru: 5, mru: 6, fifo: 7 });
    expect(new Set(Object.values(seen)).size).toBe(3);
  });

  /**
   * 손잡이가 논증을 지는 완제품이므로, **돌렸을 때 답이 실제로 바뀌는지** 를 잠근다.
   * 정책마다 따로 굴려 보는 검사는 이것을 못 본다 — 갈아 끼우는 길이 끊겨 있어도
   * 각각은 멀쩡히 제 답을 내기 때문이다. 길은 둘이다: 재생 도중(`pollInput`)과
   * 다 보인 뒤(`waitForInput`).
   */
  it('손잡이를 돌리면 답이 바뀐다 — 재생 도중에도, 끝난 뒤에도', async () => {
    const events: Ev[] = [];
    let cancelled = false;
    let polls = 0;
    let waits = 0;
    const ctx = {
      data: { ...data, policy: 'lru' },
      get cancelled() {
        return cancelled;
      },
      async emit(e: Ev) {
        events.push(e);
      },
      metric() {
        /* 값은 다른 검사가 본다 */
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        // 세 걸음째에 딱 한 번, 재생 도중에 FIFO 로 갈아 끼운다.
        polls += 1;
        return polls === 3 ? { type: 'policy', payload: { value: 2 } } : null;
      },
      async waitForInput() {
        // 다 보인 뒤 한 번 MRU 를 고르고, 그 다음은 취소로 끝낸다.
        waits += 1;
        if (waits === 1) return { type: 'policy', payload: { value: 1 } };
        cancelled = true;
        throw new Error('cancelled');
      },
    };
    await cacheReplacementAlgorithm(ctx as never);

    const started = events
      .filter((e) => e.type === 'policy-set')
      .map((e) => (e.payload as { policy: string }).policy);
    const finished = events
      .filter((e) => e.type === 'done')
      .map((e) => e.payload as { policy: string; misses: number });

    // lru 로 시작했다가 도중에 fifo 로 갈아타고, 끝난 뒤 손잡이로 mru 를 골랐다.
    expect(started).toEqual(['lru', 'fifo', 'mru']);
    // 도중에 끊긴 lru 는 끝맺지 않는다 — 갈아탄 뒤의 둘만 제 답을 낸다.
    expect(finished.map((d) => [d.policy, d.misses])).toEqual([
      ['fifo', 7],
      ['mru', 6],
    ]);
  });

  for (const [id, want] of Object.entries(EXPECTED)) {
    it(`${id} — 화면 · IR · 순수 함수가 같은 미스 수와 같은 축출 차례를 낸다`, async () => {
      const events = await drive(id);
      const done = events.find((e) => e.type === 'done');
      const screenMisses = (done?.payload as { misses: number; hits: number }).misses;
      const screenHits = (done?.payload as { misses: number; hits: number }).hits;
      const screenEvicted = events
        .filter((e) => e.type === 'evict')
        .map((e) => (e.payload as { line: number }).line);
      const pure = computeCacheReplacementResult(data, id);

      // 미스 수 — 네 증인이 모두 같아야 한다.
      expect({
        screen: screenMisses,
        ir: irMisses(id),
        pure: pure.misses,
      }).toEqual({ screen: want.misses, ir: want.misses, pure: want.misses });

      // 축출된 줄의 차례 — 우연한 일치를 가르는 자리.
      expect({ screen: screenEvicted, ir: irEvictions(id), pure: pure.evicted }).toEqual({
        screen: want.evicted,
        ir: want.evicted,
        pure: want.evicted,
      });

      // 화면이 세어 보인 것과 실제 이벤트 수가 어긋나지 않는다.
      expect(events.filter((e) => e.type === 'miss')).toHaveLength(want.misses);
      expect(events.filter((e) => e.type === 'install')).toHaveLength(want.misses);
      expect(screenHits).toBe(data.sequence.length - want.misses);
    });
  }

  it('algorithm 과 irs 의 phase 어휘 집합이 정확히 같다 (C3)', async () => {
    const fromAlgorithm = new Set<string>();
    for (const e of await drive('lru')) {
      if (e.type === 'phase') fromAlgorithm.add((e.payload as { phase: string }).phase);
    }
    const fromIR = new Set<string>();
    for (const f of cacheReplacementImperativeIR.functions) phasesOf(f.body, fromIR);

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    expect([...fromIR].sort()).toEqual(['choose-victim', 'done', 'hit', 'install', 'probe']);
  });

  /**
   * `irs.ts` 머리말이 "이 IR 의 수는 전부 작아 int 로 넘칠 길이 없다" 고 적어
   * 두었다. 그 근거는 접근열 길이와 칸 수가 작다는 것 하나에 걸려 있으므로,
   * 근거가 되는 구조를 여기서 잠근다. 접근열이 길어지면 이 검사가 먼저 깨진다.
   */
  it('32비트 천장의 근거가 되는 구조를 잠근다', () => {
    expect(data.slotCount).toBe(4);
    expect(data.sequence).toHaveLength(11);
    expect(Math.max(...data.sequence)).toBeLessThan(32);
    // 가장 큰 값은 미스 수(최대 = 접근열 길이)다. 곱셈도 누승도 없다.
    expect(data.sequence.length).toBeLessThan(2 ** 31 - 1);
  });

  it('메트릭 이름이 선언과 호출에서 일치한다 (C5)', () => {
    const controls = cacheReplacementFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(declared).toEqual(['evict-count', 'hit-count', 'miss-count']);
    for (const name of declared) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('stage 는 러너가 붙여 준 캔버스를 떼어내지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(cacheReplacementStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    }) as unknown as StageInstance;

    const svg = container.querySelector('svg');
    expect(svg, '캔버스가 컨테이너에 남아 있어야 한다').not.toBeNull();
    expect(svg!.childNodes.length, '그림이 그려져 있어야 한다').toBeGreaterThan(0);

    // 세로는 마운트한 뒤 바뀌지 않는다 (S-view).
    const before = svg!.getAttribute('viewBox');
    instance.setPolicy('loaded', 'FIFO');
    expect(svg!.getAttribute('viewBox')).toBe(before);

    instance.destroy();
    container.remove();
  });

  /**
   * 손잡이를 단 facet 은 `mechanismKind: 'reactive'` 여야 한다.
   * `CoroutineMechanism.supportedControls` 에 `'*'` 가 없어, 위젯 액션(`policy`)을
   * 만나면 러너가 **마운트 전에 throw** 한다. 그 선언이 빠지면 이 검사가 먼저 깨진다.
   */
  it('완제품이 실제로 떠서 첫 걸음을 굴린다', async () => {
    clearRegistry();
    registerCacheReplacement();

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    let handle: { destroy(): void } | null = null;
    try {
      handle = runFacet(cacheReplacementFacet, container);
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      console.error = original;
    }

    const svg = container.querySelector('svg');
    expect(svg, '캔버스가 남아 있어야 한다').not.toBeNull();
    expect(svg!.childNodes.length, '그림이 그려져 있어야 한다').toBeGreaterThan(0);
    expect(errors, '첫 걸음에서 던지지 않는다').toEqual([]);
    expect(
      container.querySelector('[role="slider"]'),
      '정책 손잡이가 떠 있어야 한다',
    ).not.toBeNull();

    handle!.destroy();
    container.remove();
  });

  /**
   * 계기가 정책마다 5·6·7 로 **정확히 갈려** 보여야 한다. 이 화면의 대비가 거기
   * 걸려 있기 때문이다.
   *
   * `ctx.metric` 은 누적 채널이고 러너는 **되감기 때만** 계기를 비운다. 손잡이를
   * 돌려 다시 도는 것은 되감기가 아니라서, 그냥 두면 판을 거듭할수록 수가 쌓여
   * 정책과 무관한 값(5 다음에 12)이 뜬다. 그래서 알고리즘이 지금 보이는 값을 들고
   * **차이만** 보낸다. 아래는 러너가 하는 누적을 그대로 흉내내 그 결과를 잰다.
   */
  it('계기가 정책마다 5·6·7 로 갈린다 — 판을 거듭해도 쌓이지 않는다', async () => {
    const gauge = new Map<string, number>();

    const run = async (first: string, thenPick: number | null): Promise<void> => {
      gauge.clear();
      let cancelled = false;
      let waits = 0;
      const ctx = {
        data: { ...data, policy: first },
        get cancelled() {
          return cancelled;
        },
        async emit() {
          /* 이 검사는 계기만 본다 */
        },
        // 러너의 누적 규칙 그대로: 새 값 = 지금 값 + 델타.
        metric(name: string, delta: number | 'inc') {
          gauge.set(name, (gauge.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
        },
        async sleep() {
          return !cancelled;
        },
        pollInput() {
          return null;
        },
        async waitForInput() {
          waits += 1;
          if (thenPick !== null && waits === 1) {
            return { type: 'policy', payload: { value: thenPick } };
          }
          cancelled = true;
          throw new Error('cancelled');
        },
      };
      await cacheReplacementAlgorithm(ctx as never);
    };

    const read = () => ({
      miss: gauge.get('miss-count'),
      hit: gauge.get('hit-count'),
      evict: gauge.get('evict-count'),
    });

    await run('lru', null);
    expect(read()).toEqual({ miss: 5, hit: 6, evict: 1 });

    await run('mru', null);
    expect(read()).toEqual({ miss: 6, hit: 5, evict: 2 });

    await run('fifo', null);
    expect(read()).toEqual({ miss: 7, hit: 4, evict: 3 });

    // 손잡이를 돌려 두 판을 잇달아 돌린 뒤에도 계기는 마지막 정책의 값만 보인다.
    // 쌓였다면 miss 가 5 + 7 = 12 로 뜬다.
    await run('lru', 2);
    expect(read()).toEqual({ miss: 7, hit: 4, evict: 3 });
  });
});
