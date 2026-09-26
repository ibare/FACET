/**
 * cache-invalidation projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 로 읽고, 모르는 이벤트 · 빠진 값은 무엇이 없는지 담아 던진다.
 * 운동의 길이는 그때그때 `runtime.getSpeed()` 를 읽어 정한다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  CacheInvalidationStage,
  StageCascade,
  StageFileChanged,
  StageRoundStart,
  StageSum,
  StageVerdict,
} from './cache-invalidation-stage.js';

/** 속도 1 에서 운동 하나의 길이 */
const MOTION_MS = 600;

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`cacheInvalidationProjector: ${where} 가 객체가 아니다`);
  return v as Obj;
}
function list(o: Obj, key: string, where: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`cacheInvalidationProjector: ${where}.${key} 가 배열이 아니다`);
  return v;
}
function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`cacheInvalidationProjector: ${where}.${key} 가 글자가 아니다`);
  return v;
}
function num(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`cacheInvalidationProjector: ${where}.${key} 가 수가 아니다`);
  return v;
}
function strOrNull(o: Obj, key: string, where: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`cacheInvalidationProjector: ${where}.${key} 가 글자도 null 도 아니다`);
  return v;
}
function verdict(o: Obj, where: string): StageVerdict {
  const v = o.verdict;
  if (v === 'cached' || v === 'own-file' || v === 'prev-layer') return v;
  throw new Error(`cacheInvalidationProjector: ${where}.verdict 가 모르는 값 ${String(v)}`);
}

function readRoundStart(payload: unknown): StageRoundStart {
  const o = obj(payload, 'round-start');
  return {
    orderId: str(o, 'orderId', 'round-start'),
    allSeconds: num(o, 'allSeconds', 'round-start'),
    layers: list(o, 'layers', 'round-start').map((raw) => {
      const l = obj(raw, 'round-start.layers[]');
      return {
        id: str(l, 'id', 'layer'),
        file: strOrNull(l, 'file', 'layer'),
        seconds: num(l, 'seconds', 'layer'),
        prevKey: str(l, 'prevKey', 'layer'),
      };
    }),
    files: list(o, 'files', 'round-start').map((raw) => {
      const f = obj(raw, 'round-start.files[]');
      return { name: str(f, 'name', 'file'), print: str(f, 'print', 'file'), content: str(f, 'content', 'file') };
    }),
  };
}

function readFileChanged(payload: unknown): StageFileChanged {
  const o = obj(payload, 'file-changed');
  return {
    name: str(o, 'name', 'file-changed'),
    before: str(o, 'before', 'file-changed'),
    after: str(o, 'after', 'file-changed'),
    content: str(o, 'content', 'file-changed'),
    layer: str(o, 'layer', 'file-changed'),
    position: num(o, 'position', 'file-changed'),
  };
}

function readCascade(payload: unknown): StageCascade {
  const o = obj(payload, 'cascade');
  return {
    firstChanged: num(o, 'firstChanged', 'cascade'),
    layers: list(o, 'layers', 'cascade').map((raw) => {
      const l = obj(raw, 'cascade.layers[]');
      return { id: str(l, 'id', 'cascade.layer'), newKey: str(l, 'newKey', 'cascade.layer'), verdict: verdict(l, 'cascade.layer') };
    }),
  };
}

function readSum(payload: unknown): StageSum {
  const o = obj(payload, 'redo-seconds');
  return {
    total: num(o, 'total', 'redo-seconds'),
    parts: list(o, 'parts', 'redo-seconds').map((raw) => {
      const part = obj(raw, 'redo-seconds.parts[]');
      return { id: str(part, 'id', 'part'), seconds: num(part, 'seconds', 'part') };
    }),
  };
}

export const cacheInvalidationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CacheInvalidationStage | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  const need = (): CacheInvalidationStage => {
    if (stage === undefined) throw new Error('cacheInvalidationProjector: stage 블록이 없다');
    return stage;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'round-start':
          need().startRound(readRoundStart(event.payload), motion());
          return;
        case 'file-changed':
          need().changeFile(readFileChanged(event.payload), motion());
          return;
        case 'cascade':
          need().cascade(readCascade(event.payload), motion());
          return;
        case 'redo-seconds':
          need().sum(readSum(event.payload), motion());
          return;
        default:
          throw new Error(`cacheInvalidationProjector: 모르는 이벤트 '${event.type}'`);
      }
    },
    onReset() {
      stage?.reset();
    },
  };
};
