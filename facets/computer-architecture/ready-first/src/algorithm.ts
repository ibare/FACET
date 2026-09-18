/**
 * 준비된 것부터 — 비순차 실행은 순서를 바꾸고도 어떻게 결과를 순서대로 남기는가.
 *
 * 대기창에 든 명령어들을 사이클 단위로 돌린다. 규약은 셋이다.
 *   - 실행기는 넉넉하다 — 한 사이클에 준비된 명령어는 모두 시작한다
 *   - 원천이 앞 명령어의 결과면 그 명령어가 끝난 **다음 사이클**부터 준비다
 *   - 끝난 명령어는 끝난 다음 사이클부터 커밋할 수 있고, 커밋은 원래 순서로만 한다
 *     (한 사이클에 여럿 가능)
 *
 * 명령어 글자에서 목적지와 원천 레지스터를 읽고, 여는 말(op)로 실행 지연을 정한다.
 * 사이클 표는 이 규약에서 셈한다.
 *
 * 이벤트 (전부 걸음이다. silent 없음):
 *   init   { instrs: { id: string; asm: string; lat: number;
 *                      dep: { reg: string; from: number } | null }[] }
 *          dep 는 가장 먼저 걸리는 원천 — 그 레지스터와 그것을 쓰는 앞 명령어의 번호.
 *          없으면 null
 *   cycle  { cycle: number; started: number[]; finished: number[]; committed: number[] }
 *          그 사이클에 시작한 · 끝난 · 커밋한 명령어의 번호 (원래 순서의 자리)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReadyFirstInstr = { id: string; asm: string };

export type ReadyFirstFacetData = {
  type: 'ready-first';
  instrs: ReadyFirstInstr[];
  /** 여는 말별 실행 지연 (사이클) */
  latency: Record<string, number>;
  /** latency 에 없는 여는 말의 지연 */
  defaultLatency: number;
  stepMs: number;
};

type Decoded = {
  id: string;
  asm: string;
  lat: number;
  dst: string | null;
  srcs: string[];
  /** 원천마다 그것을 쓰는 가장 가까운 앞 명령어 번호 */
  producers: number[];
  dep: { reg: string; from: number } | null;
};

function decode(data: ReadyFirstFacetData): Decoded[] {
  const out: Decoded[] = [];
  data.instrs.forEach((ins, i) => {
    const op = ins.asm.trim().split(/\s+/)[0] ?? '';
    const regs = ins.asm.match(/\br\d+\b/g) ?? [];
    const dst = regs[0] ?? null;
    const srcs = regs.slice(1);
    const lat = data.latency[op] ?? data.defaultLatency;
    const producers: number[] = [];
    let dep: Decoded['dep'] = null;
    for (const reg of srcs) {
      let from = -1;
      for (let j = i - 1; j >= 0; j -= 1) {
        if (out[j]!.dst === reg) {
          from = j;
          break;
        }
      }
      if (from >= 0) {
        producers.push(from);
        if (dep === null) dep = { reg, from };
      }
    }
    out.push({ id: ins.id, asm: ins.asm, lat, dst, srcs, producers, dep });
  });
  return out;
}

/** 사이클 상한 — 규약이 어긋난 자료로 끝없이 돌지 않게. */
const MAX_CYCLES = 64;

export async function readyFirst(context: FacetContext<ReadyFirstFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ReadyFirstFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const code = decode(data);
  const n = code.length;
  const start: (number | null)[] = code.map(() => null);
  const end: (number | null)[] = code.map(() => null);
  const commit: (number | null)[] = code.map(() => null);

  await ctx.emit({
    type: 'init',
    payload: {
      instrs: code.map((d) => ({ id: d.id, asm: d.asm, lat: d.lat, dep: d.dep })),
    },
  });

  let head = 0;
  for (let cycle = 1; head < n && cycle <= MAX_CYCLES; cycle += 1) {
    if (!(await pause())) return;

    // 커밋 — 줄의 앞에서부터, 끝난 다음 사이클이 된 것만
    const committed: number[] = [];
    while (head < n) {
      if (ctx.cancelled) return;
      const e = end[head];
      if (e === null || e === undefined || e >= cycle) break;
      commit[head] = cycle;
      committed.push(head);
      head += 1;
    }

    // 시작 — 원천을 쓰는 앞 명령어가 이전 사이클까지 끝났으면 준비
    const started: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return;
      if (start[i] !== null) continue;
      const ready = code[i]!.producers.every((p) => {
        const e = end[p];
        return e !== null && e !== undefined && e < cycle;
      });
      if (!ready) continue;
      start[i] = cycle;
      end[i] = cycle + code[i]!.lat - 1;
      started.push(i);
    }

    const finished: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return;
      if (end[i] === cycle) finished.push(i);
    }

    await ctx.emit({ type: 'cycle', payload: { cycle, started, finished, committed } });
  }
}
