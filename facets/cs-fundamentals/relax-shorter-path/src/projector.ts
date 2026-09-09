/**
 * relaxShorterPath projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 좁혀서 넘긴다 (C9). stage 는 정형 객체만
 * 받으며 `unknown` 을 보지 않는다. 화면 문안은 키로만 여기 남고 문장은
 * `facet.ts` 의 messages 에 있다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드 계약. */
type RelaxStage = {
  reset(spec: { vertices: string[]; source: string; scaleMax: number }): void;
  setCaption(text: string): void;
  settle(vertex: string): Promise<void>;
  write(w: { vertex: string; from: string; weight: number; value: number }): Promise<void>;
  probe(p: {
    from: string;
    to: string;
    weight: number;
    candidate: number;
    current: number;
  }): Promise<void>;
  descend(d: { vertex: string; fromValue: number; toValue: number }): Promise<void>;
  keep(vertex: string): Promise<void>;
  finish(): Promise<void>;
};

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asName = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNames = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0)
    ? (value as string[])
    : null;

export const relaxShorterPathProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as RelaxStage;
  const tr = runtime?.t ?? makeTranslator();

  let spec: { vertices: string[]; source: string; scaleMax: number } | null = null;

  /** 처음 화면의 캡션. 같은 문안이 세 곳에서 필요해 en 원본을 한 번만 둔다 (C10). */
  const startCaption = (source: string): string =>
    tr('caption.start', 'Only the start is known — {source} is 0, the rest have nothing written.', {
      source,
    });

  const build = (initialData: unknown): void => {
    const d = initialData as
      | { vertices?: unknown; source?: unknown; scaleMax?: unknown }
      | undefined;
    const vertices = asNames(d?.vertices);
    const source = asName(d?.source);
    const scaleMax = asNumber(d?.scaleMax);
    if (vertices === null || source === null || scaleMax === null || scaleMax <= 0) return;
    spec = { vertices, source, scaleMax };
    stage.reset(spec);
    stage.setCaption(startCaption(source));
  };

  return {
    onInit(initialData: unknown): void {
      build(initialData);
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'settle': {
          const p = event.payload as { vertex?: unknown; dist?: unknown } | undefined;
          const vertex = asName(p?.vertex);
          const dist = asNumber(p?.dist);
          if (vertex === null || dist === null) return;
          stage.setCaption(
            tr('caption.settle', '{vertex} holds the smallest number written so far ({dist}). Open the edges that leave it.', {
              vertex,
              dist,
            }),
          );
          await stage.settle(vertex);
          return;
        }

        case 'write': {
          const p = event.payload as
            | { vertex?: unknown; from?: unknown; weight?: unknown; value?: unknown }
            | undefined;
          const vertex = asName(p?.vertex);
          const from = asName(p?.from);
          const weight = asNumber(p?.weight);
          const value = asNumber(p?.value);
          if (vertex === null || from === null || weight === null || value === null) return;
          stage.setCaption(
            tr('caption.write', 'Nothing is written at {vertex} yet — the way through {from} puts {value} there.', {
              vertex,
              from,
              value,
            }),
          );
          await stage.write({ vertex, from, weight, value });
          return;
        }

        case 'probe': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; weight?: unknown; candidate?: unknown; current?: unknown }
            | undefined;
          const from = asName(p?.from);
          const to = asName(p?.to);
          const weight = asNumber(p?.weight);
          const candidate = asNumber(p?.candidate);
          const current = asNumber(p?.current);
          if (from === null || to === null || weight === null || candidate === null || current === null) return;
          stage.setCaption(
            tr('caption.probe', 'Going through {from} costs {candidate}. {to} has {current} written.', {
              from,
              to,
              candidate,
              current,
            }),
          );
          await stage.probe({ from, to, weight, candidate, current });
          return;
        }

        case 'descend': {
          const p = event.payload as
            | { vertex?: unknown; fromValue?: unknown; toValue?: unknown }
            | undefined;
          const vertex = asName(p?.vertex);
          const fromValue = asNumber(p?.fromValue);
          const toValue = asNumber(p?.toValue);
          if (vertex === null || fromValue === null || toValue === null) return;
          stage.setCaption(
            tr('caption.descend', '{toValue} is shorter than {fromValue} — erase what was written and write the lower number.', {
              vertex,
              fromValue,
              toValue,
            }),
          );
          await stage.descend({ vertex, fromValue, toValue });
          return;
        }

        case 'keep': {
          const p = event.payload as
            | { vertex?: unknown; candidate?: unknown; current?: unknown }
            | undefined;
          const vertex = asName(p?.vertex);
          const candidate = asNumber(p?.candidate);
          const current = asNumber(p?.current);
          if (vertex === null || candidate === null || current === null) return;
          stage.setCaption(
            tr('caption.keep', '{candidate} is not shorter than {current} — the number written stays.', {
              candidate,
              current,
            }),
          );
          await stage.keep(vertex);
          return;
        }

        case 'rewind': {
          if (spec === null) return;
          stage.reset(spec);
          stage.setCaption(startCaption(spec.source));
          return;
        }

        case 'done': {
          stage.setCaption(
            tr('caption.done', 'Every number that changed moved down. Not one of them ever went up.'),
          );
          await stage.finish();
          return;
        }

        default:
          // 이 algorithm 은 위 일곱 밖의 이벤트를 내지 않는다. 들어오면 조용히 버린다.
          return;
      }
    },

    // onReset 은 두지 않는다 — ReactiveMechanism 이 reset 끝에 onInit 을 다시
    // 부르므로 판은 그쪽에서 한 번만 다시 세워진다.
  };
};
