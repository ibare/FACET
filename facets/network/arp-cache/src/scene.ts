/**
 * arpCache 장면 — 이벤트를 잇기만 한다. 표에 줄이 있는지, 누가 주인인지는 알고리즘이 셈했다.
 *
 *  바탕  hosts · sends   (initialData 에서 베낀다. 걸음 0 은 빈 표와 빈 보냄 줄)
 *  자취  tables · frames · asks
 *  이번  step
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneHost = { id: string; ip: string; mac: string };
export type SceneSend = { from: string; ip: string };
/** by — 이 줄을 적게 한 물음을 던진 호스트 */
export type SceneRow = { ip: string; mac: string; by: string };
export type SceneTable = { host: string; rows: SceneRow[] };
export type SceneFrame = { n: number; from: string; to: string; ip: string; mac: string; via: 'asked' | 'table' };
export type SceneAsk = { n: number; asker: string; owner: string };

export type ArpStep =
  | { kind: 'start' }
  | {
      kind: 'ask';
      n: number;
      asker: string;
      owner: string;
      ip: string;
      /** 이 물음으로 새로 붙은 줄의 자리 (표 차례) */
      wrote: { host: string; row: number }[];
    }
  | { kind: 'send'; n: number; from: string; to: string; ip: string; row: number; via: 'asked' | 'table' };

export type ArpCacheScene = {
  hosts: SceneHost[];
  sends: SceneSend[];
  tables: SceneTable[];
  frames: SceneFrame[];
  asks: SceneAsk[];
  step: ArpStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`arpCacheScene: ${where} 의 '${key}' 가 글자가 아니다`);
  return v;
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`arpCacheScene: ${where} 의 '${key}' 가 수가 아니다`);
  }
  return v;
}

function list(o: Record<string, unknown>, key: string, where: string): Record<string, unknown>[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`arpCacheScene: ${where} 의 '${key}' 가 목록이 아니다`);
  return v.map((item, i) => {
    if (!isRecord(item)) throw new Error(`arpCacheScene: ${where} 의 '${key}[${i}]' 가 객체가 아니다`);
    return item;
  });
}

function via(o: Record<string, unknown>, where: string): 'asked' | 'table' {
  const v = o['via'];
  if (v !== 'asked' && v !== 'table') throw new Error(`arpCacheScene: ${where} 의 via 를 모른다`);
  return v;
}

function copyTables(tables: readonly SceneTable[]): SceneTable[] {
  return tables.map((t) => ({ host: t.host, rows: t.rows.map((r) => ({ ...r })) }));
}

export const arpCacheScene: ScenePlan<ArpCacheScene> = {
  initial(initialData: unknown): ArpCacheScene {
    const d = isRecord(initialData) ? initialData : {};
    const hosts = Array.isArray(d['hosts'])
      ? d['hosts'].filter(isRecord).map((h) => ({
          id: str(h, 'id', 'hosts'),
          ip: str(h, 'ip', 'hosts'),
          mac: str(h, 'mac', 'hosts'),
        }))
      : [];
    const sends = Array.isArray(d['sends'])
      ? d['sends'].filter(isRecord).map((s) => ({ from: str(s, 'from', 'sends'), ip: str(s, 'ip', 'sends') }))
      : [];
    return {
      hosts,
      sends,
      tables: hosts.map((h) => ({ host: h.id, rows: [] })),
      frames: [],
      asks: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: ArpCacheScene, event: FacetRuntimeEvent): ArpCacheScene {
    const p = event.payload;
    if (event.type === 'ask') {
      if (!isRecord(p)) throw new Error('arpCacheScene: ask 의 payload 가 없다');
      const n = num(p, 'n', 'ask');
      const asker = str(p, 'asker', 'ask');
      const owner = str(p, 'owner', 'ask');
      const ip = str(p, 'ip', 'ask');
      const tables = copyTables(scene.tables);
      const tableOf = (host: string): SceneTable => {
        const t = tables.find((x) => x.host === host);
        if (t === undefined) throw new Error(`arpCacheScene: 호스트 '${host}' 의 표가 없다`);
        return t;
      };
      const wrote: { host: string; row: number }[] = [];
      for (const w of list(p, 'written', 'ask')) {
        const t = tableOf(str(w, 'host', 'ask.written'));
        t.rows.push({ ip: str(w, 'ip', 'ask.written'), mac: str(w, 'mac', 'ask.written'), by: str(w, 'by', 'ask.written') });
        wrote.push({ host: t.host, row: t.rows.length - 1 });
      }
      for (const u of list(p, 'updated', 'ask')) {
        const t = tableOf(str(u, 'host', 'ask.updated'));
        const at = t.rows.findIndex((r) => r.ip === str(u, 'ip', 'ask.updated'));
        const was = t.rows[at];
        if (was === undefined) throw new Error('arpCacheScene: 고칠 줄이 표에 없다');
        t.rows[at] = { ip: was.ip, mac: str(u, 'mac', 'ask.updated'), by: was.by };
      }
      return {
        ...scene,
        tables,
        asks: [...scene.asks, { n, asker, owner }],
        step: { kind: 'ask', n, asker, owner, ip, wrote },
      };
    }
    if (event.type === 'send') {
      if (!isRecord(p)) throw new Error('arpCacheScene: send 의 payload 가 없다');
      const frame: SceneFrame = {
        n: num(p, 'n', 'send'),
        from: str(p, 'from', 'send'),
        to: str(p, 'to', 'send'),
        ip: str(p, 'ip', 'send'),
        mac: str(p, 'mac', 'send'),
        via: via(p, 'send'),
      };
      return {
        ...scene,
        frames: [...scene.frames, frame],
        step: {
          kind: 'send',
          n: frame.n,
          from: frame.from,
          to: frame.to,
          ip: frame.ip,
          row: num(p, 'row', 'send'),
          via: frame.via,
        },
      };
    }
    return scene;
  },
};
