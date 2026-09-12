/**
 * latency-ladder projector — 이벤트를 계단 stage 의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다. `event.payload` 를 그대로
 * 흘려보내지 않는다 (C9).
 *
 * 화면 문안은 stage 가 `params.t` 로 조회한다. 층 이름을 캡션과 계단참 양쪽에서
 * 쓰는데, 조회를 두 파일로 나누면 en 원본이 두 벌이 된다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** stage 가 내주는 메서드 표면. 있는 것만 부른다 (C9). */
type LadderStage = {
  reset?(): void;
  ask?(step: { level: string; cycles: number; ns: number }): Promise<void> | void;
  miss?(step: {
    from: string;
    to: string;
    cycles: number;
    ns: number;
    factor: number;
  }): Promise<void> | void;
  hit?(step: { level: string; cycles: number; ns: number }): Promise<void> | void;
  span?(step: { factor: number }): Promise<void> | void;
};

type Fields = {
  level: string;
  from: string;
  to: string;
  cycles: number;
  ns: number;
  factor: number;
};

/**
 * payload 를 읽는다. 단언 뒤에 필드마다 `typeof` 가 따라오므로 좁히개다 (C9).
 * 빠진 필드는 뜻이 없는 값으로 떨어뜨리고, 부르는 쪽이 그것을 보고 접는다.
 */
function readFields(payload: unknown): Fields {
  const out: Fields = { level: '', from: '', to: '', cycles: 0, ns: 0, factor: 0 };
  if (typeof payload !== 'object' || payload === null) return out;
  const p = payload as Record<string, unknown>;
  if (typeof p.level === 'string') out.level = p.level;
  if (typeof p.from === 'string') out.from = p.from;
  if (typeof p.to === 'string') out.to = p.to;
  if (typeof p.cycles === 'number') out.cycles = p.cycles;
  if (typeof p.ns === 'number') out.ns = p.ns;
  if (typeof p.factor === 'number') out.factor = p.factor;
  return out;
}

export const latencyLadderProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = views.stage as unknown as LadderStage | undefined;

  return {
    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event): Promise<void> {
      const f = readFields(event.payload);
      switch (event.type) {
        case 'rewind':
          stage?.reset?.();
          return;
        case 'ask':
          if (f.level === '') return;
          await stage?.ask?.({ level: f.level, cycles: f.cycles, ns: f.ns });
          return;
        case 'miss':
          if (f.from === '' || f.to === '') return;
          await stage?.miss?.({
            from: f.from,
            to: f.to,
            cycles: f.cycles,
            ns: f.ns,
            factor: f.factor,
          });
          return;
        case 'hit':
          if (f.level === '') return;
          await stage?.hit?.({ level: f.level, cycles: f.cycles, ns: f.ns });
          return;
        case 'span':
          await stage?.span?.({ factor: f.factor });
          return;
        default:
          // 이 facet 이 내보내는 것은 위 다섯뿐이다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
