/**
 * collisionProjector — 알고리즘 이벤트를 collision-stage 의 메서드로 옮긴다.
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 나눈다. 걸음 8 (점 다섯 동시)만 600ms 안쪽, 나머지는 400ms 안쪽.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { CollisionStage, StageFirst, StageHit } from './collision-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

const MOVE_MS = 380;
const MOVE_ALL_MS = 560;

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`collisionProjector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`collisionProjector: payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`collisionProjector: payload.${key} 가 문자열이 아니다`);
  return v;
}

function strList(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) throw new Error(`collisionProjector: payload.${key} 가 문자열 배열이 아니다`);
  return v as string[];
}

export const collisionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CollisionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): CollisionStage => {
    if (!stage) throw new Error('collisionProjector: stage 블록이 없다');
    return stage;
  };
  const speed = (): number => {
    if (!runtime) return 1;
    const s = runtime.getSpeed();
    if (!(s > 0)) throw new Error(`collisionProjector: 재생 속도가 어긋났다 — ${s}`);
    return s;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase payload');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'init': {
          const p = record(event.payload, 'init payload');
          code?.highlightPhase(null);
          need().begin({
            width: num(p, 'width'),
            slots: num(p, 'slots'),
            axisEnd: num(p, 'axisEnd'),
            streams: strList(p, 'streams'),
          });
          return;
        }
        case 'pigeonhole': {
          const p = record(event.payload, 'pigeonhole payload');
          return need().showSure({ slots: num(p, 'slots'), sure: num(p, 'sure') }, MOVE_MS / speed());
        }
        case 'birthday-half': {
          const p = record(event.payload, 'birthday-half payload');
          return need().showHalf({ half: num(p, 'half') }, MOVE_MS / speed());
        }
        case 'first-collision': {
          const p = record(event.payload, 'first-collision payload');
          let summary: StageFirst['summary'] = null;
          if (p.summary !== null) {
            const s = record(p.summary, 'first-collision summary');
            summary = { avgTenths: num(s, 'avgTenths'), ratio: num(s, 'ratio'), sure: num(s, 'sure') };
          }
          return need().showFirst(
            {
              row: num(p, 'row'),
              first: num(p, 'first'),
              slot: num(p, 'slot'),
              input: str(p, 'input'),
              partnerInput: str(p, 'partnerInput'),
              summary,
            },
            MOVE_MS / speed(),
          );
        }
        case 'target-hit': {
          const p = record(event.payload, 'target-hit payload');
          const raw = p.hits;
          if (!Array.isArray(raw)) throw new Error('collisionProjector: payload.hits 가 배열이 아니다');
          const hits: StageHit[] = raw.map((h) => {
            const r = record(h, 'hit');
            return { row: num(r, 'row'), tries: num(r, 'tries'), input: str(r, 'input') };
          });
          return need().showTargets(
            { hits, avgTenths: num(p, 'avgTenths'), slots: num(p, 'slots') },
            MOVE_ALL_MS / speed(),
          );
        }
        default:
          throw new Error(`collisionProjector: 모르는 이벤트 — ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
