/**
 * 전역과 지역 구조 조각의 projector — 이벤트를 자 둘 위의 동작으로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. 여기서 좁혀 정형 객체로 만들고 stage 는
 * 필수 필드 타입으로만 받는다 (C9). 화면 문안은 전부 키로 조회하고 en 원본만
 * 호출부에 리터럴로 둔다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

import type {
  GlobalAndLocalGroupShift,
  GlobalAndLocalPlacedCentroid,
  GlobalAndLocalPlacedPoint,
  GlobalAndLocalRulerRow,
  GlobalAndLocalStage,
} from './global-and-local-stage.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readRows(payload: unknown): GlobalAndLocalRulerRow[] {
  const raw = asRecord(payload)?.['rows'];
  if (!Array.isArray(raw)) return [];
  const rows: GlobalAndLocalRulerRow[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const row = rec['row'];
    if (row !== 'global' && row !== 'local') continue;
    rows.push({
      row,
      lo: readNumber(rec['lo']),
      hi: readNumber(rec['hi']),
      anchorLo: readNumber(rec['anchorLo']),
      anchorHi: readNumber(rec['anchorHi']),
    });
  }
  return rows;
}

function readPoints(payload: unknown): GlobalAndLocalPlacedPoint[] {
  const raw = asRecord(payload)?.['points'];
  if (!Array.isArray(raw)) return [];
  const points: GlobalAndLocalPlacedPoint[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const id = readText(rec['id']);
    const group = readText(rec['group']);
    if (id === '' || group === '') continue;
    points.push({ id, group, value: readNumber(rec['value']) });
  }
  return points;
}

function readCentroids(payload: unknown): GlobalAndLocalPlacedCentroid[] {
  const raw = asRecord(payload)?.['centroids'];
  if (!Array.isArray(raw)) return [];
  const centroids: GlobalAndLocalPlacedCentroid[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const group = readText(rec['group']);
    if (group === '') continue;
    centroids.push({ group, value: readNumber(rec['value']) });
  }
  return centroids;
}

function readShifts(payload: unknown): GlobalAndLocalGroupShift[] {
  const raw = asRecord(payload)?.['shifts'];
  if (!Array.isArray(raw)) return [];
  const shifts: GlobalAndLocalGroupShift[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const group = readText(rec['group']);
    if (group === '') continue;
    shifts.push({ group, shift: readNumber(rec['shift']) });
  }
  return shifts;
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function loudestShift(shifts: GlobalAndLocalGroupShift[]): number {
  let amount = 0;
  for (const entry of shifts) amount = Math.max(amount, Math.abs(entry.shift));
  return amount;
}

export const globalAndLocalProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views['stage'] as unknown as GlobalAndLocalStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const payload = event.payload;

      switch (event.type) {
        case 'rulers': {
          stage.setCaption(
            tr(
              'caption.rulers',
              'The same data, flattened two ways. Two rulers side by side, with the end clusters pinned to the same spots on both.',
            ),
          );
          await stage.showRulers(readRows(payload));
          break;
        }

        case 'spread-global': {
          stage.setCaption(
            tr(
              'caption.spreadGlobal',
              'Top ruler — every point drops onto the widest direction. The long distances survive.',
            ),
          );
          await stage.showSpread('global', readPoints(payload), readCentroids(payload));
          break;
        }

        case 'spread-local': {
          stage.setCaption(
            tr(
              'caption.spreadLocal',
              'Bottom ruler — only the order inside each cluster is kept, and the clusters are laid out at equal steps.',
            ),
          );
          await stage.showSpread('local', readPoints(payload), readCentroids(payload));
          break;
        }

        case 'tie': {
          const shifts = readShifts(payload);
          stage.setCaption(
            tr(
              'caption.tie',
              'Tie the same items together. Both ends are pinned, so what is left is the middle — it slid by {shift}.',
              { shift: percent(loudestShift(shifts)) },
            ),
          );
          await stage.showTies(shifts);
          break;
        }

        case 'inside': {
          const rec = asRecord(payload);
          stage.setCaption(
            tr(
              'caption.inside',
              'Look inside a cluster — the room one cluster gets is {g} on top and {l} below. Below, the four are readable.',
              {
                g: percent(readNumber(rec?.['globalShare'])),
                l: percent(readNumber(rec?.['localShare'])),
              },
            ),
          );
          await stage.showInside();
          break;
        }

        case 'measure-gap': {
          const rec = asRecord(payload);
          const from = readText(rec?.['from']);
          const to = readText(rec?.['to']);
          const globalShare = readNumber(rec?.['globalShare']);
          const localShare = readNumber(rec?.['localShare']);
          stage.setCaption(
            tr(
              'caption.gap',
              'Now the gap between clusters — {from}–{to}. Originally {o} of the whole, top {g}, bottom {l}.',
              {
                from,
                to,
                o: percent(readNumber(rec?.['originShare'])),
                g: percent(globalShare),
                l: percent(localShare),
              },
            ),
          );
          await stage.showGap(from, to, globalShare, localShare);
          break;
        }

        case 'ratio': {
          const rec = asRecord(payload);
          const globalRatio = readNumber(rec?.['globalRatio']);
          const localRatio = readNumber(rec?.['localRatio']);
          stage.setCaption(
            tr(
              'caption.ratio',
              'Second gap over first — originally 1 : {o}, top 1 : {g}, bottom 1 : {l}.',
              {
                o: readNumber(rec?.['originRatio']).toFixed(2),
                g: globalRatio.toFixed(2),
                l: localRatio.toFixed(2),
              },
            ),
          );
          await stage.showRatio(globalRatio, localRatio);
          break;
        }

        case 'verdict': {
          stage.setCaption(
            tr(
              'caption.verdict',
              'Three times apart became the same. Do not read cluster-to-cluster distance off the bottom ruler.',
            ),
          );
          await stage.showVerdict();
          break;
        }

        case 'done': {
          stage.setCaption(
            tr('caption.done', 'Looking close and being close are not the same thing.'),
          );
          break;
        }

        case 'rewind': {
          stage.resetScene();
          break;
        }

        default:
          // 이 알고리즘은 위 어휘만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage?.resetScene();
    },
  };
};
