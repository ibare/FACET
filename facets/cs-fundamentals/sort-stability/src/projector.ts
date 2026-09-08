/**
 * sort-stability — algorithm 이벤트를 stage 메서드 호출로 번역한다.
 *
 * payload 는 그대로 넘기지 않는다. `Array.isArray` / `typeof` 가드로 좁힌 뒤
 * 정형 인자만 stage 로 보낸다 (C9). 화면 문안은 코드에 리터럴로 박지 않고
 * `runtime.t` 로 조회한다 — en 원본만 호출부에 남는다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, Translate } from '@ffacet/core/runtime';

type StabilityStage = {
  setItems(items: { label: string; value: number }[]): void;
  setCaption(text: string): void;
  sortStable(order: string[], text: string): Promise<void>;
  sortSelection(order: string[], text: string): Promise<void>;
  hideTags(text: string): Promise<void>;
  linkOrigin(text: string): Promise<void>;
  markMismatch(labels: string[], text: string): Promise<void>;
  reset(text: string): void;
};

function readItems(source: unknown): { label: string; value: number }[] {
  const data = source as { items?: unknown } | undefined;
  if (!Array.isArray(data?.items)) return [];
  const out: { label: string; value: number }[] = [];
  for (const raw of data.items) {
    const entry = raw as { label?: unknown; value?: unknown };
    if (typeof entry?.label !== 'string' || typeof entry?.value !== 'number') continue;
    out.push({ label: entry.label, value: entry.value });
  }
  return out;
}

function readLabelList(payload: unknown, key: 'order' | 'labels'): string[] {
  const p = payload as Partial<Record<typeof key, unknown>> | undefined;
  const raw = p?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

export const sortStabilityProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StabilityStage;
  const tr: Translate = runtime?.t ?? ((_key, fallback) => fallback);

  const initialCaption = (): string =>
    tr('caption.input', 'Four items. Each carries a name tag and a value.');

  return {
    onInit(initialData: unknown): void {
      stage.setItems(readItems(initialData));
      stage.setCaption(initialCaption());
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'sort-stable':
          await stage.sortStable(
            readLabelList(event.payload, 'order'),
            tr('caption.stable', 'Stable sort — items of equal value keep their input order.'),
          );
          return;

        case 'sort-selection':
          await stage.sortSelection(
            readLabelList(event.payload, 'order'),
            tr('caption.selection', 'Selection sort — swap the smallest one to the front.'),
          );
          return;

        case 'tags-hidden':
          await stage.hideTags(
            tr('caption.tagsHidden', 'Hide the name tags and the two rows read exactly the same.'),
          );
          return;

        case 'link-origin':
          await stage.linkOrigin(
            tr('caption.linkOrigin', 'Link each item to where it came from: one pair crosses.'),
          );
          return;

        case 'mark-mismatch': {
          const p = event.payload as { value?: unknown } | undefined;
          const value = typeof p?.value === 'number' ? p.value : 0;
          await stage.markMismatch(
            readLabelList(event.payload, 'labels'),
            tr(
              'caption.mismatch',
              'Only the top row kept the input order of the two {value}s — that is stability.',
              { value },
            ),
          );
          return;
        }

        case 'rewind':
          stage.reset(initialCaption());
          return;

        default:
          // 이 facet 의 algorithm 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset(initialCaption());
    },
  };
};
