/**
 * non-repeatable-read 장면.
 *
 * 바탕 — 격리 수준 · 줄 이름 · 읽는 트랜잭션과 쓰는 트랜잭션 (initialData 에서 베낀다)
 * 자취 — 줄의 확정값 · 미확정 쓰기 · 읽은 값들 (이벤트가 쌓는다)
 * 이번 걸음 — step (계기값 `was` · `first` 를 실어 운동의 출발을 장면이 말한다)
 *
 * 셈(무엇이 보이는가)은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type NrrRead = { txn: number; row: string; value: number };
export type NrrPending = { txn: number; row: string; value: number };
export type NrrWrite = { row: string; value: number; was: number };

export type NrrStep =
  | { kind: 'read'; txn: number; row: string; value: number; nth: number; first: number }
  | { kind: 'write'; txn: number; row: string; value: number; committed: number }
  | { kind: 'commit'; txn: number; writes: NrrWrite[] };

export type NonRepeatableReadScene = {
  level: string;
  row: string;
  /** 줄의 지금 확정값 */
  committed: number;
  /** 읽는 트랜잭션 (차례에 R 이 있는 것), 처음 나온 차례 */
  readers: number[];
  /** 그 밖의 트랜잭션, 처음 나온 차례 */
  writers: number[];
  pending: NrrPending[];
  reads: NrrRead[];
  step: NrrStep | null;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`non-repeatable-read 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`non-repeatable-read 장면: ${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`non-repeatable-read 장면: ${k} 가 글자가 아니다`);
  return v;
}

export const nonRepeatableReadScene: ScenePlan<NonRepeatableReadScene> = {
  initial(initialData: unknown): NonRepeatableReadScene {
    const d = rec(initialData, 'initialData');
    const rows = d.rows;
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error('non-repeatable-read 장면: 줄은 하나여야 한다');
    }
    const r0 = rec(rows[0], 'rows[0]');
    const ops = d.ops;
    if (!Array.isArray(ops)) throw new Error('non-repeatable-read 장면: ops 가 배열이 아니다');
    const order: number[] = [];
    const reading = new Set<number>();
    for (const raw of ops) {
      const o = rec(raw, 'op');
      const txn = num(o, 'txn');
      if (!order.includes(txn)) order.push(txn);
      if (str(o, 'op') === 'R') reading.add(txn);
    }
    return {
      level: str(d, 'isolation'),
      row: str(r0, 'name'),
      committed: num(r0, 'value'),
      readers: order.filter((x) => reading.has(x)),
      writers: order.filter((x) => !reading.has(x)),
      pending: [],
      reads: [],
      step: null,
    };
  },

  reduce(scene: NonRepeatableReadScene, event: FacetRuntimeEvent): NonRepeatableReadScene {
    const p = event.payload === undefined ? {} : rec(event.payload, 'payload');
    switch (event.type) {
      case 'read': {
        const read = { txn: num(p, 'txn'), row: str(p, 'row'), value: num(p, 'value') };
        return {
          ...scene,
          pending: [...scene.pending],
          reads: [...scene.reads, read],
          step: { kind: 'read', ...read, nth: num(p, 'nth'), first: num(p, 'first') },
        };
      }
      case 'write': {
        const w = { txn: num(p, 'txn'), row: str(p, 'row'), value: num(p, 'value') };
        return {
          ...scene,
          pending: [...scene.pending.filter((x) => !(x.txn === w.txn && x.row === w.row)), w],
          reads: [...scene.reads],
          step: { kind: 'write', ...w, committed: num(p, 'committed') },
        };
      }
      case 'commit': {
        const txn = num(p, 'txn');
        const list = p.writes;
        if (!Array.isArray(list)) throw new Error('non-repeatable-read 장면: writes 가 배열이 아니다');
        const writes: NrrWrite[] = list.map((raw) => {
          const w = rec(raw, 'write');
          return { row: str(w, 'row'), value: num(w, 'value'), was: num(w, 'was') };
        });
        let committed = scene.committed;
        for (const w of writes) {
          if (w.row !== scene.row) throw new Error(`non-repeatable-read 장면: 없는 줄 ${w.row}`);
          committed = w.value;
        }
        return {
          ...scene,
          committed,
          pending: scene.pending.filter((x) => x.txn !== txn),
          reads: [...scene.reads],
          step: { kind: 'commit', txn, writes },
        };
      }
      default:
        throw new Error(`non-repeatable-read 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
