/**
 * delegate-down-the-tree — DNS 위임. 어느 서버도 모든 이름을 모르는데
 * `www.lab.example.com.` 의 주소를 어떻게 찾는가.
 *
 * 리졸버는 루트 서버 하나만 알고 시작한다. 서버에 이름 전체를 묻고(반복 질의),
 * 서버는 ① 그 이름의 레코드를 가졌으면 답하고 ② 아니면 넘긴 자리 가운데 이름의
 * 끝과 맞는 가장 긴 것을 주소와 함께 가리킨다 ③ 둘 다 없으면 던진다.
 * 리졸버는 가리킨 서버로 한 층 내려가 같은 질문을 다시 한다.
 *
 * 줄인 자리 (설명 글이 밝힌다): 캐시는 비어 있고 쓰지 않는다 · 이름을 줄여 묻지 않는다 ·
 * 메시지는 보낸 순간 닿고 잃지 않는다 · 서버 넷과 주소는 문서용 범위의 예로 정한 값이다.
 *
 * 한 걸음 = 메시지 하나 (질의 또는 그 대답). 모든 이벤트는 silent 가 아니다.
 *
 * 이벤트
 *   client-ask  { qname: string; qtype: string }
 *               클라이언트 → 리졸버, 재귀 질의 한 번
 *   query       { n: number; server: string }
 *               리졸버 → server, 질의 n (이름 전체 그대로)
 *   referral    { n: number; server: string; zone: string; ns: string; addr: string }
 *               server → 리졸버, 답 대신 넘김: zone 은 ns(addr) 가 안다
 *   answer      { n: number; server: string; value: string }
 *               server → 리졸버, 레코드의 값
 *   reply       { value: string; queries: number; referrals: number }
 *               리졸버 → 클라이언트, 답 하나. queries · referrals 는 리졸버가 보낸 질의 수와 따라간 넘김 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DnsDelegation = { zone: string; ns: string; addr: string };
export type DnsRecord = { name: string; type: string; value: string };
export type DnsServer = {
  name: string;
  addr: string;
  delegations: DnsDelegation[];
  records: DnsRecord[];
};

export type DelegateDownTheTreeFacetData = {
  type: 'delegate-down-the-tree';
  stepMs: number;
  qname: string;
  qtype: string;
  /** 리졸버가 처음 아는 서버의 이름 */
  start: string;
  servers: DnsServer[];
};

function need(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`delegate-down-the-tree: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  need(typeof v === 'string' && v.length > 0, `${where}.${key} 가 문자열이 아니다`);
  return v;
}

function list(o: Record<string, unknown>, key: string, where: string): unknown[] {
  const v = o[key];
  need(Array.isArray(v), `${where}.${key} 가 배열이 아니다`);
  return v;
}

/** 자료를 좁히고 베낀다. 모양이 틀리면 던진다. */
export function readDelegateData(raw: unknown): DelegateDownTheTreeFacetData {
  need(isRecord(raw), 'initialData 가 객체가 아니다');
  need(raw.type === 'delegate-down-the-tree', `type 이 다르다: ${String(raw.type)}`);
  const stepMs = raw.stepMs;
  need(typeof stepMs === 'number' && stepMs > 0, 'stepMs 가 양수가 아니다');
  const servers = list(raw, 'servers', 'initialData').map((s, i): DnsServer => {
    const where = `servers[${i}]`;
    need(isRecord(s), `${where} 가 객체가 아니다`);
    return {
      name: str(s, 'name', where),
      addr: str(s, 'addr', where),
      delegations: list(s, 'delegations', where).map((d, j) => {
        const w = `${where}.delegations[${j}]`;
        need(isRecord(d), `${w} 가 객체가 아니다`);
        return { zone: str(d, 'zone', w), ns: str(d, 'ns', w), addr: str(d, 'addr', w) };
      }),
      records: list(s, 'records', where).map((r, j) => {
        const w = `${where}.records[${j}]`;
        need(isRecord(r), `${w} 가 객체가 아니다`);
        return { name: str(r, 'name', w), type: str(r, 'type', w), value: str(r, 'value', w) };
      }),
    };
  });
  const data: DelegateDownTheTreeFacetData = {
    type: 'delegate-down-the-tree',
    stepMs,
    qname: str(raw, 'qname', 'initialData'),
    qtype: str(raw, 'qtype', 'initialData'),
    start: str(raw, 'start', 'initialData'),
    servers,
  };
  need(data.qname.endsWith('.'), `이름이 점으로 끝나지 않는다: ${data.qname}`);
  need(servers.some((s) => s.name === data.start), `처음 아는 서버가 표에 없다: ${data.start}`);
  return data;
}

/** zone 이 이름의 끝과 마디 경계에서 맞는가 */
export function zoneCovers(qname: string, zone: string): boolean {
  if (zone === '.') return true;
  return qname === zone || qname.endsWith(`.${zone}`);
}

export async function delegateDownTheTree(
  ctx: FacetContext<DelegateDownTheTreeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<DelegateDownTheTreeFacetData>;
  const data = readDelegateData(ctx.data);
  const { qname, qtype, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 은 이미 읽을 것이 있는 화면(이름 · 서버 넷)이라 첫 발신 앞에도 틈을 둔다
  if (!(await pause())) return;
  await ctx.emit({ type: 'client-ask', payload: { qname, qtype } });

  const byName = (name: string): DnsServer => {
    const found = data.servers.find((s) => s.name === name);
    need(found !== undefined, `표에 없는 서버: ${name}`);
    return found;
  };

  let cur = byName(data.start);
  let queries = 0;
  let referrals = 0;
  const asked = new Set<string>();
  let value: string | null = null;

  while (value === null) {
    if (!(await pause())) return;
    need(!asked.has(cur.name), `같은 서버를 다시 묻는다 — 내려가지 않는다: ${cur.name}`);
    asked.add(cur.name);
    queries += 1;
    await ctx.emit({ type: 'query', payload: { n: queries, server: cur.name } });

    if (!(await pause())) return;
    const rec = cur.records.find((r) => r.name === qname && r.type === qtype);
    if (rec) {
      value = rec.value;
      await ctx.emit({
        type: 'answer',
        payload: { n: queries, server: cur.name, value: rec.value },
      });
      break;
    }
    const cands = cur.delegations.filter((d) => zoneCovers(qname, d.zone));
    need(cands.length > 0, `${cur.name} 가 ${qname} 의 답도 넘김도 없다`);
    const best = cands.reduce((a, b) => (b.zone.length > a.zone.length ? b : a));
    referrals += 1;
    await ctx.emit({
      type: 'referral',
      payload: { n: queries, server: cur.name, zone: best.zone, ns: best.ns, addr: best.addr },
    });
    // 리졸버는 받은 주소로 간다. 그 주소의 서버가 가리킨 이름과 다르면 모형 밖이다
    const next = data.servers.find((s) => s.addr === best.addr);
    need(next !== undefined, `넘겨받은 주소에 서버가 없다: ${best.addr}`);
    need(next.name === best.ns, `넘겨받은 주소 ${best.addr} 의 서버가 ${best.ns} 가 아니다`);
    cur = next;
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'reply', payload: { value, queries, referrals } });
}
