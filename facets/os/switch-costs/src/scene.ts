/**
 * 문맥 전환 비용의 장면.
 *
 * 바탕 — 프로세스 · 메모리의 덩이와 주인 · 칸 수 · 시간 띠의 축척(span)
 * 자취 — 지금 캐시 · 실행 중인 프로세스 · 시간 조각들 · 누적 넷
 * 이번 걸음 — step (읽기면 읽기 전 캐시 `before` 를 실어 밀림을 장면이 말한다)
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 값을 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SwitchCostsSegKind = 'work' | 'switch' | 'cold';
export type SwitchCostsSeg = { kind: SwitchCostsSegKind; ticks: number };

export type SwitchCostsStep =
  | { kind: 'start' }
  | {
      kind: 'read';
      proc: string;
      block: string;
      hit: boolean;
      cost: number;
      gone: string | null;
      before: string[];
    }
  | { kind: 'switch'; from: string; to: string; cost: number };

export type SwitchCostsScene = {
  procs: string[];
  blocks: { id: string; owner: string }[];
  capacity: number;
  span: number;
  running: string;
  cache: string[];
  segs: SwitchCostsSeg[];
  /** 이번 걸음이 시간 띠 끝에 더한 조각 수 */
  fresh: number;
  clock: number;
  work: number;
  switching: number;
  cold: number;
  step: SwitchCostsStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`switchCostsScene: ${what} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`switchCostsScene: ${k} 가 문자열이 아니다`);
  return v;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`switchCostsScene: ${k} 가 수가 아니다`);
  return v;
}

function strList(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`switchCostsScene: ${k} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`switchCostsScene: ${k}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function blockList(o: Record<string, unknown>): { id: string; owner: string }[] {
  const v = o['blocks'];
  if (!Array.isArray(v)) throw new Error('switchCostsScene: blocks 가 목록이 아니다');
  return v.map((x, i) => {
    const b = rec(x, `blocks[${i}]`);
    return { id: str(b, 'id'), owner: str(b, 'owner') };
  });
}

function totals(p: Record<string, unknown>): Pick<SwitchCostsScene, 'clock' | 'work' | 'switching' | 'cold'> {
  return { clock: num(p, 'clock'), work: num(p, 'work'), switching: num(p, 'switching'), cold: num(p, 'cold') };
}

export const switchCostsScene: ScenePlan<SwitchCostsScene> = {
  initial(initialData: unknown): SwitchCostsScene {
    const d = rec(initialData, 'initialData');
    return {
      procs: strList(d, 'procs'),
      blocks: blockList(d),
      capacity: num(d, 'capacity'),
      span: 0,
      running: str(d, 'running'),
      cache: strList(d, 'cache'),
      segs: [],
      fresh: 0,
      clock: 0,
      work: 0,
      switching: 0,
      cold: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SwitchCostsScene, event: FacetRuntimeEvent): SwitchCostsScene {
    if (event.type === 'init') {
      const p = rec(event.payload, 'init.payload');
      return { ...scene, span: num(p, 'span') };
    }
    if (event.type === 'switch') {
      const p = rec(event.payload, 'switch.payload');
      const cost = num(p, 'cost');
      const to = str(p, 'to');
      return {
        ...scene,
        ...totals(p),
        running: to,
        segs: [...scene.segs, { kind: 'switch', ticks: cost }],
        fresh: 1,
        step: { kind: 'switch', from: str(p, 'from'), to, cost },
      };
    }
    if (event.type === 'read') {
      const p = rec(event.payload, 'read.payload');
      const hitRaw = p['hit'];
      if (typeof hitRaw !== 'boolean') throw new Error('switchCostsScene: hit 가 참거짓이 아니다');
      const goneRaw = p['gone'];
      if (goneRaw !== null && typeof goneRaw !== 'string') throw new Error('switchCostsScene: gone 이 문자열도 null 도 아니다');
      const cost = num(p, 'cost');
      const sum = totals(p);
      // 일 몫과 식은 캐시 몫은 누적의 차이로 가른다 — 셈을 다시 돌리지 않는다.
      const workTicks = sum.work - scene.work;
      const coldTicks = sum.cold - scene.cold;
      const added: SwitchCostsSeg[] = [{ kind: 'work', ticks: workTicks }];
      if (coldTicks > 0) added.push({ kind: 'cold', ticks: coldTicks });
      return {
        ...scene,
        ...sum,
        cache: strList(p, 'cache'),
        segs: [...scene.segs, ...added],
        fresh: added.length,
        step: {
          kind: 'read',
          proc: str(p, 'proc'),
          block: str(p, 'block'),
          hit: hitRaw,
          cost,
          gone: goneRaw,
          before: strList(p, 'before'),
        },
      };
    }
    throw new Error(`switchCostsScene: 모르는 이벤트 ${event.type}`);
  },
};
