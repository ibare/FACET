/**
 * arpCache — ARP 캐시 조각의 알고리즘.
 *
 * 한 이더넷 세그먼트의 호스트들이 정해진 차례로 프레임을 보낸다. 보내기 전에 보내는 이의
 * ARP 표에서 목적지 IP 의 줄을 찾는다. 있으면 그 MAC 으로 바로 보내고, 없으면 한 번 묻고
 * 물은 뒤 보낸다. 물음 하나로 일어나는 일은 RFC 826 의 받는 쪽 규칙을 따른다.
 *
 *  - 묻는 이의 표에 (목적지 IP, 주인 MAC) 한 줄이 끝에 붙는다
 *  - 주인의 표에 (묻는 이 IP, 묻는 이 MAC) 줄이 없으면 끝에 붙고, 있으면 그 자리에서 값을 고친다
 *  - 구경꾼은 묻는 이의 줄을 이미 가졌을 때만 그 자리에서 값을 고친다. 새 줄은 생기지 않는다
 *
 * 실제 프로토콜과 어긋나게 줄인 자리:
 *  - 줄의 수명(만료)이 없다. 한 번 적힌 줄은 재생 내내 남는다
 *  - 물음이 방송으로 퍼지는 모습은 사건 하나로 접는다 (그 그림은 `ask-who-has` 의 것이다)
 *  - 구경꾼이 같은 값으로 고치는 일은 payload(`updated`)에 싣지만 화면에 그리지 않는다
 *  - 선 위의 전달은 걸음 안에서 끝난다. 시간을 초로 세지 않는다
 *
 * 이벤트 (전부 silent 아님. 걸음 0 은 장면의 initial 이 initialData 에서 빈 표 넷으로 세운다):
 *
 *  ask   { n: number; asker: string; ip: string; owner: string;
 *          written: { host: string; ip: string; mac: string; by: string }[];
 *          updated: { host: string; ip: string; mac: string }[] }
 *        — 보냄 n 을 앞두고 asker 의 표에 ip 줄이 없어 묻는다. 주인은 owner.
 *          written 은 이 물음으로 표 끝에 새로 붙은 줄 (묻는 이 → 주인 차례, by 는 물은 이).
 *          updated 는 이미 있던 줄을 그 자리에서 고친 것 (데이터 차례)
 *  send  { n: number; from: string; ip: string; to: string; mac: string; row: number;
 *          via: 'asked' | 'table' }
 *        — 보냄 n 이 from 의 표 row 번째 줄의 MAC 으로 떠난다. to 는 그 MAC 의 주인.
 *          via 는 바로 앞 걸음에서 물었는지('asked') 이미 표에 있었는지('table')
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ArpHost = { id: string; ip: string; mac: string };
export type ArpSend = { from: string; ip: string };

export type ArpCacheFacetData = {
  type: 'arp-cache';
  stepMs: number;
  hosts: ArpHost[];
  sends: ArpSend[];
};

type Row = { ip: string; mac: string; by: string };

function findHostById(hosts: readonly ArpHost[], id: string, where: string): ArpHost {
  const found = hosts.filter((h) => h.id === id);
  if (found.length !== 1) {
    throw new Error(`arpCache: ${where} — 호스트 '${id}' 가 ${found.length} 개다 (하나여야 한다)`);
  }
  return found[0] as ArpHost;
}

function findOwnerByIp(hosts: readonly ArpHost[], ip: string, where: string): ArpHost {
  const found = hosts.filter((h) => h.ip === ip);
  if (found.length !== 1) {
    throw new Error(`arpCache: ${where} — IP ${ip} 의 주인이 ${found.length} 이다 (하나여야 한다)`);
  }
  return found[0] as ArpHost;
}

function findOwnerByMac(hosts: readonly ArpHost[], mac: string, where: string): ArpHost {
  const found = hosts.filter((h) => h.mac === mac);
  if (found.length !== 1) {
    throw new Error(`arpCache: ${where} — MAC ${mac} 의 주인이 ${found.length} 이다 (하나여야 한다)`);
  }
  return found[0] as ArpHost;
}

export async function arpCache(context: FacetContext<ArpCacheFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ArpCacheFacetData>;
  const { hosts, sends, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const tables = new Map<string, Row[]>();
  for (const h of hosts) {
    if (ctx.cancelled) return;
    if (tables.has(h.id)) throw new Error(`arpCache: 호스트 '${h.id}' 가 둘이다`);
    tables.set(h.id, []);
  }
  const tableOf = (id: string): Row[] => {
    const rows = tables.get(id);
    if (rows === undefined) throw new Error(`arpCache: 호스트 '${id}' 의 표가 없다`);
    return rows;
  };

  // 걸음 0 은 빈 표 넷이 이미 읽을 것이다 — 첫 발신 앞에 읽을 틈을 둔다.
  for (let i = 0; i < sends.length; i += 1) {
    if (!(await pause())) return;
    const send = sends[i] as ArpSend;
    const n = i + 1;
    const where = `보냄 #${n}`;
    const sender = findHostById(hosts, send.from, where);
    const own = tableOf(sender.id);
    let row = own.findIndex((r) => r.ip === send.ip);
    let via: 'asked' | 'table' = 'table';

    if (row < 0) {
      const owner = findOwnerByIp(hosts, send.ip, where);
      if (owner.id === sender.id) throw new Error(`arpCache: ${where} — 자기 자신에게 묻는다`);
      const written: { host: string; ip: string; mac: string; by: string }[] = [];
      const updated: { host: string; ip: string; mac: string }[] = [];

      own.push({ ip: owner.ip, mac: owner.mac, by: sender.id });
      written.push({ host: sender.id, ip: owner.ip, mac: owner.mac, by: sender.id });

      for (const h of hosts) {
        if (ctx.cancelled) return;
        if (h.id === sender.id) continue;
        const rows = tableOf(h.id);
        const at = rows.findIndex((r) => r.ip === sender.ip);
        if (at >= 0) {
          const was = rows[at] as Row;
          rows[at] = { ip: sender.ip, mac: sender.mac, by: was.by };
          updated.push({ host: h.id, ip: sender.ip, mac: sender.mac });
        } else if (h.id === owner.id) {
          rows.push({ ip: sender.ip, mac: sender.mac, by: sender.id });
          written.push({ host: owner.id, ip: sender.ip, mac: sender.mac, by: sender.id });
        }
      }

      await ctx.emit({
        type: 'ask',
        payload: { n, asker: sender.id, ip: send.ip, owner: owner.id, written, updated },
      });
      if (!(await pause())) return;
      row = own.findIndex((r) => r.ip === send.ip);
      via = 'asked';
    }

    const used = own[row];
    if (used === undefined) throw new Error(`arpCache: ${where} — 물은 뒤에도 ${send.ip} 줄이 없다`);
    const to = findOwnerByMac(hosts, used.mac, where);
    await ctx.emit({
      type: 'send',
      payload: { n, from: sender.id, ip: send.ip, to: to.id, mac: used.mac, row, via },
    });
  }
}
