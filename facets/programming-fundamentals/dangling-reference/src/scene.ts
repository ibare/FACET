/**
 * dangling-reference 장면 — 알고리즘의 걸음을 잇는다. 해석기를 다시 돌리지 않는다.
 *
 * - 바탕: 코드 줄 · 함수 이름 (init 이 한 번 정한다)
 * - 자취: 자리들(주소 · 내용 · 그 내용을 쓴 틀 · 지금 주인 이름) · 서 있는 틀 · 떠 있는 돌려줄 값 ·
 *         주소를 받아 쥔 이름 · 출력
 * - 이번 걸음: step (지나간 것에서 출발하는 운동의 계기값을 싣는다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneVal = { t: 'num'; n: number } | { t: 'addr'; a: number } | null;

export type Cell = {
  addr: number;
  val: SceneVal;
  /** 지금 내용을 쓴 틀의 함수 이름 (맨 바깥이면 null) */
  by: string | null;
  /** 지금 이 자리를 가진 이름 — 틀이 걷히면 null */
  owner: string | null;
  /** 주인이 사는 틀 (맨 바깥이면 null) */
  ownerFn: string | null;
};

export type StandingFrame = { fn: string; base: number };

/** 주소를 받아 쥔 이름 — 받던 때 그 자리의 값을 함께 남긴다 */
export type Holder = { name: string; slot: number; addr: number; was: SceneVal };

export type DanglingStep =
  | { k: 'start' }
  | { k: 'call'; fn: string; base: number; slot: { name: string; addr: number } | null; from: number | null }
  | {
      k: 'assign';
      fn: string | null;
      name: string;
      addr: number;
      val: SceneVal;
      before: SceneVal;
      beforeBy: string | null;
      pointedBy: string | null;
      from: number | null;
    }
  | { k: 'return'; fn: string; val: SceneVal; ofName: string | null; from: number | null }
  | {
      k: 'back';
      fn: string;
      base: number;
      gone: { name: string; addr: number; val: SceneVal }[];
      to: { name: string; addr: number } | null;
      val: SceneVal;
      heldBy: string | null;
      from: number | null;
    }
  | { k: 'show'; val: SceneVal; by: string | null; deref: { name: string; slot: number; addr: number; was: SceneVal } | null; from: number | null };

export type DanglingScene = {
  lines: { indent: number; text: string }[];
  fns: string[];
  cells: Cell[];
  frames: StandingFrame[];
  /** 돌려주고 아직 받지 않은 값과 그 틀 */
  ret: { fn: string; val: SceneVal } | null;
  holders: Holder[];
  out: { val: SceneVal; by: string | null }[];
  at: number | null;
  step: DanglingStep;
};

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function val(v: unknown): SceneVal {
  const o = rec(v);
  if (typeof o.num === 'number') return { t: 'num', n: o.num };
  if (typeof o.addr === 'number') return { t: 'addr', a: o.addr };
  return null;
}
function nameAddr(v: unknown): { name: string; addr: number } | null {
  const o = rec(v);
  return typeof o.name === 'string' && typeof o.addr === 'number' ? { name: o.name, addr: o.addr } : null;
}

/** 자리 하나를 고친 새 목록 — 없으면 주소 차례로 끼운다 */
function putCell(cells: Cell[], addr: number, patch: Partial<Cell>): Cell[] {
  const found = cells.some((c) => c.addr === addr);
  const base: Cell[] = found
    ? cells
    : [...cells, { addr, val: null, by: null, owner: null, ownerFn: null }].sort((a, b) => a.addr - b.addr);
  return base.map((c) => (c.addr === addr ? { ...c, ...patch } : c));
}

const cellAt = (cells: Cell[], addr: number): Cell | undefined => cells.find((c) => c.addr === addr);

export function emptyDanglingScene(): DanglingScene {
  return { lines: [], fns: [], cells: [], frames: [], ret: null, holders: [], out: [], at: null, step: { k: 'start' } };
}

