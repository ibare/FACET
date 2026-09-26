/**
 * defer-vs-async 의 장면.
 *
 * 알고리즘의 `moment` 이벤트를 받아 두 쪽(defer/async) 각각의 스크립트별 시각을
 * 쌓는다. 좌표·문안은 담지 않는다 — stage 가 이 시각들로 자리를 셈한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type {
  DeferVsAsyncMomentEntry,
  DeferVsAsyncMomentPayload,
  DeferVsAsyncScriptId,
  DeferVsAsyncSide,
} from './algorithm.js';

export type DeferVsAsyncScriptScene = {
  request?: number;
  arrive?: number;
  execStart?: number;
  execEnd?: number;
};

export type DeferVsAsyncLaneScene = {
  scripts: Record<DeferVsAsyncScriptId, DeferVsAsyncScriptScene>;
  parseEnd?: number;
  dcl?: number;
};

export type DeferVsAsyncScene = {
  /** 지금까지 밝혀진 가장 늦은 ms. 처음은 0. */
  nowMs: number;
  lanes: Record<DeferVsAsyncSide, DeferVsAsyncLaneScene>;
  /** 이번 걸음에 새로 드러난 사건들 — 캡션이 이걸로 말한다. */
  lastEntries: DeferVsAsyncMomentEntry[];
};

function emptyLane(): DeferVsAsyncLaneScene {
  return { scripts: { big: {}, small: {} } };
}

function cloneLane(lane: DeferVsAsyncLaneScene): DeferVsAsyncLaneScene {
  return {
    scripts: { big: { ...lane.scripts.big }, small: { ...lane.scripts.small } },
    parseEnd: lane.parseEnd,
    dcl: lane.dcl,
  };
}

function isMomentPayload(payload: unknown): payload is DeferVsAsyncMomentPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.ms !== 'number' || !Array.isArray(p.entries)) return false;
  return p.entries.every((e: unknown) => {
    if (typeof e !== 'object' || e === null) return false;
    const entry = e as Record<string, unknown>;
    return typeof entry.side === 'string' && typeof entry.kind === 'string';
  });
}

export const deferVsAsyncScene: ScenePlan<DeferVsAsyncScene> = {
  initial(): DeferVsAsyncScene {
    return {
      nowMs: 0,
      lanes: { defer: emptyLane(), async: emptyLane() },
      lastEntries: [],
    };
  },

  reduce(scene: DeferVsAsyncScene, event: FacetRuntimeEvent): DeferVsAsyncScene {
    if (event.type !== 'moment') return scene;
    if (!isMomentPayload(event.payload)) {
      throw new Error('defer-vs-async: moment payload 모양이 다르다');
    }
    const { ms, entries } = event.payload;
    const lanes: Record<DeferVsAsyncSide, DeferVsAsyncLaneScene> = {
      defer: cloneLane(scene.lanes.defer),
      async: cloneLane(scene.lanes.async),
    };
    for (const entry of entries) {
      const side = entry.side;
      if (side !== 'defer' && side !== 'async') {
        throw new Error(`defer-vs-async: 모르는 쪽 (${String(side)})`);
      }
      const lane = lanes[side];
      if (entry.kind === 'parse-end') {
        lane.parseEnd = ms;
        continue;
      }
      if (entry.kind === 'dcl') {
        lane.dcl = ms;
        continue;
      }
      const script = entry.script;
      if (script !== 'big' && script !== 'small') {
        throw new Error(`defer-vs-async: script 없는 사건 (${entry.kind})`);
      }
      const scriptScene = lane.scripts[script];
      if (entry.kind === 'request') scriptScene.request = ms;
      else if (entry.kind === 'arrive') scriptScene.arrive = ms;
      else if (entry.kind === 'exec-start') scriptScene.execStart = ms;
      else if (entry.kind === 'exec-end') scriptScene.execEnd = ms;
      else throw new Error(`defer-vs-async: 모르는 사건 (${entry.kind})`);
    }
    return { nowMs: ms, lanes, lastEntries: entries };
  },
};
