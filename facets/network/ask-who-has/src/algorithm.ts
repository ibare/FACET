/**
 * ask-who-has — ARP 요청: 누구 것이냐고 모두에게 묻는다.
 *
 * 한 이더넷 세그먼트의 호스트들 가운데 묻는 이(`asker`)가 찾는 IP 하나의 MAC 을 알아낸다.
 * 요청은 방송으로 보낸 이를 뺀 모두에게 퍼지고, 받은 호스트마다 찾는 IP 를 제 IP 와 견준다.
 * 주인 하나만 묻는 이의 MAC 으로 곧장 답한다.
 *
 * 줄인 자리 (실제 프로토콜과 어긋나게 둔 것)
 * - 선 위의 전달은 걸음 안에서 끝난다. 전파 · 전송 시간을 셈하지 않는다.
 * - 버린 호스트가 요청으로 제 표를 고치는 일, 주인이 요청에서 묻는 이를 적어 두는 일은
 *   그리지 않는다 — 적어 두기는 이웃 조각 `arp-cache` 의 몫이다.
 *
 * 이벤트 (전부 silent 아님. 걸음 0 은 scene 의 initial() 이 initialData 에서 세운다)
 * - `request` — 요청 프레임이 방송으로 퍼졌다
 *     payload: { frame: ArpFrame, heard: string[] }   heard = 받은 호스트 식별자, 데이터 차례
 * - `compare` — 받은 호스트마다 찾는 IP 를 제 IP 와 견줬다
 *     payload: { verdicts: { id: string; owner: boolean }[] }   데이터 차례
 * - `reply` — 주인이 묻는 이에게 답했다
 *     payload: { frame: ArpFrame, from: string, heard: string[] }
 *     from = 주인 식별자, heard = 답의 이더넷 받는 이 MAC 이 맞는 호스트
 * - `learn` — 묻는 이가 답에서 IP → MAC 한 쌍을 얻었다
 *     payload: { ip: string, mac: string, frames: number }   frames = 선 위를 지난 프레임 수
 *
 * ArpFrame = { ethDst, ethSrc, op, senderMac, senderIp, targetMac, targetIp } (문자열 · op 는 수)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
export const ZERO_MAC = '00:00:00:00:00:00';

export type ArpHost = { id: string; ip: string; mac: string };

export type ArpFrame = {
  ethDst: string;
  ethSrc: string;
  op: number;
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
};

export type AskWhoHasFacetData = {
  type: 'ask-who-has';
  stepMs: number;
  hosts: ArpHost[];
  asker: string;
  targetIp: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 (C6). */
export function readAskWhoHasData(raw: unknown): AskWhoHasFacetData {
  if (!isRecord(raw)) throw new Error('ask-who-has: initialData 가 객체가 아니다');
  const { stepMs, hosts, asker, targetIp } = raw;
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) throw new Error('ask-who-has: stepMs 가 없다');
  if (typeof asker !== 'string') throw new Error('ask-who-has: asker 가 없다');
  if (typeof targetIp !== 'string') throw new Error('ask-who-has: targetIp 가 없다');
  if (!Array.isArray(hosts)) throw new Error('ask-who-has: hosts 가 배열이 아니다');
  const list: ArpHost[] = hosts.map((h, i) => {
    if (!isRecord(h) || typeof h.id !== 'string' || typeof h.ip !== 'string' || typeof h.mac !== 'string') {
      throw new Error(`ask-who-has: hosts[${i}] 의 모양이 틀렸다`);
    }
    return { id: h.id, ip: h.ip, mac: h.mac };
  });
  const ids = new Set(list.map((h) => h.id));
  if (ids.size !== list.length) throw new Error('ask-who-has: 호스트 식별자가 겹친다');
  return { type: 'ask-who-has', stepMs, hosts: list, asker, targetIp };
}

export async function askWhoHas(context: FacetContext<AskWhoHasFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<AskWhoHasFacetData>;
  const data = readAskWhoHasData(ctx.data);
  const { stepMs, hosts } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const me = hosts.find((h) => h.id === data.asker);
  if (!me) throw new Error(`ask-who-has: 묻는 이 ${data.asker} 가 호스트에 없다`);

  const request: ArpFrame = {
    ethDst: BROADCAST_MAC,
    ethSrc: me.mac,
    op: 1,
    senderMac: me.mac,
    senderIp: me.ip,
    targetMac: ZERO_MAC,
    targetIp: data.targetIp,
  };
  // 방송: 보낸 이를 뺀 모두가 받는다
  const heard = hosts.filter((h) => h.id !== me.id);
  if (heard.length === 0) throw new Error('ask-who-has: 요청을 받을 호스트가 없다');

  // 선 위를 지난 프레임 수 — 요청 · 답을 보낼 때마다 센다
  let frames = 0;

  // 걸음 0 (묻는 이가 찾는 IP 만 쥔 화면) 을 읽을 틈
  if (!(await pause())) return;
  frames += 1;
  await ctx.emit({ type: 'request', payload: { frame: request, heard: heard.map((h) => h.id) } });

  if (!(await pause())) return;
  const verdicts = heard.map((h) => ({ id: h.id, owner: h.ip === request.targetIp }));
  const owners = heard.filter((h) => h.ip === request.targetIp);
  const [owner] = owners;
  if (!owner || owners.length !== 1) {
    throw new Error(`ask-who-has: 찾는 IP ${request.targetIp} 의 주인이 ${owners.length} 곳이다`);
  }
  await ctx.emit({ type: 'compare', payload: { verdicts } });

  if (!(await pause())) return;
  const reply: ArpFrame = {
    ethDst: me.mac,
    ethSrc: owner.mac,
    op: 2,
    senderMac: owner.mac,
    senderIp: owner.ip,
    targetMac: me.mac,
    targetIp: me.ip,
  };
  // 답은 방송이 아니다 — 이더넷 받는 이 MAC 이 맞는 호스트만 받는다
  const replyHeard = hosts.filter((h) => h.mac === reply.ethDst);
  if (replyHeard.length === 0) throw new Error(`ask-who-has: 답의 받는 이 ${reply.ethDst} 가 망에 없다`);
  frames += 1;
  await ctx.emit({
    type: 'reply',
    payload: { frame: reply, from: owner.id, heard: replyHeard.map((h) => h.id) },
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'learn', payload: { ip: reply.senderIp, mac: reply.senderMac, frames } });
}
