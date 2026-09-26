/**
 * only-what-changed 장면.
 *
 * 바탕 — 규칙 · 소스 (initial 이 initialData 에서 베낀다. 걸음 0 은 지난번 결과 일곱이 선 화면)
 * 자취 — 고친 소스(edited) · 들여다본 대상의 판정(verdicts, 들여다본 차례)
 * 이번 걸음 — step. 들여다보기 걸음은 앞서 들여다본 대상(from)을 계기값으로 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { OnlyWhatChangedRule } from './algorithm.js';

export type OnlyWhatChangedVerdict = { target: string; rebuilt: boolean; hit: string[] };

export type OnlyWhatChangedStep =
  | { kind: 'start' }
  | { kind: 'edit'; sources: string[] }
  | { kind: 'inspect'; target: string; rebuilt: boolean; hit: string[]; from: string | null };

export type OnlyWhatChangedScene = {
  rules: OnlyWhatChangedRule[];
  sources: string[];
  edited: string[];
  verdicts: OnlyWhatChangedVerdict[];
  step: OnlyWhatChangedStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`only-what-changed 장면: ${what} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`only-what-changed 장면: ${what} 에 글자 아닌 것`);
    return x;
  });
}

function readRules(v: unknown): OnlyWhatChangedRule[] {
  if (!Array.isArray(v)) throw new Error('only-what-changed 장면: rules 가 목록이 아니다');
  return v.map((r) => {
    if (!isRecord(r) || typeof r.target !== 'string') {
      throw new Error('only-what-changed 장면: 규칙에 target 이 없다');
    }
    return { target: r.target, inputs: stringList(r.inputs, `${r.target} 의 inputs`) };
  });
}

function inspect(scene: OnlyWhatChangedScene, target: string, rebuilt: boolean, hit: string[]): OnlyWhatChangedScene {
  if (!scene.rules.some((r) => r.target === target)) {
    throw new Error(`only-what-changed 장면: 모르는 대상 ${target}`);
  }
  if (scene.verdicts.some((v) => v.target === target)) {
    throw new Error(`only-what-changed 장면: ${target} 를 두 번 들여다봤다`);
  }
  const last = scene.verdicts[scene.verdicts.length - 1];
  return {
    ...scene,
    verdicts: [...scene.verdicts, { target, rebuilt, hit: [...hit] }],
    step: { kind: 'inspect', target, rebuilt, hit: [...hit], from: last === undefined ? null : last.target },
  };
}

export const onlyWhatChangedScene: ScenePlan<OnlyWhatChangedScene> = {
  initial(initialData: unknown): OnlyWhatChangedScene {
    if (!isRecord(initialData)) throw new Error('only-what-changed 장면: initialData 가 없다');
    return {
      rules: readRules(initialData.rules),
      sources: stringList(initialData.sources, 'sources'),
      edited: [],
      verdicts: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: OnlyWhatChangedScene, event: FacetRuntimeEvent): OnlyWhatChangedScene {
    const p = event.payload;
    if (event.type === 'edit') {
      if (!isRecord(p)) throw new Error('only-what-changed 장면: edit 에 payload 가 없다');
      const sources = stringList(p.sources, 'edit.sources');
      for (const s of sources) {
        if (!scene.sources.includes(s)) throw new Error(`only-what-changed 장면: 모르는 소스 ${s}`);
      }
      return { ...scene, edited: [...scene.edited, ...sources], step: { kind: 'edit', sources } };
    }
    if (event.type === 'keep') {
      if (!isRecord(p) || typeof p.target !== 'string') throw new Error('only-what-changed 장면: keep 에 target 이 없다');
      return inspect(scene, p.target, false, []);
    }
    if (event.type === 'rebuild') {
      if (!isRecord(p) || typeof p.target !== 'string') throw new Error('only-what-changed 장면: rebuild 에 target 이 없다');
      const hit = stringList(p.hit, 'rebuild.hit');
      if (hit.length === 0) throw new Error(`only-what-changed 장면: ${p.target} 를 바뀐 입력 없이 다시 세웠다`);
      return inspect(scene, p.target, true, hit);
    }
    return scene;
  },
};
