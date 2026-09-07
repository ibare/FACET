/**
 * HashFixedLength Projector — algorithm 이벤트를 fixed-length-stage 호출로 번역.
 *
 * 조각 facet 이라 번역이 단순하다. 세 걸음이 세 메서드에 1:1 로 대응한다.
 *
 * 문안은 전부 FacetJson.messages 에서 온다 (C10). 코드에는 키와 en 원본만 있다.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type FixedLengthStage = {
  reset(): void;
  init(payload: unknown, emptyLabel: string): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setHeaders(inLabel: string, outLabel: string): void;
  setNote(text: string): void;
  revealInputs(): void;
  revealOutputs(): void;
  markUniform(label: string): void;
};

type InitPayload = {
  algorithmLabel?: string;
  hashBits?: number;
  rows?: { input: string; bytes: number; hash: string }[];
};

export const hashFixedLengthProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as FixedLengthStage | undefined;

  /** 상시 캡션. init 과 reset 두 곳에서 쓰이므로 en 원본은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'caption.base',
      'However long the input is, the output is always the same length.',
    );

  const emptyLabel = (): string => tr('label.empty', '(nothing)');

  let algorithmLabel = '';
  let hashBits = 0;
  let longestBytes = 0;

  function applyChrome(): void {
    if (!stage) return;
    stage.setBaseCaption(baseCaption());
    stage.setHeaders(
      tr('label.inputColumn', 'input'),
      tr('label.outputColumn', '{algorithm} output', { algorithm: algorithmLabel }),
    );
    stage.setNote(
      tr(
        'label.note',
        'Even an empty input has a digest, and a 3.7 MB file gives the same 64 characters.',
      ),
    );
  }

  return {
    onInit() {
      applyChrome();
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as InitPayload;
          algorithmLabel = p.algorithmLabel ?? '';
          hashBits = p.hashBits ?? 0;
          longestBytes = (p.rows ?? []).reduce((m, r) => Math.max(m, r.bytes), 0);
          stage.init(event.payload, emptyLabel());
          applyChrome();
          break;
        }

        case 'reveal-inputs': {
          stage.revealInputs();
          stage.setCaption(
            tr('caption.inputsVary', 'The inputs run from nothing to {bytes} bytes.', {
              bytes: String(longestBytes),
            }),
          );
          break;
        }

        case 'reveal-outputs': {
          stage.revealOutputs();
          break;
        }

        case 'mark-uniform': {
          stage.markUniform(
            tr('label.always', 'always {bits} bits', { bits: String(hashBits) }),
          );
          stage.setCaption(
            tr(
              'caption.outputsUniform',
              'Every output starts and ends at the same place — {bits} bits, whatever went in.',
              { bits: String(hashBits) },
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
      applyChrome();
    },
  };
};
