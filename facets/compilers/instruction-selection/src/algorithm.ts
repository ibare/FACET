/**
 * instruction-selection — 명령 선택: 기계가 가진 명령(무늬)이 IR 나무를 덮는 크기.
 *
 * 한 판 = 원래 나무(덮이지 않은 나무)에서 출발해 가장 큰 무늬 먼저(maximal munch)로 끝까지 덮고,
 * 덮은 조각마다 명령 한 줄을 아래 조각부터 낸 뒤 → waitForInput → 받은 손잡이 값으로 다시.
 * 걸음 0 은 늘 덮이지 않은 나무다 (앞 판의 무늬 · 명령을 이어 받지 않는다).
 *
 * 규약 (조각 pattern-to-instruction 과 같다):
 *   · 마디에서 지금 모음에 든 무늬를 덮는 마디가 큰 것부터, 같으면 목록 차례로 맞춰 보고 처음 맞는 것 하나를 고른다
 *   · 고르기는 위에서 아래로 — 고른 무늬의 `e` 자리들을 왼쪽부터 (걸음 차례 = 고른 차례, 전위)
 *   · 명령은 `e` 자리의 명령을 모두 낸 뒤 자기 명령 (아래에서 위로). 새 값 이름은 명령이 나오는 차례로 t1 · t2 …
 *     (`{d}` 가 없는 명령 — store — 은 이름을 받지 않는다)
 *   · 맞는 무늬가 없는 마디는 던진다 · 덮인 마디의 합이 나무의 마디와 다르면 던진다
 *   · 산 값 최대 — 값 v 는 정의 줄 ≤ i < 마지막 읽기 줄에서 산다 (codegen 공통). 읽히지 않는 값은 던진다
 *   · 동률 — 덮는 마디가 같은 무늬 둘이 한 마디에 맞으면 목록 차례가 앞선 것. 이 데이터에서는 걸리지 않는다
 *     (같은 크기로 같은 마디 종류에 맞는 무늬 쌍이 없다 — addi 는 ADD, muli 는 MUL 에만)
 *
 * 이벤트 (모두 await, type 리터럴):
 *   - `round`  { expr: number, isa: number, source: string, nodeCount: number, leafCount: number,
 *                nodes: { path: string, parent: string | null, depth: number, slot: number, label: string }[],
 *                palette: { name: string, shape: string, form: string, size: number, inSet: boolean }[] }
 *              — 걸음 0. 덮이지 않은 나무와 지금 모음의 무늬 목록. (slot = 가로 자리 — 잎은 왼쪽부터 0.., 속 마디는 자식 평균)
 *   - `tile`   { order: number (1 부터), name: string, root: string, size: number, covered: number, nodeCount: number,
 *                covers: string[], edges: [string, string][], holes: string[], skipped: string[] }
 *              — 무늬 하나가 내려앉는다. covered = 지금까지 덮인 마디 합. skipped = 이 마디에서 먼저 맞춰 봤으나 안 맞은 무늬
 *   - `emit`   { lines: { text: string, tile: number }[], instrs: number, temps: number, maxLive: number }
 *              — 냄. lines 는 명령이 나오는 차례(아래 조각부터), tile 은 그 명령을 낸 무늬의 order
 *   - `phase`  { phase: string } — silent
 *
 * phase 어휘 (irs.ts 와 같다):
 *   tile-store · tile-load-offset · tile-load-mem · tile-imm (addi · muli) · tile-reg (add · mul) · tile-name · tile-num · emit
 *
 * 계기:
 *   - `tile-count`  걸음마다 지금까지 내려앉은 무늬 수
 *   - `instr-count` 낸 명령 수 — 냄 걸음에서만 (걸음 0 에 0)
 *   - `max-live`    산 값 최대 — 냄 걸음에서만 (걸음 0 에 0)
 *   판 머리에서 셋 다 0 으로 되돌린다 (누적 채널이라 차이만 보낸다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IsKind = 'STORE' | 'ADD' | 'MUL' | 'MEM' | 'NAME' | 'NUM';

/** IR 나무 마디. NAME 의 val 은 이름, NUM 의 val 은 수, 나머지는 null. */
export type IsNode = { kind: IsKind; val: string | number | null; kids: IsNode[] };

/**
 * 무늬 모양. `hole` 이면 `e` — 따로 덮을 아래 나무. `bind` 가 있으면 무늬가 삼키는 잎(NAME x · NUM k)이고
 * 그 값이 명령 글자의 `{x}` · `{k}` 로 들어간다.
 */
