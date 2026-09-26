/**
 * group-then-aggregate stage — 흩어진 줄이 같은 열쇠끼리 모여들고, 모인 묶음이 한 줄로 접힌다.
 *
 * 위: SQL. 가운데: 일하는 줄(처음엔 표 그대로, 모인 뒤엔 묶음마다 한 기둥).
 * 아래: 결과 표 — 접힌 줄이 하나씩 내려앉는다. 가운데의 줄 수는 줄고 결과의 줄 수는 는다.
 *
 * 정적 그리기가 정본이다. 운동은 끝 자리에 이미 선 요소를 "아직 못 온 만큼" 되돌려 놓고 흘린다.
 */
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { GroupThenAggregateScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 470;
const W = PIECE_CANVAS_W;

/** 가장자리 여백 · 기둥 사이 · 줄 높이 상한 · 기둥 폭 상한 */
const PAD = 16;
const GAP = 18;
const ROW_H_MAX = 26;
const COL_W_MAX = 210;
/** 줄 사이 틈 */
const ROW_SPACE = 3;
/** 운동 길이 — 모여듦 한 번 · 접힘 한 번 */
const GATHER_MS = 800;
const FOLD_MS = 800;
/** 접힘에서 줄이 포개지는 몫 (나머지는 한 줄이 결과로 내려앉는 몫) */
const FOLD_SPLIT = 0.5;

type Pos = { x: number; y: number };

type Layout = {
  sqlLineH: number;
  sqlTop: number;
  midLabelY: number;
  midHeaderY: number;
  midRowsTop: number;
  resultLabelY: number;
  resultHeaderY: number;
  resultRowsTop: number;
  captionY1: number;
  captionY2: number;
  rowH: number;
  colW: number;
  tableX: number;
  colX: (g: number) => number;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function layoutOf(scene: GroupThenAggregateScene): Layout {
  const codePx = parseFloat(fontSizes.sm);
  const sqlLineH = Math.round(codePx * 1.45);
  const sqlTop = PAD + codePx;
  const sqlBottom = sqlTop + (scene.sql.length - 1) * sqlLineH;
  const midLabelY = sqlBottom + 28;
  const midHeaderY = midLabelY + 20;
  const midRowsTop = midLabelY + 28;
  const captionY2 = H - 12;
  const captionY1 = captionY2 - 20;
  // 기둥 수 = 결과 줄 수 = 묶음 수. 알고리즘이 init 으로 알리기 전(빈 장면)에는 줄 수를 상한으로 둔다
  const groupCount = scene.groupCount ?? scene.rows.length;
  const midSlots = scene.rows.length;
  const between = 22 + 28;
  const avail = captionY1 - 22 - midRowsTop - between;
  const rowH = Math.min(ROW_H_MAX, avail / (midSlots + groupCount));
  const midBottom = midRowsTop + midSlots * rowH;
  const resultLabelY = midBottom + 22;
  const colW = Math.min(COL_W_MAX, (W - 2 * PAD - (groupCount - 1) * GAP) / groupCount);
  const totalW = groupCount * colW + (groupCount - 1) * GAP;
  const x0 = (W - totalW) / 2;
  return {
    sqlLineH,
    sqlTop,
    midLabelY,
    midHeaderY,
    midRowsTop,
    resultLabelY,
    resultHeaderY: resultLabelY + 20,
    resultRowsTop: resultLabelY + 28,
    captionY1,
    captionY2,
    rowH,
    colW,
    tableX: (W - colW) / 2,
    colX: (g: number) => x0 + g * (colW + GAP),
  };
}

/** 모이기 전 자리 — 표의 줄 차례 그대로 한 기둥. */
function startPos(L: Layout, index: number): Pos {
  return { x: L.tableX, y: L.midRowsTop + index * L.rowH };
}

/** 모인 뒤 자리 — 묶음 g 의 k 번째. */
function groupPos(L: Layout, g: number, k: number): Pos {
  return { x: L.colX(g), y: L.midRowsTop + k * L.rowH };
}

function resultPos(L: Layout, g: number): Pos {
  return { x: L.tableX, y: L.resultRowsTop + g * L.rowH };
}

function translate(p: Pos): string {
  return `translate(${r2(p.x)},${r2(p.y)})`;
}

export const groupThenAggregateStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function groupColors(scene: GroupThenAggregateScene): readonly string[] {
      // 묶음 수는 모인 뒤 바뀌지 않는다 — 걸음마다 색이 갈리지 않는다
      return scene.groups === null ? [] : categorical(scene.groups.length, 'vivid');
    }

    /** 칸 여럿을 가진 줄 하나. 자리는 transform 으로만 준다. */
    function drawRow(
      parent: Element,
      L: Layout,
      at: Pos,
      cells: string[],
      tone: string | null,
      strong: boolean,
    ): SVGGElement {
      const g = el('g', { transform: translate(at) }, parent);
      const h = r2(L.rowH - ROW_SPACE);
      el(
        'rect',
        {
          x: 0,
          y: 0,
          width: r2(L.colW),
          height: h,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: strong ? colors.accent : (tone ?? colors.border),
          'stroke-width': strong ? 2 : 1,
        },
        g,
      );
      if (tone !== null) el('rect', { x: 0, y: 0, width: 4, height: h, rx: 1, fill: tone }, g);
      const cw = L.colW / cells.length;
      cells.forEach((c, i) => {
        el(
          'text',
          {
            x: r2(cw * i + cw / 2),
            y: r2(h / 2 + parseFloat(fontSizes.sm) * 0.36),
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.text,
          },
          g,
          c,
        );
      });
      return g;
    }

    function drawHeader(parent: Element, L: Layout, x: number, y: number, names: string[]): void {
      const cw = L.colW / names.length;
      names.forEach((name, i) => {
        el(
          'text',
          {
            x: r2(x + cw * i + cw / 2),
            y: r2(y),
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          parent,
          name,
        );
      });
    }

    function sourceCells(scene: GroupThenAggregateScene, id: number): string[] {
      const row = scene.rows.find((r) => r[scene.idColumn] === id);
      if (row === undefined) throw new Error(`group-then-aggregate stage: 줄 ${id} 가 표에 없다`);
      return scene.columns.map((c) => String(row[c]));
    }

    type Drawn = {
      rowEls: Map<number, SVGGElement>;
      resultEls: SVGGElement[];
      overlay: SVGGElement;
      layout: Layout;
    };

    function drawStatic(scene: GroupThenAggregateScene): Drawn {
      svg.textContent = '';
      const L = layoutOf(scene);
      const tones = groupColors(scene);
      const rowEls = new Map<number, SVGGElement>();
      const resultEls: SVGGElement[] = [];

      // SQL — 보이기용 자료, 사양 그대로
      scene.sql.forEach((line, i) => {
        el(
          'text',
          {
            x: PAD,
            y: r2(L.sqlTop + i * L.sqlLineH),
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
            'xml:space': 'preserve',
          },
          svg,
          line,
        );
      });

      // 가운데 — 일하는 줄
      const remaining =
        scene.groups === null
          ? scene.rows.length
          : scene.groups.slice(scene.folded.length).reduce((s, g) => s + g.ids.length, 0);
      el(
        'text',
        {
          x: PAD,
          y: r2(L.midLabelY),
          'font-family': scene.groups === null ? fonts.mono : fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        svg,
        scene.groups === null ? scene.table : t('label.groups', 'Groups'),
      );
      el(
        'text',
        {
          x: W - PAD,
          y: r2(L.midLabelY),
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        svg,
        t('label.rows', 'Rows: {n}', { n: remaining }),
      );

      const rowLayer = el('g', {}, svg);
      if (scene.groups === null) {
        drawHeader(svg, L, L.tableX, L.midHeaderY, scene.columns);
        scene.rows.forEach((row, i) => {
          const id = row[scene.idColumn];
          if (typeof id !== 'number') throw new Error('group-then-aggregate stage: id 가 수가 아니다');
          rowEls.set(id, drawRow(rowLayer, L, startPos(L, i), sourceCells(scene, id), null, false));
        });
      } else {
        scene.groups.forEach((grp, g) => {
          if (g < scene.folded.length) return; // 접힌 묶음의 낱 줄은 더 없다
          const tone = tones[g] ?? null;
          drawHeader(svg, L, L.colX(g), L.midHeaderY, scene.columns);
          grp.ids.forEach((id, k) => {
            rowEls.set(id, drawRow(rowLayer, L, groupPos(L, g, k), sourceCells(scene, id), tone, false));
          });
        });
      }

      // 아래 — 결과 표
      el(
        'text',
        {
          x: PAD,
          y: r2(L.resultLabelY),
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        svg,
        t('label.result', 'Result'),
      );
      el(
        'text',
        {
          x: W - PAD,
          y: r2(L.resultLabelY),
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        svg,
        t('label.rows', 'Rows: {n}', { n: scene.folded.length }),
      );
      drawHeader(svg, L, L.tableX, L.resultHeaderY, scene.resultColumns);
      const resultLayer = el('g', {}, svg);
      const landed = scene.step.kind === 'fold' ? scene.step.group : -1;
      scene.folded.forEach((f, g) => {
        resultEls.push(
          drawRow(
            resultLayer,
            L,
            resultPos(L, g),
            [f.key, String(f.n), String(f.total)],
            tones[g] ?? null,
            g === landed,
          ),
        );
      });

      // 캡션 — 지금 일어나는 일
      const step = scene.step;
      let line1 = '';
      let line2 = '';
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Before GROUP BY, every row stands on its own.');
      } else if (step.kind === 'gather') {
        if (scene.groups === null) throw new Error('group-then-aggregate stage: 모인 걸음인데 묶음이 없다');
        line1 = t('caption.gather', 'Rows with the same {key} gather together. Groups: {g}.', {
          key: scene.groupBy,
          g: scene.groups.length,
        });
      } else {
        const f = scene.folded[step.group];
        if (f === undefined) throw new Error(`group-then-aggregate stage: 접힌 줄 ${step.group} 가 없다`);
        line1 = t(
          'caption.fold',
          'Group {key} folds into one row: {nName} = {n}, {totalName} = {sum} = {total}.',
          {
            key: f.key,
            nName: scene.resultColumns[1],
            n: f.n,
            totalName: scene.resultColumns[2],
            sum: f.parts.join(' + '),
            total: f.total,
          },
        );
        if (scene.groups !== null && scene.folded.length === scene.groups.length) {
          line2 = t('caption.done', 'Rows: {from} → {to}.', {
            from: scene.rows.length,
            to: scene.folded.length,
          });
        }
      }
      const capAttrs = {
        x: W / 2,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      };
      el('text', { ...capAttrs, y: r2(L.captionY1) }, svg, line1);
      if (line2 !== '') el('text', { ...capAttrs, y: r2(L.captionY2), 'font-weight': 600 }, svg, line2);

      const overlay = el('g', {}, svg);
      return { rowEls, resultEls, overlay, layout: L };
    }

    /** 한 시계. 첫 프레임은 곧바로 그린다 — 끝 자리가 번쩍이지 않게. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const t0 = performance.now();
        let done = false;
        const wake = (): void => finish(false);
        function finish(ok: boolean): void {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        }
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (performance.now() - t0) / ms);
          frame(p);
          if (p >= 1) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateGather(scene: GroupThenAggregateScene, d: Drawn, mine: number): Promise<void> {
      if (scene.groups === null) throw new Error('group-then-aggregate stage: 모인 걸음인데 묶음이 없다');
      const L = d.layout;
      const moves: { node: SVGGElement; from: Pos; to: Pos }[] = [];
      scene.groups.forEach((grp, g) => {
        grp.ids.forEach((id, k) => {
          const node = d.rowEls.get(id);
          const index = scene.rows.findIndex((r) => r[scene.idColumn] === id);
          if (node === undefined || index < 0) throw new Error(`group-then-aggregate stage: 줄 ${id} 를 못 찾았다`);
          moves.push({ node, from: startPos(L, index), to: groupPos(L, g, k) });
        });
      });
      await tween(GATHER_MS, mine, (p) => {
        const e = ease(p);
        for (const m of moves) {
          m.node.setAttribute(
            'transform',
            translate({ x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) }),
          );
        }
      });
    }

    async function animateFold(
      scene: GroupThenAggregateScene,
      g: number,
      d: Drawn,
      mine: number,
    ): Promise<void> {
      if (scene.groups === null) throw new Error('group-then-aggregate stage: 접힌 걸음인데 묶음이 없다');
      const grp = scene.groups[g];
      const landed = d.resultEls[g];
      if (grp === undefined || landed === undefined) {
        throw new Error(`group-then-aggregate stage: 묶음 ${g} 또는 그 결과 줄이 장면에 없다`);
      }
      const L = d.layout;
      const tone = groupColors(scene)[g] ?? null;
      // 접히기 전의 낱 줄들 — 정적 그리기에는 이미 없으므로 겹 층에 잠깐 세운다
      const ghosts = grp.ids.map((id, k) => ({
        node: drawRow(d.overlay, L, groupPos(L, g, k), sourceCells(scene, id), tone, false),
        from: groupPos(L, g, k),
      }));
      const top = groupPos(L, g, 0);
      const end = resultPos(L, g);
      landed.setAttribute('opacity', '0');
      landed.setAttribute('transform', translate(top));
      await tween(FOLD_MS, mine, (p) => {
        if (p < FOLD_SPLIT) {
          // 포개진다 — 묶음의 줄들이 맨 윗줄로 모여 겹친다
          const e = ease(p / FOLD_SPLIT);
          for (const gh of ghosts) {
            gh.node.setAttribute('transform', translate({ x: gh.from.x, y: lerp(gh.from.y, top.y, e) }));
          }
          return;
        }
        // 한 줄이 되어 결과로 내려앉는다
        d.overlay.textContent = '';
        landed.removeAttribute('opacity');
        const e = ease((p - FOLD_SPLIT) / (1 - FOLD_SPLIT));
        landed.setAttribute('transform', translate({ x: lerp(top.x, end.x, e), y: lerp(top.y, end.y, e) }));
      });
    }

    return {
      async render(
        next: GroupThenAggregateScene,
        _prev: GroupThenAggregateScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'gather') await animateGather(next, drawn, mine);
        else if (step.kind === 'fold') await animateFold(next, step.group, drawn, mine);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
      },

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
