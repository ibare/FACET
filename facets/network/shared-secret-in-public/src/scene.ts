import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 끝이나 엿듣는 이가 쥔 값 하나 */
export type HeldValue = { name: string; value: number };

export type ScenePartyState = {
  id: string;
  secretName: string;
  secret: number;
  shareName: string;
  /** 비밀을 뺀, 이 끝이 쥔 값 (공개 수 · 받은 값 · 셈한 값) — 쥔 차례대로 */
  held: HeldValue[];
};

export type SharedSecretStep =
  | { kind: 'start' }
  | { kind: 'cross'; from: string; to: string; items: HeldValue[]; handFrom: number }
  | {
      kind: 'mix';
      who: string;
      name: string;
      baseName: string;
      expName: string;
      baseValue: number;
      expValue: number;
      modName: string;
      modValue: number;
      value: number;
    }
  | { kind: 'eavesdrop'; leftName: string; rightName: string; modName: string; value: number };

export type SharedSecretScene = {
  // 바탕
  modName: string;
  baseName: string;
  keyName: string;
  eavesdropper: string;
  // 자취
  parties: ScenePartyState[];
  /** 엿듣는 이의 손 — 사본이 떨어진 차례대로 */
  hand: HeldValue[];
  /** 엿듣는 이가 쥔 것끼리 셈한 값 (마지막 걸음) */
  product: { leftName: string; rightName: string; modName: string; value: number } | null;
  // 이번 걸음
  step: SharedSecretStep;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`장면: ${what} 가 문자열이 아니다`);
  return v;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${what} 가 수가 아니다`);
  return v;
}
function heldList(v: unknown, what: string): HeldValue[] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 가 목록이 아니다`);
  return v.map((it, i) => {
    const r = rec(it);
    return { name: str(r.name, `${what}[${i}].name`), value: num(r.value, `${what}[${i}].value`) };
  });
}

function initial(initialData: unknown): SharedSecretScene {
  const d = rec(initialData);
  const modName = str(d.modName, 'modName');
  const baseName = str(d.baseName, 'baseName');
  const modValue = num(d.modValue, 'modValue');
  const baseValue = num(d.baseValue, 'baseValue');
  const rawParties = Array.isArray(d.parties) ? d.parties : [];
  const parties: ScenePartyState[] = rawParties.map((raw, i) => {
    const r = rec(raw);
    const held: HeldValue[] =
      r.holdsPublic === true
        ? [
            { name: modName, value: modValue },
            { name: baseName, value: baseValue },
          ]
        : [];
    return {
      id: str(r.id, `parties[${i}].id`),
      secretName: str(r.secretName, `parties[${i}].secretName`),
      secret: num(r.secret, `parties[${i}].secret`),
      shareName: str(r.shareName, `parties[${i}].shareName`),
      held,
    };
  });
  return {
    modName,
    baseName,
    keyName: str(d.keyName, 'keyName'),
    eavesdropper: str(d.eavesdropper, 'eavesdropper'),
    parties,
    hand: [],
    product: null,
    step: { kind: 'start' },
  };
}

function withHeld(parties: ScenePartyState[], who: string, add: HeldValue[]): ScenePartyState[] {
  if (!parties.some((p) => p.id === who)) throw new Error(`장면: 모르는 끝 ${who}`);
  return parties.map((p) =>
    p.id === who ? { ...p, held: [...p.held.filter((h) => !add.some((a) => a.name === h.name)), ...add] } : p,
  );
}

function reduce(scene: SharedSecretScene, event: FacetRuntimeEvent): SharedSecretScene {
  const pl = rec(event.payload);
  if (event.type === 'cross') {
    const from = str(pl.from, 'cross.from');
    const to = str(pl.to, 'cross.to');
    const items = heldList(pl.items, 'cross.items');
    return {
      ...scene,
      parties: withHeld(scene.parties, to, items),
      hand: [...scene.hand, ...items],
      step: { kind: 'cross', from, to, items, handFrom: scene.hand.length },
    };
  }
  if (event.type === 'mix') {
    const step: SharedSecretStep = {
      kind: 'mix',
      who: str(pl.who, 'mix.who'),
      name: str(pl.name, 'mix.name'),
      baseName: str(pl.baseName, 'mix.baseName'),
      expName: str(pl.expName, 'mix.expName'),
      baseValue: num(pl.baseValue, 'mix.baseValue'),
      expValue: num(pl.expValue, 'mix.expValue'),
      modName: str(pl.modName, 'mix.modName'),
      modValue: num(pl.modValue, 'mix.modValue'),
      value: num(pl.value, 'mix.value'),
    };
    return {
      ...scene,
      parties: withHeld(scene.parties, step.who, [{ name: step.name, value: step.value }]),
      step,
    };
  }
  if (event.type === 'eavesdrop') {
    const product = {
      leftName: str(pl.leftName, 'eavesdrop.leftName'),
      rightName: str(pl.rightName, 'eavesdrop.rightName'),
      modName: str(pl.modName, 'eavesdrop.modName'),
      value: num(pl.value, 'eavesdrop.value'),
    };
    return { ...scene, product, step: { kind: 'eavesdrop', ...product } };
  }
  return scene;
}

export const sharedSecretInPublicScene: ScenePlan<SharedSecretScene> = { initial, reduce };
