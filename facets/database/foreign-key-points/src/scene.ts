/**
 * foreign-key-points 장면 — 이벤트를 잇기만 한다. 값으로 찾는 셈은 알고리즘이 했다.
 *
 * 바탕   parent · child · incoming — `initial()` 이 initialData 에서 베낀다 (걸음 0 = 두 표)
 * 자취   links   — 지금까지 가 닿은 가리킴 (자식 줄 자리 → 부모 줄 자리)
 *        outcome — 들어오려는 줄의 결말 (아직이면 null)
 * 이번   step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readForeignKeyPointsData,
  type FkCell,
  type FkChildTable,
  type FkParentTable,
} from './algorithm.js';

export type FkLink = { order: number; customer: number };

export type FkOutcome = { accepted: boolean; matches: number; customer: number | null };

export type FkStep =
  | { kind: 'tables' }
  | { kind: 'follow'; order: number; customer: number; pointed: number }
  | { kind: 'insert'; accepted: boolean; matches: number; customer: number | null };

export type ForeignKeyPointsScene = {
  parent: FkParentTable;
  child: FkChildTable;
  incoming: FkCell[];
  links: FkLink[];
  outcome: FkOutcome | null;
  step: FkStep;
};

function copyRows(rows: FkCell[][]): FkCell[][] {
  return rows.map((r) => [...r]);
}

function readInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`foreign-key-points 장면: ${what} 가 줄 자리가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`foreign-key-points 장면: ${event.type} 에 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const foreignKeyPointsScene: ScenePlan<ForeignKeyPointsScene> = {
  initial(initialData: unknown): ForeignKeyPointsScene {
    const d = readForeignKeyPointsData(initialData);
    return {
      parent: { ...d.parent, columns: [...d.parent.columns], rows: copyRows(d.parent.rows) },
      child: {
        ...d.child,
        columns: [...d.child.columns],
        foreignKey: { ...d.child.foreignKey },
        rows: copyRows(d.child.rows),
      },
      incoming: [...d.incoming],
      links: [],
      outcome: null,
      step: { kind: 'tables' },
    };
  },

  reduce(scene: ForeignKeyPointsScene, event: FacetRuntimeEvent): ForeignKeyPointsScene {
    if (event.type === 'follow') {
      const p = payloadOf(event);
      const order = readInt(p.order, 'order');
      const customer = readInt(p.customer, 'customer');
      const pointed = readInt(p.pointed, 'pointed');
      if (order >= scene.child.rows.length) throw new Error(`foreign-key-points 장면: 주문 줄 ${order} 가 없다`);
      if (customer >= scene.parent.rows.length) throw new Error(`foreign-key-points 장면: 고객 줄 ${customer} 가 없다`);
      return {
        ...scene,
        links: [...scene.links, { order, customer }],
        step: { kind: 'follow', order, customer, pointed },
      };
    }
    if (event.type === 'insert') {
      const p = payloadOf(event);
      const matches = readInt(p.matches, 'matches');
      if (typeof p.accepted !== 'boolean') throw new Error('foreign-key-points 장면: insert 의 accepted 가 없다');
      const accepted = p.accepted;
      const customer = p.customer === null ? null : readInt(p.customer, 'customer');
      if (accepted && customer === null) throw new Error('foreign-key-points 장면: 받은 줄이 닿은 고객 줄이 없다');
      const outcome: FkOutcome = { accepted, matches, customer };
      if (!accepted || customer === null) {
        return { ...scene, outcome, step: { kind: 'insert', accepted, matches, customer } };
      }
      const order = scene.child.rows.length;
      return {
        ...scene,
        child: { ...scene.child, rows: [...copyRows(scene.child.rows), [...scene.incoming]] },
        links: [...scene.links, { order, customer }],
        outcome,
        step: { kind: 'insert', accepted, matches, customer },
      };
    }
    throw new Error(`foreign-key-points 장면: 모르는 이벤트 ${event.type}`);
  },
};
