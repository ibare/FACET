/**
 * union-find projector — 걸음을 stage 호출과 두 HUD 로 옮긴다.
 *
 * **조작별 값은 HUD 가 진다.** `ctx.metric` 은 더하기만 하고 값을 놓지 못해
 * "이번 조작에서 몇 칸 올랐나" 를 메트릭으로 둘 수 없다. algorithm 이 `done` 에
 * 그 조작의 셈을 실어 보내고 서식은 이쪽이 맡는다 (C10 — 문안은 선언에 있고
 * 여기서는 키와 값만 다룬다). 컨트롤바의 메트릭은 평생 누적을 따로 진다.
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { UnionFindStage } from './union-find-stage.js';

type TextDisplay = { setText(text: string): void; reset?(): void };

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function numArray(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : null;
}

export const unionFindProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as UnionFindStage;
  const costHud = views.costHud as unknown as TextDisplay | undefined;
  const heightHud = views.heightHud as unknown as TextDisplay | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  const clearHuds = (): void => {
    costHud?.setText('—');
    heightHud?.setText('—');
  };

  return {
    onInit() {
      clearHuds();
      stage.caption(t('caption.start', 'Merging groups — each union picks a root to go under.'));
    },

    onReset() {
      clearHuds();
      stage.caption(t('caption.start', 'Merging groups — each union picks a root to go under.'));
    },

    onEvent(event) {
      switch (event.type) {
        case 'state-changed': {
          const p = rec(event.payload);
          if (!p) return;
          const parent = numArray(p.parent);
          const rank = numArray(p.rank);
          if (!parent || !rank) return;
          stage.setStructure(parent, rank);
          return;
        }

        case 'hop': {
          const p = rec(event.payload);
          if (!p || typeof p.from !== 'number' || typeof p.to !== 'number') return;
          stage.hop(
            p.to,
            t('caption.hop', '{from} points at {to} — climb one.', { from: p.from, to: p.to }),
          );
          return;
        }

        case 'root-found': {
          const p = rec(event.payload);
          if (!p || typeof p.start !== 'number' || typeof p.root !== 'number') return;
          if (typeof p.hops !== 'number') return;
          stage.rootFound(
            p.root,
            t('caption.rootFound', '{start} belongs to {root} — {n} hops.', {
              start: p.start,
              root: p.root,
              n: p.hops,
            }),
          );
          return;
        }

        case 'compare': {
          const p = rec(event.payload);
          if (!p || typeof p.a !== 'number' || typeof p.b !== 'number') return;
          if (typeof p.rankA !== 'number' || typeof p.rankB !== 'number') return;
          stage.caption(
            t('caption.compare', 'Rank {ra} vs {rb} — the lower one goes under.', {
              ra: p.rankA,
              rb: p.rankB,
            }),
          );
          return;
        }

        case 'attach': {
          const p = rec(event.payload);
          if (!p || typeof p.loser !== 'number' || typeof p.winner !== 'number') return;
          const grew = p.rankGrew === true;
          stage.attach(
            p.loser,
            p.winner,
            grew
              ? t('caption.attachGrew', '{lo} goes under {wi} — the height grows by one.', {
                  lo: p.loser,
                  wi: p.winner,
                })
              : t('caption.attachSame', '{lo} goes under {wi} — the height stays.', {
                  lo: p.loser,
                  wi: p.winner,
                }),
          );
          return;
        }

        case 'compress': {
          const p = rec(event.payload);
          if (!p || typeof p.root !== 'number') return;
          const list = numArray(p.nodes);
          if (!list) return;
          stage.compressed(
            list,
            t('caption.compress', '{n} seats now point straight at {root}.', {
              n: list.length,
              root: p.root,
            }),
          );
          return;
        }

        case 'already': {
          const p = rec(event.payload);
          if (!p || typeof p.a !== 'number' || typeof p.b !== 'number') return;
          stage.caption(
            t('caption.already', '{a} and {b} share a root already.', { a: p.a, b: p.b }),
          );
          return;
        }

        case 'done': {
          const p = rec(event.payload);
          if (!p) return;
          const finds = typeof p.finds === 'number' ? p.finds : 0;
          const hops = typeof p.hops === 'number' ? p.hops : 0;
          const height = typeof p.height === 'number' ? p.height : 0;
          // **이번 조작**의 값이다. 평생 누적 평균으로 재면 "두 번째가 싸다" 가
          // 뭉개진다 — 첫 조작의 비싼 값이 계속 섞이기 때문이다. 평생 누적은
          // 컨트롤바의 메트릭이 이미 지고 있다.
          costHud?.setText(t('hud.cost', '{hops} hops / {finds} finds', { hops, finds }));
          heightHud?.setText(t('hud.height', '{n}', { n: height }));
          return;
        }

        default:
          // 그 밖의 어휘는 무시한다.
          return;
      }
    },
  };
};
