/**
 * traversal-order projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌 뒤 넘긴다 (C9). stage 는 필수 필드 타입만 받으므로
 * `event.payload` 가 그대로 건너가는 일이 없다. 화면 문안은 `runtime.t` 로
 * 조회한 문자열만 건넨다 — 코드에는 키와 en 원본만 남는다 (C10).
 */

import {
  makeTranslator,
  parseTarget,
  type FacetEventTarget,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type Translate,
} from '@ffacet/core/runtime';
import { isTraversalMoment, type TraversalMoment } from './algorithm.js';

type TraversalStage = {
  init(data: { values: number[]; orders: TraversalMoment[]; stepMs: number }): void;
  beginOrder(order: TraversalMoment, index: number): void;
  touch(value: number, moment: TraversalMoment, counted: boolean): void;
  record(order: TraversalMoment, slot: number, value: number): void;
  endOrder(index: number): void;
  finish(): void;
  rewind(): void;
  setCaption(text: string): void;
};

const DEFAULT_STEP_MS = 480;

/** `node:<값>` 하나를 값으로 되돌린다. 식별자 파싱은 parseTarget 을 경유한다. */
function nodeValue(target: FacetEventTarget | undefined): number | null {
  const raw = Array.isArray(target) ? target[0] : target;
  if (typeof raw !== 'string') return null;
  const parsed = parseTarget(raw);
  if (parsed === null || parsed.prefix !== 'node') return null;
  const value = Number(parsed.id);
  return Number.isNaN(value) ? null : value;
}

export const traversalOrderProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TraversalStage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 지금 화면에서 무슨 일이 일어나는지. 세 차례가 한 논증의 세 단계다. */
  const captionFor = (order: TraversalMoment): string => {
    if (order === 'pre') {
      return tr('caption.pre', 'Preorder — step on your own place first, then left, then right.');
    }
    if (order === 'in') {
      return tr('caption.in', 'Inorder — left first, then your own place, then right.');
    }
    return tr('caption.post', 'Postorder — both children first, then your own place.');
  };

  return {
    onInit(initialData: unknown): void {
      const data = (initialData ?? {}) as {
        values?: unknown;
        orders?: unknown;
        stepMs?: unknown;
      };
      const values = Array.isArray(data.values)
        ? data.values.filter((v): v is number => typeof v === 'number')
        : [];
      const orders = Array.isArray(data.orders) ? data.orders.filter(isTraversalMoment) : [];
      const stepMs =
        typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : DEFAULT_STEP_MS;
      stage?.init({ values, orders, stepMs });
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'order-begin': {
          const payload = (event.payload ?? {}) as { order?: unknown; index?: unknown };
          const order = isTraversalMoment(payload.order) ? payload.order : null;
          const index = typeof payload.index === 'number' ? payload.index : -1;
          if (order === null || index < 0) return;
          stage?.beginOrder(order, index);
          stage?.setCaption(captionFor(order));
          return;
        }
        case 'touch': {
          const value = nodeValue(event.target);
          const payload = (event.payload ?? {}) as { moment?: unknown; counted?: unknown };
          const moment = isTraversalMoment(payload.moment) ? payload.moment : null;
          if (value === null || moment === null) return;
          stage?.touch(value, moment, payload.counted === true);
          return;
        }
        case 'record': {
          const payload = (event.payload ?? {}) as {
            order?: unknown;
            slot?: unknown;
            value?: unknown;
          };
          const order = isTraversalMoment(payload.order) ? payload.order : null;
          const slot = typeof payload.slot === 'number' ? payload.slot : -1;
          const value = typeof payload.value === 'number' ? payload.value : nodeValue(event.target);
          if (order === null || slot < 0 || value === null) return;
          stage?.record(order, slot, value);
          return;
        }
        case 'order-end': {
          const payload = (event.payload ?? {}) as { index?: unknown };
          const index = typeof payload.index === 'number' ? payload.index : -1;
          if (index < 0) return;
          stage?.endOrder(index);
          return;
        }
        case 'done': {
          stage?.finish();
          stage?.setCaption(
            tr(
              'caption.done',
              'Same tree, same route. Only the moment of stepping on its own place moves.',
            ),
          );
          return;
        }
        case 'rewind': {
          stage?.rewind();
          stage?.setCaption('');
          return;
        }
        default:
          // 이 조각의 algorithm 은 위 여섯 말고는 발신하지 않는다. 그 밖의
          // 이벤트가 오면 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
