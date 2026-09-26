/**
 * 병합과 리베이스 — 커밋 줄기 무대.
 *
 * 두 줄(main 쪽 · feature 쪽)에 커밋을 놓고 부모 쪽으로 화살을 긋는다. 새로 생기는 커밋은 운동으로 들어온다 —
 * 병합 커밋은 부모 선 둘을 끌고 **솟고**, 다시 놓은 커밋은 옛 자리에서 main 끝 너머로 **건너가며** 해시 글자가
 * 한 자씩 새 값으로 바뀐다. 이름표는 지나는 커밋을 차례로 밟으며 **미끄러진다**. 판이 바뀌면 앞 판에서 새로 생긴
 * 커밋은 나왔던 자리로 되돌아가 사라지고, main 줄기는 손잡이 값만큼 늘거나 줄어든다.
 *
 * 무대는 셈하지 않는다 — 해시 · 자리(줄 · 칸) · 갈라진 자리 · 이름 잃은 커밋은 모두 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type RvmRow = 'main' | 'feature';
export type RvmLabelName = 'main' | 'feature';

export type RvmCommit = {
  id: string;
  change: string;
  hash: string;
  parents: string[];
  row: RvmRow;
  col: number;
};

export type RvmBoard = {
  ahead: number;
  commits: RvmCommit[];
  labels: { main: string; feature: string };
  names: { main: string; feature: string };
};

export type RvmFork = {
  at: string;
  mainSide: number;
  featureSide: number;
  mainIsAncestor: boolean;
  /** 리베이스 길인가 — main 이 조상일 때 "다시 놓을 것 없음" 과 "조상" 을 가른다 */
  rebasing: boolean;
  replay: string[];
};

export type RvmMerge = RvmCommit & { parentHashes: string[] };

export type RvmReplay = {
  from: string;
  id: string;
  change: string;
  oldHash: string;
  hash: string;
  oldParent: string;
  parent: string;
  oldParentHash: string;
  parentHash: string;
  row: RvmRow;
  col: number;
};

export type RvmMoveLabel = {
  name: RvmLabelName;
  from: string;
  to: string;
  path: string[];
  kind: 'advance' | 'fast-forward' | 'move';
  unreachable: string[];
};

