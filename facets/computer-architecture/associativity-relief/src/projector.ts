/**
 * 연관도 조각의 번역기.
 *
 * algorithm 이 낸 자리 값(setIndex · wayIndex)을 그림이 아는 칸 번호로 바꾸고,
 * 걸음마다 캡션 키를 골라 `runtime.t` 로 풀어 넘긴다. 문안은 `facet.ts` 의
 * `messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 *
 * 조회는 키와 en 원본을 **부르는 자리마다 리터럴로 펴서** 쓴다. 헬퍼로
 * 감싸면 키와 en 원본이 한 겹 뒤로 숨어, 둘이 어긋났는지 재는 전수 검사
 * (`en-original-matches-declaration`) 가 이 facet 을 그냥 지나친다. 같은 문안을
 * 여러 곳에서 부르는 것도 아니라 감쌀 까닭이 없다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, Translate } from '@ffacet/core/runtime';

/**
 * stage 가 내주는 표면. `views.stage` 는 설계상 열린 타입이라 한 번만 좁혀
 * 쓰고, 없을 수도 있는 메서드는 `?.()` 로 부른다 (C9).
 */
type Stage = {
  regroup?(p: { ways: number }): Promise<void> | void;
  fill?(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> | void;
  evict?(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> | void;
  hit?(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> | void;
  finish?(): void;
  setCaption?(text: string): void;
  reset?(): void;
};

type Access = {
  ways: number;
  step: number;
  addr: number;
  setIndex: number;
  wayIndex: number;
  occupied: number;
  victimAddr: number;
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** 걸음마다 오는 payload 는 projector 가 좁혀 넘긴다 (C9). */
function readAccess(payload: unknown): Access | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const ways = num(p.ways);
  const step = num(p.step);
  const addr = num(p.addr);
  const setIndex = num(p.setIndex);
  const wayIndex = num(p.wayIndex);
  if (ways === null || step === null || addr === null) return null;
  if (setIndex === null || wayIndex === null) return null;
  return {
    ways,
    step,
    addr,
    setIndex,
    wayIndex,
    occupied: num(p.occupied) ?? 0,
    victimAddr: num(p.victimAddr) ?? 0,
  };
}

/** 러너 밖에서 세울 때를 위한 자리. 러너가 주면 저작자 문안이 얹힌 조회기가 온다. */
const plain: Translate = (_key, en, vars) =>
  en.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  );

export const associativityReliefProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? plain;

  /** 자리와 칸 번호로 그림의 칸 하나를 짚는다. */
  const cellOf = (a: Access): number => a.setIndex * a.ways + a.wayIndex;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'regroup': {
          const p = (typeof event.payload === 'object' && event.payload !== null
            ? event.payload
            : {}) as Record<string, unknown>;
          const ways = num(p.ways);
          const sets = num(p.sets);
          if (ways === null || sets === null) return;
          stage?.setCaption?.(
            tr('caption.regroup', 'Still four lines — only the grouping changes: {ways} per seat, {sets} seats.', {
              ways,
              sets,
            }),
          );
          await stage?.regroup?.({ ways });
          return;
        }

        case 'cache-fill': {
          const a = readAccess(event.payload);
          if (!a) return;
          // 이미 누가 앉아 있는 자리에 내려앉는 것이 이 조각의 결정적 장면이다.
          if (a.occupied > 0) {
            stage?.setCaption?.(
              tr('caption.sitTogether', '{addr} wants set {set} too. This seat holds two, so it sits alongside.', {
                addr: a.addr,
                set: a.setIndex,
              }),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.fillEmpty', '{addr} lands in set {set}. The way is free, so it just moves in.', {
                addr: a.addr,
                set: a.setIndex,
              }),
            );
          }
          await stage?.fill?.({ ways: a.ways, step: a.step, addr: a.addr, cellIndex: cellOf(a) });
          return;
        }

        case 'cache-evict': {
          const a = readAccess(event.payload);
          if (!a) return;
          stage?.setCaption?.(
            tr('caption.evict', '{addr} wants set {set} too, but the only way is taken. {victim} is pushed out.', {
              addr: a.addr,
              set: a.setIndex,
              victim: a.victimAddr,
            }),
          );
          await stage?.evict?.({ ways: a.ways, step: a.step, addr: a.addr, cellIndex: cellOf(a) });
          return;
        }

        case 'cache-hit': {
          const a = readAccess(event.payload);
          if (!a) return;
          stage?.setCaption?.(
            tr('caption.hit', '{addr} is still sitting in set {set}. Nobody pushed it out — hit.', {
              addr: a.addr,
              set: a.setIndex,
            }),
          );
          await stage?.hit?.({ ways: a.ways, step: a.step, addr: a.addr, cellIndex: cellOf(a) });
          return;
        }

        case 'done': {
          const p = (typeof event.payload === 'object' && event.payload !== null
            ? event.payload
            : {}) as Record<string, unknown>;
          const before = num(p.firstMisses);
          const after = num(p.lastMisses);
          if (before === null || after === null) return;
          stage?.setCaption?.(
            tr('caption.done', 'Same four lines, same accesses. Misses: {before} → {after}.', {
              before,
              after,
            }),
          );
          stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 위 여섯이 이 algorithm 이 내는 전부다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
