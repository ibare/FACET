/**
 * IR 과 화면이 두 정책 전부에서 같은 답을 내는가.
 *
 * 이 facet 의 주장은 수 둘에 걸려 있다 — 같은 열 번의 고침에 아래층으로 내려간
 * 쓰기가 10 과 5 로 갈린다는 것. 그 수를 내는 자리가 둘이라(알고리즘이 화면에
 * 보이는 것과 코드 패널의 IR 이 셈하는 것) 둘이 갈리면 화면이 거짓말을 한다.
 * 갈려도 타입은 통과하고 예외도 안 나며 둘을 나란히 세어 본 사람만 안다.
 *
 * 특히 **끝에 남은 고쳐진 줄**을 세는지 본다. 그것을 빼먹으면 write-back 이
 * 5 가 아니라 1 로 나오는데, 그 수는 write-back 을 실제보다 훨씬 좋아 보이게
 * 만드는 종류의 거짓이다.
 */

import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext, FacetRuntimeEvent, IRStmt } from '@ffacet/core/runtime';

import { writePolicyAlgorithm, type WritePolicyData } from '../src/algorithm.js';
import { writePolicyImperativeIR } from '../src/irs.js';
import { writePolicyFacet } from '../src/facet.js';

/** 선언된 1차 데이터를 그대로 쓴다 — 검사가 facet.ts 와 함께 움직이게. */
function freshData(): WritePolicyData {
  return structuredClone(writePolicyFacet.initialData) as unknown as WritePolicyData;
}

const THROUGH = 0;
const BACK = 1;

// ─────────────────────────────────────────────────────────────
// IR 쪽

/** IR 함수는 배열을 만들 수 없다. 칸 수만큼의 상태를 부르는 쪽이 건넨다. */
function irMemoryWrites(policy: number): number {
  const d = freshData();
  const zeros = (): number[] => new Array<number>(d.slots).fill(0);
  const out = runIR(writePolicyImperativeIR, 'countMemoryWrites', [
    d.writes,
    policy,
    new Array<number>(d.slots).fill(-1),
    zeros(),
    zeros(),
    zeros(),
  ]);
  return out as number;
}

function irPhases(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      irPhases(s.body, out);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 화면 쪽 — 알고리즘을 돌려 이벤트를 받는다.

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Map<string, number>;
  /** 회차가 끝나는 순간(`done`)의 계기 값. 누적되면 여기서 드러난다. */
  snapshots: Array<{ edits: number; memory: number }>;
};

/**
 * 알고리즘을 돌린다. `then` 에 적은 정책 번호를 차례로 골라 주고, 다 떨어지면
 * 취소해 알고리즘을 정상 종료 경로로 내보낸다.
 */
async function run(then: number[] = []): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const snapshots: Array<{ edits: number; memory: number }> = [];
  const queue = [...then];
  let cancelled = false;

  const ctx = {
    data: freshData(),
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent): Promise<void> {
      events.push(e);
      // 회차가 끝나는 순간의 계기를 뜬다. 러너가 보는 것과 같은 값이다.
      if (e.type === 'done') {
        snapshots.push({
          edits: metrics.get('write-count') ?? 0,
          memory: metrics.get('memory-write-count') ?? 0,
        });
      }
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<{ type: string; payload: { value: number } }> {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'policy', payload: { value: next } };
    },
  };

  await writePolicyAlgorithm(ctx as unknown as FacetContext<WritePolicyData>);
  return { events, metrics, snapshots };
}

/** 재생 한 회차분의 이벤트. `restart` 가 회차의 경계다. */
function replays(events: FacetRuntimeEvent[]): FacetRuntimeEvent[][] {
  const out: FacetRuntimeEvent[][] = [];
  for (const e of events) {
    if (e.type === 'restart') out.push([]);
    if (out.length > 0) out[out.length - 1]!.push(e);
  }
  return out;
}

type Descend = { slot: number; line: number; folded: number; reason: string };

function descents(segment: FacetRuntimeEvent[]): Descend[] {
  return segment
    .filter((e) => e.type === 'descend')
    .map((e) => e.payload as Descend);
}

// ─────────────────────────────────────────────────────────────

