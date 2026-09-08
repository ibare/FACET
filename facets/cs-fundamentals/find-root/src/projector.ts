/**
 * find-root projector — algorithm 의 walk-start / hop / root-reached / compare /
 * rewind 이벤트를 find-root-stage 의 메서드 호출로 번역한다.
 *
 * 캡션 문안은 algorithm 이 아니라 여기서 만든다 (C10) — algorithm 은 숫자만
 * payload 로 보내고, 이 projector 가 `runtime.t` 로 FacetJson.messages 를
 * 조회해 완성 문장을 만들어 stage 에 넘긴다.
 *
 * 이 projector 는 walk 의 이름(어느 뿌리에 닿았는지)을 shadow-copy 로 추적한다
 * (원칙 5) — compare 캡션에 "이름 {n}" 을 채우려면 root-reached 결과가 필요한데,
 * 그 원본은 algorithm 의 이벤트 스트림뿐이라 여기서 받아 둔다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ViewInstance,
} from '@ffacet/core/runtime';

type FindRootStage = ViewInstance & {
  init(data: { parent: number[]; queries: number[] }): void;
  walkStart(node: number, caption: string): Promise<void>;
  hop(from: number, to: number, caption: string): Promise<void>;
  rootReached(
    start: number,
    root: number,
    groupIndex: number,
    groupCount: number,
    caption: string,
  ): Promise<void>;
  compare(a: number, b: number, caption: string): Promise<void>;
  rewind(): void;
};

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number');
}

export const findRootProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FindRootStage;
  const tr = runtime?.t ?? makeTranslator();

  // start 자리 → 닿은 뿌리(이름). compare 캡션이 이름을 말로 채우는 데 쓴다.
  let rootByStart = new Map<number, number>();
  let groupCount = 0;

  const instance: ProjectorInstance = {
    onInit(initialData: unknown) {
      const d = initialData as { parent?: unknown; queries?: unknown } | undefined;
      const parent = isNumberArray(d?.parent) ? d.parent : [];
      const queries = isNumberArray(d?.queries) ? d.queries : [];
      rootByStart = new Map();
      groupCount = 0;
      stage.init({ parent, queries });
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'walk-start': {
          const p = event.payload as { node?: unknown } | undefined;
          if (typeof p?.node !== 'number') return;
          const caption = tr('caption.start', 'Start at slot {n}.', { n: p.node });
          await stage.walkStart(p.node, caption);
          break;
        }

        case 'hop': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (typeof p?.from !== 'number' || typeof p?.to !== 'number') return;
          const caption = tr('caption.hop', 'Slot {from} points to slot {to} — climb up.', {
            from: p.from,
            to: p.to,
          });
          await stage.hop(p.from, p.to, caption);
          break;
        }

        case 'root-reached': {
          const p = event.payload as { start?: unknown; node?: unknown; groupIndex?: unknown } | undefined;
          if (typeof p?.start !== 'number' || typeof p?.node !== 'number' || typeof p?.groupIndex !== 'number') {
            return;
          }
          rootByStart.set(p.start, p.node);
          groupCount = Math.max(groupCount, p.groupIndex + 1);
          const caption = tr(
            'caption.root',
            'Slot {n} points to itself — the root. Its name is {n}.',
            { n: p.node },
          );
          await stage.rootReached(p.start, p.node, p.groupIndex, groupCount, caption);
          break;
        }

        case 'compare': {
          const p = event.payload as { a?: unknown; b?: unknown; same?: unknown } | undefined;
          if (typeof p?.a !== 'number' || typeof p?.b !== 'number' || typeof p?.same !== 'boolean') return;
          const nameA = rootByStart.get(p.a);
          const nameB = rootByStart.get(p.b);
          const caption = p.same
            ? tr('caption.compareSame', 'Slot {a} and slot {b} both reach name {name} — same group.', {
                a: p.a,
                b: p.b,
                name: nameA ?? nameB ?? '',
              })
            : tr(
                'caption.compareDiff',
                'Slot {a} reaches name {nameA}, slot {b} reaches name {nameB} — different groups.',
                { a: p.a, b: p.b, nameA: nameA ?? '', nameB: nameB ?? '' },
              );
          await stage.compare(p.a, p.b, caption);
          break;
        }

        case 'rewind': {
          stage.rewind();
          break;
        }

        default:
          // 알려지지 않은 확장 이벤트는 조용히 무시한다 (C2).
          break;
      }
    },

    onReset() {
      rootByStart = new Map();
      groupCount = 0;
    },
  };

  return instance;
};
