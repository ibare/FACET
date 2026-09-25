/**
 * auth 의 projector — `round` · `window` 이벤트를 stage 의 `startRound` · `showWindow` 로 옮긴다.
 *
 * payload 는 typeof 가드로 좁힌다. 모르는 모양 · 빈 값은 지어내지 않고 던진다.
 * 운동 길이는 부를 때마다 재생 속도를 읽어 셈한다 (속도를 올리면 운동도 짧아진다).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { AuthStage, RoundScene, WindowCounts, WindowScene } from './auth-stage.js';

/** 운동 길이(속도 1 에서). 걸음 = stepMs 1500 + 이것. */
const MOTION_MS = 900;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`auth payload: ${key} 가 수가 아니다`);
  return v;
}

function nums(o: Obj, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`auth payload: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number') throw new Error(`auth payload: ${key}[${i}] 가 수가 아니다`);
    return x;
  });
}

function objs(o: Obj, key: string): Obj[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`auth payload: ${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (!isObj(x)) throw new Error(`auth payload: ${key}[${i}] 가 객체가 아니다`);
    return x;
  });
}

function counts(o: Obj, key: string): WindowCounts {
  const v = o[key];
  if (!isObj(v)) throw new Error(`auth payload: ${key} 가 객체가 아니다`);
  return { appPass: num(v, 'appPass'), stolenPass: num(v, 'stolenPass'), stolenReject: num(v, 'stolenReject'), issued: num(v, 'issued') };
}

function toRound(p: Obj): RoundScene {
  const prev = p.prevLifetime;
  if (prev !== null && typeof prev !== 'number') throw new Error('auth payload: prevLifetime 가 수도 null 도 아니다');
  return {
    round: num(p, 'round'),
    lifetime: num(p, 'lifetime'),
    prevLifetime: prev,
    horizonSec: num(p, 'horizonSec'),
    windowSec: num(p, 'windowSec'),
    leakAtSec: num(p, 'leakAtSec'),
    appSecs: nums(p, 'appSecs'),
    attackerSecs: nums(p, 'attackerSecs'),
    appCount: num(p, 'appCount'),
    attackerCount: num(p, 'attackerCount'),
  };
}

function toWindow(p: Obj): WindowScene {
  const leakRaw = p.leak;
  if (leakRaw !== null && !isObj(leakRaw)) throw new Error('auth payload: leak 가 객체도 null 도 아니다');
  return {
    index: num(p, 'index'),
    lo: num(p, 'lo'),
    hi: num(p, 'hi'),
    issued: objs(p, 'issued').map((k) => ({ token: num(k, 'token'), issuedSec: num(k, 'issuedSec'), expiresSec: num(k, 'expiresSec') })),
    app: objs(p, 'app').map((r) => ({ sec: num(r, 'sec'), token: num(r, 'token'), status: num(r, 'status') })),
    attacker: objs(p, 'attacker').map((r) => ({ sec: num(r, 'sec'), status: num(r, 'status') })),
    leak:
      leakRaw === null
        ? null
        : {
            sec: num(leakRaw, 'sec'),
            token: num(leakRaw, 'token'),
            issuedSec: num(leakRaw, 'issuedSec'),
            expiresSec: num(leakRaw, 'expiresSec'),
            usableSec: num(leakRaw, 'usableSec'),
          },
    counts: counts(p, 'counts'),
    totals: counts(p, 'totals'),
  };
}

export const authProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as AuthStage | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(e: FacetRuntimeEvent) {
      if (!stage) return;
      const p = e.payload;
      if (e.type === 'round') {
        if (!isObj(p)) throw new Error('auth payload: round 에 payload 가 없다');
        return stage.startRound(toRound(p), motion());
      }
      if (e.type === 'window') {
        if (!isObj(p)) throw new Error('auth payload: window 에 payload 가 없다');
        return stage.showWindow(toWindow(p), motion());
      }
      return undefined;
    },
    onReset() {
      stage?.reset();
    },
  };
};
