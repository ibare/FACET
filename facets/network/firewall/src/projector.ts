/**
 * 방화벽 projector — 알고리즘 이벤트를 stage 메서드로 옮긴다.
 *
 *   order   → stage.setOrder (규칙 줄이 새 자리로 미끄러진다) · 코드 패널 표시 지움
 *   packet  → stage.dropPacket (패킷이 제 깊이까지 내려가 멈추고, 판정 칸이 뒤집힌다)
 *   dead    → stage.markDead (죽은 줄 표지가 붙거나 떨어진다)
 *   phase   → codePanel.highlightPhase
 *
 * 운동 길이는 재생 속도를 그때그때 읽어 나눈다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { FirewallStage } from './firewall-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const SLIDE_MS = 700;
const DROP_MS = 800;
const DEAD_MS = 600;

function stringList(x: unknown, what: string): string[] {
  if (!Array.isArray(x) || !x.every((s): s is string => typeof s === 'string')) {
    throw new Error(`firewallProjector: ${what} 가 글자 목록이 아니다`);
  }
  return x;
}

function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`firewallProjector: ${what} 가 수가 아니다`);
  return x;
}

function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`firewallProjector: ${what} 가 글자가 아니다`);
  return x;
}

export const firewallProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FirewallStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const dur = (ms: number) => ms / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit() {
      stage?.setCaption('');
    },
    async onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p.phase, 'phase'));
          return;
        }
        case 'order': {
          const order = stringList(p.order, 'order');
          const position = num(p.position, 'position');
          code?.clearHighlight?.();
          stage?.setCaption(
            t('caption.order', '{rule} position: {pos} · order: {order}', {
              rule: str(p.rule, 'rule'),
              pos: position,
              order: order.join(' · '),
            }),
          );
          await stage?.setOrder(order, dur(SLIDE_MS));
          return;
        }
        case 'packet': {
          const action = p.action;
          if (action !== 'allow' && action !== 'deny') throw new Error('firewallProjector: 모르는 동작');
          const depth = num(p.depth, 'depth');
          const rule = str(p.rule, 'rule');
          const packet = str(p.packet, 'packet');
          const verdict = action === 'allow' ? t('label.allow', 'Allow') : t('label.deny', 'Deny');
          stage?.setCaption(
            t('caption.packet', '{packet}: stopped at position {depth} on {rule} → {verdict}', {
              packet,
              depth,
              rule,
              verdict,
            }),
          );
          await stage?.dropPacket(num(p.index, 'index'), depth, action, rule, dur(DROP_MS));
          return;
        }
        case 'dead': {
          const dead = stringList(p.dead, 'dead');
          const count = num(p.count, 'count');
          stage?.setCaption(
            count === 0
              ? t('caption.deadNone', 'Rules never matched first: {n}', { n: count })
              : t('caption.deadSome', 'Rules never matched first: {n} ({ids})', { n: count, ids: dead.join(' · ') }),
          );
          await stage?.markDead(dead, dur(DEAD_MS));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
