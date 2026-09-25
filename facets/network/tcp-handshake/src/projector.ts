/**
 * tcp-handshake projector — round · tick · phase 를 stage 와 코드 패널로 옮긴다.
 *
 * 캡션은 알고리즘이 실어 보낸 메모(Note)를 문안으로 바꾼 것이다. 수는 모두 payload 에서 온다.
 * 운동 길이는 걸음마다 재생 속도를 읽어 셈하고, 그만큼 기다린 뒤 돌아간다 (되짚는 중에는 0).
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { StagePacket, StageTick, TcpHandshakeStage } from './tcp-handshake-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 350;
const KINDS = ['syn', 'synAck', 'ack', 'data', 'dataAck'] as const;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what}: 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key}: 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`${key}: 글이 아니다`);
  return v;
}
function strOrNull(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`${key}: 글이 아니다`);
  return v;
}
function nums(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`${key}: 수 목록이 아니다`);
  return v as number[];
}
function strs(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${key}: 글 목록이 아니다`);
  return v as string[];
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${key}: 목록이 아니다`);
  return v;
}

export const tcpHandshakeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as TcpHandshakeStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();
  let segments: string[] = [];
  let flags = { syn: '', synAck: '', ack: '' };

  const segName = (n: number): string => {
    const name = segments[n - 1];
    if (name === undefined) throw new Error(`모르는 조각 번호: ${n}`);
    return name;
  };
  const segList = (ns: number[]): string => ns.map(segName).join(', ');

  const packet = (raw: unknown): StagePacket => {
    const o = obj(raw, 'packet');
    const kind = str(o, 'kind');
    const k = KINDS.find((x) => x === kind);
    if (!k) throw new Error(`모르는 패킷: ${kind}`);
    const dir = str(o, 'dir');
    if (dir !== 'out' && dir !== 'back') throw new Error(`모르는 방향: ${dir}`);
    const label =
      k === 'dataAck' ? tr('label.ackPacket', 'ACK {n}', { n: num(o, 'ackNo') }) : str(o, 'label');
    return { id: str(o, 'id'), kind: k, label, dir, sent: num(o, 'sent'), arrive: num(o, 'arrive') };
  };

  const serverNote = (raw: unknown): string => {
    const o = obj(raw, 'note');
    const kind = str(o, 'kind');
    switch (kind) {
      case 'listen':
        return tr('caption.listen', 'Receiving port: {port}', { port: str(o, 'port') });
      case 'synArrived':
        return tr('caption.synArrived', 'Arrived: {flag} · sent: {reply}', { flag: flags.syn, reply: flags.synAck });
      case 'ackArrived':
        return tr('caption.ackArrived', 'Arrived: {flag} · connection socket opened', { flag: flags.ack });
      case 'handedUdp':
        return tr('caption.handedUdp', 'Arrived: {seg} · to the app: {seg}', { seg: segName(num(o, 'seg')) });
      case 'handed':
        return tr('caption.handed', 'Arrived: {seg} · to the app: {list} · sent ACK {ack}', {
          seg: segName(num(o, 'seg')),
          list: segList(nums(o, 'list')),
          ack: num(o, 'ack'),
        });
      case 'held':
        return tr('caption.held', 'Arrived: {seg} · waiting for: {want} · segments held: {count} · sent ACK {ack}', {
          seg: segName(num(o, 'seg')),
          want: segName(num(o, 'want')),
          count: num(o, 'count'),
          ack: num(o, 'ack'),
        });
      default:
        throw new Error(`모르는 서버 메모: ${kind}`);
    }
  };

  const clientNote = (raw: unknown): string => {
    const o = obj(raw, 'note');
    const kind = str(o, 'kind');
    switch (kind) {
      case 'synSent':
        return tr('caption.synSent', 'Sent: {flag}', { flag: flags.syn });
      case 'synAckArrived':
        return tr('caption.synAckArrived', 'Arrived: {flag} · sent: {reply}', { flag: flags.synAck, reply: flags.ack });
      case 'ackBack':
        return tr('caption.ackBack', 'ACK {ack} arrived', { ack: num(o, 'ack') });
      case 'sent':
        return tr('caption.sent', 'Sent: {seg}', { seg: segName(num(o, 'seg')) });
      case 'sentLost':
        return tr('caption.sentLost', 'Sent: {seg} · lost on the way', { seg: segName(num(o, 'seg')) });
      case 'resent':
        return tr('caption.resent', 'Timer expired · resent: {seg}', { seg: segName(num(o, 'seg')) });
      default:
        throw new Error(`모르는 클라이언트 메모: ${kind}`);
    }
  };

  const line = (who: string, notes: string[]): string =>
    `${who} · ${notes.length > 0 ? notes.join(' · ') : tr('caption.quiet', 'nothing arrives or leaves')}`;

  const motion = (): number => {
    if (!stage || stage.isInstant()) return 0;
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round(MOTION_MS / Math.max(0.01, speed));
  };

  const showTick = async (payload: unknown): Promise<void> => {
    const p = obj(payload, 'tick');
    const tick = num(p, 'tick');
    const method = str(p, 'method');
    if (method !== 'udp' && method !== 'tcp') throw new Error(`모르는 방식: ${method}`);
    const finalRaw = p['final'];
    let finalLine: string | null = null;
    let missing: number[] | null = null;
    if (finalRaw !== null) {
      const f = obj(finalRaw, 'final');
      missing = nums(f, 'missing');
      const head = tr('caption.final', 'Round over · segments the app received: {n} · last handed over: tick {last}', {
        n: num(f, 'received'),
        last: num(f, 'lastDelivery'),
      });
      finalLine =
        missing.length > 0
          ? `${head} · ${tr('caption.missing', 'not received: {list}', { list: segList(missing) })}`
          : head;
    }
    const s: StageTick = {
      tick,
      tcp: method === 'tcp',
      clientState: strOrNull(p, 'clientState'),
      serverState: strOrNull(p, 'serverState'),
      listenText: tr('label.listenSocket', 'Listening socket · port {port}', { port: str(p, 'listenPort') }),
      connKey: strOrNull(p, 'connKey'),
      flights: list(p, 'flights').map(packet),
      lostNow: list(p, 'lostNow').map(packet),
      held: nums(p, 'held'),
      copies: nums(p, 'copies'),
      handed: nums(p, 'handed'),
      handTick: nums(p, 'handTick'),
      serverLine: line(tr('label.server', 'Server'), list(p, 'serverNotes').map(serverNote)),
      clientLine: line(tr('label.client', 'Client'), list(p, 'clientNotes').map(clientNote)),
      finalLine,
      missing,
      tickLabel: tr('label.tick', 'tick {n}', { n: tick }),
    };
    const ms = motion();
    stage?.showTick(s, ms);
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  };

  return {
    onInit(data) {
      const d = obj(data, 'initialData');
      segments = strs(d, 'segments');
      const f = obj(d['flags'], 'flags');
      flags = { syn: str(f, 'syn'), synAck: str(f, 'synAck'), ack: str(f, 'ack') };
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = obj(e.payload, 'round');
          segments = strs(p, 'segments');
          code?.clearHighlight?.();
          stage?.startRound(segments, num(p, 'axisMax'), p['ghostAvailable'] === true);
          return;
        }
        case 'tick':
          await showTick(e.payload);
          return;
        default:
          return;
      }
    },
    onDestroy() {
      code?.clearHighlight?.();
    },
  };
};
