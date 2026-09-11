/**
 * primality 의 Projector — algorithm 이 내는 다섯 이벤트를 stage 와 codePanel
 * 호출로 옮긴다.
 *
 * 그림도 문안도 여기서 짓지 않는다: 좌표는 stage 가 캔버스에서 역산하고 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10). 여기 남는 것은 키와 en 원본뿐이다.
 *
 * **배율은 여기서 셈한다.** 정수 둘(검사 횟수와 전수 검사 횟수)만 payload 로
 * 오고, 나눈 값은 화면에 적는 순간의 표현이라 표현 계층의 몫이다. algorithm 이
 * 소수를 실어 보내면 metric 채널의 누적 오차 문제와 같은 자리에 서게 된다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 의 구조적 계약. 전부 optional 이고 호출은 `?.()` 로 한다 (C9). */
type PrimalityStage = {
  build?(n: number, limit: number, fullChecks: number): Promise<void> | void;
  check?(d: number, checks: number): Promise<void> | void;
  wall?(): Promise<void> | void;
  verdict?(checks: number, fullChecks: number, ratio: string): Promise<void> | void;
  setCaption?(text: string): void;
  clear?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 배율. 소수 한 자리로 적는다 — 11.9 와 42.0 이 같은 모양으로 읽혀야 한다. */
function ratioOf(full: number, checks: number): string {
  if (checks <= 0) return '0.0';
  return (full / checks).toFixed(1);
}

export const primalityProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PrimalityStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    /**
     * 되돌리기 뒤에도 다시 불린다 (`ReactiveMechanism.reset`). stage 를 마운트
     * 직후의 빈 틀로 돌리는 것이 전부다 — `initialData` 를 여기서 다시 좁혀
     * 밀어 넣지 않는다. 그 일은 stage 의 `mount` 가 이미 했다.
     */
    onInit(): void {
      stage?.clear?.();
      codePanel?.clearHighlight?.();
    },

    async onEvent(event): Promise<void> {
      const p = asObject(event.payload);

      switch (event.type) {
        case 'built': {
          if (!p) return;
          const n = asNumber(p.n);
          const limit = asNumber(p.limit);
          const fullChecks = asNumber(p.fullChecks);
          if (n === null || limit === null || fullChecks === null) return;
          await stage?.build?.(n, limit, fullChecks);
          stage?.setCaption?.(
            tr('caption.built', 'Is {n} prime? The candidates to divide by run from 2 up to {limit}.', {
              n,
              limit,
            }),
          );
          return;
        }

        case 'check': {
          if (!p) return;
          const n = asNumber(p.n);
          const d = asNumber(p.d);
          const checks = asNumber(p.checks);
          if (n === null || d === null || checks === null) return;
          stage?.setCaption?.(
            tr('caption.check', '{n} divided by {d} leaves a remainder — not a divisor.', { n, d }),
          );
          await stage?.check?.(d, checks);
          return;
        }

        case 'wall': {
          if (!p) return;
          const limit = asNumber(p.limit);
          if (limit === null) return;
          stage?.setCaption?.(
            tr(
              'caption.wall',
              'The candidates stop at {limit}. Past the square root nothing new can turn up, because the smaller side of every divisor pair sits at or before it.',
              { limit },
            ),
          );
          await stage?.wall?.();
          return;
        }

        case 'verdict': {
          if (!p) return;
          const n = asNumber(p.n);
          const checks = asNumber(p.checks);
          const fullChecks = asNumber(p.fullChecks);
          if (n === null || checks === null || fullChecks === null) return;
          const ratio = ratioOf(fullChecks, checks);
          // 하이라이트를 거두지 않는다. 마지막 불은 `return 1` 에 켜진 채로
          // 남아야 한다 — 이 화면의 논증이 "`return 0` 에는 끝내 불이 안 들어온다"
          // 이므로, 켜져야 할 줄까지 꺼 버리면 그 대비가 성립하지 않는다.
          // 거두는 일은 onInit / onReset 이 한다.
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              '{n} is prime, settled in {checks} checks. Dividing by every candidate below {n} would have taken {full}.',
              { n, checks, full: fullChecks },
            ),
          );
          await stage?.verdict?.(checks, fullChecks, ratio);
          return;
        }

        case 'phase': {
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(phase);
          return;
        }

        default:
          // algorithm 이 내보내는 다섯을 위에서 모두 다룬다. 그 밖의 이벤트는
          // 오지 않으며, 오더라도 화면을 건드리지 않고 흘려보낸다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.clear?.();
      codePanel?.clearHighlight?.();
    },
  };
};