export type PatNode = { hole?: boolean; kind?: IsKind; bind?: 'x' | 'k'; kids?: PatNode[] };

/** 무늬 — `set` 은 이 무늬가 처음 드는 모음(0 기본 · 1 + 즉시값 · 2 + 주소 더하기). form 은 명령 글자 틀. */
export type Pattern = { name: string; set: number; shape: PatNode; form: string };

export type InstructionSelectionData = {
  type: 'instruction-selection';
  stepMs: number;
  /** 명령 모음 사다리 (segments value 와 같다) */
  isaLadder: number[];
  /** 식 사다리 (segments value 와 같다) */
  exprLadder: number[];
  /** 첫 판의 손잡이 값 */
  isa: number;
  expr: number;
  /** 나무 위 한 줄 — 원시 줄 (자료, 번역하지 않는다) */
  sources: string[];
  trees: IsNode[];
  patterns: Pattern[];
};

export type TileResult = {
  name: string;
  root: string;
  size: number;
  covers: string[];
  edges: [string, string][];
  holes: string[];
  skipped: string[];
};

export type LineResult = { text: string; tile: number; def: number | null; uses: number[] };

export type SelectResult = {
  tiles: TileResult[];
  lines: LineResult[];
  instrs: number;
  temps: number;
  maxLive: number;
  nodeCount: number;
};

export type TreeNodeView = { path: string; parent: string | null; depth: number; slot: number; label: string };

/** 마디 글자 — `STORE` · `NAME y` · `NUM 16`. */
export function nodeLabel(n: IsNode): string {
  if (n.kind === 'NAME' || n.kind === 'NUM') {
    if (n.val === null) throw new Error(`${n.kind} 마디에 값이 없다`);
    return `${n.kind} ${n.val}`;
  }
  return n.kind;
}

export function countNodes(n: IsNode): number {
  let c = 1;
  for (const k of n.kids) c += countNodes(k);
  return c;
}

/** 무늬가 덮는 마디 수 = hole 이 아닌 무늬 마디 수. */
export function patternSize(p: PatNode): number {
  if (p.hole === true) return 0;
  let c = 1;
  for (const k of p.kids ?? []) c += patternSize(k);
  return c;
}

/** 무늬 모양 글자 — `MEM(ADD(e, k))` · `NAME x`. */
export function patternShape(p: PatNode): string {
  if (p.hole === true) return 'e';
  if (p.kind === undefined) throw new Error('무늬 마디에 종류가 없다');
  if (p.bind !== undefined) return p.kind === 'NUM' ? 'k' : `${p.kind} ${p.bind}`;
  const kids = p.kids ?? [];
  if (kids.length === 0) return p.kind;
  return `${p.kind}(${kids.map(patternShape).join(', ')})`;
}

/**
 * 나무의 가로 자리 · 깊이 · 글자. 잎은 왼쪽부터 0.. 차례, 속 마디는 자식 자리의 평균.
 * 마디 열쇠는 자리 경로 (`r` 뿌리, 뒤에 붙는 0 · 1 이 왼쪽 · 오른쪽 자식) — 두 식의 나무가 같은 경로를 나눠 가진다.
 */
export function layoutTree(tree: IsNode): { nodes: TreeNodeView[]; leafCount: number } {
  const nodes: TreeNodeView[] = [];
  let leaves = 0;
  const walk = (n: IsNode, path: string, parent: string | null, depth: number): number => {
    const at = nodes.length;
    nodes.push({ path, parent, depth, slot: 0, label: nodeLabel(n) });
    let slot: number;
    if (n.kids.length === 0) {
      slot = leaves;
      leaves += 1;
    } else {
      let sum = 0;
      n.kids.forEach((k, i) => {
        sum += walk(k, `${path}${i}`, path, depth + 1);
      });
      slot = sum / n.kids.length;
    }
    const me = nodes[at];
    if (me === undefined) throw new Error('나무 자리를 잃었다');
    me.slot = slot;
    return slot;
  };
  walk(tree, 'r', null, 0);
  return { nodes, leafCount: leaves };
}

type MatchAcc = { covers: string[]; edges: [string, string][]; holes: { node: IsNode; path: string }[]; binds: Record<string, string | number> };

