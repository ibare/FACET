/**
 * index-and-tag 조각의 projector.
 *
 * algorithm 이 보내는 것은 수와 비트열뿐이고, 화면에 뜰 문장은 여기서 키로
 * 조회한다 (C10). payload 는 가드로 좁힌 뒤 stage 로 넘긴다 (C9).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

type IndexAndTagStage = {
  showAddress(a: {
    addr: number;
    label: string;
    tagBits: string;
    indexBits: string;
    offsetBits: string;
  }): Promise<void>;
  splitAddress(): Promise<void>;
  dispatch(a: { line: number; offset: number; evicted: boolean }): Promise<void>;
  finish(): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export const indexAndTagProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IndexAndTagStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      // 가드가 뒤따르는 좁히개다 — 꺼낸 값은 하나씩 typeof 로 거른다 (C9).
      const p = (typeof event.payload === 'object' && event.payload !== null
        ? event.payload
        : {}) as Record<string, unknown>;

      switch (event.type) {
        case 'address-arrives': {
          const addr = num(p.addr);
          const tagBits = str(p.tagBits);
          const indexBits = str(p.indexBits);
          const offsetBits = str(p.offsetBits);
          if (addr === null || tagBits === null || indexBits === null || offsetBits === null) return;
          stage.setCaption(tr('caption.arrives', 'One address arrives: {addr}.', { addr }));
          await stage.showAddress({
            addr,
            label: tr('label.address', 'address {addr}', { addr }),
            tagBits,
            indexBits,
            offsetBits,
          });
          return;
        }

        case 'address-splits': {
          stage.setCaption(tr('caption.splits', 'It breaks into three — tag, index, offset.'));
          await stage.splitAddress();
          return;
        }

        case 'pieces-dispatched': {
          const line = num(p.line);
          const tag = num(p.tag);
          const offset = num(p.offset);
          if (line === null || tag === null || offset === null) return;
          const evicted = num(p.evicted);
          stage.setCaption(
            evicted === null
              ? tr(
                  'caption.dispatch',
                  'The index picks line {line}, the tag stays in it, the offset points at byte {offset}.',
                  { line, offset },
                )
              : tr(
                  'caption.evicted',
                  'That line was holding tag {old}; tag {tag} takes its place — same line, different place.',
                  { old: evicted, tag },
                ),
          );
          await stage.dispatch({ line, offset, evicted: evicted !== null });
          return;
        }

        case 'rewind': {
          stage.rewind();
          return;
        }

        case 'done': {
          stage.setCaption(
            tr('caption.done', 'Different places can share one line. The tag is what tells them apart.'),
          );
          await stage.finish();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다 — 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
