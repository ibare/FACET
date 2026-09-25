/**
 * arp projector — 알고리즘 이벤트를 arp-stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이는 재생 속도를 따른다 — 부를 때마다 runtime.getSpeed() 를 읽는다.
 * 운동 상한(속도 1): 판 머리 250 ms + 화살 400 ms · 홉 걸음 850 ms.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { ArpHopView, ArpStageApi } from './arp-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const ROUND_MS = 250;
const PICK_MS = 400;
const HOP_MS = 850;

type Payload = Record<string, unknown>;

function asPayload(p: unknown): Payload {
  if (!p || typeof p !== 'object') throw new Error('[arp] payload 가 없다');
  return p as Payload;
}
function str(p: Payload, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`[arp] ${k} 가 문자열이 아니다`);
  return v;
}
function num(p: Payload, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[arp] ${k} 가 수가 아니다`);
  return v;
}
function flag(p: Payload, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`[arp] ${k} 가 참거짓이 아니다`);
  return v;
}
function strs(p: Payload, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`[arp] ${k} 가 문자열 목록이 아니다`);
  return v as string[];
}
function updates(p: Payload): { node: string; sym: string; row: number; ip: string; mac: string }[] {
  const v = p['updates'];
  if (!Array.isArray(v)) throw new Error('[arp] updates 가 목록이 아니다');
  return v.map((x) => {
    const q = asPayload(x);
    return { node: str(q, 'node'), sym: str(q, 'sym'), row: num(q, 'row'), ip: str(q, 'ip'), mac: str(q, 'mac') };
  });
}
function adds(p: Payload): { node: string; sym: string; ip: string; mac: string }[] {
  const v = p['adds'];
  if (!Array.isArray(v)) throw new Error('[arp] adds 가 목록이 아니다');
  return v.map((x) => {
    const q = asPayload(x);
    return { node: str(q, 'node'), sym: str(q, 'sym'), ip: str(q, 'ip'), mac: str(q, 'mac') };
  });
}

export const arpProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as ArpStageApi | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const dur = (ms: number): number => ms / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let lines: string[] = [];
  const say = (next: string[]): void => {
    lines = next;
    stage?.setCaption(lines);
  };

  return {
    onInit() {
      code?.clearHighlight?.();
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = asPayload(e.payload);
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = asPayload(e.payload);
          say([]);
          await stage?.startRound(
            {
              cache: flag(p, 'cache'),
              srcIp: str(p, 'srcIp'),
              dstIp: str(p, 'dstIp'),
              usedLinks: strs(p, 'usedLinks'),
              usedNodes: strs(p, 'usedNodes'),
            },
            dur(ROUND_MS),
          );
          return;
        }
        case 'pick': {
          const p = asPayload(e.payload);
          const same = flag(p, 'same');
          const vars = { n: num(p, 'octets'), ip: str(p, 'askIp'), src: str(p, 'srcIp'), dst: str(p, 'dstIp') };
          say([
            t('caption.compare', 'Sender {src} · destination {dst}', vars),
            same
              ? t('caption.pickSame', 'First {n} octets match · ask for: {ip} (the destination)', vars)
              : t('caption.pickOther', 'First {n} octets differ · ask for: {ip} (the gateway)', vars),
          ]);
          await stage?.pick(
            {
              srcIp: vars.src,
              dstIp: vars.dst,
              octets: vars.n,
              same,
              askIp: vars.ip,
              owner: str(p, 'owner'),
            },
            dur(PICK_MS),
          );
          return;
        }
        case 'hop': {
          const p = asPayload(e.payload);
          const kindRaw = str(p, 'kind');
          if (kindRaw !== 'broadcast' && kindRaw !== 'table') throw new Error(`[arp] 모르는 홉: ${kindRaw}`);
          const view: ArpHopView = {
            kind: kindRaw,
            from: str(p, 'from'),
            to: str(p, 'to'),
            link: str(p, 'link'),
            heard: strs(p, 'heard'),
            srcMac: str(p, 'srcMac'),
            dstMac: str(p, 'dstMac'),
            srcIp: str(p, 'srcIp'),
            dstIp: str(p, 'dstIp'),
            row: num(p, 'row'),
            adds: adds(p),
            updates: updates(p),
            newPair: flag(p, 'newPair'),
          };
          const head = t('caption.step', 'Send {s} · hop {h} · link {l} · {from} → {to}', {
            s: num(p, 'send'),
            h: num(p, 'hop'),
            l: num(p, 'linkNo'),
            from: str(p, 'fromSym'),
            to: str(p, 'toSym'),
          });
          const next: string[] = [head];
          if (view.kind === 'broadcast') {
            next.push(
              t('caption.broadcast', 'Broadcast (to {bmac}) · who has {ip}? · heard by: {heard} · reply from: {owner}', {
                bmac: str(p, 'broadcastMac'),
                ip: str(p, 'askIp'),
                heard: strs(p, 'heardSyms').join(' · '),
                owner: str(p, 'toSym'),
              }),
            );
            if (view.adds.length + view.updates.length > 0) {
              next.push(
                t('caption.wrote', 'Written to tables: {nodes}', {
                  nodes: [...view.adds, ...view.updates].map((a) => a.sym).join(' · '),
                }),
              );
            }
          } else {
            next.push(
              t('caption.fromTable', 'From the table: {ip} → {mac} · no broadcast', {
                ip: str(p, 'askIp'),
                mac: view.dstMac,
              }),
            );
          }
          say(next);
          await stage?.hop(view, dur(HOP_MS));
          return;
        }
        case 'done': {
          const p = asPayload(e.payload);
          say([
            ...lines,
            t('caption.done', 'Done · IP pairs: {ip} · MAC pairs: {mac} · broadcasts: {b}', {
              ip: num(p, 'ipPairs'),
              mac: num(p, 'macPairs'),
              b: num(p, 'broadcasts'),
            }),
          ]);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