function matchPattern(p: PatNode, n: IsNode, path: string, acc: MatchAcc): boolean {
  if (p.hole === true) {
    acc.holes.push({ node: n, path });
    return true;
  }
  if (p.kind !== n.kind) return false;
  if (p.bind !== undefined) {
    if (n.kids.length !== 0) return false;
    if (n.val === null) throw new Error(`${n.kind} 잎에 값이 없다`);
    acc.covers.push(path);
    acc.binds[p.bind] = n.val;
    return true;
  }
  const kids = p.kids ?? [];
  if (kids.length !== n.kids.length) return false;
  acc.covers.push(path);
  for (let i = 0; i < kids.length; i += 1) {
    const pk = kids[i];
    const nk = n.kids[i];
    if (pk === undefined || nk === undefined) throw new Error('무늬와 나무의 자식 수가 어긋났다');
    const childPath = `${path}${i}`;
    if (pk.hole !== true) acc.edges.push([path, childPath]);
    if (!matchPattern(pk, nk, childPath, acc)) return false;
  }
  return true;
}

/** 가장 큰 무늬 먼저 — 위에서 고르고 아래부터 낸다. */
export function selectInstructions(tree: IsNode, patterns: Pattern[], isa: number): SelectResult {
  // 지금 모음에 든 무늬 — 덮는 마디가 큰 것부터, 같으면 목록 차례 (sort 는 안정 정렬)
  const ordered = patterns
    .map((p, i) => ({ p, i, size: patternSize(p.shape) }))
    .filter((c) => c.p.set <= isa)
    .sort((a, b) => (b.size - a.size) || (a.i - b.i));
  const tiles: TileResult[] = [];
  const lines: LineResult[] = [];
  let temps = 0;

  const munch = (n: IsNode, path: string): number | null => {
    const skipped: string[] = [];
    let chosen: { p: Pattern; size: number; acc: MatchAcc } | null = null;
    for (const c of ordered) {
      const acc: MatchAcc = { covers: [], edges: [], holes: [], binds: {} };
      if (matchPattern(c.p.shape, n, path, acc)) {
        chosen = { p: c.p, size: c.size, acc };
        break;
      }
      if (c.p.shape.kind === n.kind) skipped.push(c.p.name);
    }
    if (chosen === null) throw new Error(`맞는 무늬가 없다: ${nodeLabel(n)} @ ${path}`);
    const order = tiles.length + 1;
    tiles.push({
      name: chosen.p.name,
      root: path,
      size: chosen.size,
      covers: chosen.acc.covers,
      edges: chosen.acc.edges,
      holes: chosen.acc.holes.map((h) => h.path),
      skipped,
    });
    const holeVals: number[] = [];
    for (const h of chosen.acc.holes) {
      const v = munch(h.node, h.path);
      if (v === null) throw new Error(`값을 내지 않는 무늬가 e 자리에 왔다 @ ${h.path}`);
      holeVals.push(v);
    }
    const form = chosen.p.form;
    let def: number | null = null;
    if (form.includes('{d}')) {
      temps += 1;
      def = temps;
    }
    let text = form;
    if (def !== null) text = text.split('{d}').join(`t${def}`);
    for (const [b, v] of Object.entries(chosen.acc.binds)) text = text.split(`{${b}}`).join(String(v));
    holeVals.forEach((v, i) => {
      text = text.split(`{e${i}}`).join(`t${v}`);
    });
    if (/\{[a-z0-9]+\}/.test(text)) throw new Error(`명령 틀의 자리를 다 채우지 못했다: ${text}`);
    lines.push({ text, tile: order, def, uses: holeVals });
    return def;
  };

  munch(tree, 'r');

  const nodeCount = countNodes(tree);
  const covered = tiles.reduce((s, x) => s + x.size, 0);
  if (covered !== nodeCount) throw new Error(`덮인 마디 ${covered} 가 나무의 마디 ${nodeCount} 와 다르다`);

  // 산 값 최대 — 정의 줄 ≤ i < 마지막 읽기 줄
  const defLine = new Map<number, number>();
  const lastUse = new Map<number, number>();
  lines.forEach((ln, i) => {
    for (const u of ln.uses) lastUse.set(u, i + 1);
    if (ln.def !== null) defLine.set(ln.def, i + 1);
  });
  for (const v of defLine.keys()) if (!lastUse.has(v)) throw new Error(`읽히지 않는 값: t${v}`);
  let maxLive = 0;
  for (let i = 1; i <= lines.length; i += 1) {
    let live = 0;
    for (const [v, d] of defLine) {
      const last = lastUse.get(v);
      if (last === undefined) throw new Error(`읽히지 않는 값: t${v}`);
      if (d <= i && i < last) live += 1;
    }
    maxLive = Math.max(maxLive, live);
  }
  return { tiles, lines, instrs: lines.length, temps, maxLive, nodeCount };
}

