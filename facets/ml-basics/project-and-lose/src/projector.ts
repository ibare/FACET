/**
 * projectAndLose 의 번역기 — 걸음 하나를 stage 메서드 하나로 옮긴다.
 *
 * payload 는 여기서 좁혀서 넘긴다 (C9). stage 는 좁혀진 값만 받는다.
 * 화면 문안은 `FacetJson.messages` 에서 오고 코드에는 키와 en 원본만 남는다 (C10).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type Stage = {
  setCaption(text: string): void;
  showScene(centerX: number, centerY: number, angleDeg: number): Promise<void>;
  dropPoints(indices: number[], footXs: number[], footYs: number[]): Promise<void>;
  markLongest(index: number, maxDist: number): Promise<void>;
  collapseTraces(keepPct: number, losePct: number): Promise<void>;
  showAmbiguity(index: number): Promise<void>;
  finish(): Promise<void>;
  rewind(): void;
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nums(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}

export const projectAndLoseProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event): Promise<void> {
      const p = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'scene-ready': {
          const cx = num(p.centerX);
          const cy = num(p.centerY);
          const deg = num(p.angleDeg);
          if (cx === null || cy === null || deg === null) return;
          stage.setCaption(
            tr('caption.axisGiven', 'One axis, already found. The points will drop onto it.'),
          );
          await stage.showScene(cx, cy, deg);
          return;
        }

        case 'drop': {
          const indices = nums(p.indices);
          const footXs = nums(p.footXs);
          const footYs = nums(p.footYs);
          if (!indices || !footXs || !footYs) return;
          if (indices.length !== footXs.length || indices.length !== footYs.length) return;
          stage.setCaption(tr('caption.drop', 'Each point drops onto the axis at a right angle.'));
          await stage.dropPoints(indices, footXs, footYs);
          return;
        }

        case 'residual-mark': {
          const index = num(p.index);
          const maxDist = num(p.maxDist);
          const meanDist = num(p.meanDist);
          if (index === null || maxDist === null || meanDist === null) return;
          stage.setCaption(
            tr('caption.measure', 'The drop distance is what is lost — farthest {max}, average {mean}.', {
              max: maxDist.toFixed(2),
              mean: meanDist.toFixed(2),
            }),
          );
          await stage.markLongest(index, maxDist);
          return;
        }

        case 'collapse': {
          const keepPct = num(p.keepPct);
          const losePct = num(p.losePct);
          if (keepPct === null || losePct === null) return;
          stage.setCaption(tr('caption.erase', 'Erase the traces. Only the spots on the axis remain.'));
          await stage.collapseTraces(keepPct, losePct);
          return;
        }

        case 'ambiguity': {
          const index = num(p.index);
          if (index === null) return;
          stage.setCaption(
            tr('caption.ambiguous', 'This spot on the axis looks the same from anywhere along this line.'),
          );
          await stage.showAmbiguity(index);
          return;
        }

        case 'done': {
          stage.setCaption(tr('caption.done', 'So the original spot cannot be pointed back to.'));
          await stage.finish();
          return;
        }

        case 'rewind': {
          stage.rewind();
          return;
        }

        default:
          // 이 알고리즘은 위 일곱만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind();
    },
  };
};
