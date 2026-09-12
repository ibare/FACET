/**
 * 공간 지역성 조각의 번역기.
 *
 * algorithm 이 보내는 것은 수뿐이고 (색인 · 주소 · 줄 번호), 화면에 뜰 문장은
 * 여기서 `tr` 로 해석해 stage 로 넘긴다 (C10). stage 는 문자를 조회하지 않는다 —
 * 그쪽이 그리는 글자는 전부 표식이다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 표면. 오픈 타입을 좁히는 자리를 한 곳에 모은다 (C9). */
type Stage = {
  probe(index: number): Promise<void>;
  lift(line: number, index: number): Promise<void>;
  touch(index: number): Promise<void>;
  setCaption(text: string): void;
  finish(): void;
  rewind(): void;
};

/**
 * payload 에서 수 몇 개를 꺼낸다.
 *
 * `as Record<string, unknown>` 뒤에 필드마다 `typeof` 가 따라붙는 좁히개다 — 검사
 * 없이 곧바로 꺼내 쓰면 회피이고, 하나씩 걸러 내면 좁히개다 (C9).
 */
function nums(payload: unknown, keys: readonly string[]): Record<string, number> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const src = payload as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = src[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

export const spatialLocalityProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  // onInit 을 두지 않는다. initialData 를 좁히는 것은 stage 의 mount 이고,
  // 여기서 다시 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece).
  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'probe': {
          const p = nums(event.payload, ['index', 'addr', 'line']);
          if (!p) return;
          stage.setCaption(
            tr('caption.probe', 'a[{i}] — address {addr}, line {line}. Not up here.', {
              i: p.index,
              addr: p.addr,
              line: p.line,
            }),
          );
          await stage.probe(p.index);
          return;
        }

        case 'line-lift': {
          const p = nums(event.payload, ['index', 'line', 'span']);
          if (!p) return;
          stage.setCaption(
            tr('caption.lift', 'Miss. A whole line rises — {span} come up together.', {
              span: p.span,
            }),
          );
          await stage.lift(p.line, p.index);
          return;
        }

        case 'touch': {
          const p = nums(event.payload, ['index', 'addr', 'line']);
          if (!p) return;
          stage.setCaption(
            tr('caption.hit', 'a[{i}] — address {addr}, line {line}. Already up here.', {
              i: p.index,
              addr: p.addr,
              line: p.line,
            }),
          );
          await stage.touch(p.index);
          return;
        }

        case 'done': {
          const p = nums(event.payload, ['touches', 'misses', 'hits']);
          if (!p) return;
          stage.setCaption(
            tr('caption.done', '{touches} touches: {hits} rode along, {misses} went down.', {
              touches: p.touches,
              hits: p.hits,
              misses: p.misses,
            }),
          );
          stage.finish();
          return;
        }

        case 'rewind':
          stage.rewind();
          return;

        default:
          // 위 다섯이 이 algorithm 이 내보내는 전부다. 그 밖의 것은 조용히 버린다.
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
