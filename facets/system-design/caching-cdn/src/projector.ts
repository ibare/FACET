/**
 * CachingCdn Projector — algorithm 이벤트를 cdn-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 분산된 엣지점 — 지도 위 여러 자리의 동시 존재.
 *   2. 클라이언트 ↔ 가까운 엣지의 짝지음 (점선 인근선).
 *   3. 두 결말의 호 — 히트는 짧은 왕복, 미스는 긴 여정.
 *   4. 계층 캐스케이드와 채움의 사후 효과 (엣지 → 지역 → 오리진 / 채움 후 가속).
 *   5. 여러 클라이언트의 동시성 — 같은 콘텐츠로 N 도시가 줄줄이 짧게 답받는 가속.
 *   6. 오리진 부하의 호흡 (펄스 / 누적 게이지).
 *
 * 운동 시간 (ms) 은 기획 §8 / §9 기준 — stage 가 자체 ms 상수를 갖고
 * opts.duration 은 보조적으로 전달.
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type CdnStage = {
  reset(): void;
  init(payload: {
    edges: Array<{ id: string; label: string; nx: number; ny: number }>;
    regional: { id: string } | null;
    origin: { id: string };
    contents: Array<{ id: string; label: string }>;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  emitRequest(
    payload: {
      traceIndex: number;
      edgeId: string;
      contentId: string;
      clientLabel: string;
      outcome: 'hit' | 'regional-hit' | 'miss';
      fillPath?: Array<'edge' | 'regional' | 'origin'>;
      reachedOrigin: boolean;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  emitInvalidate(
    payload: { traceIndex: number; edgeId: string; contentId?: string },
    opts?: { duration?: number },
  ): Promise<void>;
  signalInvalid(op: string, raw: string): void;
  signalDemoEnd(): void;
};


export const cachingCdnProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  /** 상시 캡션. 여러 곳에서 쓰이므로 en 원본 리터럴은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'caption.base',
      'A CDN is the system-level behaviour of edges worldwide taking requests from nearby clients — answering short when they hold the answer, and travelling up the hierarchy to fetch and keep it when they do not.',
    );
  const stage = views.stage as unknown as CdnStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(baseCaption());
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as {
            edges?: Array<{ id?: string; label?: string; nx?: number; ny?: number }>;
            regional?: { id?: string } | null;
            origin?: { id?: string };
            contents?: Array<{ id?: string; label?: string }>;
          };
          stage.init({
            edges: Array.isArray(p.edges)
              ? p.edges.map((e) => ({
                  id: String(e.id ?? ''),
                  label: String(e.label ?? ''),
                  nx: typeof e.nx === 'number' ? e.nx : 0.5,
                  ny: typeof e.ny === 'number' ? e.ny : 0.5,
                }))
              : [],
            regional:
              p.regional && typeof p.regional.id === 'string'
                ? { id: p.regional.id }
                : null,
            origin: { id: String(p.origin?.id ?? 'origin') },
            contents: Array.isArray(p.contents)
              ? p.contents.map((c) => ({
                  id: String(c.id ?? ''),
                  label: String(c.label ?? c.id ?? ''),
                }))
              : [],
          });
          break;
        }

        case 'request': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            edgeId?: string;
            contentId?: string;
            clientLabel?: string;
            outcome?: 'hit' | 'regional-hit' | 'miss';
            fillPath?: Array<'edge' | 'regional' | 'origin'>;
            reachedOrigin?: boolean;
          };
          const dur = 1200 / speed;
          await stage.emitRequest(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              edgeId: String(p.edgeId ?? ''),
              contentId: String(p.contentId ?? ''),
              clientLabel: String(p.clientLabel ?? ''),
              outcome:
                p.outcome === 'hit' || p.outcome === 'regional-hit'
                  ? p.outcome
                  : 'miss',
              fillPath: Array.isArray(p.fillPath) ? p.fillPath : undefined,
              reachedOrigin: Boolean(p.reachedOrigin),
            },
            { duration: dur },
          );
          break;
        }

        case 'invalidate': {
          const p = (event.payload ?? {}) as {
            traceIndex?: number;
            edgeId?: string;
            contentId?: string;
          };
          const dur = 320 / speed;
          await stage.emitInvalidate(
            {
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
              edgeId: String(p.edgeId ?? ''),
              contentId:
                typeof p.contentId === 'string' ? p.contentId : undefined,
            },
            { duration: dur },
          );
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        case 'demo-end': {
          stage.signalDemoEnd();
          break;
        }

        default:
          // phase 등 silent 메타 이벤트는 시각 변화 없음 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(baseCaption());
    },
  };
};
