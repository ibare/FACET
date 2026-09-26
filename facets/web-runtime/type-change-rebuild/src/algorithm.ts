/**
 * 이벤트 (silent 없음)
 * - compare      { path, oldType, newType, same, n } — 같은 자리 한 쌍(전위 차례)을 견준다.
 * - removeBranch { path, removed: { path, type }[], n } — 종류가 달라 옛 가지를 통째로 지운다 (한 걸음).
 * - create       { path, type, props, n } — 새 가지의 노드 하나를 전위 차례로 만든다.
 *
 * `n` 은 이 이벤트까지의 누적치 { compare, patch, create, remove }. 이 조각의 데이터에서는
 * 속성이 늘 같아 patch 가 0 에서 움직이지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TreeNode = {
  type: string;
  props?: [string, string][];
  children?: TreeNode[];
};

export type TypeChangeRebuildFacetData = {
  type: 'typeChangeRebuild';
  stepMs: number;
  oldTree: TreeNode;
  newTree: TreeNode;
};

type Counts = { compare: number; patch: number; create: number; remove: number };

function subtreePreorder(v: TreeNode, path: string, acc: { path: string; type: string }[]): void {
  acc.push({ path, type: v.type });
  const kids = v.children ?? [];
  for (let i = 0; i < kids.length; i += 1) subtreePreorder(kids[i]!, `${path}/${i}`, acc);
}

export async function typeChangeRebuild(ctx: FacetContext<TypeChangeRebuildFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<TypeChangeRebuildFacetData>;
  const { stepMs, oldTree, newTree } = rctx.data;
  const n: Counts = { compare: 0, patch: 0, create: 0, remove: 0 };

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  async function createEach(v: TreeNode, path: string): Promise<boolean> {
    n.create += 1;
    await ctx.emit({ type: 'create', payload: { path, type: v.type, props: v.props ?? [], n: { ...n } } });
    if (!(await pause())) return false;
    const kids = v.children ?? [];
    for (let i = 0; i < kids.length; i += 1) {
      if (rctx.cancelled) return false;
      if (!(await createEach(kids[i]!, `${path}/${i}`))) return false;
    }
    return true;
  }

  async function removeAt(v: TreeNode, path: string): Promise<boolean> {
    const removed: { path: string; type: string }[] = [];
    subtreePreorder(v, path, removed);
    n.remove += removed.length;
    await ctx.emit({ type: 'removeBranch', payload: { path, removed, n: { ...n } } });
    return pause();
  }

  async function diff(old: TreeNode, next: TreeNode, path: string): Promise<boolean> {
    n.compare += 1;
    const same = old.type === next.type;
    await ctx.emit({ type: 'compare', payload: { path, oldType: old.type, newType: next.type, same, n: { ...n } } });
    if (!(await pause())) return false;
    if (!same) {
      if (!(await removeAt(old, path))) return false;
      return createEach(next, path);
    }
    const oldKids = old.children ?? [];
    const newKids = next.children ?? [];
    const count = Math.max(oldKids.length, newKids.length);
    for (let i = 0; i < count; i += 1) {
      if (rctx.cancelled) return false;
      const childPath = `${path}/${i}`;
      if (i < oldKids.length && i < newKids.length) {
        if (!(await diff(oldKids[i]!, newKids[i]!, childPath))) return false;
      } else if (i < newKids.length) {
        if (!(await createEach(newKids[i]!, childPath))) return false;
      } else if (!(await removeAt(oldKids[i]!, childPath))) {
        return false;
      }
    }
    return true;
  }

  // 걸음 0(마운트)이 이미 옛 트리 전체를 보여 준다 — 첫 발신 앞에 stepMs 를 두어 읽을 틈을 준다.
  if (!(await pause())) return;
  await diff(oldTree, newTree, '0');
  // 끝 화면(끝까지 남은 것 · 새로 자란 것)도 같은 만큼 읽을 틈을 준다.
  await pause();
}
