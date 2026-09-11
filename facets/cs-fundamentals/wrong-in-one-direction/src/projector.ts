/**
 * wrong-in-one-direction projector — 걸음을 판 위의 동작으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). 화면 문안은 키만 코드에 두고
 * 문장은 facet.ts 의 messages 에서 온다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type ProbeView = {
  word: string;
  probeIndex: number;
  slots: number[];
  slot: number;
  bit: number;
};
type VerdictView = { word: string; present: boolean; truth: boolean; blockedSlot: number };
type AttributeView = { slots: number[]; owners: string[] };

type Stage = {
  setCaption?(text: string): void;
  showProbe?(p: ProbeView): Promise<void> | void;
  showVerdict?(v: VerdictView): Promise<void> | void;
  showOwners?(a: AttributeView): Promise<void> | void;
  showConclusion?(): Promise<void> | void;
  resetScene?(): void;
};

function asRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readProbe(payload: unknown): ProbeView | null {
  const p = asRecord(payload);
  if (!p) return null;
  const word = typeof p.word === 'string' ? p.word : '';
  const probeIndex = typeof p.probeIndex === 'number' ? p.probeIndex : -1;
  const slot = typeof p.slot === 'number' ? p.slot : -1;
  if (word === '' || probeIndex < 0 || slot < 0) return null;
  return { word, probeIndex, slot, bit: p.bit === 1 ? 1 : 0, slots: numbers(p.slots) };
}

function readVerdict(payload: unknown): VerdictView | null {
  const p = asRecord(payload);
  if (!p) return null;
  const word = typeof p.word === 'string' ? p.word : '';
  if (word === '') return null;
  return {
    word,
    present: p.present === true,
    truth: p.truth === true,
    blockedSlot: typeof p.blockedSlot === 'number' ? p.blockedSlot : -1,
  };
}

function readAttribute(payload: unknown): AttributeView | null {
  const p = asRecord(payload);
  if (!p) return null;
  const slots = numbers(p.slots);
  const owners = strings(p.owners);
  if (slots.length === 0) return null;
  return { slots, owners };
}

export const wrongInOneDirectionProjector: ProjectorFactory = (views, runtime) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as Stage | undefined;

  return {
    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'probe': {
          const p = readProbe(event.payload);
          if (!p) return;
          stage?.setCaption?.(
            p.bit === 1
              ? tr('caption.pass', 'Slot {slot} is on. It passes.', { slot: p.slot })
              : tr('caption.block', 'Slot {slot} is off. It stops here.', { slot: p.slot }),
          );
          await stage?.showProbe?.(p);
          return;
        }
        case 'verdict': {
          const v = readVerdict(event.payload);
          if (!v) return;
          if (!v.present) {
            stage?.setCaption?.(
              tr(
                'caption.no',
                'It met an off slot, so "absent". This answer cannot be wrong.',
              ),
            );
          } else if (v.truth) {
            stage?.setCaption?.(
              tr(
                'caption.yesTrue',
                'All three on, so "present" — and it really was put in: {word}.',
                { word: v.word },
              ),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.yesFalse', 'All three on, so "present". But it was never put in: {word}.', {
                word: v.word,
              }),
            );
          }
          await stage?.showVerdict?.(v);
          return;
        }
        case 'attribute': {
          const a = readAttribute(event.payload);
          if (!a) return;
          stage?.setCaption?.(
            tr('caption.owners', 'Others had switched those three on: {owners}.', {
              owners: a.owners.filter((o) => o !== '').join(' · '),
            }),
          );
          await stage?.showOwners?.(a);
          return;
        }
        case 'rewind': {
          stage?.resetScene?.();
          return;
        }
        case 'done': {
          stage?.setCaption?.(
            tr('caption.conclusion', '"Absent" is always right. "Present" is not.'),
          );
          await stage?.showConclusion?.();
          return;
        }
        default:
          // 이 조각이 내보내지 않는 이벤트다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.resetScene?.();
    },
  };
};
