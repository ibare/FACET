/**
 * 수용 영역 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   stack     → stage.setStack  (판 머리 · 코드 패널 강조를 끈다)
 *   top-cell  → stage.showTop
 *   field     → stage.showField
 *   phase     → codePanel.highlightPhase
 *
 * 운동 길이는 payload 의 motionMs 를 **그때그때의** 재생 속도로 나눈다.
 * payload 는 typeof 로 좁히고, 어긋나면 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { ReceptiveFieldStage, StageField, StageLayer, StageLayerKind, StageStack, StageTop } from './receptive-field-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(x: unknown, where: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new Error(`receptiveFieldProjector: ${where} 가 객체가 아니다`);
  }
  return x as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`receptiveFieldProjector: ${where}.${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`receptiveFieldProjector: ${where}.${key} 가 글자가 아니다`);
  return v;
}

function kindOf(v: unknown): StageLayerKind {
  if (v === 'input' || v === 'conv' || v === 'pool') return v;
  throw new Error(`receptiveFieldProjector: 모르는 층 종류 ${String(v)}`);
}

function readStack(p: Record<string, unknown>): { stack: StageStack; motionMs: number } {
  const raw = p.layers;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('receptiveFieldProjector: stack.layers 가 비었다');
  const layers: StageLayer[] = raw.map((x, i) => {
    const o = rec(x, `stack.layers[${i}]`);
    return { id: str(o, 'id', 'layer'), kind: kindOf(o.kind), number: num(o, 'number', 'layer'), side: num(o, 'side', 'layer') };
  });
  const ext = rec(p.extent, 'stack.extent');
  return {
    stack: { layers, extent: { layerCount: num(ext, 'layerCount', 'extent'), sideSum: num(ext, 'sideSum', 'extent') } },
    motionMs: num(p, 'motionMs', 'stack'),
  };
}

function readTop(p: Record<string, unknown>): StageTop {
  return { layer: str(p, 'layer', 'top-cell'), row: num(p, 'row', 'top-cell'), col: num(p, 'col', 'top-cell'), weights: num(p, 'weights', 'top-cell') };
}

function readField(p: Record<string, unknown>): StageField {
  const w = p.window;
  if (w !== 'conv' && w !== 'pool') throw new Error('receptiveFieldProjector: field.window 가 conv · pool 이 아니다');
  if (typeof p.last !== 'boolean') throw new Error('receptiveFieldProjector: field.last 가 참거짓이 아니다');
  return {
    layer: str(p, 'layer', 'field'),
    window: w,
    k: num(p, 'k', 'field'),
    s: num(p, 's', 'field'),
    rowLo: num(p, 'rowLo', 'field'),
    rowHi: num(p, 'rowHi', 'field'),
    colLo: num(p, 'colLo', 'field'),
    colHi: num(p, 'colHi', 'field'),
    side: num(p, 'side', 'field'),
    cells: num(p, 'cells', 'field'),
    last: p.last,
  };
}

export const receptiveFieldProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ReceptiveFieldStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const dur = (): number => {
    if (motionMs === null) throw new Error('receptiveFieldProjector: 판 머리(stack) 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const ph = p.phase;
          if (ph !== null && typeof ph !== 'string') throw new Error('receptiveFieldProjector: phase 가 글자가 아니다');
          codePanel?.highlightPhase(ph);
          return;
        }
        case 'stack': {
          const read = readStack(rec(event.payload, 'stack'));
          motionMs = read.motionMs;
          codePanel?.highlightPhase(null);
          void stage?.setStack(read.stack, dur());
          return;
        }
        case 'top-cell': {
          const top = readTop(rec(event.payload, 'top-cell'));
          void stage?.showTop(top, dur());
          return;
        }
        case 'field': {
          const field = readField(rec(event.payload, 'field'));
          void stage?.showField(field, dur());
          return;
        }
        default:
          throw new Error(`receptiveFieldProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      stage?.clear();
      codePanel?.highlightPhase(null);
    },
  };
};
