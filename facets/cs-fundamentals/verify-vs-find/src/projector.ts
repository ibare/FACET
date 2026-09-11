/**
 * verify-vs-find 의 번역기.
 *
 * payload 를 좁힌 뒤 stage 로 넘긴다 — `event.payload` 를 그대로 전달하지
 * 않는다 (C9). 화면 문안은 키로 조회하고 en 원본은 호출부에 리터럴로 둔다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

type Hit = { mask: number; picked: number[]; sum: number };

type Stage = {
  showProblem?(v: { values: number[]; target: number; candidates: number; answers: number }): Promise<void> | void;
  examineGiven?(v: {
    mask: number;
    picked: number[];
    partials: number[];
    sum: number;
    target: number;
    ok: boolean;
  }): Promise<void> | void;
  sweep?(v: { from: number; to: number; seen: number; total: number; hits: Hit[] }): Promise<void> | void;
  settle?(v: { verifySeen: number; findSeen: number }): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

function fields(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as Record<string, unknown>;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
}

function hits(v: unknown): Hit[] {
  if (!Array.isArray(v)) return [];
  const out: Hit[] = [];
  for (const raw of v) {
    const f = fields(raw);
    if (typeof f.mask !== 'number') continue;
    out.push({ mask: f.mask, picked: nums(f.picked), sum: num(f.sum) });
  }
  return out;
}

export const verifyVsFindProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const f = fields(event.payload);

      switch (event.type) {
        case 'setup': {
          const values = nums(f.values);
          const target = num(f.target);
          stage.setCaption?.(
            tr('caption.setup', '{count} numbers, and a target of {target}.', {
              count: values.length,
              target,
            }),
          );
          await stage.showProblem?.({
            values,
            target,
            candidates: num(f.candidates),
            answers: num(f.answers),
          });
          return;
        }

        case 'verify-candidate': {
          const sum = num(f.sum);
          stage.setCaption?.(
            tr('caption.verify', 'Someone hands you one candidate. Add it up: {sum}. One look and it is done.', {
              sum,
            }),
          );
          await stage.examineGiven?.({
            mask: num(f.mask),
            picked: nums(f.picked),
            partials: nums(f.partials),
            sum,
            target: num(f.target),
            ok: f.ok === true,
          });
          return;
        }

        case 'sweep-block': {
          const seen = num(f.seen);
          const total = num(f.total);
          const found = hits(f.hits);
          stage.setCaption?.(
            found.length > 0
              ? tr('caption.hit', 'A match turns up in this batch. Looked at: {seen} of {total}.', { seen, total })
              : tr(
                  'caption.sweep',
                  'Nobody hands you anything, so every candidate gets a look. Looked at: {seen} of {total}.',
                  { seen, total },
                ),
          );
          await stage.sweep?.({
            from: num(f.from),
            to: num(f.to),
            seen,
            total,
            hits: found,
          });
          return;
        }

        case 'done': {
          const verifySeen = num(f.verifySeen);
          const findSeen = num(f.findSeen);
          stage.setCaption?.(
            tr('caption.done', 'Checking looked at {verifySeen}. Finding had to look at all {findSeen}.', {
              verifySeen,
              findSeen,
            }),
          );
          await stage.settle?.({ verifySeen, findSeen });
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          return;
        }

        default:
          // 이 facet 은 위 다섯만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
