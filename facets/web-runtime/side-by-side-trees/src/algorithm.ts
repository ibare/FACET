/**
 * side-by-side-trees — 이벤트
 *
 * 'compare' — payload: { path: string; nodeType: string; changes: { prop: string; from: string; to: string }[] }
 *   옛 트리와 새 트리의 같은 자리(전위 차례) 노드 한 쌍을 견준 결과.
 *   changes 가 비어 있으면 그대로 지나간 것, 채워져 있으면 그 속성들이 이 걸음에
 *   곧바로 실제 트리에 반영된 것이다 (커밋 단계를 따로 두지 않는다). silent 아님.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 가상 노드. props 는 (이름, 값) 목록 — 적힌 차례가 곧 견주는 차례. */
export type TreeNode = {
  type: string;
  props: [string, string][];
  children: TreeNode[];
};

export type SideBySideTreesFacetData = {
  type: 'side-by-side-trees';
  oldTree: TreeNode;
  newTree: TreeNode;
  stepMs: number;
};

type PropChange = { prop: string; from: string; to: string };

/** 옛 속성 차례 + 새 속성 중 옛에 없던 것 차례로 견준다 (patch_props 와 같은 규약). */
function diffProps(oldProps: [string, string][], newProps: [string, string][]): PropChange[] {
  const oldMap = new Map(oldProps);
  const newMap = new Map(newProps);
  const names: string[] = [];
  for (const [k] of oldProps) names.push(k);
  for (const [k] of newProps) if (!oldMap.has(k)) names.push(k);

  const out: PropChange[] = [];
  for (const name of names) {
    const from = oldMap.get(name);
    const to = newMap.get(name);
    if (from === undefined || to === undefined) {
      // 이 조각의 데이터에는 지움·더함이 없다 (common.md) — 있다면 사양이 틀렸다.
      throw new Error(`side-by-side-trees: '${name}' 이 옛/새 어느 한쪽에만 있다 — 이 조각의 데이터에는 없어야 한다`);
    }
    if (from !== to) out.push({ prop: name, from, to });
  }
  return out;
}

export async function sideBySideTrees(ctx: FacetContext<SideBySideTreesFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<SideBySideTreesFacetData>;
  const { oldTree, newTree, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  async function walk(old: TreeNode, next: TreeNode, path: string): Promise<void> {
    if (rc.cancelled) return;
    if (old.type !== next.type) {
      throw new Error(`side-by-side-trees: ${path} 자리의 종류가 다르다 (${old.type}/${next.type}) — 이 조각의 데이터에는 없어야 한다`);
    }
    if (old.children.length !== next.children.length) {
      throw new Error(`side-by-side-trees: ${path} 자리의 자식 수가 다르다 — 이 조각의 데이터에는 없어야 한다`);
    }
    const changes = diffProps(old.props, next.props);
    await ctx.emit({ type: 'compare', target: `tree:${path}`, payload: { path, nodeType: old.type, changes } });
    if (!(await pause())) return;
    for (let i = 0; i < old.children.length; i += 1) {
      if (rc.cancelled) return;
      await walk(old.children[i]!, next.children[i]!, `${path}/${i}`);
    }
  }

  // 걸음 0(옛 트리·새 트리·실제 트리가 이미 나란히 보이는 화면)이 이미 읽을 것이 있는
  // 화면이라, 첫 발신 앞에 stepMs 만큼 두어 읽을 틈을 준다.
  if (!(await pause())) return;
  await walk(oldTree, newTree, '0');
}
