/**
 * HashFixedLength Projector — algorithm 이벤트를 fixed-length-stage 호출로 번역.
 *
 * 조각 facet 이라 번역이 단순하다. 세 걸음이 세 메서드에 1:1 로 대응한다.
 *
 * 문안은 전부 FacetJson.messages 에서 온다 (C10). 코드에는 키와 en 원본만 있다.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 그리는 데 필요한 형태. projector 가 경계에서 이 모양으로 좁힌다. */
type StageInit = { rows: { input: string; bytes: number; hash: string }[] };

type FixedLengthStage = {
  reset(): void;
  init(payload: StageInit, emptyLabel: string): void;
  setBaseCaption(text: string): void;
  setCaption(text: string): void;
  setHeaders(inLabel: string, outLabel: string): void;
  setNote(text: string): void;
  revealInputs(): void;
  revealOutputs(): void;
  markUniform(label: string): void;
};

type InitPayload = {
  algorithmLabel?: unknown;
  hashBits?: unknown;
  rows?: unknown;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function narrowRows(v: unknown): StageInit['rows'] {
  if (!Array.isArray(v)) return [];
  return v.map((r) => {
    const row = (r ?? {}) as { input?: unknown; bytes?: unknown; hash?: unknown };
    return { input: str(row.input), bytes: num(row.bytes), hash: str(row.hash) };
  });
}

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
          const rows = narrowRows(p.rows);
          algorithmLabel = str(p.algorithmLabel);
          hashBits = num(p.hashBits);
          longestBytes = rows.reduce((m, r) => Math.max(m, r.bytes), 0);
          stage.init({ rows }, emptyLabel());
          applyChrome();
          break;
        }

        case 'rewind': {
          // 손으로 짚기 시작 — 화면만 처음으로 돌린다. 데이터는 그대로다.
          stage.reset();
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
