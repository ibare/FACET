/**
 * 집합 연관 캐시 projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 `runtime.t` 로 조회하고 값은 플레이스홀더로 넣는다 (C10). 문장 자체는
 * `facet.ts` 의 messages 에 있으므로 저작자가 손댈 수 있다.
 */

import {
  makeTranslator,
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드 (C9 — 구체형은 파일 상단에 모은다). */
type CacheStage = {
  setSequence?(addresses: number[]): void;
  setCaption?(text: string): void;
  setLayout?(ways: number, sets: number): Promise<void> | void;
  focusAccess?(
    index: number,
    round: number,
    line: number,
    setIndex: number,
    tag: number,
  ): Promise<void> | void;
  probeSet?(setIndex: number): Promise<void> | void;
  showHit?(slot: number): Promise<void> | void;
  showMiss?(
    slot: number,
    tag: number,
    evictedTag: number | null,
    fromIndex: number,
  ): Promise<void> | void;
  finish?(): void;
  clear?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
};

type Fields = Record<string, unknown>;

function fieldsOf(payload: unknown): Fields | undefined {
  return typeof payload === 'object' && payload !== null ? (payload as Fields) : undefined;
}

function numberAt(fields: Fields | undefined, key: string): number | null {
  const value = fields?.[key];
  return typeof value === 'number' ? value : null;
}

export const setAssociativeCacheProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CacheStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 지금 훑고 있는 묶음의 너비. 캡션이 "몇 칸을 뒤지는가" 를 말할 때 쓴다. */
  let ways = 1;
  /** 지금 강조된 접근 칩. 미스 때 그 칩이 날아갈 출발점이다. */
  let accessIndex = 0;

  const instance: ProjectorInstance = {
    onInit(initialData: unknown): void {
      const data = fieldsOf(initialData);
      const addresses = data?.addresses;
      if (Array.isArray(addresses) && addresses.every((x) => typeof x === 'number')) {
        stage?.setSequence?.(addresses as number[]);
      }
      const slots = numberAt(data, 'slots');
      const startWays = numberAt(data, 'ways');
      if (slots !== null && startWays !== null && startWays > 0) {
        ways = startWays;
        stage?.setLayout?.(startWays, Math.floor(slots / startWays));
      }
      stage?.setCaption?.(
        tr('caption.intro', 'Eight slots, always eight. Only the dividers between them move.'),
      );
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const fields = fieldsOf(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = fields?.phase;
          panel?.highlightPhase?.(typeof phase === 'string' ? phase : null);
          return;
        }

        case 'layout-changed': {
          const nextWays = numberAt(fields, 'ways');
          const sets = numberAt(fields, 'sets');
          if (nextWays === null || sets === null) return;
          ways = nextWays;
          stage?.setCaption?.(
            tr(
              'caption.ways',
              '{ways}-way: eight slots in {sets} groups of {ways}. One lookup now searches {ways} slots.',
              { ways: nextWays, sets },
            ),
          );
          await stage?.setLayout?.(nextWays, sets);
          return;
        }

        case 'highlight': {
          const index = toIndexArray(event.target)[0];
          const addr = numberAt(fields, 'addr');
          const line = numberAt(fields, 'line');
          const setIndex = numberAt(fields, 'setIndex');
          const tag = numberAt(fields, 'tag');
          const round = numberAt(fields, 'round') ?? 0;
          if (index === undefined || addr === null || line === null) return;
          if (setIndex === null || tag === null) return;
          accessIndex = index;
          stage?.setCaption?.(
            tr('caption.decode', 'Address {addr} is line {line}: set {set}, tag {tag}.', {
              addr,
              line,
              set: setIndex,
              tag,
            }),
          );
          await stage?.focusAccess?.(index, round, line, setIndex, tag);
          return;
        }

        case 'probe-set': {
          const setIndex = numberAt(fields, 'setIndex');
          if (setIndex === null) return;
          const width = numberAt(fields, 'ways') ?? ways;
          stage?.setCaption?.(
            tr('caption.probe', 'Searching set {set} — every one of its {ways} slots.', {
              set: setIndex,
              ways: width,
            }),
          );
          await stage?.probeSet?.(setIndex);
          return;
        }

        case 'cache-hit': {
          const slot = numberAt(fields, 'slot');
          const setIndex = numberAt(fields, 'setIndex');
          const tag = numberAt(fields, 'tag');
          if (slot === null || setIndex === null || tag === null) return;
          stage?.setCaption?.(
            tr('caption.hit', 'Hit. Tag {tag} was already sitting in set {set}.', {
              tag,
              set: setIndex,
            }),
          );
          await stage?.showHit?.(slot);
          return;
        }

        case 'cache-miss': {
          const slot = numberAt(fields, 'slot');
          const setIndex = numberAt(fields, 'setIndex');
          const tag = numberAt(fields, 'tag');
          if (slot === null || setIndex === null || tag === null) return;
          const evicted = numberAt(fields, 'evictedTag');
          stage?.setCaption?.(
            evicted === null
              ? tr('caption.fill', 'Miss. Tag {tag} takes a free slot in set {set}.', {
                  tag,
                  set: setIndex,
                })
              : tr(
                  'caption.evict',
                  'Miss. Tag {tag} pushes out tag {old}, the oldest in set {set}.',
                  { tag, old: evicted, set: setIndex },
                ),
          );
          await stage?.showMiss?.(slot, tag, evicted, accessIndex);
          return;
        }

        case 'done': {
          const misses = numberAt(fields, 'misses');
          const width = numberAt(fields, 'ways') ?? ways;
          if (misses === null) return;
          const prevWays = numberAt(fields, 'prevWays');
          const prevMisses = numberAt(fields, 'prevMisses');
          if (prevWays === null || prevMisses === null) {
            stage?.setCaption?.(
              tr('caption.doneFirst', '{ways}-way ends with {misses} misses. Widen the groups and watch.', {
                ways: width,
                misses,
              }),
            );
          } else if (prevMisses === misses) {
            stage?.setCaption?.(
              tr(
                'caption.donePlateau',
                '{ways}-way ends with {misses} misses — the same as {prevWays}-way. Wider groups only cost more searching now.',
                { ways: width, misses, prevWays },
              ),
            );
          } else {
            stage?.setCaption?.(
              tr(
                'caption.doneDrop',
                '{ways}-way ends with {misses} misses, down from {prev} at {prevWays}-way. Still eight slots.',
                { ways: width, misses, prev: prevMisses, prevWays },
              ),
            );
          }
          stage?.finish?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 조용히 흘린다 — 이 facet 의 algorithm 은 위의 것만
          // 발신하므로 여기 닿는 것이 있다면 어휘가 어긋난 것이다 (C2).
          return;
      }
    },

    onReset(): void {
      panel?.highlightPhase?.(null);
      stage?.clear?.();
      stage?.setCaption?.(
        tr('caption.intro', 'Eight slots, always eight. Only the dividers between them move.'),
      );
    },
  };

  return instance;
};
