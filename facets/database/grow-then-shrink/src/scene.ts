/**
 * grow-then-shrink 장면 — 알고리즘의 acquire / release 를 잇기만 한다.
 *
 * 바탕 : txn · ops (initialData 에서 베낀다)
 * 자취 : held (쥔 잠금, 잡은 차례) · done (연산을 마친 줄) · released (놓은 잠금과 그 기다린 걸음) ·
 *        counts (걸음마다 쥔 수) ·
 *        lockPoint (잠금 지점이 된 걸음) · committed
 * 이번 걸음 : step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LockMode = 'S' | 'X';

export type GrowThenShrinkSceneOp = { op: 'R' | 'W'; row: string };

export type HeldLock = { row: string; mode: LockMode; waited: number };

export type GrowThenShrinkStep =
  | { kind: 'acquire'; row: string; mode: LockMode; op: 'R' | 'W'; lockPoint: boolean }
  | { kind: 'release'; row: string; mode: LockMode; slot: number; commit: boolean; waited: number };

export type GrowThenShrinkScene = {
  txn: number;
  ops: GrowThenShrinkSceneOp[];
  held: HeldLock[];
  done: string[];
  released: { row: string; waited: number }[];
  counts: number[];
  lockPoint: number | null;
  committed: boolean;
  step: GrowThenShrinkStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`grow-then-shrink 장면: ${k} 가 글자가 아니다`);
  return v;
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`grow-then-shrink 장면: ${k} 가 수가 아니다`);
  return v;
}

function bool(p: Record<string, unknown>, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`grow-then-shrink 장면: ${k} 가 참거짓이 아니다`);
  return v;
}

function mode(p: Record<string, unknown>): LockMode {
  const v = str(p, 'mode');
  if (v !== 'S' && v !== 'X') throw new Error(`grow-then-shrink 장면: 모르는 잠금 ${v}`);
  return v;
}

function opKind(v: unknown): 'R' | 'W' {
  if (v !== 'R' && v !== 'W') throw new Error(`grow-then-shrink 장면: 모르는 연산 ${String(v)}`);
  return v;
}

function waitedOf(p: Record<string, unknown>): Map<string, number> {
  const raw = p['waited'];
  if (!Array.isArray(raw)) throw new Error('grow-then-shrink 장면: waited 가 목록이 아니다');
  const out = new Map<string, number>();
  for (const w of raw) {
    if (!isRecord(w)) throw new Error('grow-then-shrink 장면: waited 항목 모양이 틀렸다');
    out.set(str(w, 'row'), num(w, 'n'));
  }
  return out;
}

export const growThenShrinkScene: ScenePlan<GrowThenShrinkScene> = {
  initial(initialData: unknown): GrowThenShrinkScene {
    if (!isRecord(initialData)) throw new Error('grow-then-shrink 장면: initialData 가 없다');
    const txn = num(initialData, 'txn');
    const rawOps = initialData['ops'];
    if (!Array.isArray(rawOps) || rawOps.length === 0) throw new Error('grow-then-shrink 장면: ops 가 없다');
    const ops = rawOps.map((o) => {
      if (!isRecord(o)) throw new Error('grow-then-shrink 장면: ops 항목 모양이 틀렸다');
      return { op: opKind(o['op']), row: str(o, 'row') };
    });
    return { txn, ops, held: [], done: [], released: [], counts: [0], lockPoint: null, committed: false, step: null };
  },

  reduce(scene: GrowThenShrinkScene, event: FacetRuntimeEvent): GrowThenShrinkScene {
    const p = event.payload;
    if (event.type === 'acquire') {
      if (!isRecord(p)) throw new Error('grow-then-shrink 장면: acquire 에 payload 가 없다');
      const row = str(p, 'row');
      const m = mode(p);
      const lockPoint = bool(p, 'lockPoint');
      const waited = waitedOf(p);
      const held = [...scene.held.map((h) => ({ ...h })), { row, mode: m, waited: 0 }].map((h) => {
        const n = waited.get(h.row);
        if (n === undefined) throw new Error(`grow-then-shrink 장면: ${h.row} 의 기다림이 없다`);
        return { ...h, waited: n };
      });
      const count = num(p, 'held');
      if (count !== held.length) throw new Error('grow-then-shrink 장면: 쥔 수가 맞지 않는다');
      const counts = [...scene.counts, count];
      return {
        ...scene,
        held,
        done: [...scene.done, row],
        counts,
        lockPoint: lockPoint ? counts.length - 1 : scene.lockPoint,
        step: { kind: 'acquire', row, mode: m, op: opKind(p['op']), lockPoint },
      };
    }
    if (event.type === 'release') {
      if (!isRecord(p)) throw new Error('grow-then-shrink 장면: release 에 payload 가 없다');
      const row = str(p, 'row');
      const slot = num(p, 'slot');
      const commit = bool(p, 'commit');
      const gone = scene.held[slot];
      if (gone === undefined || gone.row !== row) throw new Error(`grow-then-shrink 장면: ${row} 가 ${slot} 자리에 없다`);
      const held = scene.held.filter((_, i) => i !== slot).map((h) => ({ ...h }));
      const count = num(p, 'held');
      if (count !== held.length) throw new Error('grow-then-shrink 장면: 쥔 수가 맞지 않는다');
      return {
        ...scene,
        held,
        counts: [...scene.counts, count],
        released: [...scene.released.map((r) => ({ ...r })), { row, waited: gone.waited }],
        committed: commit,
        step: { kind: 'release', row, mode: mode(p), slot, commit, waited: gone.waited },
      };
    }
    throw new Error(`grow-then-shrink 장면: 모르는 이벤트 ${event.type}`);
  },
};
