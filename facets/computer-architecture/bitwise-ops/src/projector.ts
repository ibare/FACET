/**
 * bitwiseOpsProjector — algorithm 이벤트를 stage 메서드 호출과 코드 패널 짚기로 옮긴다.
 *
 * 문안은 여기서만 해석한다. algorithm 은 translator 를 갖지 않으므로 연산 **식별
 * 번호**만 실어 보내고, 그것을 사람이 읽는 문장으로 바꾸는 것은 표현 계층의
 * 일이다 (C10). stage 는 도형에 새겨진 표식(`a` · `AND` · 비트 숫자)만 그리고
 * 문장은 여기서 받아 간다.
 */

import type {
  FacetEventTarget,
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

/** stage 의 계약 (C9 — 열린 타입을 좁히는 구체형은 파일 상단에 모은다). */
type BitwiseStage = {
  setScene?(scene: {
    opIndex: number;
    width: number;
    a: number;
    b: number;
    aBits: number[];
    bBits: number[];
    binary: boolean;
    shift: 'left' | 'right' | null;
  }): void;
  setRule?(text: string): void;
  setCaption?(text: string): void;
  focusBit?(focus: {
    index: number;
    srcIndex: number | null;
    aBit: number;
    bBit: number;
    binary: boolean;
  }): Promise<void> | void;
  placeBit?(place: { index: number; outBit: number; runningValue: number }): void;
  dropBit?(drop: { index: number; bit: number; side: 'left' | 'right' }): Promise<void> | void;
  clearFocus?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** `bit:<i>` 에서 자리 번호를 꺼낸다. 식별자 파싱은 parseTarget 경유다 (C1). */
function bitIndexOf(target: FacetEventTarget | undefined): number | null {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (parsed === null || parsed.prefix !== 'bit') return null;
  const n = Number(parsed.id);
  return Number.isInteger(n) ? n : null;
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const v = source[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function bitArrayAt(source: Record<string, unknown>, key: string): number[] {
  const v = source[key];
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number');
}

/** payload 를 좁힌다. 단언 뒤에 검사가 따르므로 좁히개다 (C9). */
function fieldsOf(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

export const bitwiseOpsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as BitwiseStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;

  // 장면이 바뀔 때만 갱신되는 것들. 걸음마다 오는 payload 는 그때그때 좁힌다.
  let binary = true;
  let shift: 'left' | 'right' | null = null;

  /** 연산마다의 한 줄짜리 규칙. 번호 → 문장은 표현 계층의 일이다. */
  function ruleTextOf(opIndex: number): string {
    if (opIndex === 0) return tr('rule.and', 'Both bits 1 → 1.');
    if (opIndex === 1) return tr('rule.or', 'Either bit 1 → 1.');
    if (opIndex === 2) return tr('rule.xor', 'The two bits differ → 1.');
    if (opIndex === 3) return tr('rule.not', '1 → 0, 0 → 1. Here b is unused.');
    if (opIndex === 4) return tr('rule.shl', 'Every place reads its right neighbour.');
    return tr('rule.shr', 'Every place reads its left neighbour.');
  }

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'phase': {
          // silent 이벤트도 projector 에는 온다 — 코드 패널이 여기서만 갱신된다.
          const f = fieldsOf(event.payload);
          const name = f !== null && typeof f.phase === 'string' ? f.phase : null;
          panel?.highlightPhase?.(name);
          return;
        }

        case 'state-changed': {
          const f = fieldsOf(event.payload);
          if (f === null) return;
          const opIndex = numberAt(f, 'opIndex');
          const width = numberAt(f, 'width');
          const a = numberAt(f, 'a');
          const b = numberAt(f, 'b');
          if (opIndex === null || width === null || a === null || b === null) return;
          binary = f.binary === true;
          shift = f.shift === 'left' || f.shift === 'right' ? f.shift : null;
          stage?.setScene?.({
            opIndex,
            width,
            a,
            b,
            aBits: bitArrayAt(f, 'aBits'),
            bBits: bitArrayAt(f, 'bBits'),
            binary,
            shift,
          });
          stage?.setRule?.(ruleTextOf(opIndex));
          stage?.setCaption?.('');
          return;
        }

        case 'highlight': {
          const f = fieldsOf(event.payload);
          if (f === null) return;
          const index = bitIndexOf(event.target) ?? numberAt(f, 'index');
          const aBit = numberAt(f, 'aBit');
          const bBit = numberAt(f, 'bBit');
          if (index === null || aBit === null || bBit === null) return;
          const srcIndex = numberAt(f, 'srcIndex');

          await stage?.focusBit?.({ index, srcIndex, aBit, bBit, binary });

          if (shift !== null) {
            stage?.setCaption?.(
              srcIndex === null
                ? tr('caption.readNone', 'Place {i} has no neighbour to read, so 0 comes in.', {
                    i: index,
                  })
                : tr('caption.readFrom', 'Place {i} reads place {src}: {x}.', {
                    i: index,
                    src: srcIndex,
                    x: aBit,
                  }),
            );
            return;
          }
          stage?.setCaption?.(
            binary
              ? tr('caption.read2', 'Place {i}: reading {x} and {y}.', {
                  i: index,
                  x: aBit,
                  y: bBit,
                })
              : tr('caption.read1', 'Place {i}: reading {x}.', { i: index, x: aBit }),
          );
          return;
        }

        case 'mark': {
          const f = fieldsOf(event.payload);
          if (f === null) return;
          const index = bitIndexOf(event.target) ?? numberAt(f, 'index');
          const outBit = numberAt(f, 'outBit');
          const runningValue = numberAt(f, 'runningValue');
          if (index === null || outBit === null || runningValue === null) return;
          stage?.placeBit?.({ index, outBit, runningValue });
          stage?.setCaption?.(tr('caption.write', 'Place {i} gets {z}.', { i: index, z: outBit }));
          return;
        }

        case 'bit-dropped': {
          const f = fieldsOf(event.payload);
          if (f === null) return;
          const index = numberAt(f, 'index');
          const bit = numberAt(f, 'bit');
          const side = f.side === 'left' || f.side === 'right' ? f.side : null;
          if (index === null || bit === null || side === null) return;
          stage?.clearFocus?.();
          await stage?.dropBit?.({ index, bit, side });
          stage?.setCaption?.(
            tr('caption.dropped', 'Bit {x} at place {i} fell outside the eight places.', {
              x: bit,
              i: index,
            }),
          );
          return;
        }

        case 'done': {
          const f = fieldsOf(event.payload);
          if (f === null) return;
          const value = numberAt(f, 'value');
          if (value === null) return;
          stage?.clearFocus?.();
          stage?.setCaption?.(
            tr('caption.done', 'Eight places, one rule each, one number: {value}.', { value }),
          );
          return;
        }

        default:
          // 이 algorithm 이 내지 않는 이벤트다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      panel?.clearHighlight?.();
      stage?.clearFocus?.();
    },
  };
};
