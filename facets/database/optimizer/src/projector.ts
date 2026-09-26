/**
 * optimizer projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동의 길이는 걸음마다 `runtime.getSpeed()` 를 그때 읽어 셈한다 (속도를 올리면 운동도 짧아진다).
 * payload 는 typeof 로 읽고, 모양이 틀리면 던진다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import { fillK } from './algorithm.js';
import type { OptimizerStageApi, PlanShape } from './optimizer-stage.js';

/** 한 걸음의 운동 길이 (1 배속). stepMs 1800 보다 짧다. */
const MOTION_MS = 900;

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function obj(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`optimizer projector: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`optimizer projector: ${what} 가 수가 아니다`);
  return x;
}
function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`optimizer projector: ${what} 가 글자가 아니다`);
  return x;
}
function nums(x: unknown, what: string): number[] {
  if (!Array.isArray(x)) throw new Error(`optimizer projector: ${what} 가 배열이 아니다`);
  return x.map((v) => num(v, what));
}
function strs(x: unknown, what: string): string[] {
  if (!Array.isArray(x)) throw new Error(`optimizer projector: ${what} 가 배열이 아니다`);
  return x.map((v) => str(v, what));
}
function plan(x: unknown): PlanShape {
  const o = obj(x, 'plan');
  if (!Array.isArray(o.children)) throw new Error('optimizer projector: plan.children 가 배열이 아니다');
  return {
    id: str(o.id, 'plan.id'),
    op: str(o.op, 'plan.op'),
    detail: str(o.detail, 'plan.detail'),
    children: o.children.map(plan),
  };
}

export const optimizerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as OptimizerStageApi | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    /** 걸음 0 이전 — 첫 k · 첫 차례의 SQL 과 트리를 그린다 (자료의 `{k}` 를 채울 뿐 셈하지 않는다). */
    onInit(data) {
      const d = obj(data, 'initialData');
      const k = num(d.filteredCustomers, 'filteredCustomers');
      const order = num(d.joinOrder, 'joinOrder');
      const orderIds = strs(d.joinOrders, 'joinOrders');
      if (!Array.isArray(d.plans)) throw new Error('optimizer projector: plans 가 배열이 아니다');
      const orderId = orderIds[order];
      const raw = d.plans[order];
      if (orderId === undefined || raw === undefined) throw new Error(`optimizer projector: 차례 ${order} 가 없다`);
      const fill = (node: PlanShape): PlanShape => ({ ...node, detail: fillK(node.detail, k), children: node.children.map(fill) });
      stage?.showInitial({ orderId, sql: strs(d.sql, 'sql').map((line) => fillK(line, k)), plan: fill(plan(raw)) });
    },
    onEvent(e) {
      const p = e.payload;
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase(str(obj(p, 'phase').phase, 'phase'));
          return;
        }
        case 'round': {
          const o = obj(p, 'round');
          code?.highlightPhase(null);
          stage?.beginRound({
            orderId: str(o.orderId, 'orderId'),
            sql: strs(o.sql, 'sql'),
            plan: plan(o.plan),
            keptCustomerIds: nums(o.keptCustomerIds, 'keptCustomerIds'),
            keptCount: num(o.keptCount, 'keptCount'),
            customerCount: num(o.customerCount, 'customerCount'),
            ms: motion(),
          });
          return;
        }
        case 'first-join': {
          const o = obj(p, 'first-join');
          stage?.firstJoin({
            nodeId: str(o.nodeId, 'nodeId'),
            cond: str(o.detail, 'detail'),
            ids: nums(o.middleOrderIds, 'middleOrderIds'),
            count: num(o.middleCount, 'middleCount'),
            ms: motion(),
          });
          return;
        }
        case 'second-join': {
          const o = obj(p, 'second-join');
          if (!Array.isArray(o.finalRows)) throw new Error('optimizer projector: finalRows 가 배열이 아니다');
          stage?.secondJoin({
            nodeId: str(o.nodeId, 'nodeId'),
            cond: str(o.detail, 'detail'),
            rows: o.finalRows.map((r) => {
              const row = obj(r, 'finalRow');
              return { key: str(row.key, 'finalRow.key'), cells: strs(row.cells, 'finalRow.cells') };
            }),
            finalCount: num(o.finalCount, 'finalCount'),
            madeCount: num(o.madeCount, 'madeCount'),
            ms: motion(),
          });
          return;
        }
        case 'compare': {
          const o = obj(p, 'compare');
          stage?.compare({
            made: nums(o.made, 'made'),
            orderIds: strs(o.orderIds, 'orderIds'),
            cheaper: num(o.cheaper, 'cheaper'),
            current: num(o.current, 'current'),
            ms: motion(),
          });
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight();
    },
  };
};
