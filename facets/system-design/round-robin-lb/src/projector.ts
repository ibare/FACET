/**
 * round-robin-lb projector — algorithm 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * init → stage.begin (판 머리: 표를 제 자리로, 막대 · 선 · 호 · 캡션을 걷는다, 코드 패널 끔)
 * drop-server → stage.drop · route → stage.route · phase → codePanel.highlightPhase
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 로 다시 셈한다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { BeginInput, DropInput, RoundRobinLbStage, RouteInput } from './round-robin-lb-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

const MOTION_MS = 300;

function rec(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error(`round-robin-lb projector: ${what} payload 가 없다`);
  return raw as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`round-robin-lb projector: ${key} 가 수가 아니다`);
  return v;
}

function bool(o: Record<string, unknown>, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`round-robin-lb projector: ${key} 가 참거짓이 아니다`);
  return v;
}

function nums(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) throw new Error(`round-robin-lb projector: ${key} 가 수 배열이 아니다`);
  return v as number[];
}

function strs(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`round-robin-lb projector: ${key} 가 글 배열이 아니다`);
  return v as string[];
}

function policyName(t: Translate, policy: number): string {
  switch (policy) {
    case 0:
      return t('label.policy.turn', 'Round robin');
    case 1:
      return t('label.policy.idlest', 'Least connections');
    case 2:
      return t('label.policy.mod', 'Modulo hash');
    case 3:
      return t('label.policy.ring', 'Ring hash');
    default:
      throw new Error(`round-robin-lb projector: 모르는 고르는 법 ${policy}`);
  }
}

export const roundRobinLbProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as RoundRobinLbStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('round-robin-lb projector: stage 가 없다');
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let servers: string[] = [];
  let keys: string[] = [];

  const name = (list: string[], i: number, what: string): string => {
    const v = list[i];
    if (v === undefined) throw new Error(`round-robin-lb projector: 모르는 ${what} ${i}`);
    return v;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('round-robin-lb projector: phase 이름이 없다');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          servers = strs(p, 'servers');
          keys = strs(p, 'keys');
          const policy = num(p, 'policy');
          const spread = num(p, 'spread');
          const input: BeginInput = {
            policy,
            servers,
            keys,
            serverRing: nums(p, 'serverRing'),
            keyRing: nums(p, 'keyRing'),
            requests: num(p, 'requests'),
            openAxis: num(p, 'openAxis'),
            imbalanceAxis: num(p, 'imbalanceAxis'),
          };
          code?.highlightPhase?.(null);
          stage.begin(input, motion());
          stage.setCaption(
            t('caption.init', '{policy} · hold spread {spread}', { policy: policyName(t, policy), spread: `±${spread}` }),
          );
          return;
        }
        case 'drop-server': {
          const p = rec(event.payload, 'drop-server');
          const input: DropInput = {
            tick: num(p, 'tick'),
            server: num(p, 'server'),
            alive: nums(p, 'alive'),
            open: nums(p, 'open'),
          };
          stage.drop(input, motion());
          stage.setCaption(
            t('caption.drop', 'Tick {tick} · down: {server}', { tick: input.tick, server: name(servers, input.server, '서버') }),
          );
          return;
        }
        case 'route': {
          const p = rec(event.payload, 'route');
          const input: RouteInput = {
            tick: num(p, 'tick'),
            key: num(p, 'key'),
            pick: num(p, 'pick'),
            moved: bool(p, 'moved'),
            imbalanceSum: num(p, 'imbalanceSum'),
            open: nums(p, 'open'),
            alive: nums(p, 'alive'),
            lastOf: nums(p, 'lastOf'),
          };
          const from = num(p, 'from');
          const gap = num(p, 'gap');
          stage.route(input, motion());
          const vars = {
            tick: input.tick,
            key: name(keys, input.key, '사용자'),
            server: name(servers, input.pick, '서버'),
            gap,
          };
          stage.setCaption(
            input.moved
              ? t('caption.routeMoved', 'Tick {tick} · {key}: {from} → {server} (moved) · imbalance {gap}', {
                  ...vars,
                  from: name(servers, from, '서버'),
                })
              : t('caption.route', 'Tick {tick} · {key} → {server} · imbalance {gap}', vars),
          );
          return;
        }
        default:
          throw new Error(`round-robin-lb projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase?.(null);
    },
  };
};