/** 명령 틀의 모양 글자 — `load {d}, [{e0}+{k}]` → `load d, [e+k]`. */
export function formShape(form: string): string {
  return form.replace(/\{e[0-9]\}/g, 'e').replace(/\{([dxk])\}/g, '$1');
}

function inLadder(ladder: number[], v: unknown): v is number {
  return typeof v === 'number' && ladder.includes(v);
}

export async function instructionSelectionAlgorithm(
  ctx0: FacetContext<InstructionSelectionData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<InstructionSelectionData>;
  const data = ctx.data;
  if (!inLadder(data.isaLadder, data.isa)) throw new Error(`명령 모음 기본값이 사다리에 없다: ${data.isa}`);
  if (!inLadder(data.exprLadder, data.expr)) throw new Error(`식 기본값이 사다리에 없다: ${data.expr}`);
  let isa = data.isa;
  let expr = data.expr;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { tiles: 0, instrs: 0, live: 0 };
  const setTiles = (v: number) => {
    ctx.metric('tile-count', v - shown.tiles);
    shown.tiles = v;
  };
  const setInstrs = (v: number) => {
    ctx.metric('instr-count', v - shown.instrs);
    shown.instrs = v;
  };
  const setLive = (v: number) => {
    ctx.metric('max-live', v - shown.live);
    shown.live = v;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const tree = data.trees[expr];
      const source = data.sources[expr];
      if (tree === undefined || source === undefined) throw new Error(`식 ${expr} 의 나무가 없다`);
      const res = selectInstructions(tree, data.patterns, isa);
      const layout = layoutTree(tree);

      // 걸음 0 — 덮이지 않은 나무
      setTiles(0);
      setInstrs(0);
      setLive(0);
      await ctx.emit({
        type: 'round',
        payload: {
          expr,
          isa,
          source,
          nodeCount: res.nodeCount,
          leafCount: layout.leafCount,
          nodes: layout.nodes,
          palette: data.patterns.map((p) => ({
            name: p.name,
            shape: patternShape(p.shape),
            form: formShape(p.form),
            size: patternSize(p.shape),
            inSet: p.set <= isa,
          })),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      // 고르기 — 무늬 하나가 한 걸음
      let covered = 0;
      for (let i = 0; i < res.tiles.length; i += 1) {
        if (ctx.cancelled) return;
        const tile = res.tiles[i];
        if (tile === undefined) throw new Error('무늬 차례를 잃었다');
        switch (tile.name) {
          case 'store':
            await phase('tile-store');
            break;
          case 'load-offset':
            await phase('tile-load-offset');
            break;
          case 'load-mem':
            await phase('tile-load-mem');
            break;
          case 'addi':
          case 'muli':
            await phase('tile-imm');
            break;
          case 'add':
          case 'mul':
            await phase('tile-reg');
            break;
          case 'load-name':
            await phase('tile-name');
            break;
          case 'li':
            await phase('tile-num');
            break;
          default:
            throw new Error(`phase 를 모르는 무늬: ${tile.name}`);
        }
        covered += tile.size;
        await ctx.emit({
          type: 'tile',
          payload: {
            order: i + 1,
            name: tile.name,
            root: tile.root,
            size: tile.size,
            covered,
            nodeCount: res.nodeCount,
            covers: tile.covers,
            edges: tile.edges,
            holes: tile.holes,
            skipped: tile.skipped,
          },
        });
        setTiles(i + 1);
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      // 냄 — 아래 조각부터 명령 한 줄씩
      if (ctx.cancelled) return;
      await phase('emit');
      await ctx.emit({
        type: 'emit',
        payload: {
          lines: res.lines.map((l) => ({ text: l.text, tile: l.tile })),
          instrs: res.instrs,
          temps: res.temps,
          maxLive: res.maxLive,
        },
      });
      setInstrs(res.instrs);
      setLive(res.maxLive);

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const v = typeof p === 'object' && p !== null && 'value' in p ? (p as { value: unknown }).value : undefined;
        if (input.type === 'isa') {
          if (!inLadder(data.isaLadder, v)) continue;
          isa = v;
          break;
        }
        if (input.type === 'expr') {
          if (!inLadder(data.exprLadder, v)) continue;
          expr = v;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
