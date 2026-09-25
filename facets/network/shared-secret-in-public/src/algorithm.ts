/**
 * 공개된 선 위에서 비밀 맞추기 — 디피-헬먼 (작은 수의 유한체 판).
 *
 * 규약 (사양 그대로):
 *   - A = g^a mod p (client 가 셈) · B = g^b mod p (server 가 셈)
 *   - client 의 K = B^a mod p · server 의 K = A^b mod p
 *   - 걸음 차례는 `wire` 를 앞에서부터 따른다. 보낼 값을 보내는 쪽이 아직 모르면
 *     건너기 **앞에** 그 쪽이 셈한다 (그래서 A 를 셈하고 보낸 다음에 B 를 셈한다)
 *   - 선을 다 건넌 뒤 두 K 를 `parties` 차례로 (client 먼저, 다음 걸음에 server) 셈한다
 *   - 엿듣는 이는 선을 건넌 것만 손에 쥔다. 마지막 걸음에 쥔 두 공개값 A · B 로
 *     A × B mod p 를 셈해 보인다. 비밀을 추측하거나 무차별로 찾는 걸음은 없다
 *   - 모듈러 거듭제곱은 곱할 때마다 mod 로 줄인다 (number 로 넘치지 않는다)
 *
 * 이벤트 (silent 없음 — 전부 걸음이다)
 *   mix        { who: string; name: string; baseName: string; expName: string;
 *                baseValue: number; expValue: number; modName: string; modValue: number;
 *                value: number }
 *              한 끝이 제 비밀을 지수로 섞어 새 값을 셈한다 (A · B · K)
 *   cross      { from: string; to: string; items: { name: string; value: number }[] }
 *              값이 선을 건넌다. 받는 끝이 쥐고, 엿듣는 이가 사본을 쥔다
 *   eavesdrop  { leftName: string; rightName: string; modName: string; value: number }
 *              엿듣는 이가 쥔 두 공개값의 곱을 p 로 줄인 값
 *
 * 셈할 수 없는 상태(보낼 값을 셈할 길이 없음 · 받지 못한 공개값 · 모르는 끝)는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SharedSecretParty = {
  /** 식별자 — 표시 이름은 messages 의 label.<id> */
  id: string;
  secretName: string;
  /** 예로 정한 비밀 수 */
  secret: number;
  /** 이 끝이 셈해 내보내는 공개값의 이름 */
  shareName: string;
  /** 처음부터 공개 수(p · g)를 쥐고 있는가 — 여는 쪽 */
  holdsPublic: boolean;
};

export type SharedSecretSend = { from: string; to: string; send: string[] };

export type SharedSecretInPublicFacetData = {
  type: 'shared-secret-in-public';
  stepMs: number;
  modName: string;
  modValue: number;
  baseName: string;
  baseValue: number;
  keyName: string;
  eavesdropper: string;
  parties: SharedSecretParty[];
  wire: SharedSecretSend[];
};

/** g^e mod m — 곱할 때마다 줄인다. */
export function modPow(base: number, exp: number, mod: number): number {
  let result = 1 % mod;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e % 2 === 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return result;
}

export async function sharedSecretInPublic(
  ctx: FacetContext<SharedSecretInPublicFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SharedSecretInPublicFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const known = new Map<string, Map<string, number>>();
  for (const party of data.parties) {
    const held = new Map<string, number>();
    if (party.holdsPublic) {
      held.set(data.modName, data.modValue);
      held.set(data.baseName, data.baseValue);
    }
    held.set(party.secretName, party.secret);
    known.set(party.id, held);
  }
  const hand = new Map<string, number>();

  function partyOf(id: string): SharedSecretParty {
    const party = data.parties.find((q) => q.id === id);
    if (!party) throw new Error(`모르는 끝: ${id}`);
    return party;
  }
  function heldBy(id: string): Map<string, number> {
    const held = known.get(id);
    if (!held) throw new Error(`모르는 끝: ${id}`);
    return held;
  }
  function need(held: Map<string, number>, who: string, name: string): number {
    const v = held.get(name);
    if (v === undefined) throw new Error(`${who} 가 ${name} 를 쥐지 않았다`);
    return v;
  }

  for (const entry of data.wire) {
    if (ctx.cancelled) return;
    const sender = partyOf(entry.from);
    partyOf(entry.to);
    const senderHeld = heldBy(entry.from);

    for (const name of entry.send) {
      if (ctx.cancelled) return;
      if (senderHeld.has(name)) continue;
      if (name !== sender.shareName) {
        throw new Error(`${entry.from} 가 ${name} 를 셈할 길이 없다`);
      }
      const baseValue = need(senderHeld, entry.from, data.baseName);
      const modValue = need(senderHeld, entry.from, data.modName);
      const value = modPow(baseValue, sender.secret, modValue);
      if (!(await pause())) return;
      await ctx.emit({
        type: 'mix',
        payload: {
          who: sender.id,
          name,
          baseName: data.baseName,
          expName: sender.secretName,
          baseValue,
          expValue: sender.secret,
          modName: data.modName,
          modValue,
          value,
        },
      });
      senderHeld.set(name, value);
    }

    const items = entry.send.map((name) => ({ name, value: need(senderHeld, entry.from, name) }));
    if (!(await pause())) return;
    await ctx.emit({ type: 'cross', payload: { from: entry.from, to: entry.to, items } });
    const receiverHeld = heldBy(entry.to);
    for (const item of items) {
      if (ctx.cancelled) return;
      receiverHeld.set(item.name, item.value);
      hand.set(item.name, item.value);
    }
  }

  for (const party of data.parties) {
    if (ctx.cancelled) return;
    const other = data.parties.find((q) => q.id !== party.id);
    if (!other) throw new Error('맞은편 끝이 없다');
    const held = heldBy(party.id);
    const baseValue = need(held, party.id, other.shareName);
    const modValue = need(held, party.id, data.modName);
    const value = modPow(baseValue, party.secret, modValue);
    if (!(await pause())) return;
    await ctx.emit({
      type: 'mix',
      payload: {
        who: party.id,
        name: data.keyName,
        baseName: other.shareName,
        expName: party.secretName,
        baseValue,
        expValue: party.secret,
        modName: data.modName,
        modValue,
        value,
      },
    });
    held.set(data.keyName, value);
  }

  const [first, second] = data.parties;
  if (!first || !second) throw new Error('끝이 둘이 아니다');
  const left = need(hand, data.eavesdropper, first.shareName);
  const right = need(hand, data.eavesdropper, second.shareName);
  const mod = need(hand, data.eavesdropper, data.modName);
  if (!(await pause())) return;
  await ctx.emit({
    type: 'eavesdrop',
    payload: {
      leftName: first.shareName,
      rightName: second.shareName,
      modName: data.modName,
      value: (left * right) % mod,
    },
  });
}
