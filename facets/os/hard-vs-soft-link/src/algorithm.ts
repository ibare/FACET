/**
 * hardVsSoftLink — 한 디렉터리 안에서 하드 링크와 심볼릭 링크가 원래 이름을 지운 뒤 갈라지는 것.
 *
 * 규약 (사양 그대로):
 * - 링크 수 = 디렉터리 항목 가운데 그 inode 번호를 가진 수. 데이터로 두지 않고 셈한다.
 * - 찾기: 이름으로 항목을 얻고, 그 inode 가 심볼릭 링크면 적힌 이름으로 **같은 디렉터리에서** 다시 찾는다.
 * - 차례: 지우기 전에 probe 차례대로 찾기 → unlink 이름 지우기 → 지운 뒤에 probe 차례대로 찾기.
 * - 한 걸음 = 이름 하나로 inode 하나에 닿는 일 (심볼릭 링크는 링크 inode 에 닿는 걸음과 적힌 이름을 찾는 걸음, 둘) ·
 *   지우기 한 걸음. 지우기는 항목만 없앤다 — inode 는 남는다.
 * - 고리 · 처음 찾는 이름이 없음 · 없는 inode 번호 · 모르는 종류는 던진다.
 *
 * 이벤트:
 * - `init` (silent) — payload `{ links: { ino: number; n: number }[] }` inode 마다 링크 수. 걸음 0 을 갈아 끼운다
 * - `reach` — payload `{ start: string; name: string; ino: number; kind: 'file' | 'symlink'; target: string | null; via: number | null }`
 *   `start` 는 찾기를 시작한 이름, `via` 는 적힌 이름을 따라왔을 때 그 심볼릭 링크의 inode 번호 (곧장 찾았으면 null),
 *   `target` 은 심볼릭 링크에 적힌 이름 (보통 파일이면 null)
 * - `unlink` — payload `{ name: string; ino: number; links: number }` 지운 항목과, 지운 뒤 그 inode 의 링크 수
 * - `miss` — payload `{ start: string; name: string; via: number }` 적힌 이름을 다시 찾았으나 항목이 없다 (끊김)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HardVsSoftLinkEntry = { name: string; ino: number };
export type HardVsSoftLinkInode =
  | { ino: number; kind: 'file' }
  | { ino: number; kind: 'symlink'; target: string };

export type HardVsSoftLinkFacetData = {
  type: 'hard-vs-soft-link';
  stepMs: number;
  /** 디렉터리 이름 (자료 — 번역하지 않는다) */
  dir: string;
  /** 디렉터리 항목. 적힌 차례 */
  entries: HardVsSoftLinkEntry[];
  inodes: HardVsSoftLinkInode[];
  /** 지우기 앞뒤로 찾아볼 이름의 차례 */
  probe: string[];
  /** 지울 이름 */
  unlink: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 자료를 좁힌다. 모르는 모양은 던진다. 장면도 같은 좁히개를 쓴다. */
