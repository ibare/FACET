/**
 * bit-mask projector — 덮개 이벤트를 그림의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 넘긴다. stage 는 필수 필드 타입으로만
 * 받는다 (C9). 문안은 키로 조회하고 en 원본만 이 파일에 리터럴로 남는다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type MaskScene = { maskBits: number[]; mask: number };
type ReadScene = { value: number };

/** stage 가 내주는 메서드 표면. 없는 메서드도 있을 수 있으므로 전부 optional (C9). */
type BitMaskStage = {
  showMask?(scene: MaskScene): void | Promise<void>;
  applyMask?(scene: ReadScene): void | Promise<void>;
  liftMask?(scene: ReadScene): void | Promise<void>;
  setCaption?(text: string): void;
  resetScene?(): void;
};

/**
 * 열린 payload 를 객체로 좁힌다. 아래 읽개들이 필드마다 `typeof` 를 보므로
 * 이 단언은 회피가 아니라 좁히개다 (C9).
 */
function asRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 0/1 만 담긴 배열로 좁힌다. 한 칸이라도 수가 아니면 통째로 버린다. */
function readBits(source: Record<string, unknown>, key: string): number[] | null {
  const value = source[key];
  if (!Array.isArray(value)) return null;
  const bits: number[] = [];
  for (const bit of value) {
    if (typeof bit !== 'number') return null;
    bits.push(bit === 1 ? 1 : 0);
  }
  return bits.length > 0 ? bits : null;
}

function readMaskScene(payload: unknown): MaskScene | null {
  const source = asRecord(payload);
  if (!source) return null;
  const maskBits = readBits(source, 'maskBits');
  const mask = readNumber(source, 'mask');
  return maskBits !== null && mask !== null ? { maskBits, mask } : null;
}

function readReadScene(payload: unknown): ReadScene | null {
  const source = asRecord(payload);
  if (!source) return null;
  const value = readNumber(source, 'value');
  return value !== null ? { value } : null;
}

export const bitMaskProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as BitMaskStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'mask-shown': {
          const scene = readMaskScene(event.payload);
          if (!scene) break;
          stage.setCaption?.(
            tr('caption.mask', 'The cover is punched: 1 is a hole, 0 is a lid.'),
          );
          await stage.showMask?.(scene);
          break;
        }
        case 'mask-applied': {
          const scene = readReadScene(event.payload);
          if (!scene) break;
          stage.setCaption?.(
            tr(
              'caption.applied',
              'Only the bits under the holes come through — all eight positions decide at once.',
            ),
          );
          await stage.applyMask?.(scene);
          break;
        }
        case 'mask-lifted': {
          const scene = readReadScene(event.payload);
          if (!scene) break;
          stage.setCaption?.(
            tr('caption.lifted', 'Take the cover off and the original value is untouched.'),
          );
          await stage.liftMask?.(scene);
          break;
        }
        case 'rewind': {
          stage.resetScene?.();
          break;
        }
        case 'done': {
          stage.setCaption?.(
            tr('caption.done', 'A mask keeps just the positions you need.'),
          );
          break;
        }
        default:
          // 이 algorithm 이 내지 않는 이벤트다. 조용히 흘린다 (C2).
          break;
      }
    },
    onReset(): void {
      // 되돌릴 때 stage 는 다시 마운트되지 않는다. 화면을 손수 처음으로 돌린다.
      stage.resetScene?.();
    },
  };
};
