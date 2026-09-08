/**
 * HashAvalanche Projector — algorithm 이벤트를 avalanche-stage view 호출로 번역.
 *
 * 조각 facet 이라 번역이 단순하다. 네 걸음이 네 메서드에 1:1 로 대응하고,
 * 분기도 상태도 거의 없다.
 *
 * 문안은 전부 FacetJson.messages 에서 온다 (C10). 코드에는 키와 en 원본만 있다.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type StageInit = {
  inputA: string;
  inputB: string;
  inputBitsA: boolean[];
  inputBitsB: boolean[];
  inputFlipped: boolean[];
  outputBitsA: boolean[];
  outputBitsB: boolean[];
  outputFlipped: boolean[];
};

type AvalancheStage = {
  reset(): void;
  init(payload: StageInit): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setNote(text: string): void;
  revealInputs(): void;
  markInputDiff(countLabel: string): void;
  revealOutputs(arrowLabel: string): void;
  markOutputDiff(countLabel: string): void;
};

type InitPayload = Partial<StageInit> & {
  algorithmLabel?: unknown;
  inputTotalBits?: unknown;
  inputFlippedBits?: unknown;
  outputTotalBits?: unknown;
  outputFlippedBits?: unknown;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function bits(v: unknown): boolean[] {
  return Array.isArray(v) ? v.map((b) => b === true) : [];
}
function narrowInit(p: InitPayload): StageInit {
  return {
    inputA: str(p.inputA),
    inputB: str(p.inputB),
    inputBitsA: bits(p.inputBitsA),
    inputBitsB: bits(p.inputBitsB),
    inputFlipped: bits(p.inputFlipped),
    outputBitsA: bits(p.outputBitsA),
    outputBitsB: bits(p.outputBitsB),
    outputFlipped: bits(p.outputFlipped),
  };
}

export const hashAvalancheProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as AvalancheStage | undefined;

  // init 이 준 수치. 각 층의 카운트 문안이 이 값으로 만들어진다.
  let algorithmLabel = '';
  let inputTotalBits = 0;
  let inputFlippedBits = 0;
  let outputTotalBits = 0;
  let outputFlippedBits = 0;

  return {
    onInit() {
      if (!stage) return;
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as InitPayload;
          algorithmLabel = str(p.algorithmLabel);
          inputTotalBits = num(p.inputTotalBits);
          inputFlippedBits = num(p.inputFlippedBits);
          outputTotalBits = num(p.outputTotalBits);
          outputFlippedBits = num(p.outputFlippedBits);
          stage.init(narrowInit(p));
          break;
        }

        case 'rewind': {
          // 손으로 짚기 시작 — 화면만 처음으로 돌린다. 데이터는 그대로다.
          stage.reset();
          break;
        }

        case 'reveal-inputs': {
          stage.revealInputs();
          break;
        }

        case 'mark-input-diff': {
          stage.markInputDiff(
            tr('label.bitDiff', '{flipped} / {total} bits differ', {
              flipped: String(inputFlippedBits),
              total: String(inputTotalBits),
            }),
          );
          break;
        }

        case 'reveal-outputs': {
          stage.revealOutputs(
            tr('label.through', '↓  {algorithm}  ↓', { algorithm: algorithmLabel }),
          );
          break;
        }

        case 'mark-output-diff': {
          stage.markOutputDiff(
            tr('label.bitDiff', '{flipped} / {total} bits differ', {
              flipped: String(outputFlippedBits),
              total: String(outputTotalBits),
            }),
          );
          stage.setCaption(
            tr(
              'caption.result',
              'Only {inputFlipped} of {inputTotal} input bits differ, but {outputFlipped} of {outputTotal} output bits do.',
              {
                inputFlipped: String(inputFlippedBits),
                inputTotal: String(inputTotalBits),
                outputFlipped: String(outputFlippedBits),
                outputTotal: String(outputTotalBits),
              },
            ),
          );
          break;
        }

        default:
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
    },
  };
};