export function readHardVsSoftLinkData(raw: unknown): HardVsSoftLinkFacetData {
  if (!isRecord(raw)) throw new Error('hard-vs-soft-link: initialData 가 객체가 아니다');
  const { stepMs, dir, entries, inodes, probe, unlink } = raw;
  if (raw.type !== 'hard-vs-soft-link') throw new Error('hard-vs-soft-link: type 이 다르다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('hard-vs-soft-link: stepMs 가 없다');
  if (typeof dir !== 'string' || dir === '') throw new Error('hard-vs-soft-link: dir 이 없다');
  if (!Array.isArray(entries)) throw new Error('hard-vs-soft-link: entries 가 배열이 아니다');
  if (!Array.isArray(inodes)) throw new Error('hard-vs-soft-link: inodes 가 배열이 아니다');
  if (!Array.isArray(probe)) throw new Error('hard-vs-soft-link: probe 가 배열이 아니다');
  if (typeof unlink !== 'string') throw new Error('hard-vs-soft-link: unlink 가 없다');
  const outEntries: HardVsSoftLinkEntry[] = entries.map((e, i) => {
    if (!isRecord(e) || typeof e.name !== 'string' || typeof e.ino !== 'number') {
      throw new Error(`hard-vs-soft-link: entries[${i}] 모양이 틀렸다`);
    }
    return { name: e.name, ino: e.ino };
  });
  const outInodes: HardVsSoftLinkInode[] = inodes.map((n, i) => {
    if (!isRecord(n) || typeof n.ino !== 'number') throw new Error(`hard-vs-soft-link: inodes[${i}] 모양이 틀렸다`);
    if (n.kind === 'file') return { ino: n.ino, kind: 'file' };
    if (n.kind === 'symlink') {
      if (typeof n.target !== 'string') throw new Error(`hard-vs-soft-link: inodes[${i}] 에 적힌 이름이 없다`);
      return { ino: n.ino, kind: 'symlink', target: n.target };
    }
    throw new Error(`hard-vs-soft-link: inodes[${i}] 의 종류를 모른다`);
  });
  const outProbe = probe.map((p, i) => {
    if (typeof p !== 'string') throw new Error(`hard-vs-soft-link: probe[${i}] 가 이름이 아니다`);
    return p;
  });
  return { type: 'hard-vs-soft-link', stepMs, dir, entries: outEntries, inodes: outInodes, probe: outProbe, unlink };
}

/** 링크 수 — 항목 가운데 그 번호를 가진 수. */
function linkCount(entries: readonly HardVsSoftLinkEntry[], ino: number): number {
  let n = 0;
  for (const e of entries) {
    if (e.ino === ino) n += 1;
  }
  return n;
}

export async function hardVsSoftLink(ctx: FacetContext<HardVsSoftLinkFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HardVsSoftLinkFacetData>;
  const data = readHardVsSoftLinkData(ctx.data);
  const entries = data.entries.map((e) => ({ ...e }));
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  function inodeOf(ino: number): HardVsSoftLinkInode {
    const node = data.inodes.find((n) => n.ino === ino);
    if (node === undefined) throw new Error(`hard-vs-soft-link: inode ${ino} 이 없다`);
    return node;
  }

  /** start 로 찾기를 시작해 보통 파일에 닿거나 끊길 때까지. 걸음마다 쉰다. false 면 취소. */
  async function resolve(start: string): Promise<boolean> {
    let name = start;
    let via: number | null = null;
    const seen = new Set<string>();
    for (;;) {
      if (rctx.cancelled) return false;
      if (seen.has(name)) throw new Error(`hard-vs-soft-link: ${start} 를 찾다 고리를 만났다`);
      seen.add(name);
      const entry = entries.find((e) => e.name === name);
      if (entry === undefined) {
        if (via === null) throw new Error(`hard-vs-soft-link: 처음 찾는 이름 ${name} 이 디렉터리에 없다`);
        await ctx.emit({ type: 'miss', payload: { start, name, via } });
        return pause();
      }
      const node = inodeOf(entry.ino);
      if (node.kind === 'file') {
        await ctx.emit({
          type: 'reach',
          payload: { start, name, ino: entry.ino, kind: 'file', target: null, via },
        });
        return pause();
      }
      await ctx.emit({
        type: 'reach',
        payload: { start, name, ino: entry.ino, kind: 'symlink', target: node.target, via },
      });
      if (!(await pause())) return false;
      via = entry.ino;
      name = node.target;
    }
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { links: data.inodes.map((n) => ({ ino: n.ino, n: linkCount(entries, n.ino) })) },
  });
  // 걸음 0 은 이미 읽을 것이 있는 화면(디렉터리와 inode)이라 첫 걸음 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;

  for (const name of data.probe) {
    if (!(await resolve(name))) return;
  }

  const at = entries.findIndex((e) => e.name === data.unlink);
  if (at < 0) throw new Error(`hard-vs-soft-link: 지울 이름 ${data.unlink} 이 없다`);
  const removed = entries[at];
  if (removed === undefined) throw new Error('hard-vs-soft-link: 지울 항목을 읽지 못했다');
  entries.splice(at, 1);
  await ctx.emit({
    type: 'unlink',
    payload: { name: removed.name, ino: removed.ino, links: linkCount(entries, removed.ino) },
  });
  if (!(await pause())) return;

  for (const name of data.probe) {
    if (!(await resolve(name))) return;
  }
}
