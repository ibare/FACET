/**
 * gated-cells projector — 알고리즘 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 로 읽고, 모양이 어긋나면 던진다. 무대에 넘기는 운동 길이는
 * 그때그때의 재생 속도로 나눈다 (걸음 경계를 넘지 않게).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';

/** 한 걸음의 운동 길이 (속도 1 에서). stepMs 900 안쪽에 들어간다. */
const MOTION_MS = 300;

export type LaneValue = { id: string; value: number };
export type GateValue = { id: string; value: number };

export type SetupView = {
  cell: string;
  lanes: LaneValue[];
  carried: string;
  gateIds: string[];
  candidateId: string | null;
  xs: number[];
};

export type StepView = {
  step: number;
  x: number;
  gates: GateValue[];
  candidate: number | null;
  lanes: LaneValue[];
  factor: number | null;
  kept: number;
};

export type EndView = { kept: number; count: number; lo: number; hi: number };

export type GatedCellsStage = {
  setup(view: SetupView, ms: number): void;
  step(view: StepView, ms: number): void;
  finish(view: EndView, ms: number): void;
};

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`gated-cells projector: ${what} payload 가 없다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gated-cells projector: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`gated-cells projector: ${what} 가 글이 아니다`);
  return v;
}

function numOrNull(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}

function pairs(v: unknown, what: string): { id: string; value: number }[] {
  if (!Array.isArray(v)) throw new Error(`gated-cells projector: ${what} 가 목록이 아니다`);
  return v.map((item, k) => {
    const r = rec(item, `${what}[${k}]`);
    return { id: str(r.id, `${what}[${k}].id`), value: num(r.value, `${what}[${k}].value`) };
  });
}

export const gatedCellsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GatedCellsStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): GatedCellsStage => {
    if (!stage) throw new Error('gated-cells projector: stage 가 없다');
    return stage;
  };
  const motion = (): number => MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          if (!Array.isArray(p.gateIds) || !Array.isArray(p.xs)) throw new Error('gated-cells projector: init 모양');
          code?.highlightPhase(null);
          need().setup(
            {
              cell: str(p.cell, 'cell'),
              lanes: pairs(p.lanes, 'lanes'),
              carried: str(p.carried, 'carried'),
              gateIds: p.gateIds.map((g, k) => str(g, `gateIds[${k}]`)),
              candidateId: p.candidateId === null ? null : str(p.candidateId, 'candidateId'),
              xs: p.xs.map((x, k) => num(x, `xs[${k}]`)),
            },
            motion(),
          );
          return;
        }
        case 'cell-step': {
          const p = rec(event.payload, 'cell-step');
          need().step(
            {
              step: num(p.step, 'step'),
              x: num(p.x, 'x'),
              gates: pairs(p.gates, 'gates'),
              candidate: numOrNull(p.candidate, 'candidate'),
              lanes: pairs(p.lanes, 'lanes'),
              factor: numOrNull(p.factor, 'factor'),
              kept: num(p.kept, 'kept'),
            },
            motion(),
          );
          return;
        }
        case 'kept-share': {
          const p = rec(event.payload, 'kept-share');
          need().finish(
            { kept: num(p.kept, 'kept'), count: num(p.count, 'count'), lo: num(p.lo, 'lo'), hi: num(p.hi, 'hi') },
            motion(),
          );
          return;
        }
        default:
          throw new Error(`gated-cells projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
