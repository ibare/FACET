/**
 * 제어 해저드 projector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 문안은 facet.ts 의 messages 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 * payload 는 typeof 가드로 읽는다 (C9).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import type { ControlHazardSlot, ControlHazardStage } from './control-hazard-stage.js';

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function obj(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

function num(v: unknown, dflt = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function readSlot(v: unknown): ControlHazardSlot | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'number' || typeof r.pc !== 'number') return null;
  return { id: r.id, pc: r.pc, spec: r.spec === true };
}

export const controlHazardProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ControlHazardStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  let program: string[] = [];
  let resolveStage = 3;
  let lastCycles: number | null = null;

  const stageName = (s: number): string => {
    switch (s) {
      case 1:
        return tr('stage.if', 'IF');
      case 2:
        return tr('stage.id', 'ID');
      case 3:
        return tr('stage.ex', 'EX');
      case 4:
        return tr('stage.mem', 'MEM');
      default:
        return tr('stage.wb', 'WB');
    }
  };

  /** 목표 줄의 표식(`L`) — 없으면 그 줄의 글 전체. */
  const labelOf = (pc: number): string => {
    const line = program[pc] ?? '';
    const m = /^\s*([A-Za-z_]\w*):/.exec(line);
    return m ? (m[1] ?? line) : line;
  };

  return {
    onInit(initialData) {
      const d = obj(initialData);
      program = Array.isArray(d.program) ? d.program.filter((s): s is string => typeof s === 'string') : [];
      resolveStage = num(d.resolveStage, 3);
      stage?.clear();
    },

    onEvent(event) {
      const p = obj(event.payload);
      switch (event.type) {
        case 'phase': {
          const name = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(name);
          return;
        }
        case 'round-start': {
          resolveStage = num(p.resolveStage, resolveStage);
          const penalty = num(p.penalty, resolveStage - 1);
          stage?.startRound(
            resolveStage,
            lastCycles,
            tr('label.window', 'Fetched before resolve: {n}', { n: penalty }),
            lastCycles === null ? '' : tr('label.prevEnd', 'Before: {n}', { n: lastCycles }),
          );
          stage?.setCaption(
            tr('caption.start', 'Resolve in {stage}: each taken branch discards {n}. Guess: not taken, keep fetching.', {
              stage: stageName(resolveStage),
              n: penalty,
            }),
          );
          return;
        }
        case 'cycle': {
          const cycle = num(p.cycle);
          const raw = Array.isArray(p.slots) ? p.slots : [];
          const slots = raw.map(readSlot);
          stage?.showCycle(cycle, slots, tr('label.cycle', 'Cycle {n}', { n: cycle }));
          const fetched = slots[0] ?? null;
          if (fetched === null) {
            stage?.setCaption(tr('caption.drain', 'Cycle {cycle}: nothing left to fetch, the pipeline drains', { cycle }));
          } else if (fetched.spec) {
            stage?.setCaption(
              tr('caption.guess', 'Cycle {cycle}: fetch {text} — only a guess, the branch is not resolved yet', {
                cycle,
                text: program[fetched.pc] ?? '',
              }),
            );
          } else {
            stage?.setCaption(tr('caption.fetch', 'Cycle {cycle}: fetch {text}', { cycle, text: program[fetched.pc] ?? '' }));
          }
          return;
        }
        case 'resolve': {
          const cycle = num(p.cycle);
          const taken = p.taken === true;
          const flushed = (Array.isArray(p.flushed) ? p.flushed : [])
            .map((f) => obj(f).id)
            .filter((id): id is number => typeof id === 'number');
          const target = num(p.target, 0);
          const at = stageName(num(p.stage, resolveStage));
          stage?.resolveBranch(num(p.branchId, -1), taken, flushed);
          if (taken) {
            stage?.setCaption(
              tr('caption.taken', 'Cycle {cycle}: resolved in {stage} — taken. Discard {n} and jump back → {label}', {
                cycle,
                stage: at,
                n: flushed.length,
                label: labelOf(target),
              }),
            );
          } else {
            stage?.setCaption(
              tr('caption.notTaken', 'Cycle {cycle}: resolved in {stage} — not taken. The guess holds, nothing is lost', {
                cycle,
                stage: at,
              }),
            );
          }
          return;
        }
        case 'jump': {
          stage?.jumpBack(num(p.target, 0));
          return;
        }
        case 'round-end': {
          const cycles = num(p.cycles);
          stage?.finishRound(cycles, tr('label.end', 'End: {n}', { n: cycles }));
          stage?.setCaption(
            tr('caption.done', '{cycles} cycles: {taken} taken × {penalty} = {flushed} discarded', {
              cycles,
              taken: num(p.taken),
              penalty: num(p.penalty),
              flushed: num(p.flushed),
            }),
          );
          lastCycles = cycles;
          return;
        }
        default:
          return;
      }
    },

    onReset() {
      lastCycles = null;
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
