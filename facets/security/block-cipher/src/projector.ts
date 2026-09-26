/**
 * block-cipher projector — 알고리즘 이벤트(init · lock · compare · phase)를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 로 좁혀 읽고, 어긋난 모양은 던진다. 캡션은 payload 의 셈한 값으로만 만든다.
 * 운동 길이는 부를 때마다 재생 속도를 읽어 정한다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { BlockCipherCompare, BlockCipherInit, BlockCipherLock, BlockCipherStage } from './block-cipher-stage.js';

const MOTION_MS = 600;

type CodePanel = { highlightPhase(phase: string | null): void };

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`blockCipherProjector: ${what} payload 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`blockCipherProjector: ${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`blockCipherProjector: ${k} 가 글이 아니다`);
  return v;
}
function strs(o: Record<string, unknown>, k: string): string[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`blockCipherProjector: ${k} 가 글 목록이 아니다`);
  return v as string[];
}
function nums(v: unknown, k: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`blockCipherProjector: ${k} 가 수 목록이 아니다`);
  }
  return v as number[];
}
function numRows(o: Record<string, unknown>, k: string): number[][] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`blockCipherProjector: ${k} 가 목록이 아니다`);
  return v.map((row) => nums(row, k));
}
function oneOf<T extends string>(o: Record<string, unknown>, k: string, allowed: readonly T[]): T {
  const v = str(o, k);
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`blockCipherProjector: ${k} 값 ${v} 를 모른다`);
  return v as T;
}

export const blockCipherProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BlockCipherStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  const need = (): BlockCipherStage => {
    if (!stage) throw new Error('blockCipherProjector: stage 가 없다');
    return stage;
  };

  return {
    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          codePanel?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          const init: BlockCipherInit = {
            blocks: num(p, 'blocks'),
            mode: oneOf(p, 'mode', ['ecb', 'cbc', 'ctr'] as const),
            rounds: num(p, 'rounds'),
            maxRounds: num(p, 'maxRounds'),
            change: oneOf(p, 'change', ['plain', 'iv'] as const),
            flipAt: num(p, 'flipAt'),
            plain: strs(p, 'plain'),
            plainText: strs(p, 'plainText'),
            plainBits: numRows(p, 'plainBits'),
            iv: str(p, 'iv'),
            ivBits: nums(p.ivBits, 'ivBits'),
            key: str(p, 'key'),
            counters: strs(p, 'counters'),
          };
          const s = need();
          const from = str(p, 'changedFrom');
          const to = str(p, 'changedTo');
          const run = s.init(init, motion());
          if (init.change === 'plain') {
            s.setCaption(
              t('caption.flipPlain', 'Flip bit {pos} of block 1: {from} → {to} ({textFrom} → {textTo})', {
                pos: init.flipAt,
                from,
                to,
                textFrom: str(p, 'changedTextFrom'),
                textTo: str(p, 'changedTextTo'),
              }),
            );
          } else {
            s.setCaption(t('caption.flipIv', 'Flip bit {pos} of the IV: {from} → {to}', { pos: init.flipAt, from, to }));
          }
          await run;
          return;
        }
        case 'lock': {
          const p = rec(event.payload, 'lock');
          const lock: BlockCipherLock = {
            which: oneOf(p, 'which', ['original', 'changed'] as const),
            cipher: strs(p, 'cipher'),
            bits: numRows(p, 'bits'),
            pairs: numRows(p, 'pairs'),
          };
          const s = need();
          const run = s.lock(lock, motion());
          const joined = lock.cipher.join(' ');
          if (lock.which === 'original') {
            s.setCaption(t('caption.lockOriginal', 'Original lock: C = {cipher} · repeated blocks {n}', { cipher: joined, n: num(p, 'repeat') }));
          } else {
            s.setCaption(t('caption.lockChanged', 'Flipped lock: C′ = {cipher}', { cipher: joined }));
          }
          await run;
          return;
        }
        case 'compare': {
          const p = rec(event.payload, 'compare');
          const cmp: BlockCipherCompare = {
            bits: numRows(p, 'bits'),
            perBlock: nums(p.perBlock, 'perBlock'),
            perBlockNibbles: nums(p.perBlockNibbles, 'perBlockNibbles'),
          };
          const s = need();
          const run = s.compare(cmp, motion());
          s.setCaption(
            t('caption.compare', 'C ⊕ C′: different bits {bits} · different nibbles {nibbles} · different blocks {blocks} / {total}', {
              bits: num(p, 'diffBits'),
              nibbles: num(p, 'diffNibbles'),
              blocks: num(p, 'diffBlocks'),
              total: num(p, 'blocks'),
            }),
          );
          await run;
          return;
        }
        default:
          throw new Error(`blockCipherProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      codePanel?.highlightPhase(null);
      stage?.reset();
    },
  };
};
