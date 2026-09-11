/**
 * constant-fades projector — algorithm 이 낸 수를 stage 의 메서드 호출로 옮긴다.
 *
 * 두 가지만 한다.
 *   1. payload 를 좁혀서 넘긴다 (C9). `event.payload` 를 그대로 흘리지 않는다.
 *   2. 지금 무슨 일이 일어나는지를 말하는 캡션의 **키**를 고른다 (C10). 문장 자체는
 *      `facet.ts` 의 messages 에 있고 여기에는 키와 en 원본만 남는다.
 *
 * 화면의 수식 표기(`100·n` · `n²` · `×10`)는 여기서 만들지 않는다. 그것은 계수에서
 * 조립되는 표식이라 stage 가 그린다 — 열 언어로 번역할 것이 아니다 (C10 판정 3).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 표면. 열린 ViewInstance 를 이 모양으로만 본다 (C9). */
type Stage = {
  showAxis?(ticks: number[]): Promise<void> | void;
  showProbe?(spec: ProbeSpec): Promise<void> | void;
  plantBoundary?(spec: BoundarySpec): Promise<void> | void;
  moveBoundary?(spec: MoveSpec): Promise<void> | void;
  showSpacing?(spec: SpacingSpec): Promise<void> | void;
  eraseConstants?(): Promise<void> | void;
  setCaption?(text: string): void;
  rewind?(): void;
};

type Lead = 'linear' | 'quad' | 'tie';
type ProbeSpec = {
  n: number;
  coefficient: number;
  linear: number;
  quad: number;
  lead: Lead;
  ratio: number;
};
type BoundarySpec = { coefficient: number; meeting: number; value: number };
type MoveSpec = BoundarySpec & { previous: number };
type SpacingSpec = { factor: number; marks: Array<{ coefficient: number; meeting: number }> };

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTicks(payload: unknown): number[] | null {
  const p = fields(payload);
  if (!p || !Array.isArray(p.ticks)) return null;
  const out: number[] = [];
  for (const raw of p.ticks) {
    const n = num(raw);
    if (n === null) return null;
    out.push(n);
  }
  return out.length > 0 ? out : null;
}

function readProbe(payload: unknown): ProbeSpec | null {
  const p = fields(payload);
  if (!p) return null;
  const n = num(p.n);
  const coefficient = num(p.coefficient);
  const linear = num(p.linear);
  const quad = num(p.quad);
  const ratio = num(p.ratio);
  const lead = p.lead;
  if (n === null || coefficient === null || linear === null || quad === null || ratio === null) return null;
  if (lead !== 'linear' && lead !== 'quad' && lead !== 'tie') return null;
  return { n, coefficient, linear, quad, lead, ratio };
}

function readBoundary(payload: unknown): BoundarySpec | null {
  const p = fields(payload);
  if (!p) return null;
  const coefficient = num(p.coefficient);
  const meeting = num(p.meeting);
  const value = num(p.value);
  if (coefficient === null || meeting === null || value === null) return null;
  return { coefficient, meeting, value };
}

function readMove(payload: unknown): MoveSpec | null {
  const base = readBoundary(payload);
  const p = fields(payload);
  const previous = p ? num(p.previous) : null;
  if (!base || previous === null) return null;
  return { ...base, previous };
}

function readSpacing(payload: unknown): SpacingSpec | null {
  const p = fields(payload);
  if (!p) return null;
  const factor = num(p.factor);
  if (factor === null || !Array.isArray(p.marks)) return null;
  const marks: Array<{ coefficient: number; meeting: number }> = [];
  for (const raw of p.marks) {
    const m = fields(raw);
    const coefficient = m ? num(m.coefficient) : null;
    const meeting = m ? num(m.meeting) : null;
    if (coefficient === null || meeting === null) return null;
    marks.push({ coefficient, meeting });
  }
  return marks.length > 0 ? { factor, marks } : null;
}

