/**
 * polymorphism projector — 알고리즘 이벤트를 stage 메서드로 옮긴다.
 *
 * 문안은 여기서 번역해 넘기고, 움직임 길이는 걸음마다 `runtime.getSpeed()` 를 새로 읽어 셈한다.
 * 코드 패널이 없으므로 phase 를 다루지 않는다 (알고리즘도 phase 를 보내지 않는다).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { PolymorphismStage } from './polymorphism-stage.js';

/** 걸음 간격 가운데 움직임에 쓰는 몫. */
const MOTION_SHARE = 0.55;

export const polymorphismProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PolymorphismStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  let stepMs = 1100;
  const ms = (): number => Math.round((stepMs * MOTION_SHARE) / Math.max(0.01, runtime?.getSpeed() ?? 1));

  const str = (p: Record<string, unknown>, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const num = (p: Record<string, unknown>, k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);

  return {
    onInit(data: unknown): void {
      if (typeof data === 'object' && data !== null) {
        const s = (data as { stepMs?: unknown }).stepMs;
        if (typeof s === 'number' && s > 0) stepMs = s;
      }
      stage?.reset();
    },
    onEvent(e: FacetRuntimeEvent): void {
      if (!stage) return;
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'start': {
          const receiver = str(p, 'receiver');
          const method = str(p, 'method');
          if (receiver !== null && method !== null) stage.start(receiver, method);
          break;
        }
        case 'stamp': {
          const cls = str(p, 'cls');
          if (cls !== null) stage.stamp(cls, ms(), t('caption.class', 'Class: {cls}', { cls }));
          break;
        }
        case 'look': {
          const cls = str(p, 'cls');
          const method = str(p, 'method');
          const looked = num(p, 'looked');
          if (cls !== null && method !== null && looked !== null) {
            stage.look(cls, p.found === true, method, ms(), t('caption.looked', 'Classes looked: {n}', { n: looked }));
          }
          break;
        }
        case 'run': {
          const owner = str(p, 'owner');
          const method = str(p, 'method');
          const out = str(p, 'out');
          const levels = num(p, 'levels');
          if (owner !== null && method !== null && out !== null && levels !== null) {
            stage.run(owner, method, out, p.slot === true, ms(), [
              t('caption.output', 'Output: {out}', { out }),
              t('caption.levels', 'Levels up: {n}', { n: levels }),
            ]);
          }
          break;
        }
        case 'fail':
          stage.fail(ms(), [t('caption.error', 'Error: {err}', { err: 'NoMethod' })]);
          break;
        default:
          break;
      }
    },
    onReset(): void {
      stage?.reset();
    },
  };
};