/** projector 가 부르는 표면 */
export type RebaseVsMergeStage = {
  board(p: RvmBoard, ms: number): Promise<void>;
  fork(p: RvmFork, ms: number): Promise<void>;
  mergeCommit(p: RvmMerge, ms: number): Promise<void>;
  replay(p: RvmReplay, ms: number): Promise<void>;
  moveLabel(p: RvmMoveLabel, ms: number): Promise<void>;
  clear(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 320;
const X0 = 56;
const COL = 96;
const ROW_Y: Record<RvmRow, number> = { main: 124, feature: 240 };
const R = 15;
const TAG_H = 18;
const PANEL_X = 578;
const PANEL_Y = 44;
const PANEL_W = 136;
const HASH_LEN = 7;

type NodeState = {
  id: string;
  change: string;
  hash: string;
  parents: string[];
  x: number;
  y: number;
  scale: number;
  dim: boolean;
  fresh: boolean;
  /** 사라질 때 돌아갈 자리 — 다시 놓은 커밋은 옛 커밋 자리, 병합 커밋은 아래, 줄기 끝은 부모 자리 */
  home: { x: number; y: number } | null;
  g: SVGGElement;
  circle: SVGCircleElement;
  hashText: SVGTextElement;
};

type TagState = {
  name: RvmLabelName;
  target: string;
  x: number;
  y: number;
  g: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

function colX(col: number): number {
  return X0 + col * COL;
}

function tagPos(name: RvmLabelName, node: { x: number; y: number }): { x: number; y: number } {
  return name === 'main' ? { x: node.x, y: node.y - 48 } : { x: node.x, y: node.y + 52 };
}

/** 해시 글자를 앞에서부터 p 만큼 새 값으로 바꾼다 */
function rollHash(from: string, to: string, p: number): string {
  const k = Math.round(p * to.length);
  return to.slice(0, k) + from.slice(k, to.length);
}

function changeName(t: Translate, change: string): string {
  switch (change) {
    case 'init':
      return t('label.init', 'first commit');
    case 'add-login':
      return t('label.add-login', 'add login');
    case 'add-db':
      return t('label.add-db', 'add DB');
    case 'add-cache':
      return t('label.add-cache', 'add cache');
    case 'add-button':
      return t('label.add-button', 'add button');
    case 'fix-color':
      return t('label.fix-color', 'fix color');
    case 'merge-feature':
      return t('label.merge-feature', 'join feature');
    default:
      throw new Error(`rebase-vs-merge-stage: 이름 없는 변경 식별자 '${change}'`);
  }
}

function mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
  void container;
  const t = params.t ?? makeTranslator(params.locale);
  const c: Palette = getColors(params.theme);
  const isInstant = params.isInstant ?? (() => false);
  const svg = params.canvas;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const smPx = parseFloat(fontSizes.sm);
  const xsPx = parseFloat(fontSizes.xs);

  const caption = el('text', { x: 16, y: 26, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text });
  const edgeLayer = el('g');
  const ringLayer = el('g');
  const nodeLayer = el('g');
  const tagLayer = el('g');
  const panel = el('g', { transform: `translate(${PANEL_X},${PANEL_Y})`, visibility: 'hidden' });
  const panelBox = el('rect', { x: 0, y: 0, width: PANEL_W, height: 92, rx: 6, fill: c.bgSubtle, stroke: c.border });
  const panelTitle = el('text', { x: 10, y: 18, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
  const panelLines = [0, 1, 2].map((i) =>
    el('text', { x: 10, y: 40 + i * 18, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text }),
  );
  panel.append(panelBox, panelTitle, ...panelLines);
  svg.append(caption, edgeLayer, ringLayer, nodeLayer, tagLayer, panel);

  const nodes = new Map<string, NodeState>();
  const edges = new Map<string, { line: SVGLineElement; head: SVGPolygonElement }>();
  const tags = new Map<RvmLabelName, TagState>();
  let names: { main: string; feature: string } | null = null;
  let ring: SVGCircleElement | null = null;

  // ── 운동
  const jobs = new Set<{ finish(draw: boolean): void }>();
  let destroyed = false;
  const raf = (fn: () => void): number =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : (setTimeout(fn, 16) as unknown as number);
  const unraf = (id: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  };
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function tween(ms: number, draw: (p: number) => void): Promise<void> {
    if (destroyed || isInstant() || ms <= 0) {
      draw(1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const start = now();
      let frame = 0;
      const job = {
        finish(doDraw: boolean): void {
          unraf(frame);
          jobs.delete(job);
          if (doDraw) draw(1);
          resolve();
        },
      };
      const tick = (): void => {
        const p = Math.min(1, (now() - start) / ms);
        draw(ease(p));
        if (p >= 1) {
          jobs.delete(job);
          resolve();
        } else frame = raf(tick);
      };
      jobs.add(job);
      frame = raf(tick);
    });
  }
  params.onScrubStart?.(() => {
    for (const j of [...jobs]) j.finish(true);
  });

  // ── 그리기
  function need(id: string, where: string): NodeState {
    const n = nodes.get(id);
    if (!n) throw new Error(`rebase-vs-merge-stage: ${where} — 화면에 없는 커밋 '${id}'`);
    return n;
  }

  function placeNode(n: NodeState): void {
    n.g.setAttribute('transform', `translate(${n.x},${n.y}) scale(${n.scale})`);
    n.g.setAttribute('opacity', n.dim ? '0.35' : '1');
    n.circle.setAttribute('stroke-dasharray', n.dim ? '3 3' : 'none');
  }

  function makeNode(commit: { id: string; change: string; hash: string; parents: string[] }, fresh: boolean, at: { x: number; y: number }): NodeState {
    const g = el('g');
    const stroke = fresh ? c.primary : c.text;
    const circle = el('circle', { r: R, fill: c.bg, stroke, 'stroke-width': fresh ? 2.5 : 1.5 });
    const letter = el('text', {
      'text-anchor': 'middle',
      y: smPx * 0.36,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': 700,
      fill: fresh ? c.primary : c.text,
    });
    letter.textContent = commit.id;
    const change = el('text', { 'text-anchor': 'middle', y: -R - 8, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
    change.textContent = changeName(t, commit.change);
    const hashText = el('text', { 'text-anchor': 'middle', y: R + 6 + xsPx, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: fresh ? c.primary : c.text });
    hashText.textContent = commit.hash;
    g.append(circle, letter, change, hashText);
    nodeLayer.append(g);
    const n: NodeState = {
      id: commit.id,
      change: commit.change,
      hash: commit.hash,
      parents: [...commit.parents],
      x: at.x,
      y: at.y,
      scale: 1,
      dim: false,
      fresh,
      home: null,
      g,
      circle,
      hashText,
    };
    nodes.set(n.id, n);
    placeNode(n);
    return n;
  }

  function removeNode(id: string): void {
    const n = nodes.get(id);
    if (!n) return;
    n.g.remove();
    nodes.delete(id);
  }

  /** 모든 화살을 지금 자리로 다시 긋는다 — 자식 → 부모 */
  function drawEdges(): void {
    const live = new Set<string>();
    for (const n of nodes.values()) {
      n.parents.forEach((pid, i) => {
        const parent = nodes.get(pid);
        if (!parent) throw new Error(`rebase-vs-merge-stage: 커밋 '${n.id}' 의 부모 '${pid}' 가 화면에 없다`);
        const key = `${n.id}>${pid}>${i}`;
        live.add(key);
        let e = edges.get(key);
        if (!e) {
          e = { line: el('line', { 'stroke-width': 1.5 }), head: el('polygon') };
          edgeLayer.append(e.line, e.head);
          edges.set(key, e);
        }
        const color = n.fresh ? c.primary : c.textMuted;
        const dx = parent.x - n.x;
        const dy = parent.y - n.y;
        const len = Math.hypot(dx, dy);
        const opacity = Math.min(n.scale, 1) * (n.dim ? 0.35 : 1);
        if (len < 2 * R + 6) {
          e.line.setAttribute('opacity', '0');
          e.head.setAttribute('opacity', '0');
          return;
        }
        const ux = dx / len;
        const uy = dy / len;
        const sx = n.x + ux * R * n.scale;
        const sy = n.y + uy * R * n.scale;
        const ex = parent.x - ux * (R * parent.scale + 2);
        const ey = parent.y - uy * (R * parent.scale + 2);
        const bx = ex - ux * 8;
        const by = ey - uy * 8;
        e.line.setAttribute('x1', String(sx));
        e.line.setAttribute('y1', String(sy));
        e.line.setAttribute('x2', String(bx));
        e.line.setAttribute('y2', String(by));
        e.line.setAttribute('stroke', color);
        e.line.setAttribute('opacity', String(opacity));
        e.line.setAttribute('stroke-dasharray', n.dim ? '3 3' : 'none');
        e.head.setAttribute('points', `${ex},${ey} ${bx - uy * 4},${by + ux * 4} ${bx + uy * 4},${by - ux * 4}`);
        e.head.setAttribute('fill', color);
        e.head.setAttribute('opacity', String(opacity));
      });
    }
    for (const [key, e] of edges) {
      if (live.has(key)) continue;
      e.line.remove();
      e.head.remove();
      edges.delete(key);
    }
  }

  function makeTag(name: RvmLabelName): TagState {
    if (!names) throw new Error('rebase-vs-merge-stage: 이름표 이름을 받기 전에 이름표를 그린다');
    const g = el('g');
    const label = names[name];
    const width = label.length * smPx * 0.62 + 16;
    const main = name === 'main';
    const rect = el('rect', {
      x: -width / 2,
      y: -TAG_H / 2,
      width,
      height: TAG_H,
      rx: TAG_H / 2,
      fill: main ? c.text : c.bg,
      stroke: c.text,
      'stroke-width': 1.5,
    });
    const text = el('text', {
      'text-anchor': 'middle',
      y: smPx * 0.36,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: main ? c.bg : c.text,
    });
    text.textContent = label;
    g.append(rect, text);
    tagLayer.append(g);
    const tag: TagState = { name, target: '', x: 0, y: 0, g, rect, text };
    tags.set(name, tag);
    return tag;
  }

  function placeTag(tag: TagState): void {
    tag.g.setAttribute('transform', `translate(${tag.x},${tag.y})`);
  }

  function setPanel(id: string | null, lines: { text: string; struck: boolean }[]): void {
    if (id === null) {
      panel.setAttribute('visibility', 'hidden');
      return;
    }
    panelTitle.textContent = t('label.hashInput', 'Hash input · {id}', { id });
    panelLines.forEach((line, i) => {
      const src = lines[i];
      line.textContent = src ? src.text : '';
      line.setAttribute('fill', src?.struck ? c.textMuted : c.text);
      line.setAttribute('text-decoration', src?.struck ? 'line-through' : 'none');
    });
    panel.setAttribute('visibility', 'visible');
  }

  function clearRing(): void {
    if (ring) ring.remove();
    ring = null;
  }

  // ── 표면
  const stage: RebaseVsMergeStage = {
    async board(p, ms) {
      names = { main: p.names.main, feature: p.names.feature };
      clearRing();
      setPanel(null, []);
      caption.textContent = t('caption.start', 'Start · commits: {n}', { n: p.commits.length });

      // 이 판의 커밋 — 자리는 payload 가 준다
      const want = new Map(p.commits.map((cm) => [cm.id, cm]));
      const moves: { n: NodeState; from: { x: number; y: number; s: number }; to: { x: number; y: number; s: number } }[] = [];
      const leaving: NodeState[] = [];
      for (const n of nodes.values()) {
        if (want.has(n.id)) continue;
        // 앞 판에서 새로 생긴 커밋 · 이 판에 없는 줄기 끝 — 나왔던 자리로 되돌아가며 사라진다
        const parent = n.parents[0] !== undefined ? nodes.get(n.parents[0]) : undefined;
        const home = n.home ?? (parent && want.has(parent.id) ? { x: parent.x, y: parent.y } : { x: n.x, y: n.y + 40 });
        moves.push({ n, from: { x: n.x, y: n.y, s: n.scale }, to: { x: home.x, y: home.y, s: 0.2 } });
        leaving.push(n);
      }
      for (const cm of p.commits) {
        const to = { x: colX(cm.col), y: ROW_Y[cm.row], s: 1 };
        let n = nodes.get(cm.id);
        if (!n) {
          const parent = cm.parents[0] !== undefined ? nodes.get(cm.parents[0]) : undefined;
          const start = parent ? { x: parent.x, y: parent.y } : { x: to.x, y: to.y };
          n = makeNode(cm, false, start);
          n.scale = 0.2;
        } else {
          n.hash = cm.hash;
          n.hashText.textContent = cm.hash;
          n.parents = [...cm.parents];
        }
        n.dim = false;
        n.home = null;
        moves.push({ n, from: { x: n.x, y: n.y, s: n.scale }, to });
      }

      const tagMoves: { tag: TagState; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
      for (const name of ['main', 'feature'] as const) {
        const target = p.labels[name];
        const cm = want.get(target);
        if (!cm) throw new Error(`rebase-vs-merge-stage: 이름표 ${name} 가 이 판에 없는 커밋 '${target}' 를 가리킨다`);
        const to = tagPos(name, { x: colX(cm.col), y: ROW_Y[cm.row] });
        let tag = tags.get(name);
        if (!tag) {
          tag = makeTag(name);
          tag.x = to.x;
          tag.y = to.y;
        }
        tag.target = target;
        tagMoves.push({ tag, from: { x: tag.x, y: tag.y }, to });
      }

      await tween(ms, (k) => {
        for (const m of moves) {
          m.n.x = lerp(m.from.x, m.to.x, k);
          m.n.y = lerp(m.from.y, m.to.y, k);
          m.n.scale = lerp(m.from.s, m.to.s, k);
          placeNode(m.n);
        }
        for (const m of tagMoves) {
          m.tag.x = lerp(m.from.x, m.to.x, k);
          m.tag.y = lerp(m.from.y, m.to.y, k);
          placeTag(m.tag);
        }
        drawEdges();
      });
      for (const n of leaving) removeNode(n.id);
      drawEdges();
    },

    async fork(p, ms) {
      if (!names) throw new Error('rebase-vs-merge-stage: 처음 걸음 없이 갈라진 자리가 왔다');
      const at = need(p.at, '갈라진 자리');
      const vars = { at: p.at, mainName: names.main, featureName: names.feature, m: p.mainSide, f: p.featureSide, list: p.replay.join(' ') };
      if (p.mainIsAncestor && p.rebasing) {
        caption.textContent = t('caption.forkNothing', 'Parted at {at} = tip of {mainName} · nothing to replay', vars);
      } else if (p.mainIsAncestor) {
        caption.textContent = t('caption.forkAncestor', 'Parted at {at} = tip of {mainName} · {mainName} is an ancestor of {featureName}', vars);
      } else if (p.replay.length > 0) {
        caption.textContent = t('caption.forkReplay', 'Parted at {at} · {mainName} side: {m} · {featureName} side: {f} · to replay: {list}', vars);
      } else {
        caption.textContent = t('caption.fork', 'Parted at {at} · {mainName} side: {m} · {featureName} side: {f}', vars);
      }
      clearRing();
      const r = el('circle', { cx: at.x, cy: at.y, r: 70, fill: 'none', stroke: c.accent, 'stroke-width': 2.5, 'stroke-dasharray': '5 4' });
      ringLayer.append(r);
      ring = r;
      await tween(ms, (k) => {
        r.setAttribute('r', String(lerp(70, R + 6, k)));
      });
    },

    async mergeCommit(p, ms) {
      if (p.parents.length !== 2 || p.parentHashes.length !== 2) throw new Error('rebase-vs-merge-stage: 병합 커밋의 부모가 둘이 아니다');
      for (const pid of p.parents) need(pid, '병합 커밋의 부모');
      caption.textContent = t('caption.merge', 'New commit {id} · parents: {p1}, {p2}', { id: p.id, p1: p.parents[0]!, p2: p.parents[1]! });
      setPanel(p.id, [
        { text: `tree ${p.change}`, struck: false },
        { text: `parent ${p.parentHashes[0]!}`, struck: false },
        { text: `parent ${p.parentHashes[1]!}`, struck: false },
      ]);
      const to = { x: colX(p.col), y: ROW_Y[p.row] };
      const from = { x: to.x, y: to.y + 90 };
      removeNode(p.id);
      const n = makeNode(p, true, from);
      n.home = from;
      n.scale = 0.3;
      const blank = '·'.repeat(HASH_LEN);
      await tween(ms, (k) => {
        n.y = lerp(from.y, to.y, k);
        n.scale = lerp(0.3, 1, k);
        n.hashText.textContent = rollHash(blank, p.hash, k);
        placeNode(n);
        drawEdges();
      });
    },

    async replay(p, ms) {
      const src = need(p.from, '다시 놓을 옛 커밋');
      need(p.parent, '새 부모');
      caption.textContent = t('caption.replay', '{from} → {id} · parent: {oldParent} → {parent}', {
        from: p.from,
        id: p.id,
        oldParent: p.oldParent,
        parent: p.parent,
      });
      setPanel(p.id, [
        { text: `tree ${p.change}`, struck: false },
        { text: `parent ${p.oldParentHash}`, struck: true },
        { text: `parent ${p.parentHash}`, struck: false },
      ]);
      const from = { x: src.x, y: src.y };
      const to = { x: colX(p.col), y: ROW_Y[p.row] };
      removeNode(p.id);
      const n = makeNode({ id: p.id, change: p.change, hash: p.oldHash, parents: [p.parent] }, true, from);
      n.home = from;
      await tween(ms, (k) => {
        n.x = lerp(from.x, to.x, k);
        // 옛 줄에서 새 줄로 건너가는 활 — 곧게 가면 옛 커밋을 그대로 덮는다
        n.y = lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * 26;
        n.hashText.textContent = rollHash(p.oldHash, p.hash, k);
        placeNode(n);
        drawEdges();
      });
      n.hash = p.hash;
    },

    async moveLabel(p, ms) {
      if (!names) throw new Error('rebase-vs-merge-stage: 처음 걸음 없이 이름표가 움직인다');
      const tag = tags.get(p.name);
      if (!tag) throw new Error(`rebase-vs-merge-stage: 이름표 '${p.name}' 가 화면에 없다`);
      if (p.path.length === 0 || p.path[p.path.length - 1] !== p.to) throw new Error('rebase-vs-merge-stage: 이름표 길의 끝이 to 가 아니다');
      const vars = { name: names[p.name], from: p.from, to: p.to, list: p.unreachable.join(' ') };
      if (p.kind === 'advance') caption.textContent = t('caption.advance', '{name}: {from} → {to} · onto the new commit', vars);
      else if (p.kind === 'fast-forward') caption.textContent = t('caption.fastForward', '{name}: {from} → {to} · no new commit', vars);
      else caption.textContent = t('caption.featureMove', '{name}: {from} → {to} · left without a name: {list}', vars);

      setPanel(null, []);
      clearRing();
      const stops = [{ x: tag.x, y: tag.y }, ...p.path.map((id) => tagPos(p.name, need(id, '이름표 길')))];
      const dimmed = p.unreachable.map((id) => need(id, '이름 잃은 커밋'));
      for (const n of dimmed) n.dim = true;
      tag.target = p.to;
      const legs = stops.length - 1;
      await tween(ms, (k) => {
        const s = Math.min(legs - 1, Math.floor(k * legs));
        const local = k * legs - s;
        const a = stops[s]!;
        const b = stops[s + 1]!;
        tag.x = lerp(a.x, b.x, local);
        tag.y = lerp(a.y, b.y, local);
        placeTag(tag);
        for (const n of dimmed) placeNode(n);
        drawEdges();
      });
    },

    clear() {
      for (const j of [...jobs]) j.finish(false);
      clearRing();
      setPanel(null, []);
      caption.textContent = '';
      for (const id of [...nodes.keys()]) removeNode(id);
      for (const tag of tags.values()) tag.g.remove();
      tags.clear();
      drawEdges();
    },
  };

  return {
    ...stage,
    destroy(): void {
      destroyed = true;
      for (const j of [...jobs]) j.finish(false);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    },
  };
}

export const rebaseVsMergeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount,
};
