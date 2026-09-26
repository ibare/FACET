/**
 * register-allocation projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 읽어 무대의 표면 타입으로 옮긴다. 비었거나 모양이 다르면 던진다 (C6 · C9).
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 (350ms 이하).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  RaComparedView,
  RaFreedView,
  RaReloadView,
  RaRoundView,
  RaSpillView,
  RaStage,
  RaTakeView,
} from './register-allocation-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

type Obj = Record<string, unknown>;

const MOTION_MS = 350;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`payload.${key} 가 글자가 아니다`);
  return v;
}
function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`payload.${key} 가 참거짓이 아니다`);
  return v;
}
function list(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`payload.${key} 가 배열이 아니다`);
  return v;
}
const freedOf = (o: Obj): RaFreedView[] =>
  list(o, 'freed').map((x) => {
    const f = obj(x, 'freed[]');
    return { value: str(f, 'value'), reg: num(f, 'reg') };
  });
const comparedOf = (o: Obj): RaComparedView[] =>
  list(o, 'compared').map((x) => {
    const f = obj(x, 'compared[]');
    return { value: str(f, 'value'), last: num(f, 'last') };
  });

function roundOf(o: Obj): RaRoundView {
  return {
    k: num(o, 'k'),
    lines: list(o, 'lines').map((x) => {
      const l = obj(x, 'lines[]');
      return { line: num(l, 'line'), text: str(l, 'text'), liveAfter: num(l, 'liveAfter'), fit: num(l, 'fit') };
    }),
    values: list(o, 'values').map((x) => {
      const v = obj(x, 'values[]');
      return { name: str(v, 'name'), color: num(v, 'color') };
    }),
    edges: list(o, 'edges').map((x) => {
      if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'string' || typeof x[1] !== 'string') {
        throw new Error('payload.edges[] 가 이름 둘이 아니다');
      }
      return [x[0], x[1]] as [string, string];
    }),
    colors: num(o, 'colors'),
    maxLive: num(o, 'maxLive'),
    total: num(o, 'total'),
  };
}
function takeOf(o: Obj): RaTakeView {
  return {
    line: num(o, 'line'),
    value: str(o, 'value'),
    reg: num(o, 'reg'),
    freed: freedOf(o),
    text: str(o, 'text'),
    total: num(o, 'total'),
    inserted: num(o, 'inserted'),
    done: bool(o, 'done'),
  };
}
function spillOf(v: unknown): RaSpillView | null {
  if (v === null) return null;
  const o = obj(v, 'payload.spill');
  return {
    victim: str(o, 'victim'),
    reg: num(o, 'reg'),
    slotIndex: num(o, 'slotIndex'),
    slotText: str(o, 'slotText'),
    compared: comparedOf(o),
    storeAt: num(o, 'storeAt'),
    storeText: str(o, 'storeText'),
  };
}
function reloadOf(o: Obj): RaReloadView {
  if (!('spill' in o)) throw new Error('payload.spill 이 없다');
  return {
    line: num(o, 'line'),
    value: str(o, 'value'),
    slotIndex: num(o, 'slotIndex'),
    slotText: str(o, 'slotText'),
    reg: num(o, 'reg'),
    loadAt: num(o, 'loadAt'),
    loadText: str(o, 'loadText'),
    spill: spillOf(o.spill),
    total: num(o, 'total'),
    inserted: num(o, 'inserted'),
  };
}

export const regAllocProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RaStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? Math.min(MOTION_MS, MOTION_MS / speed) : MOTION_MS;
  };
  const need = (): RaStage => {
    if (!stage) throw new Error('stage 가 없다');
    return stage;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          code?.highlightPhase?.(null);
          return need().round(roundOf(obj(event.payload, 'round payload')), ms());
        }
        case 'take':
          return need().take(takeOf(obj(event.payload, 'take payload')), ms());
        case 'evict': {
          const o = obj(event.payload, 'evict payload');
          return need().evict(
            {
              ...takeOf(o),
              victim: str(o, 'victim'),
              slotIndex: num(o, 'slotIndex'),
              slotText: str(o, 'slotText'),
              compared: comparedOf(o),
              storeAt: num(o, 'storeAt'),
              storeText: str(o, 'storeText'),
            },
            ms(),
          );
        }
        case 'reload':
          return need().reload(reloadOf(obj(event.payload, 'reload payload')), ms());
        case 'free': {
          const o = obj(event.payload, 'free payload');
          return need().free(
            { line: num(o, 'line'), freed: freedOf(o), text: str(o, 'text'), total: num(o, 'total'), inserted: num(o, 'inserted'), done: bool(o, 'done') },
            ms(),
          );
        }
        default:
          throw new Error(`모르는 이벤트: ${event.type}`);
      }
    },
    onReset() {
      stage?.clear();
      code?.highlightPhase?.(null);
    },
  };
};