export const danglingReferenceScene: ScenePlan<DanglingScene> = {
  initial(initialData: unknown): DanglingScene {
    // 바탕을 값으로 베낀다 — 걸음 0 에 프로그램 전체가 보인다
    const d = rec(initialData);
    const raw = Array.isArray(d.lines) ? d.lines : [];
    const lines = raw.map((l) => ({ indent: num(rec(l).indent), text: str(rec(l).text) }));
    const fns = raw
      .map((l) => rec(rec(l).stmt))
      .filter((st) => st.k === 'def' && typeof st.name === 'string')
      .map((st) => st.name as string);
    return { ...emptyDanglingScene(), lines, fns };
  },

  reduce(scene: DanglingScene, event: FacetRuntimeEvent): DanglingScene {
    const p = rec(event.payload);
    const line = num(p.line, -1);
    const from = scene.at;
    const topFn = scene.frames.length > 0 ? scene.frames[scene.frames.length - 1].fn : null;

    switch (event.type) {
      case 'init': {
        const raw = Array.isArray(p.lines) ? p.lines : [];
        const lines = raw.map((l) => ({ indent: num(rec(l).indent), text: str(rec(l).text) }));
        const fns = Array.isArray(p.fns) ? p.fns.filter((f): f is string => typeof f === 'string') : [];
        return { ...emptyDanglingScene(), lines, fns };
      }
      case 'call': {
        const fn = str(p.fn);
        const base = num(p.base, 100);
        const slot = nameAddr(p.slot);
        const cells = slot
          ? putCell(scene.cells, slot.addr, { val: null, by: topFn, owner: slot.name, ownerFn: topFn })
          : scene.cells;
        return {
          ...scene,
          cells,
          frames: [...scene.frames, { fn, base }],
          at: line,
          step: { k: 'call', fn, base, slot, from },
        };
      }
      case 'assign': {
        const fn = strOrNull(p.fn);
        const name = str(p.name);
        const addr = num(p.addr);
        const v = val(p.value);
        const old = cellAt(scene.cells, addr);
        const holder = scene.holders.find((h) => h.addr === addr);
        const pointedBy = holder && holder.name !== name ? holder.name : null;
        return {
          ...scene,
          cells: putCell(scene.cells, addr, { val: v, by: fn, owner: name, ownerFn: fn }),
          at: line,
          step: {
            k: 'assign',
            fn,
            name,
            addr,
            val: v,
            before: old ? old.val : null,
            beforeBy: old ? old.by : null,
            pointedBy,
            from,
          },
        };
      }
      case 'return': {
        const fn = str(p.fn);
        const v = val(p.value);
        const target = v && v.t === 'addr' ? cellAt(scene.cells, v.a) : undefined;
        const ofName = target ? target.owner : null;
        return { ...scene, ret: { fn, val: v }, at: line, step: { k: 'return', fn, val: v, ofName, from } };
      }
      case 'back': {
        const fn = str(p.fn);
        const goneRaw = Array.isArray(p.gone) ? p.gone : [];
        const goneAddrs = goneRaw.map(nameAddr).filter((g): g is { name: string; addr: number } => g !== null);
        const gone = goneAddrs.map((g) => ({ ...g, val: cellAt(scene.cells, g.addr)?.val ?? null }));
        const standing = scene.frames.find((f) => f.fn === fn);
        const base = standing ? standing.base : goneAddrs[0]?.addr ?? 100;
        let cells = scene.cells;
        for (const g of goneAddrs) cells = putCell(cells, g.addr, { owner: null, ownerFn: null });
        const to = nameAddr(p.to);
        const v = val(p.value);
        let holders = scene.holders;
        if (to) {
          cells = putCell(cells, to.addr, { val: v, by: null });
          holders = holders.filter((h) => h.name !== to.name);
          if (v && v.t === 'addr') {
            holders = [...holders, { name: to.name, slot: to.addr, addr: v.a, was: cellAt(cells, v.a)?.val ?? null }];
          }
        }
        const heldBy = gone.map((g) => scene.holders.find((h) => h.addr === g.addr)?.name ?? null).find((n) => n) ?? null;
        return {
          ...scene,
          cells,
          frames: scene.frames.filter((f) => f.fn !== fn),
          ret: null,
          holders,
          at: line,
          step: { k: 'back', fn, base, gone, to, val: v, heldBy, from },
        };
      }
      case 'show': {
        const v = val(p.value);
        const d = rec(p.deref);
        const deref =
          typeof d.name === 'string' && typeof d.slot === 'number' && typeof d.addr === 'number'
            ? {
                name: d.name,
                slot: d.slot,
                addr: d.addr,
                was: scene.holders.find((h) => h.name === d.name)?.was ?? null,
              }
            : null;
        const by = deref ? cellAt(scene.cells, deref.addr)?.by ?? null : null;
        return {
          ...scene,
          out: [...scene.out, { val: v, by }],
          at: line,
          step: { k: 'show', val: v, by, deref, from },
        };
      }
      default:
        return scene;
    }
  },
};