describe('쓰기 정책', () => {
  it('1차 데이터가 사양 그대로다 — 수가 여기서 나온다', () => {
    const d = freshData();
    expect(d.slots).toBe(4);
    expect(d.lineBytes).toBe(16);
    expect(d.writes).toEqual([0, 0, 0, 1, 1, 0, 2, 3, 4, 0]);
    expect(d.policies).toEqual(['through', 'back']);
  });

  it('IR 이 세는 아래층 쓰기 — write-through 10, write-back 5', () => {
    expect(irMemoryWrites(THROUGH)).toBe(10);
    expect(irMemoryWrites(BACK)).toBe(5);
  });

  it('화면이 보이는 아래층 쓰기도 같은 10 과 5 다', async () => {
    const { events } = await run([BACK]);
    const [through, back] = replays(events);

    expect(descents(through!).length).toBe(10);
    expect(descents(back!).length).toBe(5);
  });

  it('IR 과 화면이 두 정책 전부에서 같은 답을 낸다', async () => {
    const { events } = await run([BACK]);
    const [through, back] = replays(events);

    expect(descents(through!).length).toBe(irMemoryWrites(THROUGH));
    expect(descents(back!).length).toBe(irMemoryWrites(BACK));
  });

  /*
   * 여기가 이 facet 이 거짓이 되기 가장 쉬운 자리다. 쫓겨날 때만 세면 1 이 나온다.
   */
  it('write-back 의 5 는 축출 1 + 끝에 남은 고쳐진 줄 4 다', async () => {
    const { events } = await run([BACK]);
    const back = replays(events)[1]!;
    const d = descents(back);

    expect(d.filter((x) => x.reason === 'evict').length).toBe(1);
    expect(d.filter((x) => x.reason === 'flush').length).toBe(4);
    expect(d.filter((x) => x.reason === 'through').length).toBe(0);
  });

  it('write-through 는 끝에 남기는 것이 없다 — 열 번이 모두 고칠 때 내려간다', async () => {
    const { events } = await run([BACK]);
    const through = replays(events)[0]!;
    const d = descents(through);

    expect(d.every((x) => x.reason === 'through')).toBe(true);
    expect(d.every((x) => x.folded === 1)).toBe(true);
  });

  /*
   * 덩어리로 내려가도 고침이 사라지지는 않는다. 내려가는 **횟수**가 줄 뿐이다.
   * 그래서 실려 내려간 고침을 다 더하면 두 정책 모두 열이 되어야 한다.
   */
  it('실려 내려간 고침의 합은 두 정책 모두 열이다', async () => {
    const { events } = await run([BACK]);
    const [through, back] = replays(events);
    const sum = (xs: Descend[]): number => xs.reduce((a, x) => a + x.folded, 0);

    expect(sum(descents(through!))).toBe(10);
    expect(sum(descents(back!))).toBe(10);
  });

  it('줄 0 은 다섯 번 고쳐졌는데 내려간 것은 한 번뿐이다', async () => {
    const { events } = await run([BACK]);
    const back = replays(events)[1]!;
    const forLine0 = descents(back).filter((x) => x.line === 0);

    expect(forLine0.length).toBe(1);
    expect(forLine0[0]!.folded).toBe(5);
  });

  it('고친 횟수는 정책과 무관하게 열로 같다 — 갈리는 것은 내려간 쪽뿐이다', async () => {
    const { events } = await run([BACK]);
    const [through, back] = replays(events);
    const edits = (seg: FacetRuntimeEvent[]): number =>
      seg.filter((e) => e.type === 'write-begin').length;

    expect(edits(through!)).toBe(10);
    expect(edits(back!)).toBe(10);
  });

  /*
   * `ctx.metric` 은 누적 채널이고 러너는 **되감기 때만** 계기를 비운다. 손잡이를
   * 돌려 다시 도는 것은 되감기가 아니라서, 알고리즘이 스스로 되감지 않으면 판을
   * 거듭할수록 수가 쌓인다.
   *
   * 쌓이면 이 facet 의 주장이 통째로 무너진다 — 고친 횟수까지 10 과 20 으로
   * 갈려 버려, "고침은 열로 같고 내려간 것만 갈린다" 가 화면에서 거짓이 된다.
   * 그래서 회차가 끝나는 순간의 값을 회차마다 잠근다.
   */
  it('계기 둘이 회차마다 제 값을 보인다 — 고침은 열로 같고 내려간 것만 갈린다', async () => {
    const { metrics, snapshots } = await run([BACK]);

    expect(snapshots).toEqual([
      { edits: 10, memory: 10 }, // write-through
      { edits: 10, memory: 5 }, // write-back
    ]);

    // 끝에 남은 값도 둘째 회차의 것이지 두 회차의 합이 아니다.
    expect(metrics.get('write-count')).toBe(10);
    expect(metrics.get('memory-write-count')).toBe(5);
  });

  it('phase 어휘가 algorithm 과 irs 에서 집합으로 같다 (C3)', async () => {
    const { events } = await run([BACK]);
    const fromAlgorithm = new Set<string>();
    for (const e of events) {
      if (e.type !== 'phase') continue;
      const p = e.payload as { phase?: unknown };
      if (typeof p?.phase === 'string') fromAlgorithm.add(p.phase);
    }

    const fromIR = new Set<string>();
    for (const fn of writePolicyImperativeIR.functions) irPhases(fn.body, fromIR);

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    expect(fromIR.size).toBe(7);
  });

  it('phase 이벤트는 걸음의 경계가 아니다 — 언제나 silent', async () => {
    const { events } = await run([BACK]);
    const loud = events.filter((e) => e.type === 'phase' && e.silent !== true);
    expect(loud).toEqual([]);
  });

  /*
   * 32비트 천장의 근거를 구조로 잠근다. 칸 넷·차례 열이면 셈이 열을 넘지 않아
   * 어느 언어의 int 로도 넘치지 않는다. 그 전제가 커지면 여기가 먼저 깨진다.
   */
  it('IR 이 셈하는 수는 열을 넘지 않는다', () => {
    const d = freshData();
    expect(d.writes.length).toBeLessThanOrEqual(10);
    expect(d.slots).toBeLessThanOrEqual(4);
    expect(irMemoryWrites(THROUGH)).toBeLessThanOrEqual(d.writes.length);
  });
});
