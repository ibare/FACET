/**
 * nat projector — 알고리즘 이벤트를 nat-stage 호출로 옮기고, 캡션 문안을 고른다.
 *
 * 움직임 길이는 재생 속도를 따라간다 — 부를 때마다 runtime.getSpeed() 를 읽는다.
 * onEvent 가 움직임이 끝날 때까지 기다리므로 한 걸음 = 움직임 + stepMs 다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { NatStage } from './nat-stage.js';

/** 한 걸음의 움직임 (속도 1 일 때) */
const MOTION_MS = 600;

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function record(e: FacetRuntimeEvent): Record<string, unknown> {
  const p: unknown = e.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`nat projector: ${e.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, name: string): number {
  const v = p[name];
  if (typeof v !== 'number') throw new Error(`nat projector: ${name} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, name: string): string {
  const v = p[name];
  if (typeof v !== 'string') throw new Error(`nat projector: ${name} 가 글이 아니다`);
  return v;
}

export const natProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as NatStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = record(e);
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = record(e);
          const devices = num(p, 'devices');
          code?.clearHighlight?.();
          stage?.setCaption(t('caption.ready', 'Empty table · inside devices: {n}', { n: devices }));
          await stage?.round({ rewrite: num(p, 'rewrite'), key: num(p, 'key'), devices }, motion());
          return;
        }
        case 'out': {
          const p = record(e);
          const outcome = str(p, 'outcome');
          if (outcome !== 'write' && outcome !== 'block') throw new Error(`nat projector: 모르는 나감 결과 ${outcome}`);
          const row = num(p, 'row');
          const vars = { from: str(p, 'from'), to: str(p, 'to'), row: row + 1 };
          stage?.setCaption(
            outcome === 'write'
              ? t('caption.write', 'Out {from} → {to} · row #{row} written', vars)
              : t('caption.block', 'Out {from} → {to} · blocked, same key in row #{row}', vars),
          );
          await stage?.out(
            { device: num(p, 'device'), pub: num(p, 'pub'), outcome, row, nextPort: num(p, 'nextPort') },
            motion(),
          );
          return;
        }
        case 'in': {
          const p = record(e);
          const kind = str(p, 'kind');
          if (kind !== 'reply' && kind !== 'stray') throw new Error(`nat projector: 모르는 들어옴 ${kind}`);
          const found = num(p, 'found');
          const vars = { from: str(p, 'from'), to: str(p, 'to'), dest: str(p, 'dest'), row: found + 1 };
          if (kind === 'reply') {
            stage?.setCaption(t('caption.reply', 'Reply {from} → {to} ⇒ {dest} · looked up row #{row}', vars));
          } else if (found >= 0) {
            stage?.setCaption(t('caption.strayIn', 'Stranger {from} → {to} ⇒ {dest} · let in · looked up row #{row}', vars));
          } else {
            stage?.setCaption(t('caption.strayDrop', 'Stranger {from} → {to} · no matching row · dropped', vars));
          }
          await stage?.inbound(
            { kind, remote: num(p, 'remote'), port: num(p, 'port'), found, device: num(p, 'device') },
            motion(),
          );
          return;
        }
        case 'done': {
          await stage?.settle(motion());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight?.();
      stage?.reset();
    },
  };
};
