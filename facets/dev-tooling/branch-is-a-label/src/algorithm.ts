/**
 * branch-is-a-label — 브랜치는 커밋을 담는 가지가 아니라 커밋 하나를 가리키는 이름표다.
 *
 * 처음 커밋 · 이름 · HEAD 에서 시작해 `actions` 를 차례대로 하나씩 일으킨다. 걸음 하나 = 일 하나.
 * 새 커밋의 부모와 옮겨질 이름은 데이터에 적혀 있지 않다 — HEAD 에서 셈한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   name-create  { name: string; commit: string }
 *                HEAD 가 가리키는 이름의 커밋에 새 이름을 붙였다. 커밋 수는 그대로
 *   head-move    { from: string; to: string }
 *                HEAD 가 가리키는 이름을 바꿨다. 어느 이름도 커밋을 바꾸지 않는다
 *   commit       { commit: string; parent: string; name: string; from: string }
 *                새 커밋 `commit` 을 만들었다. 부모 = HEAD 가 가리키는 이름 `name` 의 커밋 `from`.
 *                그 이름 하나만 `from` → `commit` 으로 옮겼다 (`parent` 와 `from` 은 같은 커밋)
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (처음 커밋 · 이름 · HEAD). init 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CommitRecord = { id: string; parents: string[] };
export type NameRecord = { name: string; commit: string };
export type HistoryAction =
  | { kind: 'create-name'; name: string }
  | { kind: 'switch'; name: string }
  | { kind: 'commit'; id: string };

export type BranchIsALabelFacetData = {
  type: 'branch-is-a-label';
  stepMs: number;
  commits: CommitRecord[];
  names: NameRecord[];
  head: string;
  actions: HistoryAction[];
};

/** 이력의 한 때 — 커밋(만든 차례) · 이름(만든 차례) · HEAD 가 가리키는 이름. */
export type HistoryState = {
  commits: { id: string; parent: string | null }[];
  names: NameRecord[];
  head: string;
};

/** 일 하나가 일으킨 것. 이벤트 payload 와 같은 모양. */
export type HistoryChange =
  | { kind: 'name-create'; name: string; commit: string }
  | { kind: 'head-move'; from: string; to: string }
  | { kind: 'commit'; commit: string; parent: string; name: string; from: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`branch-is-a-label: ${path} 는 빈칸 아닌 글이어야 한다`);
  }
  return v;
}

/** initialData 를 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
export function parseHistoryData(raw: unknown): BranchIsALabelFacetData {
  if (!isRecord(raw)) throw new Error('branch-is-a-label: initialData 가 객체가 아니다');
  if (raw.type !== 'branch-is-a-label') {
    throw new Error(`branch-is-a-label: initialData.type 이 ${String(raw.type)} 이다`);
  }
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('branch-is-a-label: initialData.stepMs 는 양수여야 한다');
  }
  if (!Array.isArray(raw.commits)) throw new Error('branch-is-a-label: initialData.commits 가 배열이 아니다');
  const commits: CommitRecord[] = raw.commits.map((c: unknown, i: number) => {
    if (!isRecord(c)) throw new Error(`branch-is-a-label: commits[${i}] 가 객체가 아니다`);
    const id = needString(c.id, `commits[${i}].id`);
    if (!Array.isArray(c.parents)) throw new Error(`branch-is-a-label: commits[${i}].parents 가 배열이 아니다`);
    const parents = c.parents.map((p: unknown, j: number) => needString(p, `commits[${i}].parents[${j}]`));
    return { id, parents };
  });
  if (!Array.isArray(raw.names)) throw new Error('branch-is-a-label: initialData.names 가 배열이 아니다');
  const names: NameRecord[] = raw.names.map((n: unknown, i: number) => {
    if (!isRecord(n)) throw new Error(`branch-is-a-label: names[${i}] 가 객체가 아니다`);
    return { name: needString(n.name, `names[${i}].name`), commit: needString(n.commit, `names[${i}].commit`) };
  });
  const head = needString(raw.head, 'head');
  if (!Array.isArray(raw.actions)) throw new Error('branch-is-a-label: initialData.actions 가 배열이 아니다');
  const actions: HistoryAction[] = raw.actions.map((a: unknown, i: number): HistoryAction => {
    if (!isRecord(a)) throw new Error(`branch-is-a-label: actions[${i}] 가 객체가 아니다`);
    if (a.kind === 'create-name') return { kind: 'create-name', name: needString(a.name, `actions[${i}].name`) };
    if (a.kind === 'switch') return { kind: 'switch', name: needString(a.name, `actions[${i}].name`) };
    if (a.kind === 'commit') return { kind: 'commit', id: needString(a.id, `actions[${i}].id`) };
    throw new Error(`branch-is-a-label: actions[${i}].kind 가 모르는 값 ${String(a.kind)} 이다`);
  });
  return { type: 'branch-is-a-label', stepMs, commits, names, head, actions };
}

/** 처음 커밋 · 이름 · HEAD 를 한 때로 세운다. 병합 커밋 · 없는 부모 · 없는 이름은 던진다. */
export function startState(data: BranchIsALabelFacetData): HistoryState {
  const seen = new Set<string>();
  const commits: HistoryState['commits'] = [];
  for (const c of data.commits) {
    if (seen.has(c.id)) throw new Error(`branch-is-a-label: 커밋 ${c.id} 가 두 번 나온다`);
    if (c.parents.length > 1) throw new Error(`branch-is-a-label: 커밋 ${c.id} 는 부모가 둘 이상이다 — 이 조각은 병합 커밋을 모른다`);
    const parent = c.parents.length === 1 ? c.parents[0] : undefined;
    if (parent !== undefined && !seen.has(parent)) {
      throw new Error(`branch-is-a-label: 커밋 ${c.id} 의 부모 ${parent} 가 앞에 없다`);
    }
    seen.add(c.id);
    commits.push({ id: c.id, parent: parent ?? null });
  }
  const nameSeen = new Set<string>();
  for (const n of data.names) {
    if (nameSeen.has(n.name)) throw new Error(`branch-is-a-label: 이름 ${n.name} 이 두 번 나온다`);
    if (!seen.has(n.commit)) throw new Error(`branch-is-a-label: 이름 ${n.name} 의 커밋 ${n.commit} 가 없다`);
    nameSeen.add(n.name);
  }
  if (!nameSeen.has(data.head)) throw new Error(`branch-is-a-label: HEAD 가 가리키는 이름 ${data.head} 가 없다`);
  return { commits, names: data.names.map((n) => ({ ...n })), head: data.head };
}