/** 다섯 자리부터 세 자리씩 끊어 읽는다. stage 의 칩과 같은 규칙이다. */
function groupDigits(value: number): string {
  const s = String(value);
  if (s.length <= 4) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 배수는 정수면 정수로, 아니면 소수 한 자리로 읽는다. */
function formatRatio(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? groupDigits(rounded) : rounded.toFixed(1);
}

export const constantFadesProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as Stage | undefined;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'axis': {
          const ticks = readTicks(event.payload);
          if (!ticks) return;
          stage.setCaption?.(tr('caption.axis', 'Lay out the line where n grows.'));
          await stage.showAxis?.(ticks);
          return;
        }

        case 'probe': {
          const spec = readProbe(event.payload);
          if (!spec) return;
          if (spec.lead === 'tie') {
            stage.setCaption?.(
              tr('caption.tie', 'At n = {n} the two meet exactly: both are {value}.', {
                n: groupDigits(spec.n),
                value: groupDigits(spec.linear),
              }),
            );
          } else if (spec.lead === 'linear') {
            stage.setCaption?.(
              tr('caption.leadLinear', 'At n = {n}, {coefficient}·n is {ratio} times as large as n².', {
                n: groupDigits(spec.n),
                coefficient: groupDigits(spec.coefficient),
                ratio: formatRatio(spec.ratio),
              }),
            );
          } else {
            stage.setCaption?.(
              tr(
                'caption.leadQuad',
                'At n = {n}, n² is {ratio} times as large as {coefficient}·n — and it never gives the lead back.',
                {
                  n: groupDigits(spec.n),
                  coefficient: groupDigits(spec.coefficient),
                  ratio: formatRatio(spec.ratio),
                },
              ),
            );
          }
          await stage.showProbe?.(spec);
          return;
        }

        case 'boundary': {
          const spec = readBoundary(event.payload);
          if (!spec) return;
          stage.setCaption?.(
            tr(
              'caption.boundary',
              'Left of the post {coefficient}·n leads; everything to the right belongs to n². The post stands at n = {meeting}.',
              {
                coefficient: groupDigits(spec.coefficient),
                meeting: groupDigits(spec.meeting),
              },
            ),
          );
          await stage.plantBoundary?.(spec);
          return;
        }

        case 'boundary-move': {
          const spec = readMove(event.payload);
          if (!spec) return;
          // 기둥이 어느 쪽으로 가는지가 곧 상수를 줄였는지 키웠는지다.
          if (spec.meeting < spec.previous) {
            stage.setCaption?.(
              tr(
                'caption.shrink',
                'Constant {coefficient} — the meeting point slides one tick to the left, to n = {meeting}.',
                {
                  coefficient: groupDigits(spec.coefficient),
                  meeting: groupDigits(spec.meeting),
                },
              ),
            );
          } else {
            stage.setCaption?.(
              tr(
                'caption.grow',
                'Constant {coefficient} — raising it only pushes the meeting point right, to n = {meeting}.',
                {
                  coefficient: groupDigits(spec.coefficient),
                  meeting: groupDigits(spec.meeting),
                },
              ),
            );
          }
          await stage.moveBoundary?.(spec);
          return;
        }

        case 'spacing': {
          const spec = readSpacing(event.payload);
          if (!spec) return;
          stage.setCaption?.(
            tr(
              'caption.spacing',
              'A {factor}-fold constant buys exactly one tick. The right end stays with n² either way.',
              { factor: groupDigits(spec.factor) },
            ),
          );
          await stage.showSpacing?.(spec);
          return;
        }

        case 'constant-erased': {
          stage.setCaption?.(
            tr(
              'caption.erase',
              'Erase the constants and the three say one thing: n against n². The constant only chose where they meet.',
            ),
          );
          await stage.eraseConstants?.();
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          return;
        }

        // 이 조각의 algorithm 은 위 일곱 말고는 내보내지 않는다. 다른 것이 오면
        // 조용히 흘린다 (C2).
        default:
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
