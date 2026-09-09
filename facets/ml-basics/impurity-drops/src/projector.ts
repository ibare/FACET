/**
 * impurityDrops projector — 사건을 섞임 자의 몸짓으로 옮긴다.
 *
 * payload 는 열린 타입이라 그대로 넘기지 않는다. 이 파일 위쪽의 좁히개
 * (`toBuckets` · `toCuts` · `toBox`) 를 지나야 stage 로 간다 (C9).
 * 화면에 뜨는 문장은 전부 키로만 여기 있고 문안은 `facet.ts` 의 `messages`
 * 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

import type { StageBox, StageBucket, StageCut } from './impurity-drops-stage.js';

type ImpurityStage = {
  showSample?(v: { buckets: StageBucket[] }): Promise<void>;
  drawCuts?(v: { cuts: StageCut[] }): Promise<void>;
  splitBuckets?(v: { buckets: StageBucket[] }): Promise<void>;
  markLevel?(v: { from: number; to: number }): Promise<void>;
  settle?(v: { buckets: StageBucket[] }): Promise<void>;
  setCaption?(text: string): void;
  reset?(): void;
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function side(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toBox(v: unknown): StageBox {
  const b = v as { xLo?: unknown; xHi?: unknown; yLo?: unknown; yHi?: unknown } | undefined;
  return { xLo: side(b?.xLo), xHi: side(b?.xHi), yLo: side(b?.yLo), yHi: side(b?.yHi) };
}

function toCounts(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => num(x));
}

function toBuckets(v: unknown): StageBucket[] {
  const raw = (v as { buckets?: unknown } | undefined)?.buckets;
  if (!Array.isArray(raw)) return [];
  const out: StageBucket[] = [];
  for (const item of raw) {
    const b = item as {
      id?: unknown;
      box?: unknown;
      counts?: unknown;
      n?: unknown;
      gini?: unknown;
      pureClass?: unknown;
    };
    if (typeof b?.id !== 'string') continue;
    out.push({
      id: b.id,
      box: toBox(b.box),
      counts: toCounts(b.counts),
      n: num(b.n),
      gini: num(b.gini),
      pureClass: typeof b.pureClass === 'number' ? b.pureClass : -1,
    });
  }
  return out;
}

function toCuts(v: unknown): StageCut[] {
  const raw = (v as { cuts?: unknown } | undefined)?.cuts;
  if (!Array.isArray(raw)) return [];
  const out: StageCut[] = [];
  for (const item of raw) {
    const cut = item as { bucketId?: unknown; axis?: unknown; at?: unknown; box?: unknown };
    if (cut?.axis !== 'x' && cut?.axis !== 'y') continue;
    if (typeof cut.at !== 'number' || !Number.isFinite(cut.at)) continue;
    out.push({
      bucketId: typeof cut.bucketId === 'string' ? cut.bucketId : '',
      axis: cut.axis,
      at: cut.at,
      box: toBox(cut.box),
    });
  }
  return out;
}

function toDepth(v: unknown): number {
  const d = (v as { depth?: unknown } | undefined)?.depth;
  return typeof d === 'number' && Number.isFinite(d) ? d : 0;
}

/** 섞임 값은 네 자리로 읽는다 — 0.4082 와 0.3200 이 갈리는 자리가 거기다. */
function level(v: number): string {
  return v.toFixed(4);
}

/** 기준값은 꼬리 0 을 떼고 읽는다 — 3 과 3.5 를 있는 그대로. */
function threshold(v: number): string {
  return String(Number(v.toFixed(3)));
}

export const impurityDropsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ImpurityStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.reset?.();
    },

    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'sample-shown': {
          const buckets = toBuckets(event.payload);
          const root = buckets[0];
          stage?.setCaption?.(
            tr(
              'caption.start',
              'All of them sit in one bucket. The colour boundary lands right on the half-and-half mark. Impurity: {g}',
              { g: level(root ? root.gini : 0) },
            ),
          );
          await stage?.showSample?.({ buckets });
          return;
        }

        case 'cut-drawn': {
          const cuts = toCuts(event.payload);
          if (toDepth(event.payload) === 0) {
            stage?.setCaption?.(
              tr('caption.cutRoot', 'One question for the whole bucket. Cut position: {t}', {
                t: cuts.map((c) => threshold(c.at)).join(', '),
              }),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.cutAgain', 'Now each bucket gets its own question. Cut positions: {ts}', {
                ts: cuts.map((c) => threshold(c.at)).join(', '),
              }),
            );
          }
          await stage?.drawCuts?.({ cuts });
          return;
        }

        case 'buckets-split': {
          stage?.setCaption?.(
            tr(
              'caption.split',
              'Each piece drops to its own impurity — set by where the colour boundary sits, not by how wide the piece is.',
            ),
          );
          await stage?.splitBuckets?.({ buckets: toBuckets(event.payload) });
          return;
        }

        case 'level-measured': {
          const p = event.payload as { from?: unknown; to?: unknown; drop?: unknown } | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          stage?.setCaption?.(
            tr('caption.level', 'Impurity of the layer, weighted by bucket size: {to}. It fell by {drop}', {
              to: level(to),
              drop: level(num(p?.drop)),
            }),
          );
          await stage?.markLevel?.({ from, to });
          return;
        }

        case 'settled': {
          stage?.setCaption?.(
            tr(
              'caption.settled',
              'Every bucket now carries a single label. Nothing left to ask, so the tree stops.',
            ),
          );
          await stage?.settle?.({ buckets: toBuckets(event.payload) });
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        case 'done':
          // 화면은 'settled' 에서 할 말을 마쳤다. 발신이 끝났다는 표시일 뿐이라
          // 그리는 것이 없다.
          return;

        default:
          // 위 어휘 밖의 이벤트는 이 조각이 내보내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },
  };
};