/** HEAD 가 가리키는 이름의 커밋. */
export function headCommit(state: HistoryState): string {
  const n = state.names.find((x) => x.name === state.head);
  if (n === undefined) throw new Error(`branch-is-a-label: HEAD 가 가리키는 이름 ${state.head} 가 없다`);
  return n.commit;
}

/** 일 하나를 적용한다. 새 때와 그 일이 일으킨 것을 돌려준다. 앞 때는 고치지 않는다. */
export function applyAction(state: HistoryState, action: HistoryAction): { state: HistoryState; change: HistoryChange } {
  if (action.kind === 'create-name') {
    if (state.names.some((n) => n.name === action.name)) {
      throw new Error(`branch-is-a-label: 이름 ${action.name} 이 이미 있다`);
    }
    const commit = headCommit(state);
    return {
      state: { ...state, commits: state.commits.slice(), names: [...state.names, { name: action.name, commit }] },
      change: { kind: 'name-create', name: action.name, commit },
    };
  }
  if (action.kind === 'switch') {
    if (!state.names.some((n) => n.name === action.name)) {
      throw new Error(`branch-is-a-label: HEAD 를 옮길 이름 ${action.name} 이 없다`);
    }
    return {
      state: { ...state, commits: state.commits.slice(), names: state.names.map((n) => ({ ...n })), head: action.name },
      change: { kind: 'head-move', from: state.head, to: action.name },
    };
  }
  if (state.commits.some((c) => c.id === action.id)) {
    throw new Error(`branch-is-a-label: 커밋 ${action.id} 가 이미 있다`);
  }
  const parent = headCommit(state);
  return {
    state: {
      commits: [...state.commits, { id: action.id, parent }],
      names: state.names.map((n) => (n.name === state.head ? { name: n.name, commit: action.id } : { ...n })),
      head: state.head,
    },
    change: { kind: 'commit', commit: action.id, parent, name: state.head, from: parent },
  };
}

/** 일을 모두 적용한 끝 때 — 그림이 자리를 미리 셈하는 데 쓴다. */
export function finalState(data: BranchIsALabelFacetData): HistoryState {
  let s = startState(data);
  for (const a of data.actions) s = applyAction(s, a).state;
  return s;
}

export async function branchIsALabel(context: FacetContext<BranchIsALabelFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BranchIsALabelFacetData>;
  const data = parseHistoryData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let state = startState(data);
  for (const action of data.actions) {
    // 걸음 0 은 처음 이력이 이미 서 있는 화면이라 첫 일 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const next = applyAction(state, action);
    state = next.state;
    const change = next.change;
    if (change.kind === 'name-create') {
      await ctx.emit({ type: 'name-create', payload: { name: change.name, commit: change.commit } });
    } else if (change.kind === 'head-move') {
      await ctx.emit({ type: 'head-move', payload: { from: change.from, to: change.to } });
    } else {
      await ctx.emit({
        type: 'commit',
        payload: { commit: change.commit, parent: change.parent, name: change.name, from: change.from },
      });
    }
  }
}
