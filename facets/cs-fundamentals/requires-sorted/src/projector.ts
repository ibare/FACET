/**
 * requiresSorted projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 캡션은 여기서 고른다. algorithm 은 translator 를 갖지 않고 문안을 정하는 것은
 * 표현 계층의 일이므로 (C10), 어떤 걸음에 무슨 말을 얹을지는 payload 의 모양에서
 * 판정한다 — 짚개가 둘인가 하나인가, 두 줄이 같은 쪽으로 갔는가, 한쪽이 멈췄는가.
 *
 * payload 는 좁힌 뒤 넘긴다 (C9). `event.payload` 를 그대로 stage 로 보내지 않고,
 * `typeof` / `Array.isArray` 가드를 지난 정형 배열만 조립해 넘긴다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { ProbeSpec, SettleSpec, VerdictSpec } from './requires-sorted-stage.js';

type RequiresSortedStage = {
  reset?(): void;
  showProbe?(probes: ProbeSpec[]): Promise<void>;
  settle?(results: SettleSpec[]): Promise<void>;
  markAnswerLost?(row: string): Promise<void>;
  finish?(verdicts: VerdictSpec[]): Promise<void>;
  setCaption?(text: string): void;
};

const ACTIONS = ['left', 'right', 'found', 'empty'] as const;
type SettleAction = (typeof ACTIONS)[number];

function isAction(v: unknown): v is SettleAction {
  return typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
}

function readProbes(payload: unknown): ProbeSpec[] {
  const p = payload as { probes?: unknown } | undefined;
  if (!Array.isArray(p?.probes)) return [];
  const out: ProbeSpec[] = [];
  for (const raw of p.probes) {
    const r = raw as { row?: unknown; index?: unknown; value?: unknown };
    if (typeof r?.row !== 'string') continue;
    if (typeof r.index !== 'number' || typeof r.value !== 'number') continue;
    out.push({ row: r.row, index: r.index, value: r.value });
  }
  return out;
}

function readResults(payload: unknown): SettleSpec[] {
  const p = payload as { results?: unknown } | undefined;
  if (!Array.isArray(p?.results)) return [];
  const out: SettleSpec[] = [];
  for (const raw of p.results) {
    const r = raw as {
      row?: unknown;
      action?: unknown;
      lo?: unknown;
      hi?: unknown;
      foundAt?: unknown;
    };
    if (typeof r?.row !== 'string' || !isAction(r.action)) continue;
    if (typeof r.lo !== 'number' || typeof r.hi !== 'number') continue;
    out.push({
      row: r.row,
      action: r.action,
      lo: r.lo,
      hi: r.hi,
      foundAt: typeof r.foundAt === 'number' ? r.foundAt : -1,
    });
  }
  return out;
}

function readVerdicts(payload: unknown): VerdictSpec[] {
  const p = payload as { verdicts?: unknown } | undefined;
  if (!Array.isArray(p?.verdicts)) return [];
  const out: VerdictSpec[] = [];
  for (const raw of p.verdicts) {
    const r = raw as { row?: unknown; found?: unknown; index?: unknown };
    if (typeof r?.row !== 'string' || typeof r.found !== 'boolean') continue;
    if (typeof r.index !== 'number') continue;
    out.push({ row: r.row, found: r.found, index: r.index });
  }
  return out;
}

function readLost(payload: unknown): string | null {
  const p = payload as { row?: unknown } | undefined;
  return typeof p?.row === 'string' ? p.row : null;
}

export const requiresSortedProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as RequiresSortedStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 두 줄이 찾는 값. 캡션의 {target} 자리에 넣는다. */
  let target = '';

  const say = (text: string): void => stage?.setCaption?.(text);

  const setup = (): void =>
    say(
      tr(
        'caption.setup',
        'Two rows, the same seven values, the same binary search. One row is in order, the other is not.',
        {},
      ),
    );

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { target?: unknown } | undefined;
      target = typeof d?.target === 'number' ? String(d.target) : '';
      stage?.reset?.();
      setup();
    },

    onReset(): void {
      stage?.reset?.();
      setup();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'probe': {
          const probes = readProbes(event.payload);
          if (probes.length === 0) return;
          const first = probes[0] as ProbeSpec;
          const sameSlot = probes.every((p) => p.index === first.index);
          if (probes.length === 1) {
            say(
              tr('caption.probeOne', 'Only the lower row is still running. It probes slot {i}.', {
                i: first.index,
              }),
            );
          } else if (sameSlot) {
            say(
              tr(
                'caption.probeBoth',
                'The same procedure probes the middle of both rows — slot {i}.',
                { i: first.index },
              ),
            );
          } else {
            say(
              tr('caption.probeApart', 'Each row probes the middle of its own live range.', {}),
            );
          }
          await stage?.showProbe?.(probes);
          return;
        }

        case 'settle': {
          const results = readResults(event.payload);
          if (results.length === 0) return;
          const actions = results.map((r) => r.action);
          if (actions.includes('empty')) {
            say(
              tr(
                'caption.empty',
                'The range closes on nothing. The lower row answers: {target} is not here.',
                { target },
              ),
            );
          } else if (actions.includes('found')) {
            say(
              tr(
                'caption.split',
                'The ordered row lands on {target} and stops. The other sees a smaller value and turns right.',
                { target },
              ),
            );
          } else if (actions.every((a) => a === 'left')) {
            say(
              tr(
                'caption.dropRight',
                '{target} is smaller than both probes, so both rows throw away the right half.',
                { target },
              ),
            );
          } else if (actions.every((a) => a === 'right')) {
            say(
              tr(
                'caption.dropLeft',
                '{target} is larger than both probes, so both rows throw away the left half.',
                { target },
              ),
            );
          } else {
            say(
              tr('caption.narrow', 'Each row drops the half that cannot hold {target}.', {
                target,
              }),
            );
          }
          await stage?.settle?.(results);
          return;
        }

        case 'answer-lost': {
          const row = readLost(event.payload);
          if (row === null) return;
          say(
            tr(
              'caption.lost',
              'The unordered row just threw away the half that actually holds {target}.',
              { target },
            ),
          );
          await stage?.markAnswerLost?.(row);
          return;
        }

        case 'done': {
          const verdicts = readVerdicts(event.payload);
          if (verdicts.length === 0) return;
          say(
            tr(
              'caption.verdict',
              'Same procedure, same seven values: found above, "not here" below — while {target} sits in the ringed slot all along.',
              { target },
            ),
          );
          await stage?.finish?.(verdicts);
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          setup();
          return;
        }

        default:
          // 이 algorithm 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
