/**
 * mergeTheFrequentPair projector — 알고리즘의 발신을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 필수 필드 타입으로 받는다.
 * 화면 문안은 키로만 다루고 문장은 `FacetJson.messages` 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory, type ProjectorInstance } from '@ffacet/core/runtime';

type Stage = {
  paint?(rows: string[][]): Promise<void>;
  weigh?(counts: number[][], winner: boolean[][]): Promise<void>;
  fuse?(rows: string[][], token: string): Promise<void>;
  rewind?(): void;
  setCaption?(text: string): void;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  const out: string[][] = [];
  for (const line of value) {
    if (!Array.isArray(line)) {
      out.push([]);
      continue;
    }
    out.push(line.filter((token): token is string => typeof token === 'string'));
  }
  return out;
}

function readNumberGrid(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value.map((line) =>
    Array.isArray(line) ? line.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)) : [],
  );
}

function readFlagGrid(value: unknown): boolean[][] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => (Array.isArray(line) ? line.map((flag) => flag === true) : []));
}

export const mergeTheFrequentPairProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    // initialData 는 stage 의 mount 가 이미 받았다. 여기서 다시 좁혀 밀어 넣으면
    // 좁히는 규칙이 두 벌이 된다 (S-piece).

    async onEvent(event): Promise<void> {
      const payload = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'split': {
          stage?.setCaption?.(
            tr('caption.split', 'Each word is cut into letters, closed by the end mark {mark}.', {
              mark: readString(payload?.mark),
            }),
          );
          await stage?.paint?.(readRows(payload?.rows));
          return;
        }

        case 'weigh': {
          const a = readString(payload?.a);
          const b = readString(payload?.b);
          stage?.setCaption?.(
            tr(
              'caption.weigh',
              'Count every neighbouring pair across the whole corpus. Heaviest seam: {pair} at {count}.',
              { pair: `${a}+${b}`, count: readNumber(payload?.count) },
            ),
          );
          await stage?.weigh?.(readNumberGrid(payload?.counts), readFlagGrid(payload?.winner));
          return;
        }

        case 'merge': {
          const a = readString(payload?.a);
          const b = readString(payload?.b);
          const token = readString(payload?.token);
          stage?.setCaption?.(
            tr('caption.merge', 'The seam closes: {pair} becomes {token}, in every word at once.', {
              pair: `${a}+${b}`,
              token,
            }),
          );
          await stage?.fuse?.(readRows(payload?.rows), token);
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', 'Five merges, and the vocabulary stops here. Distinct pieces: {n}.', {
              n: readNumber(payload?.pieces),
            }),
          );
          return;
        }

        default:
          // 이 facet 의 알고리즘은 위 다섯만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
