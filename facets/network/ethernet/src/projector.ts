/**
 * ethernet projector — algorithm 이벤트를 stage · 코드 패널 호출로 옮긴다.
 *
 *   round    → stage.startRound · 코드 패널 줄을 끈다 (앞 판의 줄이 남지 않게)
 *   collide  → stage.collide
 *   send     → stage.send
 *   finish   → stage.finish
 *   phase    → codePanel.highlightPhase
 *
 * 운동 길이는 걸음마다 runtime.getSpeed() 를 읽어 정한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  CollidePayload,
  EthernetStage,
  PickPayload,
  RoundPayload,
  SendPayload,
} from './ethernet-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

/** 운동 한 번의 길이 (재생 속도 1 에서) */
const MOTION_MS = 240;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const num = (p: Record<string, unknown>, key: string): number => {
  const val = p[key];
  if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error(`payload.${key} 가 수가 아니다`);
  return val;
};

const readRound = (p: Record<string, unknown>): RoundPayload => {
  const stations = p.stations;
  if (!Array.isArray(stations) || !stations.every((s): s is string => typeof s === 'string')) {
    throw new Error('payload.stations 가 기호 목록이 아니다');
  }
  return { stations, policy: num(p, 'policy'), seed: num(p, 'seed'), frameSlots: num(p, 'frameSlots') };
};

const readPick = (x: unknown): PickPayload => {
  if (!isRecord(x)) throw new Error('pick 이 객체가 아니다');
  if (typeof x.dropped !== 'boolean') throw new Error('pick.dropped 가 참거짓이 아니다');
  return {
    station: num(x, 'station'),
    attempt: num(x, 'attempt'),
    dropped: x.dropped,
    k: num(x, 'k'),
    span: num(x, 'span'),
    listen: num(x, 'listen'),
  };
};

const readCollide = (p: Record<string, unknown>): CollidePayload => {
  if (!Array.isArray(p.picks) || p.picks.length < 2) throw new Error('충돌에는 둘 이상이 있어야 한다');
  return { slot: num(p, 'slot'), picks: p.picks.map(readPick) };
};

const readSend = (p: Record<string, unknown>): SendPayload => ({
  slot: num(p, 'slot'),
  station: num(p, 'station'),
  until: num(p, 'until'),
  free: num(p, 'free'),
});

export const ethernetProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EthernetStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(e) {
      const p = isRecord(e.payload) ? e.payload : {};
      switch (e.type) {
        case 'round':
          code?.clearHighlight?.();
          stage?.startRound(readRound(p), motion());
          return;
        case 'collide':
          stage?.collide(readCollide(p), motion());
          return;
        case 'send':
          stage?.send(readSend(p), motion());
          return;
        case 'finish':
          stage?.finish({ slot: num(p, 'slot') }, motion());
          return;
        case 'phase': {
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('payload.phase 가 글이 아니다');
          code?.highlightPhase?.(phase);
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
