/**
 * 보간 탐색 Projector — 알고리즘 이벤트를 stage(interpolation-search-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type ProbeFormula = {
  lo: number;
  hi: number;
  target: number;
  loValue: number;
  hiValue: number;
  numer: number;
  denom: number;
  offset: number;
  mid: number;
};

type TrackMark = { index: number; step: number; value: number };

type InterpolationStage = {
  setData(values: number[], target: number): void;
  setRange(lo: number, hi: number): void;
  setFormula(formula: ProbeFormula | null): void;
  setCellState(index: number, state: 'probing' | 'found' | null): void;
  setCaption(text: string): void;
  addAimMark(mark: TrackMark): void;
  addHalveMark(mark: TrackMark): void;
  setActiveTrack(track: 'aim' | 'halve' | null): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const interpolationSearchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as InterpolationStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[]; target?: number } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      const target = num(data?.target) ?? 0;
      stage?.setData(values, target);
      stage?.setActiveTrack('aim');
      stage?.setCaption(
        tr('caption.start', 'The values are evenly spread — so size can point at a seat.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'search-begin': {
          const p = event.payload as { target?: number; lo?: number; hi?: number } | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const target = num(p?.target);
          if (lo !== undefined && hi !== undefined) stage?.setRange(lo, hi);
          if (target !== undefined) {
            stage?.setCaption(tr('caption.begin', 'Look for {target}.', { target }));
          }
          break;
        }

        case 'range-check': {
          const p = event.payload as
            | { lo?: number; hi?: number; loValue?: number; hiValue?: number; ok?: boolean }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const loValue = num(p?.loValue);
          const hiValue = num(p?.hiValue);
          if (lo !== undefined && hi !== undefined) stage?.setRange(lo, hi);
          if (loValue === undefined || hiValue === undefined) break;
          stage?.setCaption(
            p?.ok === true
              ? tr(
                  'caption.inRange',
                  'The wanted value lies between {low} and {high} — aiming is safe.',
                  { low: loValue, high: hiValue },
                )
              : tr(
                  'caption.outOfRange',
                  'The wanted value is outside {low}..{high} — aiming would point off the array.',
                  { low: loValue, high: hiValue },
                ),
          );
          break;
        }

        case 'probe': {
          const p = event.payload as
            | {
                lo?: number;
                hi?: number;
                mid?: number;
                value?: number;
                target?: number;
                loValue?: number;
                hiValue?: number;
                numer?: number;
                denom?: number;
                offset?: number;
                probes?: number;
              }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const mid = num(p?.mid);
          const value = num(p?.value);
          const target = num(p?.target);
          const loValue = num(p?.loValue);
          const hiValue = num(p?.hiValue);
          const numer = num(p?.numer);
          const denom = num(p?.denom);
          const offset = num(p?.offset);
          const probes = num(p?.probes);
          if (
            lo === undefined ||
            hi === undefined ||
            mid === undefined ||
            value === undefined ||
            target === undefined ||
            loValue === undefined ||
            hiValue === undefined ||
            numer === undefined ||
            denom === undefined ||
            offset === undefined ||
            probes === undefined
          ) {
            break;
          }
          stage?.setFormula({ lo, hi, target, loValue, hiValue, numer, denom, offset, mid });
          stage?.setCellState(mid, 'probing');
          stage?.addAimMark({ index: mid, step: probes, value });
          stage?.setCaption(
            tr('caption.probe', 'Size aims at seat {mid} — not the middle, but where it should be.', {
              mid,
            }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as
            | { index?: number; value?: number; target?: number; verdict?: string }
            | undefined;
          const value = num(p?.value);
          const target = num(p?.target);
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'probing');
          const index = num(p?.index);
          if (index === undefined || value === undefined || target === undefined) break;
          if (p?.verdict === 'too-small') {
            stage?.setCaption(
              tr('caption.tooSmall', 'Seat {index} holds {value} — smaller than {target}.', {
                index,
                value,
                target,
              }),
            );
          } else if (p?.verdict === 'too-big') {
            stage?.setCaption(
              tr('caption.tooBig', 'Seat {index} holds {value} — larger than {target}.', {
                index,
                value,
                target,
              }),
            );
          } else {
            stage?.setCaption(
              tr('caption.hit', 'Seat {index} holds {value}. That is the one.', { index, value }),
            );
          }
          break;
        }

        case 'unhighlight': {
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, null);
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'found') break;
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'found');
          break;
        }

        case 'narrow': {
          const p = event.payload as
            | { side?: string; lo?: number; hi?: number; mid?: number }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const mid = num(p?.mid);
          if (lo !== undefined && hi !== undefined) stage?.setRange(lo, hi);
          if (mid === undefined) break;
          stage?.setCaption(
            p?.side === 'left'
              ? tr('caption.dropLeft', 'Seat {mid} and everything left of it goes.', { mid })
              : tr('caption.dropRight', 'Seat {mid} and everything right of it goes.', { mid }),
          );
          break;
        }

        case 'search-found': {
          const p = event.payload as { index?: number; probes?: number } | undefined;
          const index = num(p?.index);
          const probes = num(p?.probes);
          if (index === undefined || probes === undefined) break;
          stage?.setCaption(
            tr('caption.found', 'Found at seat {index}. Probes so far: {probes}.', {
              index,
              probes,
            }),
          );
          break;
        }

        case 'search-missed': {
          const target = num((event.payload as { target?: number } | undefined)?.target);
          if (target === undefined) break;
          stage?.setCaption(tr('caption.missed', '{target} is not in this array.', { target }));
          break;
        }

        case 'halving-begin': {
          // 견주는 쪽은 코드 패널이 든 알고리즘이 아니다 — 짚던 줄을 놓는다.
          codePanel?.clearHighlight();
          stage?.setActiveTrack('halve');
          // 찾은 칸의 표시는 거두지 않는다 — 반씩 접는 쪽도 결국 그 칸에 닿는다.
          stage?.setCaption(
            tr('caption.halveBegin', 'Now the same array, halved blindly — how many steps?'),
          );
          break;
        }

        case 'halving-probe': {
          const p = event.payload as
            | { step?: number; mid?: number; value?: number; hit?: boolean }
            | undefined;
          const step = num(p?.step);
          const mid = num(p?.mid);
          const value = num(p?.value);
          if (step === undefined || mid === undefined || value === undefined) break;
          stage?.addHalveMark({ index: mid, step, value });
          stage?.setCaption(
            p?.hit === true
              ? tr('caption.halveHit', 'Halving reaches it on step {step}.', { step })
              : tr('caption.halveProbe', 'Halving takes the middle seat {mid} — {value}.', {
                  mid,
                  value,
                }),
          );
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as { probes?: number; halvings?: number } | undefined;
          const probes = num(p?.probes);
          const halvings = num(p?.halvings);
          codePanel?.clearHighlight();
          stage?.setActiveTrack(null);
          if (probes === undefined || halvings === undefined) break;
          stage?.setCaption(
            tr('caption.done', 'Aiming {probes} against halving {halvings}.', {
              probes,
              halvings,
            }),
          );
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
