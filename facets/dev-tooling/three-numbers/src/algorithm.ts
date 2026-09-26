/**
 * three-numbers — 내보냄마다 바뀐 것들 가운데 가장 무거운 하나가 버전의 자리를 고른다.
 *
 * 버전은 세 수 `major.minor.patch` 다. 무게 차례는 breaking > feature > fix.
 * breaking → major +1 · 오른쪽 둘 0 / feature → minor +1 · patch 0 / fix → patch +1.
 * 가벼운 바뀜이 같은 내보냄에 함께 있어도 제 자리를 따로 올리지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나다. 걸음 0 은 장면의 initial 이 처음 버전으로 채운다):
 *
 *   release   내보냄 하나의 바뀐 것들이 들어오고 가장 무거운 것이 정해진다
 *     payload {
 *       index: number                                  // 1 부터
 *       changes: { id: string; kind: ChangeKind }[]    // 데이터의 차례 그대로
 *       heaviest: string                               // 가장 무거운 것의 id (같은 무게면 앞의 것)
 *     }
 *
 *   bump      고른 자리가 하나 오르고 오른쪽 자리들이 0 이 된다
 *     payload {
 *       index: number
 *       from: [number, number, number]; fromText: string
 *       to: [number, number, number];   toText: string
 *       place: 0 | 1 | 2                               // 0 major · 1 minor · 2 patch
 *       dropped: number[]                              // 0 이 아니었다가 0 으로 떨어진 자리
 *       last: boolean                                  // 마지막 내보냄인가
 *     }
 *
 * 걸음 0 이 이미 처음 버전을 보이므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ChangeKind = 'fix' | 'feature' | 'breaking';
export type Change = { id: string; kind: ChangeKind };
export type Version = [number, number, number];
export type Place = 0 | 1 | 2;

export type ThreeNumbersFacetData = {
  type: 'three-numbers';
  stepMs: number;
  /** 처음 버전 — 세 수 `M.m.p` */
  start: string;
  /** 내보냄마다 바뀐 것의 목록 */
  releases: Change[][];
};

const WEIGHT: Record<ChangeKind, number> = { fix: 0, feature: 1, breaking: 2 };
const PLACE_OF: Record<ChangeKind, Place> = { breaking: 0, feature: 1, fix: 2 };

/** 세 수가 아닌 모양(앞붙이 · 프리릴리스 · 빌드 표식 포함)은 던진다. */
export function parseVersion(text: string): Version {
  const parts = text.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`three-numbers: 모르는 버전 모양 '${text}'`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function formatVersion(v: Version): string {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

export function isChangeKind(k: unknown): k is ChangeKind {
  return k === 'fix' || k === 'feature' || k === 'breaking';
}

/** 목록에서 가장 무거운 것 하나. 같은 무게면 앞의 것. 빈 목록은 던진다. */
export function heaviestOf(changes: readonly Change[]): Change {
  const first = changes[0];
  if (!first) throw new Error('three-numbers: 바뀐 것이 없는 내보냄');
  let best = first;
  for (const c of changes) {
    if (WEIGHT[c.kind] > WEIGHT[best.kind]) best = c;
  }
  return best;
}

/** 고른 자리를 올리고 오른쪽을 0 으로. 0 이 아니었다가 떨어진 자리도 함께 돌려준다. */
export function bump(v: Version, kind: ChangeKind): { to: Version; place: Place; dropped: number[] } {
  const place = PLACE_OF[kind];
  const to: Version = [v[0], v[1], v[2]];
  to[place] = v[place] + 1;
  const dropped: number[] = [];
  for (let i = place + 1; i < 3; i += 1) {
    if (v[i] !== 0) dropped.push(i);
    to[i] = 0;
  }
  return { to, place, dropped };
}

function checkData(data: ThreeNumbersFacetData): void {
  parseVersion(data.start);
  if (data.releases.length === 0) throw new Error('three-numbers: 내보냄이 없다');
  for (const rel of data.releases) {
    if (rel.length === 0) throw new Error('three-numbers: 바뀐 것이 없는 내보냄');
    for (const c of rel) {
      if (!isChangeKind(c.kind)) throw new Error(`three-numbers: 모르는 바뀜 종류 '${String(c.kind)}' (${c.id})`);
    }
  }
}

export async function threeNumbers(context: FacetContext<ThreeNumbersFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ThreeNumbersFacetData>;
  const data = ctx.data;
  checkData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let v = parseVersion(data.start);
  const total = data.releases.length;
  for (const [i, rel] of data.releases.entries()) {
    if (!(await pause())) return;
    const heavy = heaviestOf(rel);
    await ctx.emit({
      type: 'release',
      payload: {
        index: i + 1,
        changes: rel.map((c) => ({ id: c.id, kind: c.kind })),
        heaviest: heavy.id,
      },
    });
    if (!(await pause())) return;
    const r = bump(v, heavy.kind);
    await ctx.emit({
      type: 'bump',
      payload: {
        index: i + 1,
        from: [v[0], v[1], v[2]],
        fromText: formatVersion(v),
        to: [r.to[0], r.to[1], r.to[2]],
        toText: formatVersion(r.to),
        place: r.place,
        dropped: r.dropped,
        last: i === total - 1,
      },
    });
    v = r.to;
  }
}
