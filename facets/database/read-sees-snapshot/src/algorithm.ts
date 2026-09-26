/**
 * readSeesSnapshot — 스냅샷 읽기 (MVCC).
 *
 * 한 줄의 판(version) 사슬 위에서 사건을 차례로 돌린다. 사건 하나에 틱 하나,
 * `firstTick` 부터 1 씩 센다. 알고리즘이 판 사슬을 쥐고 셈하며, 장면은 그 결과만 잇는다.
 *
 * 규약 (사양 그대로):
 *   - 스냅샷 = 트랜잭션이 **시작한 틱**. 트랜잭션 안의 모든 읽기가 그 스냅샷을 쓴다.
 *   - 쓰기는 커밋 안 된 새 판(시작 틱 없음, 끝 틱 없음)을 사슬 끝에 붙인다.
 *   - 커밋은 그 틱을 찍는다 — 커밋된 판 가운데 끝 틱이 없는 판(지금 판)의 끝 틱과
 *     새 판의 시작 틱이 모두 커밋 틱이 된다.
 *   - 보임 규칙: 시작 틱이 있고(커밋됨) `시작 틱 ≤ 스냅샷 < 끝 틱` (끝 틱 없음 = 무한).
 *     보이는 판이 하나가 아니면 셈할 수 없는 상태로 던진다.
 *
 * 이벤트 (전부 silent 아님 — 사건 하나가 걸음 하나):
 *   - 'begin'  { tick: number; txn: string; snap: number }
 *       트랜잭션 시작. snap 은 그 틱.
 *   - 'write'  { tick: number; txn: string; value: number; version: number }
 *       커밋 안 된 새 판을 사슬의 version 번째(0 부터) 자리에 붙였다.
 *   - 'commit' { tick: number; txn: string; version: number; closed: number }
 *       version 번째 판의 시작 틱과 closed 번째 판의 끝 틱이 tick 이 된다.
 *   - 'read'   { tick: number; txn: string; snap: number; value: number; version: number }
 *       snap 으로 보이는 판 하나(version 번째)를 골라 그 값을 읽었다.
 *
 * ctx.metric 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SnapshotEvent =
  | { kind: 'begin'; txn: string }
  | { kind: 'write'; txn: string; value: number }
  | { kind: 'commit'; txn: string }
  | { kind: 'read'; txn: string };

export type ReadSeesSnapshotFacetData = {
  type: 'read-sees-snapshot';
  stepMs: number;
  /** 줄 이름 (자료, 번역하지 않는다) */
  row: string;
  /** 처음 판의 값 */
  value: number;
  /** 처음 판의 시작 틱 */
  versionTick: number;
  /** 첫 사건의 틱 */
  firstTick: number;
  events: SnapshotEvent[];
};

/** 사슬의 판 하나. start 가 null 이면 커밋 전, end 가 null 이면 끝 없음. */
type Version = { value: number; start: number | null; end: number | null; by: string | null };

export async function readSeesSnapshot(
  context: FacetContext<ReadSeesSnapshotFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ReadSeesSnapshotFacetData>;
  const { stepMs, events, row } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const chain: Version[] = [
    { value: ctx.data.value, start: ctx.data.versionTick, end: null, by: null },
  ];
  const pending = new Map<string, number>();
  const snaps = new Map<string, number>();

  let tick = ctx.data.firstTick;
  // 걸음 0 은 이미 읽을 것(처음 판)이 있는 화면이라 첫 사건 앞에도 문을 둔다.
  for (const ev of events) {
    if (!(await pause())) return;
    switch (ev.kind) {
      case 'begin': {
        if (snaps.has(ev.txn)) throw new Error(`${ev.txn} 이 두 번 시작한다 (틱 ${tick})`);
        snaps.set(ev.txn, tick);
        await ctx.emit({ type: 'begin', payload: { tick, txn: ev.txn, snap: tick } });
        break;
      }
      case 'write': {
        if (pending.has(ev.txn)) throw new Error(`${ev.txn} 이 커밋 전에 또 쓴다 (틱 ${tick})`);
        chain.push({ value: ev.value, start: null, end: null, by: ev.txn });
        const version = chain.length - 1;
        pending.set(ev.txn, version);
        await ctx.emit({ type: 'write', payload: { tick, txn: ev.txn, value: ev.value, version } });
        break;
      }
      case 'commit': {
        const version = pending.get(ev.txn);
        if (version === undefined) throw new Error(`${ev.txn} 은 쓴 것 없이 커밋한다 (틱 ${tick})`);
        const current = chain
          .map((v, i) => ({ v, i }))
          .filter(({ v }) => v.start !== null && v.end === null);
        if (current.length !== 1) {
          throw new Error(`${row} 의 지금 판이 하나가 아니다: ${current.length} (틱 ${tick})`);
        }
        const closed = current[0]!.i;
        chain[closed] = { ...chain[closed]!, end: tick };
        chain[version] = { ...chain[version]!, start: tick };
        pending.delete(ev.txn);
        await ctx.emit({ type: 'commit', payload: { tick, txn: ev.txn, version, closed } });
        break;
      }
      case 'read': {
        const snap = snaps.get(ev.txn);
        if (snap === undefined) throw new Error(`${ev.txn} 은 시작하지 않고 읽는다 (틱 ${tick})`);
        const hits = chain
          .map((v, i) => ({ v, i }))
          .filter(({ v }) => v.start !== null && v.start <= snap && (v.end === null || snap < v.end));
        if (hits.length !== 1) {
          throw new Error(`${row} 에서 스냅샷 ${snap} 으로 보이는 판이 하나가 아니다: ${hits.length}`);
        }
        const hit = hits[0]!;
        await ctx.emit({
          type: 'read',
          payload: { tick, txn: ev.txn, snap, value: hit.v.value, version: hit.i },
        });
        break;
      }
      default: {
        const unknown: never = ev;
        throw new Error(`모르는 사건: ${JSON.stringify(unknown)}`);
      }
    }
    tick += 1;
  }
}
