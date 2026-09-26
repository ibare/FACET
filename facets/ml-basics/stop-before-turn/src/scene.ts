/**
 * stop-before-turn 의 장면.
 *
 * 바탕 — 무게 이름 · 참을성(initialData) · 세로 축척과 마지막 에폭(init).
 * 자취 — 지나온 에폭의 무게와 검증 손실, 가장 좋던 에폭, 기다림, 쓰는 무게의 에폭.
 * 이번 걸음 — step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowStopBeforeTurnData } from './algorithm.js';

export type EpochPoint = { epoch: number; w1: number; w2: number; val: number };

export type StopStep =
  | { kind: 'none' }
  | { kind: 'start' }
  | { kind: 'better'; epoch: number; from: number }
  | { kind: 'worse'; epoch: number }
  | { kind: 'stop'; epoch: number }
  | { kind: 'revert'; from: number; to: number };

export type StopBeforeTurnScene = {
  names: [string, string];
  patience: number;
  axis: { lo: number; hi: number; lastEpoch: number } | null;
  epochs: EpochPoint[];
  bestEpoch: number | null;
  wait: number;
  /** 쓰는 무게가 어느 에폭의 것인가. */
  used: number | null;
  stopped: boolean;
  reverted: boolean;
  step: StopStep;
};

function fail(path: string, why: string): never {
  throw new Error(`stopBeforeTurnScene: ${path} — ${why}`);
}

function rec(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}.payload.${key}`, '유한한 수가 아니다');
  return v;
}

function int(p: Record<string, unknown>, key: string, where: string): number {
  const v = num(p, key, where);
  if (!Number.isInteger(v) || v < 0) fail(`${where}.payload.${key}`, '0 이상의 정수가 아니다');
  return v;
}

function bool(p: Record<string, unknown>, key: string, where: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') fail(`${where}.payload.${key}`, '참거짓이 아니다');
  return v;
}

export const stopBeforeTurnScene: ScenePlan<StopBeforeTurnScene> = {
  initial(initialData: unknown): StopBeforeTurnScene {
    const d = narrowStopBeforeTurnData(initialData);
    return {
      names: [d.names[0], d.names[1]],
      patience: d.patience,
      axis: null,
      epochs: [],
      bestEpoch: null,
      wait: 0,
      used: null,
      stopped: false,
      reverted: false,
      step: { kind: 'none' },
    };
  },

  reduce(scene: StopBeforeTurnScene, event: FacetRuntimeEvent): StopBeforeTurnScene {
    switch (event.type) {
      case 'init': {
        const p = rec(event);
        if (scene.axis !== null) fail('init', '바탕이 이미 있다');
        const lo = num(p, 'lo', 'init');
        const hi = num(p, 'hi', 'init');
        if (!(lo > 0 && hi > lo)) fail('init.payload', '0 < lo < hi 가 아니다 (로그 눈금)');
        const epoch = int(p, 'epoch', 'init');
        if (epoch !== 0) fail('init.payload.epoch', '0 이 아니다');
        const lastEpoch = int(p, 'lastEpoch', 'init');
        if (lastEpoch < 1) fail('init.payload.lastEpoch', '1 보다 작다');
        const point: EpochPoint = {
          epoch: 0,
          w1: num(p, 'w1', 'init'),
          w2: num(p, 'w2', 'init'),
          val: num(p, 'val', 'init'),
        };
        return {
          ...scene,
          axis: { lo, hi, lastEpoch },
          epochs: [point],
          bestEpoch: 0,
          wait: 0,
          used: 0,
          step: { kind: 'start' },
        };
      }
      case 'epoch': {
        const p = rec(event);
        if (scene.axis === null || scene.bestEpoch === null) fail('epoch', 'init 앞에 왔다');
        if (scene.stopped) fail('epoch', '학습이 멈춘 뒤에 왔다');
        const epoch = int(p, 'epoch', 'epoch');
        const prevLast = scene.epochs[scene.epochs.length - 1];
        if (epoch !== prevLast.epoch + 1) fail('epoch.payload.epoch', `${prevLast.epoch + 1} 이 아니다`);
        if (epoch > scene.axis.lastEpoch) fail('epoch.payload.epoch', '마지막 에폭을 넘었다');
        const val = num(p, 'val', 'epoch');
        const improved = bool(p, 'improved', 'epoch');
        const bestEpoch = int(p, 'bestEpoch', 'epoch');
        const wait = int(p, 'wait', 'epoch');
        const stopped = bool(p, 'stopped', 'epoch');
        const bestVal = num(p, 'bestVal', 'epoch');
        if (improved) {
          if (bestEpoch !== epoch) fail('epoch.payload.bestEpoch', '나아진 에폭이 아니다');
          if (wait !== 0) fail('epoch.payload.wait', '나아졌는데 0 이 아니다');
          if (bestVal !== val) fail('epoch.payload.bestVal', '이 에폭의 검증 손실이 아니다');
        } else {
          if (bestEpoch !== scene.bestEpoch) fail('epoch.payload.bestEpoch', '앞 장면의 가장 좋던 에폭이 아니다');
          if (wait !== scene.wait + 1) fail('epoch.payload.wait', `${scene.wait + 1} 이 아니다`);
          if (bestVal !== scene.epochs[bestEpoch].val) fail('epoch.payload.bestVal', '가장 좋던 에폭의 값이 아니다');
        }
        if (stopped !== wait >= scene.patience) fail('epoch.payload.stopped', '기다림 · 참을성과 맞지 않는다');
        if (stopped && epoch !== scene.axis.lastEpoch) fail('epoch.payload.epoch', '멈춘 에폭이 마지막 에폭이 아니다');
        const point: EpochPoint = { epoch, w1: num(p, 'w1', 'epoch'), w2: num(p, 'w2', 'epoch'), val };
        const step: StopStep = improved
          ? { kind: 'better', epoch, from: scene.bestEpoch }
          : stopped
            ? { kind: 'stop', epoch }
            : { kind: 'worse', epoch };
        return {
          ...scene,
          epochs: [...scene.epochs, point],
          bestEpoch,
          wait,
          used: epoch,
          stopped,
          step,
        };
      }
      case 'revert': {
        const p = rec(event);
        if (!scene.stopped || scene.reverted) fail('revert', '멈춘 뒤 한 번만 온다');
        if (scene.bestEpoch === null || scene.used === null) fail('revert', '가장 좋던 에폭 · 쓰는 무게가 없다');
        const from = int(p, 'from', 'revert');
        const to = int(p, 'to', 'revert');
        if (from !== scene.used) fail('revert.payload.from', '지금 쓰는 무게의 에폭이 아니다');
        if (to !== scene.bestEpoch) fail('revert.payload.to', '가장 좋던 에폭이 아니다');
        const best = scene.epochs[to];
        if (num(p, 'w1', 'revert') !== best.w1 || num(p, 'w2', 'revert') !== best.w2) {
          fail('revert.payload.w1', '가장 좋던 에폭의 무게가 아니다');
        }
        if (num(p, 'val', 'revert') !== best.val) fail('revert.payload.val', '가장 좋던 에폭의 값이 아니다');
        return { ...scene, used: to, reverted: true, step: { kind: 'revert', from, to } };
      }
      default:
        throw new Error(`stopBeforeTurnScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
