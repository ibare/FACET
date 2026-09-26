/**
 * convolution projector — algorithm 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동의 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 재생 속도를 따른다.
 * 판 머리의 코드 패널은 이 판의 첫 phase(`output-size`)가 round-start 앞에 와서 앞 판의 강조를 덮는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  ConvolutionPadArgs,
  ConvolutionRowArgs,
  ConvolutionStage,
  ConvolutionStartArgs,
  ConvolutionSummaryArgs,
} from './convolution-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function record(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`convolution projector: ${type} 의 payload 가 객체가 아니다`);
  return payload as Record<string, unknown>;
}

function int(p: Record<string, unknown>, key: string, type: string): number {
  const value = p[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`convolution projector: ${type}.${key} 가 정수가 아니다`);
  return value;
}

function intList(p: Record<string, unknown>, key: string, type: string): number[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`convolution projector: ${type}.${key} 가 목록이 아니다`);
  return value.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`convolution projector: ${type}.${key}[${i}] 가 정수가 아니다`);
    return x;
  });
}

function intGrid(p: Record<string, unknown>, key: string, type: string): number[][] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`convolution projector: ${type}.${key} 가 목록이 아니다`);
  return value.map((line, i) => intList({ line }, 'line', `${type}.${key}[${i}]`));
}

function pairs(p: Record<string, unknown>, key: string, type: string): [number, number][] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`convolution projector: ${type}.${key} 가 목록이 아니다`);
  return value.map((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`convolution projector: ${type}.${key}[${i}] 가 좌표 둘이 아니다`);
    const [r, c] = pair as unknown[];
    if (typeof r !== 'number' || typeof c !== 'number') throw new Error(`convolution projector: ${type}.${key}[${i}] 의 좌표가 수가 아니다`);
    return [r, c];
  });
}

export const convolutionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ConvolutionStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let motionMs = 0;
  const ms = (): number => motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      const type = event.type;
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, type);
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('convolution projector: phase.phase 가 글자가 아니다');
          codePanel?.highlightPhase(phase);
          return;
        }
        case 'round-start': {
          const p = record(event.payload, type);
          motionMs = int(p, 'motionMs', type);
          const args: ConvolutionStartArgs = {
            stride: int(p, 'stride', type),
            padding: int(p, 'padding', type),
            n: int(p, 'n', type),
            k: int(p, 'k', type),
            o: int(p, 'o', type),
            paddedSide: int(p, 'paddedSide', type),
            input: intGrid(p, 'input', type),
            kernel: intGrid(p, 'kernel', type),
            anchors: pairs(p, 'anchors', type),
          };
          stage?.start(args, ms());
          return;
        }
        case 'pad': {
          const p = record(event.payload, type);
          const args: ConvolutionPadArgs = {
            padValue: int(p, 'padValue', type),
            paddedSide: int(p, 'paddedSide', type),
            paddedCells: int(p, 'paddedCells', type),
          };
          stage?.pad(args, ms());
          return;
        }
        case 'row': {
          const p = record(event.payload, type);
          const args: ConvolutionRowArgs = {
            row: int(p, 'row', type),
            anchors: pairs(p, 'anchors', type),
            values: intList(p, 'values', type),
            cover: intGrid(p, 'cover', type),
            placed: int(p, 'placed', type),
            touched: int(p, 'touched', type),
          };
          stage?.row(args, ms());
          return;
        }
        case 'cover-summary': {
          const p = record(event.payload, type);
          const args: ConvolutionSummaryArgs = {
            dropped: int(p, 'dropped', type),
            droppedRows: intList(p, 'droppedRows', type),
            droppedCols: intList(p, 'droppedCols', type),
            cornerUse: int(p, 'cornerUse', type),
            maxUse: int(p, 'maxUse', type),
            cover: intGrid(p, 'cover', type),
          };
          stage?.summary(args, ms());
          return;
        }
        default:
          throw new Error(`convolution projector: 모르는 이벤트 '${type}'`);
      }
    },
    onReset() {
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
