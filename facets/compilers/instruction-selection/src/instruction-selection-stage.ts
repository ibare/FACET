/**
 * instruction-selection 무대 — IR 나무 위에 무늬가 내려앉아 마디를 삼키고, 끝에 덮인 조각마다 명령 한 줄이
 * 아래 조각부터 떨어져 나와 명령 열로 쌓인다.
 *
 * 운동:
 *   - 새 판 — 앞 판의 무늬가 위로 **걷히고**, 명령 열이 비워진다. 식이 바뀌면 같은 자리 경로의 마디가 새 자리로
 *     미끄러지고, 새 가지(`MUL(NAME i, NUM 8)`)는 부모 자리에서 **자라 나오며** 없어진 마디는 부모로 오그라든다
 *   - 무늬 — 덮는 마디들을 감싼 덩어리가 위에서 **내려앉는다** (큰 무늬는 덩어리 하나가 여러 마디를 한 번에 덮는다)
 *   - 냄 — 명령 한 줄씩 제 무늬 자리에서 떨어져 나와 명령 열의 제 줄로 옮겨 간다 (아래 조각부터)
 *
 * 무대는 셈하지 않는다 — 나무의 가로 자리(slot) · 깊이 · 덮는 마디 · 명령 글자 · 수는 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StageNode = { path: string; parent: string | null; depth: number; slot: number; label: string };
export type StagePattern = { name: string; shape: string; form: string; size: number; inSet: boolean };
export type StageRound = {
  source: string;
  nodeCount: number;
  leafCount: number;
  nodes: StageNode[];
  palette: StagePattern[];
};
export type StageTile = {
  order: number;
  name: string;
  root: string;
  size: number;
  covered: number;
  nodeCount: number;
  covers: string[];
  edges: [string, string][];
  skipped: string[];
};
export type StageEmit = { lines: { text: string; tile: number }[]; instrs: number; temps: number; maxLive: number };

export type InstructionSelectionStage = ViewInstance & {
  showRound(r: StageRound, ms: number): void;
  placeTile(tile: StageTile, ms: number): void;
  emitLines(e: StageEmit, ms: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 520;
const TREE_L = 20;
const TREE_W = 430;
const TREE_TOP = 84;
const LEVEL_DY = 58;
const NODE_H = 22;
const RIGHT_X = 472;
const PAL_HEAD_Y = 62;
const PAL_Y = 84;
const PAL_DY = 18;
const INS_HEAD_Y = 266;
const INS_Y = 290;
const INS_DY = 20;
const CAPTION_Y = 508;
const TILE_DROP = 30;
const TILE_OPACITY = 0.38;

type NodeEl = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; x: number; y: number; label: string; parent: string | null };

export const instructionSelectionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const charW = smPx * 0.6;
    const tileColors = categorical(12, 'vivid');

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };

    const root = el('g', {}, svg);
    const sourceText = el('text', { x: TREE_L, y: 34, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, root);
    sourceText.setAttribute('xml:space', 'preserve');
    const caption = el('text', { x: TREE_L, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, root);
    const tileLayer = el('g', {}, root);
    const edgeLayer = el('g', {}, root);
    const nodeLayer = el('g', {}, root);
    const palLayer = el('g', {}, root);
    const insLayer = el('g', {}, root);

    el('line', { x1: RIGHT_X - 12, y1: 50, x2: RIGHT_X - 12, y2: H - 30, stroke: c.border, 'stroke-width': 1 }, root);
    const palHead = el('text', { x: RIGHT_X, y: PAL_HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    palHead.textContent = t('label.patterns', 'Patterns');
    const palSizeHead = el(
      'text',
      { x: W - 12, y: PAL_HEAD_Y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
      root,
    );
    palSizeHead.textContent = t('label.covers', 'Covers');
    const insHead = el('text', { x: RIGHT_X, y: INS_HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    insHead.textContent = t('label.instructions', 'Instructions');

    const nodes = new Map<string, NodeEl>();
    const edges = new Map<string, SVGLineElement>();
    let tiles: SVGGElement[] = [];
    /** 무늬 order → 그 무늬가 덮은 뿌리 마디 자리 (명령이 떨어져 나오는 자리) */
    let tileAt = new Map<number, { x: number; y: number }>();
    let insLines: SVGGElement[] = [];
    let palRows = new Map<string, { g: SVGGElement; bar: SVGRectElement; strike: SVGLineElement; name: SVGTextElement; inSet: boolean }>();
    let leafCount = 0;

    const frames = new Set<number>();
    let destroyed = false;

    /** 진행 중인 운동의 마무리 — 끊길 때도 끝 상태로 건너뛰고 done(걷히는 요소 지우기)을 부른다 */
    const pending = new Set<() => void>();

    /**
     * 걸린 프레임을 거두고 진행 중인 운동을 끝 상태로 마무리한다. 프레임만 끊으면 done 이 불리지 않아
     * 걷히던 앞 판의 무늬 · 명령 줄 · 없어지던 마디가 반쯤 걷힌 채 남는다.
     */
    const cancelAll = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      const left = [...pending];
      pending.clear();
      for (const finish of left) finish();
    };
    params.onScrubStart?.(cancelAll);

    /** 0..1 진행률을 ms 동안 그린다. 되짚는 중이면 끝 상태로 건너뛴다. */
    const animate = (ms: number, delay: number, draw: (p: number) => void, done?: () => void) => {
      if (destroyed || isInstant() || ms <= 0) {
        draw(1);
        done?.();
        return;
      }
      draw(0);
      const finish = () => {
        pending.delete(finish);
        draw(1);
        done?.();
      };
      pending.add(finish);
      const start = performance.now() + delay;
      const tick = (now: number) => {
        if (destroyed || !pending.has(finish)) return;
        const raw = (now - start) / ms;
        const p = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
        if (p >= 1) {
          finish();
          return;
        }
        draw(1 - (1 - p) * (1 - p));
        const id = requestAnimationFrame(tick);
        frames.add(id);
      };
      const id = requestAnimationFrame(tick);
      frames.add(id);
    };

    const nodeX = (slot: number) => TREE_L + ((slot + 0.5) * TREE_W) / leafCount;
    const nodeY = (depth: number) => TREE_TOP + depth * LEVEL_DY;
    const nodeW = (label: string) => label.length * charW + 14;

    const placeNode = (n: NodeEl, x: number, y: number) => {
      n.x = x;
      n.y = y;
      n.g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    };
    const setLabel = (n: NodeEl, label: string) => {
      n.label = label;
      n.text.textContent = label;
      const w = nodeW(label);
      n.rect.setAttribute('x', (-w / 2).toFixed(1));
      n.rect.setAttribute('width', w.toFixed(1));
    };
    const drawEdges = () => {
      for (const [child, line] of edges) {
        const a = nodes.get(child);
        const pp = a?.parent;
        const b = pp === null || pp === undefined ? undefined : nodes.get(pp);
        if (a === undefined || b === undefined) throw new Error(`가지의 끝 마디가 없다: ${child}`);
        line.setAttribute('x1', b.x.toFixed(1));
        line.setAttribute('y1', (b.y + NODE_H / 2).toFixed(1));
        line.setAttribute('x2', a.x.toFixed(1));
        line.setAttribute('y2', (a.y - NODE_H / 2).toFixed(1));
      }
    };
    const makeNode = (s: StageNode): NodeEl => {
      const g = el('g', {}, nodeLayer);
      const rect = el('rect', { y: -NODE_H / 2, height: NODE_H, rx: 5, fill: c.bg, stroke: c.text, 'stroke-width': 1.2 }, g);
      const text = el(
        'text',
        { x: 0, y: 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
        g,
      );
      const n: NodeEl = { g, rect, text, x: 0, y: 0, label: '', parent: s.parent };
      setLabel(n, s.label);
      return n;
    };

    const liftTiles = (ms: number) => {
      const old = tiles;
      tiles = [];
      for (const g of old) {
        animate(ms, 0, (p) => {
          g.setAttribute('transform', `translate(0,${(-TILE_DROP * p).toFixed(1)})`);
          g.setAttribute('opacity', (TILE_OPACITY * (1 - p)).toFixed(3));
        }, () => g.remove());
      }
    };
    const clearLines = (ms: number) => {
      const old = insLines;
      insLines = [];
      for (const g of old) {
        animate(ms, 0, (p) => {
          g.setAttribute('transform', `translate(${(24 * p).toFixed(1)},0)`);
          g.setAttribute('opacity', (1 - p).toFixed(3));
        }, () => g.remove());
      }
    };

    const drawPalette = (pal: StagePattern[]) => {
      for (const g of [...palLayer.children]) g.remove();
      palRows = new Map();
      pal.forEach((p, i) => {
        const y = PAL_Y + i * PAL_DY;
        const g = el('g', { opacity: p.inSet ? 1 : 0.4 }, palLayer);
        const bar = el('rect', { x: RIGHT_X - 6, y: y - 13, width: W - RIGHT_X, height: PAL_DY - 1, rx: 3, fill: c.accent, opacity: 0 }, g);
        const ink = p.inSet ? c.text : c.textMuted;
        const txt = (x: number, s: string, anchor: string, family: string, fill: string) => {
          const e = el('text', { x, y, 'text-anchor': anchor, 'font-family': family, 'font-size': fontSizes.xs, fill }, g);
          e.setAttribute('xml:space', 'preserve');
          e.textContent = s;
          return e;
        };
        const name = txt(RIGHT_X, p.name, 'start', fonts.mono, ink);
        txt(RIGHT_X + 82, p.shape, 'start', fonts.mono, ink);
        txt(RIGHT_X + 198, p.form, 'start', fonts.mono, ink);
        txt(W - 12, String(p.size), 'end', fonts.mono, ink);
        const strike = el(
          'line',
          { x1: RIGHT_X + 80, y1: y - xsPx / 3, x2: RIGHT_X + 300, y2: y - xsPx / 3, stroke: c.danger, 'stroke-width': 1.4, opacity: 0 },
          g,
        );
        palRows.set(p.name, { g, bar, strike, name, inSet: p.inSet });
      });
    };
    const clearPaletteMarks = () => {
      for (const row of palRows.values()) {
        row.bar.setAttribute('opacity', '0');
        row.strike.setAttribute('opacity', '0');
        row.name.setAttribute('fill', row.inSet ? c.text : c.textMuted);
      }
    };

    const tileColor = (order: number): string => {
      const col = tileColors[(order - 1) % tileColors.length];
      if (col === undefined) throw new Error('무늬 색을 잃었다');
      return col;
    };

    const inst: InstructionSelectionStage = {
      showRound(r, ms) {
        if (r.leafCount <= 0) throw new Error('잎이 없는 나무');
        leafCount = r.leafCount;
        sourceText.textContent = r.source;
        liftTiles(ms);
        tileAt = new Map();
        clearLines(ms);
        drawPalette(r.palette);

        const want = new Map(r.nodes.map((s) => [s.path, s]));
        const moves: { n: NodeEl; x0: number; y0: number; x1: number; y1: number }[] = [];
        // 새 판의 마디 — 같은 경로는 미끄러지고, 새 경로는 부모 자리에서 자라 나온다
        for (const s of r.nodes) {
          const x1 = nodeX(s.slot);
          const y1 = nodeY(s.depth);
          let n = nodes.get(s.path);
          if (n === undefined) {
            const par = s.parent === null ? undefined : nodes.get(s.parent);
            n = makeNode(s);
            nodes.set(s.path, n);
            const px = par === undefined ? x1 : par.x;
            const py = par === undefined ? y1 : par.y;
            placeNode(n, px, py);
          } else if (n.label !== s.label) setLabel(n, s.label);
          n.parent = s.parent;
          moves.push({ n, x0: n.x, y0: n.y, x1, y1 });
          if (s.parent !== null && !edges.has(s.path)) {
            edges.set(s.path, el('line', { stroke: c.textMuted, 'stroke-width': 1.2 }, edgeLayer));
          }
        }
        // 없어진 마디 — 부모의 새 자리로 오그라든다
        const gone: { path: string; n: NodeEl; x0: number; y0: number; x1: number; y1: number }[] = [];
        for (const [path, n] of nodes) {
          if (want.has(path)) continue;
          let anc = n.parent;
          while (anc !== null && !want.has(anc)) {
            const up = nodes.get(anc);
            if (up === undefined) throw new Error(`없어질 마디의 조상을 잃었다: ${anc}`);
            anc = up.parent;
          }
          const target = anc === null ? undefined : want.get(anc);
          const x1 = target === undefined ? n.x : nodeX(target.slot);
          const y1 = target === undefined ? n.y : nodeY(target.depth);
          gone.push({ path, n, x0: n.x, y0: n.y, x1, y1 });
        }
        animate(
          ms,
          0,
          (p) => {
            for (const m of moves) placeNode(m.n, m.x0 + (m.x1 - m.x0) * p, m.y0 + (m.y1 - m.y0) * p);
            for (const g of gone) {
              placeNode(g.n, g.x0 + (g.x1 - g.x0) * p, g.y0 + (g.y1 - g.y0) * p);
              g.n.g.setAttribute('opacity', (1 - p).toFixed(3));
            }
            drawEdges();
          },
          () => {
            for (const g of gone) {
              g.n.g.remove();
              nodes.delete(g.path);
              edges.get(g.path)?.remove();
              edges.delete(g.path);
            }
            drawEdges();
          },
        );
        caption.textContent = t('caption.start', 'Uncovered tree · nodes: {nodes}', { nodes: r.nodeCount });
      },

      placeTile(tile, ms) {
        const col = tileColor(tile.order);
        const g = el('g', { opacity: 0 }, tileLayer);
        const pad = 6;
        for (const [a, b] of tile.edges) {
          const na = nodes.get(a);
          const nb = nodes.get(b);
          if (na === undefined || nb === undefined) throw new Error(`무늬 가장자리의 마디가 없다: ${a} → ${b}`);
          el('line', { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, stroke: col, 'stroke-width': NODE_H, 'stroke-linecap': 'round' }, g);
        }
        for (const p of tile.covers) {
          const n = nodes.get(p);
          if (n === undefined) throw new Error(`무늬가 덮을 마디가 없다: ${p}`);
          const w = nodeW(n.label) + pad * 2;
          el('rect', { x: n.x - w / 2, y: n.y - NODE_H / 2 - pad, width: w, height: NODE_H + pad * 2, rx: 10, fill: col }, g);
        }
        tiles.push(g);
        const rootNode = nodes.get(tile.root);
        if (rootNode === undefined) throw new Error(`무늬의 뿌리 마디가 없다: ${tile.root}`);
        tileAt.set(tile.order, { x: rootNode.x, y: rootNode.y });
        animate(ms, 0, (p) => {
          g.setAttribute('transform', `translate(0,${(-TILE_DROP * (1 - p)).toFixed(1)})`);
          g.setAttribute('opacity', (TILE_OPACITY * p).toFixed(3));
        });

        clearPaletteMarks();
        const row = palRows.get(tile.name);
        if (row === undefined) throw new Error(`무늬 목록에 없는 무늬: ${tile.name}`);
        row.bar.setAttribute('fill', col);
        row.bar.setAttribute('opacity', String(TILE_OPACITY));
        for (const s of tile.skipped) {
          const sk = palRows.get(s);
          if (sk === undefined) throw new Error(`무늬 목록에 없는 무늬: ${s}`);
          sk.strike.setAttribute('opacity', '1');
          sk.name.setAttribute('fill', c.danger);
        }
        caption.textContent =
          tile.skipped.length > 0
            ? t('caption.tileSkip', '{pattern} · no fit: {skipped} · covers: {size} · covered: {covered} / {nodes}', {
                pattern: tile.name,
                skipped: tile.skipped.join(', '),
                size: tile.size,
                covered: tile.covered,
                nodes: tile.nodeCount,
              })
            : t('caption.tile', '{pattern} · covers: {size} · covered: {covered} / {nodes}', {
                pattern: tile.name,
                size: tile.size,
                covered: tile.covered,
                nodes: tile.nodeCount,
              });
      },

      emitLines(e, ms) {
        clearPaletteMarks();
        const n = e.lines.length;
        const each = n > 0 ? ms / (n + 1) : ms;
        e.lines.forEach((ln, i) => {
          const from = tileAt.get(ln.tile);
          if (from === undefined) throw new Error(`명령을 낸 무늬가 없다: ${ln.tile}`);
          // 제 무늬의 뿌리 마디 자리에서 출발한다 (글자 왼쪽 끝을 마디 가운데 조금 왼쪽에)
          const sx = from.x - 30;
          const sy = from.y + 4;
          const tx = RIGHT_X + 16;
          const ty = INS_Y + i * INS_DY;
          const g = el('g', { opacity: 0 }, insLayer);
          el('circle', { cx: -9, cy: -4, r: 4, fill: tileColor(ln.tile) }, g);
          const txt = el('text', { x: 0, y: 0, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, g);
          txt.setAttribute('xml:space', 'preserve');
          txt.textContent = ln.text;
          insLines.push(g);
          animate(each * 2, each * i, (p) => {
            const x = sx + (tx - sx) * p;
            const y = sy + (ty - sy) * p;
            g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
            g.setAttribute('opacity', p > 0 ? '1' : '0');
          });
        });
        caption.textContent = t('caption.emit', 'Instructions: {instrs} · temporaries: {temps} · max live: {live}', {
          instrs: e.instrs,
          temps: e.temps,
          live: e.maxLive,
        });
      },

      reset() {
        cancelAll();
        // 목록이 아니라 층째 비운다 — 목록에서 먼저 빠진 채 걷히던 요소까지 함께 지운다
        for (const layer of [tileLayer, insLayer, nodeLayer, edgeLayer, palLayer]) {
          for (const ch of [...layer.children]) ch.remove();
        }
        tiles = [];
        tileAt = new Map();
        insLines = [];
        nodes.clear();
        edges.clear();
        palRows = new Map();
        sourceText.textContent = '';
        caption.textContent = '';
      },

      destroy() {
        destroyed = true;
        cancelAll();
        root.remove();
      },
    };
    return inst;
  },
};
