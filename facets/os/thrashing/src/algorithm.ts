/**
 * thrashing — 프레임이 모자라면 방금 밀어낸 페이지를 바로 다음에 다시 가져온다.
 *
 * 값은 모두 예로 정한 것이다. 실제 시스템에서 잰 것이 아니다.
 * 프로세스 둘(p1: a1 a2 · p2: b1 b2)이 프레임 셋을 함께 쓰고, 참조 열둘을 둘씩 번갈아 낸다.
 *
 * 규약 (사양의 규약 줄을 옮김)
 * - 교체는 프레임 전체에서 가장 오래 안 쓴 것(LRU). 프로세스를 가리지 않는다.
 *   동률이면 번호가 낮은 프레임.
 * - 빈 프레임이 있으면 번호가 낮은 것부터 채운다. 교체로 비운 프레임에는 새 페이지가 그 자리에 들어간다.
 * - 참조 하나가 한 걸음. 적중이면 쓴 때만 새로 적는다.
 * - 밀려난 페이지가 다시 불리면 밀려난 걸음과 그 사이 걸음 수를 싣는다.
 *
 * 이벤트
 * - `reference` (silent 아님) — 참조 하나
 *   payload: {
 *     t: number;               // 몇 번째 참조 (1 부터)
 *     page: string;            // 참조한 페이지
 *     fault: boolean;          // 프레임에 없었나
 *     frame: number;           // 그 페이지가 놓인 프레임 번호
 *     victim: string | null;   // 이번에 밀려난 페이지 (없으면 null)
 *     outAt: number | null;    // 이 페이지가 앞서 밀려났던 걸음 (없으면 null)
 *     backAfter: number | null // 밀려난 뒤 다시 불리기까지 걸음 수 (없으면 null)
 *   }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 로 세운다 (프레임 전부 빔, 페이지 전부 디스크).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ThrashingProcess = { id: string; pages: string[] };

export type ThrashingFacetData = {
  type: 'thrashing';
  stepMs: number;
  frames: number;
  processes: ThrashingProcess[];
  refs: string[];
};

/** 자료를 검사한다. 셈할 수 없는 모양이면 던진다 (C6). */
export function checkThrashingData(data: ThrashingFacetData): Set<string> {
  if (!Number.isInteger(data.frames) || data.frames < 1) {
    throw new Error(`thrashing: 프레임 수가 1 이상의 정수가 아니다 (${String(data.frames)})`);
  }
  const pages = new Set<string>();
  for (const proc of data.processes) {
    for (const page of proc.pages) {
      if (pages.has(page)) throw new Error(`thrashing: 페이지 ${page} 가 두 번 선언됐다`);
      pages.add(page);
    }
  }
  data.refs.forEach((page, i) => {
    if (!pages.has(page)) {
      throw new Error(`thrashing: 참조 ${i + 1} 의 페이지 ${page} 가 어느 프로세스에도 없다`);
    }
  });
  return pages;
}

export async function thrashing(rawCtx: FacetContext<ThrashingFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<ThrashingFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  checkThrashingData(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const frames: (string | null)[] = Array.from({ length: data.frames }, () => null);
  const lastUsed = new Map<string, number>();
  const evictedAt = new Map<string, number>();

  for (let i = 0; i < data.refs.length; i += 1) {
    if (!(await pause())) return;
    const t = i + 1;
    const page = data.refs[i];
    if (page === undefined) throw new Error(`thrashing: 참조 ${t} 가 비었다`);

    let outAt: number | null = null;
    let backAfter: number | null = null;
    const was = evictedAt.get(page);
    if (was !== undefined) {
      outAt = was;
      backAfter = t - was;
      evictedAt.delete(page);
    }

    const at = frames.indexOf(page);
    if (at >= 0) {
      lastUsed.set(page, t);
      await ctx.emit({
        type: 'reference',
        payload: { t, page, fault: false, frame: at, victim: null, outAt, backAfter },
      });
      continue;
    }

    let frame = frames.indexOf(null);
    let victim: string | null = null;
    if (frame < 0) {
      // 가장 오래 안 쓴 것. 엄격히 작은 것만 바꾸므로 동률이면 번호 낮은 프레임이 남는다.
      let best = -1;
      let bestUsed = Infinity;
      frames.forEach((held, k) => {
        if (held === null) throw new Error('thrashing: 빈 프레임이 없는데 빈 칸을 만났다');
        const used = lastUsed.get(held);
        if (used === undefined) throw new Error(`thrashing: 프레임의 ${held} 에 쓴 때가 없다`);
        if (used < bestUsed) {
          best = k;
          bestUsed = used;
        }
      });
      if (best < 0) throw new Error('thrashing: 밀어낼 프레임을 고르지 못했다');
      frame = best;
      victim = frames[best] ?? null;
      if (victim === null) throw new Error('thrashing: 고른 프레임이 비어 있다');
      evictedAt.set(victim, t);
      lastUsed.delete(victim);
    }
    frames[frame] = page;
    lastUsed.set(page, t);
    await ctx.emit({
      type: 'reference',
      payload: { t, page, fault: true, frame, victim, outAt, backAfter },
    });
  }
}
