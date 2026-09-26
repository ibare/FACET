/**
 * shared-vs-exclusive 장면.
 *
 * - 바탕: 줄 이름과 그 줄에 올 요청 수(`cap` — 쌓을 칸의 높이를 정한다), 트랜잭션 목록(색의 차례).
 *   initialData 의 구조에서 베낀다
 * - 자취: 줄마다 쥔 이(허락된 차례) · 튕겨 난 요청(막힌 차례)
 * - 이번 걸음: 방금 허락되었거나 막힌 요청 하나
 *
 * 허락 · 막힘의 셈은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Mode = 'S' | 'X';

export type Hold = { txn: string; mode: Mode };

export type Turned = { txn: string; mode: Mode; blockers: Hold[] };

export type RowScene = {
  name: string;
  cap: number;
  holders: Hold[];
  turned: Turned[];
};

export type SharedVsExclusiveStep =
  | { kind: 'grant'; row: string; txn: string; mode: Mode }
  | { kind: 'block'; row: string; txn: string; mode: Mode; blockers: Hold[] };

export type SharedVsExclusiveScene = {
  rows: RowScene[];
  txns: string[];
  step: SharedVsExclusiveStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readMode(v: unknown, where: string): Mode {
  if (v === 'S' || v === 'X') return v;
  throw new Error(`shared-vs-exclusive scene: ${where} 의 잠금 종류가 S · X 가 아니다`);
}

function readString(v: unknown, where: string): string {
  if (typeof v === 'string' && v.length > 0) return v;
  throw new Error(`shared-vs-exclusive scene: ${where} 가 빈 이름이다`);
}

function readHold(v: unknown, where: string): Hold {
  if (!isRecord(v)) throw new Error(`shared-vs-exclusive scene: ${where} 가 객체가 아니다`);
  return { txn: readString(v.txn, `${where}.txn`), mode: readMode(v.mode, where) };
}

function initial(initialData: unknown): SharedVsExclusiveScene {
  if (!isRecord(initialData) || !Array.isArray(initialData.rows) || !Array.isArray(initialData.requests)) {
    throw new Error('shared-vs-exclusive scene: initialData 에 rows · requests 가 없다');
  }
  const names = initialData.rows.map((r, i) => readString(r, `rows[${i}]`));
  const requests = initialData.requests.map((r, i) => {
    if (!isRecord(r)) throw new Error(`shared-vs-exclusive scene: requests[${i}] 가 객체가 아니다`);
    return { txn: readString(r.txn, `requests[${i}].txn`), row: readString(r.row, `requests[${i}].row`) };
  });
  const txns: string[] = [];
  for (const r of requests) {
    if (!names.includes(r.row)) throw new Error(`shared-vs-exclusive scene: 없는 줄 '${r.row}'`);
    if (!txns.includes(r.txn)) txns.push(r.txn);
  }
  return {
    rows: names.map((name) => ({
      name,
      cap: requests.filter((r) => r.row === name).length,
      holders: [],
      turned: [],
    })),
    txns,
    step: null,
  };
}

function reduce(scene: SharedVsExclusiveScene, event: FacetRuntimeEvent): SharedVsExclusiveScene {
  if (event.type !== 'grant' && event.type !== 'block') return scene;
  const p = event.payload;
  if (!isRecord(p)) throw new Error(`shared-vs-exclusive scene: ${event.type} payload 가 없다`);
  const row = readString(p.row, 'payload.row');
  const txn = readString(p.txn, 'payload.txn');
  const mode = readMode(p.mode, 'payload');
  if (!scene.rows.some((r) => r.name === row)) {
    throw new Error(`shared-vs-exclusive scene: 없는 줄 '${row}'`);
  }

  if (event.type === 'grant') {
    return {
      ...scene,
      rows: scene.rows.map((r) =>
        r.name === row ? { ...r, holders: [...r.holders, { txn, mode }] } : r,
      ),
      step: { kind: 'grant', row, txn, mode },
    };
  }

  if (!Array.isArray(p.blockers) || p.blockers.length === 0) {
    throw new Error('shared-vs-exclusive scene: block 에 막은 이가 없다');
  }
  const blockers = p.blockers.map((b, i) => readHold(b, `blockers[${i}]`));
  return {
    ...scene,
    rows: scene.rows.map((r) =>
      r.name === row
        ? { ...r, turned: [...r.turned, { txn, mode, blockers: blockers.map((b) => ({ ...b })) }] }
        : r,
    ),
    step: { kind: 'block', row, txn, mode, blockers },
  };
}

export const sharedVsExclusiveScene: ScenePlan<SharedVsExclusiveScene> = { initial, reduce };
