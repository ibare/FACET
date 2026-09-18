/**
 * 5단계 파이프라인 — projector.
 *
 * algorithm 이벤트를 stage 메서드와 코드 패널 하이라이트로 옮긴다. 문안은 키와 en 원본을
 * 리터럴로 적고 번역은 FacetJson.messages 가 진다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { FiveStagePipelineStage } from './five-stage-pipeline-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);

function record(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

export const fiveStagePipelineProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FiveStagePipelineStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 박자 하나(450ms)에 맞춘 움직임 길이. 빠르게 돌리면 함께 짧아진다. */
  const ms = () => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.max(60, Math.min(360, 360 / Math.max(0.1, speed)));
  };

  /** 이번 판의 명령어 글 — 캡션에 쓴다. */
  let instructions: string[] = [];
  let stages = 5;

  return {
    onInit() {
      instructions = [];
      stage?.clear?.();
      code?.clearHighlight?.();
    },

    onReset() {
      instructions = [];
      stage?.clear?.();
      code?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = record(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'round-start': {
          const count = num(p.count);
          instructions = Array.isArray(p.instructions)
            ? p.instructions.filter((s): s is string => typeof s === 'string')
            : [];
          stages = num(p.stageCount, 5);
          stage?.startRound?.({ count, instructions, ms: ms() });
          stage?.setCaption?.('', '');
          return;
        }
        case 'serial-plan': {
          const serialCycles = num(p.serialCycles);
          stage?.planSerial?.({
            serialCycles,
            cyclesPerInstruction: num(p.cyclesPerInstruction, stages),
            ms: ms(),
          });
          stage?.setCaption?.(
            tr('caption.start', 'Feeding {count} instructions. One at a time, the last would finish at cycle {serial}.', {
              count: num(p.count),
              serial: serialCycles,
            }),
            '',
          );
          return;
        }
        case 'tick': {
          const cycle = num(p.cycle);
          const busy = num(p.busy);
          const slots = Array.isArray(p.slots) ? p.slots.map((v) => num(v, -1)) : [];
          stage?.tick?.({ cycle, slots, busy, ms: ms() });
          stage?.setCaption?.(
            tr('caption.tick', 'Cycle {cycle}: {busy} of {stages} stages busy.', {
              cycle,
              busy,
              stages,
            }),
            '',
          );
          return;
        }
        case 'retire': {
          const index = num(p.index);
          const wbCycle = num(p.wbCycle);
          const latencyCycles = num(p.latencyCycles);
          stage?.retire?.({ index, ifCycle: num(p.ifCycle), wbCycle, latencyCycles, ms: ms() });
          stage?.setCaption?.(
            tr('caption.retire', 'Cycle {cycle}: {text} leaves WB, {latency} cycles after entering IF.', {
              cycle: wbCycle,
              text: instructions[index] ?? '',
              latency: latencyCycles,
            }),
            '',
          );
          return;
        }
        case 'round-end': {
          const pipeCycles = num(p.pipeCycles);
          const serialCycles = num(p.serialCycles);
          const fullCycles = num(p.fullCycles);
          stage?.endRound?.({ pipeCycles, serialCycles, ms: ms() });
          stage?.setCaption?.(
            tr('caption.end', 'Pipelined {pipe} cycles · one at a time {serial} · speedup {speedup}% · stages busy {util}%', {
              pipe: pipeCycles,
              serial: serialCycles,
              speedup: num(p.speedupPercent),
              util: num(p.utilizationPercent),
            }),
            tr('caption.shape', 'All stages full for {full} cycles · filling and draining {edge} cycles', {
              full: fullCycles,
              edge: pipeCycles - fullCycles,
            }),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
