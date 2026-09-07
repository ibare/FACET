/**
 * HashAvalanche Projector — algorithm 이벤트를 avalanche-stage view 호출로 번역.
 *
 * 조각 facet 이라 번역이 단순하다. 여섯 걸음이 여섯 메서드에 1:1 로 대응하고,
 * 분기도 상태도 없다.
 *
 * 문안은 전부 FacetJson.messages 에서 온다 (C10). 코드에는 키와 en 원본만 있다.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type AvalancheStage = {
  reset(): void;
  init(payload: unknown): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  revealInputs(): void;
  markInputDiff(countLabel: string): void;
  revealOutputs(arrowLabel: string): void;
  markOutputDiff(countLabel: string): void;
};

type InitPayload = {
  algorithmLabel?: string;
  inputTotalBits?: number;
  inputFlippedBits?: number;
  outputTotalBits?: number;
  outputFlippedBits?: number;
};

export const hashAvalancheProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as AvalancheStage | undefined;

  /** 상시 캡션. init 과 reset 두 곳에서 쓰이므로 en 원본은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'caption.base',
      'A hash turns a tiny change of the input into a completely different output.',
    );

  // init 이 준 수치. 각 층의 카운트 문안이 이 값으로 만들어진다.
  let algorithmLabel = '';
  let inputTotalBits = 0;
  let inputFlippedBits = 0;
  let outputTotalBits = 0;
  let outputFlippedBits = 0;

  return {
    onInit() {
      if (!stage) return;
      stage.setBaseCaption(baseCaption());
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as InitPayload;
          algorithmLabel = p.algorithmLabel ?? '';
          inputTotalBits = p.inputTotalBits ?? 0;
          inputFlippedBits = p.inputFlippedBits ?? 0;
          outputTotalBits = p.outputTotalBits ?? 0;
          outputFlippedBits = p.outputFlippedBits ?? 0;
          stage.init(event.payload);
          stage.setBaseCaption(baseCaption());
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
      stage.setBaseCaption(baseCaption());
    },
  };
};
