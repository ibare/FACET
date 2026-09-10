/**
 * dendrogramCut projector — 걸음 이벤트를 무대의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 무대는 이미 정형화된 값만 받는다.
 * `initialData` 는 무대의 `mount` 가 직접 좁히므로 여기서 다시 밀어 넣지 않는다
 * (S-piece).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Merge = { id: string; left: string; right: string; height: number };
type Band = { lo: number; hi: number; clusters: number };

type DendrogramStage = {
  showTree(merges: Merge[], topHeight: number): void;
  slideTo(height: number, clusters: number): Promise<void>;
  settleAt(height: number, clusters: number): Promise<void>;
  showBands(bands: Band[]): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readMerges(value: unknown): Merge[] {
  if (!Array.isArray(value)) return [];
  const out: Merge[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const height = num(row.height);
    if (
      typeof row.id !== 'string' ||
      typeof row.left !== 'string' ||
      typeof row.right !== 'string' ||
      height === null
    ) {
      continue;
    }
    out.push({ id: row.id, left: row.left, right: row.right, height });
  }
  return out;
}

function readBands(value: unknown): Band[] {
  if (!Array.isArray(value)) return [];
  const out: Band[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const lo = num(row.lo);
    const hi = num(row.hi);
    const clusters = num(row.clusters);
    if (lo === null || hi === null || clusters === null) continue;
    out.push({ lo, hi, clusters });
  }
  return out;
}

function readCut(value: unknown): { height: number; clusters: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const height = num(row.height);
  const clusters = num(row.clusters);
  if (height === null || clusters === null) return null;
  return { height, clusters };
}

export const dendrogramCutProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DendrogramStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'tree-ready': {
          const payload = (event.payload ?? {}) as Record<string, unknown>;
          const merges = readMerges(payload.merges);
          const topHeight = num(payload.topHeight);
          if (merges.length === 0 || topHeight === null) return;
          stage.showTree(merges, topHeight);
          stage.setCaption(tr('caption.grown', 'The tree is already fully grown.'));
          return;
        }
        case 'cut-moved': {
          const cut = readCut(event.payload);
          if (cut === null) return;
          stage.setCaption(
            tr('caption.cut', 'Cut height {h} — clusters {n}', {
              h: cut.height.toFixed(2),
              n: cut.clusters,
            }),
          );
          await stage.slideTo(cut.height, cut.clusters);
          return;
        }
        case 'gaps-marked': {
          const payload = (event.payload ?? {}) as Record<string, unknown>;
          const bands = readBands(payload.bands);
          if (bands.length === 0) return;
          stage.setCaption(
            tr('caption.bands', 'Wide empty bands between the crossbars: {n}', {
              n: bands.length,
            }),
          );
          await stage.showBands(bands);
          return;
        }
        case 'cut-settled': {
          const cut = readCut(event.payload);
          if (cut === null) return;
          stage.setCaption(
            tr('caption.settled', 'Cut inside a wide band — clusters {n}', { n: cut.clusters }),
          );
          await stage.settleAt(cut.height, cut.clusters);
          return;
        }
        case 'rewind': {
          stage.reset();
          return;
        }
        case 'done': {
          stage.setCaption(tr('caption.done', 'The tree does not choose. A person does.'));
          return;
        }
        default:
          // 이 facet 은 위 여섯만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset();
    },
  };
};
