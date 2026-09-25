import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readHardVsSoftLinkData,
  type HardVsSoftLinkEntry,
  type HardVsSoftLinkInode,
} from './algorithm.js';

/** 찾기 한 마디. entry = 이름 칸에서 inode 로, follow = 링크 inode 에 적힌 이름이 디렉터리로 되돌아가 그 칸에 닿음, miss = 되돌아갔으나 빈자리 */
export type HardVsSoftLinkHop =
  | { kind: 'entry'; name: string; ino: number }
  | { kind: 'follow'; via: number; name: string }
  | { kind: 'miss'; via: number; name: string };

/** 한 이름으로 시작한 찾기의 자취 */
export type HardVsSoftLinkTrail = { start: string; hops: HardVsSoftLinkHop[] };

export type HardVsSoftLinkStep =
  | { kind: 'reach'; start: string; name: string; ino: number; target: string | null; follow: boolean }
  | { kind: 'unlink'; name: string; ino: number; was: number | null; links: number }
  | { kind: 'miss'; start: string; name: string };

export type HardVsSoftLinkScene = {
  // 바탕
  dir: string;
  /** 처음 적힌 항목과 그 차례 — 지워도 칸은 남는다 */
  slots: HardVsSoftLinkEntry[];
  inodes: HardVsSoftLinkInode[];
  /** 지울 이름 */
  pending: string;
  // 자취
  entries: HardVsSoftLinkEntry[];
  links: { ino: number; n: number }[] | null;
  trails: HardVsSoftLinkTrail[];
  // 이번 걸음
  step: HardVsSoftLinkStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function need<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`hardVsSoftLinkScene: ${what}`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`hardVsSoftLinkScene: payload.${key} 가 글자가 아니다`);
  return v;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`hardVsSoftLinkScene: payload.${key} 가 수가 아니다`);
  return v;
}

function numOrNull(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`hardVsSoftLinkScene: payload.${key} 가 수가 아니다`);
  return v;
}

function strOrNull(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`hardVsSoftLinkScene: payload.${key} 가 글자가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!isRecord(p)) throw new Error(`hardVsSoftLinkScene: ${event.type} 의 payload 가 없다`);
  return p;
}

/** 시작 이름의 자취를 새로 세우거나(곧장 찾기) 이어 붙인다(적힌 이름 따라가기). 다른 자취는 그대로 둔다. */
function withTrail(
  trails: readonly HardVsSoftLinkTrail[],
  start: string,
  hops: HardVsSoftLinkHop[],
  fresh: boolean,
): HardVsSoftLinkTrail[] {
  const at = trails.findIndex((tr) => tr.start === start);
  if (fresh) {
    const next: HardVsSoftLinkTrail = { start, hops };
    if (at < 0) return [...trails.map(copyTrail), next];
    return trails.map((tr, i) => (i === at ? next : copyTrail(tr)));
  }
  if (at < 0) throw new Error(`hardVsSoftLinkScene: ${start} 의 자취 없이 따라가기가 왔다`);
  return trails.map((tr, i) => (i === at ? { start, hops: [...tr.hops.map(copyHop), ...hops] } : copyTrail(tr)));
}

function copyHop(h: HardVsSoftLinkHop): HardVsSoftLinkHop {
  return { ...h };
}

function copyTrail(tr: HardVsSoftLinkTrail): HardVsSoftLinkTrail {
  return { start: tr.start, hops: tr.hops.map(copyHop) };
}

export const hardVsSoftLinkScene: ScenePlan<HardVsSoftLinkScene> = {
  initial(initialData: unknown): HardVsSoftLinkScene {
    const data = readHardVsSoftLinkData(initialData);
    return {
      dir: data.dir,
      slots: data.entries.map((e) => ({ ...e })),
      inodes: data.inodes.map((n) => ({ ...n })),
      pending: data.unlink,
      entries: data.entries.map((e) => ({ ...e })),
      links: null,
      trails: [],
      step: null,
    };
  },

  reduce(scene: HardVsSoftLinkScene, event: FacetRuntimeEvent): HardVsSoftLinkScene {
    const base = {
      ...scene,
      slots: scene.slots.map((e) => ({ ...e })),
      inodes: scene.inodes.map((n) => ({ ...n })),
      entries: scene.entries.map((e) => ({ ...e })),
      links: scene.links === null ? null : scene.links.map((l) => ({ ...l })),
      trails: scene.trails.map(copyTrail),
    };
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const raw = p.links;
        if (!Array.isArray(raw)) throw new Error('hardVsSoftLinkScene: init.links 가 배열이 아니다');
        const links = raw.map((l) => {
          if (!isRecord(l)) throw new Error('hardVsSoftLinkScene: init.links 칸 모양이 틀렸다');
          return { ino: num(l, 'ino'), n: num(l, 'n') };
        });
        return { ...base, links, step: null };
      }
      case 'reach': {
        const p = payloadOf(event);
        const start = str(p, 'start');
        const name = str(p, 'name');
        const ino = num(p, 'ino');
        const target = strOrNull(p, 'target');
        const via = numOrNull(p, 'via');
        const hops: HardVsSoftLinkHop[] =
          via === null
            ? [{ kind: 'entry', name, ino }]
            : [
                { kind: 'follow', via, name },
                { kind: 'entry', name, ino },
              ];
        return {
          ...base,
          trails: withTrail(base.trails, start, hops, via === null),
          step: { kind: 'reach', start, name, ino, target, follow: via !== null },
        };
      }
      case 'unlink': {
        const p = payloadOf(event);
        const name = str(p, 'name');
        const ino = num(p, 'ino');
        const links = num(p, 'links');
        const wasEntry = base.entries.find((e) => e.name === name);
        need(wasEntry, `지울 항목 ${name} 이 장면에 없다`);
        const was =
          base.links === null ? null : need(base.links.find((l) => l.ino === ino), `inode ${ino} 의 링크 수가 없다`).n;
        return {
          ...base,
          entries: base.entries.filter((e) => e.name !== name),
          links: base.links === null ? null : base.links.map((l) => (l.ino === ino ? { ino, n: links } : l)),
          // 지우기 앞의 찾기 자취는 지운 칸을 지나므로 걷는다. 지운 뒤의 찾기가 새로 긋는다.
          trails: [],
          step: { kind: 'unlink', name, ino, was, links },
        };
      }
      case 'miss': {
        const p = payloadOf(event);
        const start = str(p, 'start');
        const name = str(p, 'name');
        const via = num(p, 'via');
        return {
          ...base,
          trails: withTrail(base.trails, start, [{ kind: 'miss', via, name }], false),
          step: { kind: 'miss', start, name },
        };
      }
      default:
        throw new Error(`hardVsSoftLinkScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
