/**
 * probe-a-few-cells-stage — 갈라진 평면 위에서 뚜껑이 하나씩 열린다.
 *
 * 그림의 골자는 평면의 나뉨이다. 대표 넷이 평면을 나눠 가지므로 칸의 경계는
 * 대표끼리의 수직이등분선이고, 그것을 캔버스에서 직접 잘라 낸다 — 칸은 캔버스
 * 끝까지 뻗으므로 그림이 폭을 통째로 쓴다.
 *
 * 운동은 셋이다. 질의가 위에서 내려앉고(translate), 자가 질의에서 대표까지
 * 뻗고(x2/y2), 뚜껑이 바깥으로 밀려 나가며 칸을 드러낸다(translate). 뚜껑은
 * 자기 칸으로 clip 되어 있어, 밀리는 만큼 질의 쪽부터 벗겨진다.
 *
 * 좌표는 전부 캔버스에서 역산한다. 세로만 이 파일이 갖고 가로는 러너가 준다
 * (S-piece).
 */

import { PIECE_CANVAS_W, fonts, fontSizes, getColors } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

/** 세로는 그림이 정한다. 평면이 주인공이라 가로에 견줘 넉넉히 잡는다. */
const H = 340;
/** 캡션이 앉는 아래 띠. */
const CAPTION_BAND = 46;
const PLOT_H = H - CAPTION_BAND;
/** 세로로 담는 평면의 범위(데이터 단위). 점은 1~12 에 있다. */
const Y_SPAN = 14;
/** 데이터가 모여 있는 한가운데. 축척이 여기서 나온다. */
const DATA_CX = 6;
const DATA_CY = 6.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** clip·pattern 의 id 가 한 문서 안에서 겹치지 않게 하는 번호. */
let seq = 0;

type Pt = { x: number; y: number };

type Scene = {
  points: number[][];
  centroids: number[][];
  query: number[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pairOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = v[0];
  const y = v[1];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function pairsOf(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  const out: number[][] = [];
  for (const item of v) {
    const p = pairOf(item);
    if (p !== null) out.push(p);
  }
  return out;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불린다
 * (S-piece).
 */
function readScene(raw: Record<string, unknown> | undefined): Scene {
  const data = raw ?? {};
  return {
    points: pairsOf(data.points),
    centroids: pairsOf(data.centroids),
    query: pairOf(data.query) ?? [0, 0],
  };
}

function mix(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** `keep` 에 가까운 반평면만 남긴다 — 두 대표의 수직이등분선으로 자른다. */
function bisectorClip(poly: Pt[], keep: Pt, away: Pt): Pt[] {
  const mx = (keep.x + away.x) / 2;
  const my = (keep.y + away.y) / 2;
  const nx = away.x - keep.x;
  const ny = away.y - keep.y;
  const side = (p: Pt): number => (p.x - mx) * nx + (p.y - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const dc = side(cur);
    const dp = side(prev);
    if (dc <= 0) {
      if (dp > 0) out.push(mix(prev, cur, dp / (dp - dc)));
      out.push(cur);
    } else if (dp <= 0) {
      out.push(mix(prev, cur, dp / (dp - dc)));
    }
  }
  return out;
}

/** 캔버스를 대표들이 나눠 가진 몫. 칸은 캔버스 끝까지 뻗는다. */
function cellPolygon(sites: Pt[], i: number, w: number): Pt[] {
  let poly: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: PLOT_H },
    { x: 0, y: PLOT_H },
  ];
  for (let j = 0; j < sites.length; j += 1) {
    if (j !== i) poly = bisectorClip(poly, sites[i], sites[j]);
  }
  return poly;
}

function polyPoints(poly: Pt[]): string {
  return poly.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
}

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k) * (1 - k);
}

type CellUi = {
  site: Pt;
  /** 바깥 방향 단위 벡터 — 뚜껑이 밀려 나가는 쪽. */
  out: Pt;
  /** 뚜껑이 칸을 완전히 벗어나는 거리. */
  span: number;
  lid: SVGGElement;
  edge: SVGPolygonElement;
  mark: SVGGElement;
  ruler: SVGLineElement;
  distText: SVGTextElement;
  idText: SVGTextElement;
  countText: SVGTextElement;
  rankText: SVGTextElement;
};

export const probeAFewCellsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    const canvas = params.canvas;
    const W = PIECE_CANVAS_W;
    const uid = `pafc${(seq += 1)}`;

    // ── 축척. 세로에 데이터를 담고 그 배율을 가로에도 그대로 쓴다. 거리가
    //    차례를 정하는 그림이라 가로세로 배율이 다르면 화면이 거짓을 말한다.
    const s = PLOT_H / Y_SPAN;
    const sx = (x: number): number => W / 2 + (x - DATA_CX) * s;
    const sy = (y: number): number => (DATA_CY + Y_SPAN / 2 - y) * s;

    const qp: Pt = { x: sx(scene.query[0]), y: sy(scene.query[1]) };
    const sites: Pt[] = scene.centroids.map((c) => ({ x: sx(c[0]), y: sy(c[1]) }));

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    async function tween(ms: number, draw: (k: number) => void): Promise<void> {
      const started = Date.now();
      for (;;) {
        if (destroyed) return;
        const k = Math.min(1, (Date.now() - started) / ms);
        draw(easeOut(k));
        if (k >= 1) return;
        await wait(16);
      }
    }

    // ── 뼈대
    const root = el('g');
    canvas.appendChild(root);
    const defs = el('defs');
    root.appendChild(defs);

    // 닫힌 뚜껑의 결. 칸마다 같은 위상이라 열기 전에는 이음매가 보이지 않는다.
    const hatch = el('pattern', {
      id: `${uid}-hatch`,
      width: 14,
      height: 14,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(-45)',
    });
    hatch.appendChild(
      el('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 14,
        stroke: colors.text,
        'stroke-opacity': 0.16,
        'stroke-width': 1,
      }),
    );
    defs.appendChild(hatch);

    const gPoints = el('g');
    const gLids = el('g');
    const gEdges = el('g');
    const gRing = el('g');
    const gSpokes = el('g');
    const gRulers = el('g');
    const gMarks = el('g');
    const gLabels = el('g');
    // 점은 뚜껑 아래에 깔린다 — 덮인 칸의 점은 결 너머로만 비친다.
    root.appendChild(gPoints);
    root.appendChild(gLids);
    root.appendChild(gEdges);
    root.appendChild(gRing);
    root.appendChild(gSpokes);
    root.appendChild(gRulers);
    root.appendChild(gMarks);
    root.appendChild(gLabels);

    const label = (
      content: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      weight = '400',
    ): SVGTextElement => {
      const node = el('text', {
        x: r2(x),
        y: r2(y),
        fill,
        'font-family': fonts.mono,
        'font-size': size,
        'font-weight': weight,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      node.textContent = content;
      return node;
    };

    // ── 점 스물넷
    const dots = scene.points.map((p) => {
      const dot = el('circle', {
        cx: r2(sx(p[0])),
        cy: r2(sy(p[1])),
        r: 4.4,
        fill: colors.bg,
        stroke: colors.textMuted,
        'stroke-width': 1.3,
      });
      gPoints.appendChild(dot);
      return dot;
    });

    // ── 칸 — 뚜껑 · 경계 · 대표 · 자 · 이름표
    const cells: CellUi[] = sites.map((site, i) => {
      const poly = cellPolygon(sites, i, W);
      const pts = polyPoints(poly);

      const clip = el('clipPath', { id: `${uid}-cell${i}` });
      clip.appendChild(el('polygon', { points: pts }));
      defs.appendChild(clip);

      const holder = el('g', { 'clip-path': `url(#${uid}-cell${i})` });
      const lid = el('g', { transform: 'translate(0,0)' });
      lid.appendChild(el('polygon', { points: pts, fill: colors.text, 'fill-opacity': 0.05 }));
      lid.appendChild(el('polygon', { points: pts, fill: `url(#${uid}-hatch)` }));
      holder.appendChild(lid);
      gLids.appendChild(holder);

      const edge = el('polygon', {
        points: pts,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-opacity': 0,
        'stroke-width': 1.2,
      });
      gEdges.appendChild(edge);

      const dx = site.x - qp.x;
      const dy = site.y - qp.y;
      const len = Math.hypot(dx, dy) || 1;
      const out: Pt = { x: dx / len, y: dy / len };
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of poly) {
        const t = v.x * out.x + v.y * out.y;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
      const span = hi - lo + 28;

      const mark = el('g', {
        transform: `translate(${r2(site.x)},${r2(site.y)}) scale(0)`,
        opacity: 0,
      });
      mark.appendChild(
        el('polygon', {
          points: '0,-7 7,0 0,7 -7,0',
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.4,
        }),
      );
      gMarks.appendChild(mark);

      const ruler = el('line', {
        x1: r2(qp.x),
        y1: r2(qp.y),
        x2: r2(qp.x),
        y2: r2(qp.y),
        stroke: colors.text,
        'stroke-opacity': 0.55,
        'stroke-width': 1.3,
      });
      gRulers.appendChild(ruler);

      // 잰 값은 재는 자리에 남긴다 — 자의 한복판, 바깥 법선 쪽에 매단다.
      const mid: Pt = { x: (qp.x + site.x) / 2, y: (qp.y + site.y) / 2 };
      const distText = label(
        '',
        mid.x - out.y * 13,
        mid.y + out.x * 13,
        fontSizes.xs,
        colors.text,
      );
      distText.setAttribute('opacity', '0');
      gRulers.appendChild(distText);

      // 이름표는 자기 칸의 바깥쪽에 선다. 네 칸이 캔버스 네 귀를 나눠 가지므로
      // 이름표도 따라서 네 귀로 흩어진다.
      const ax = site.x < W / 2 ? 86 : W - 86;
      const ay = Math.max(58, Math.min(PLOT_H - 58, site.y));
      // 사람이 읽는 번호는 1 부터 센다. 배열 색인 `i` 는 0 부터이고 payload 도
      // 그대로 싣지만, 화면과 글에서는 첫 칸이 "1" 이어야 한다 — 같은 네 칸을
      // 다루는 완제품(`invertedFileIndex`)이 그 규약을 쓰므로, 두 화면이 한 글에
      // 나란히 놓일 때 "칸 2" 가 서로 다른 칸을 가리키지 않게 맞춘다.
      const idText = label(String(i + 1), ax, ay - 17, fontSizes.lg, colors.text, '600');
      const countText = label('', ax, ay + 3, fontSizes.xs, colors.textMuted);
      const rankText = label('', ax, ay + 22, fontSizes.sm, colors.textMuted);
      idText.setAttribute('opacity', '0');
      gLabels.appendChild(idText);
      gLabels.appendChild(countText);
      gLabels.appendChild(rankText);

      return { site, out, span, lid, edge, mark, ruler, distText, idText, countText, rankText };
    });

    // ── 대표까지의 거리가 엇비슷하다는 것을 보이는 띠
    const ring = el('path', {
      d: '',
      'fill-rule': 'evenodd',
      fill: colors.accent,
      'fill-opacity': 0.18,
      stroke: colors.accent,
      'stroke-opacity': 0.55,
      'stroke-width': 1,
    });
    gRing.appendChild(ring);

    const circleAt = (radius: number): string =>
      `M ${r2(qp.x - radius)},${r2(qp.y)} a ${r2(radius)},${r2(radius)} 0 1,0 ${r2(radius * 2)},0` +
      ` a ${r2(radius)},${r2(radius)} 0 1,0 ${r2(-radius * 2)},0`;

    // ── 질의
    const queryMark = el('g', {
      transform: `translate(${r2(qp.x)},${r2(qp.y - 36)})`,
      opacity: 0,
    });
    queryMark.appendChild(
      el('circle', {
        r: 6.5,
        fill: colors.accent,
        stroke: colors.stateInk,
        'stroke-width': 1.2,
      }),
    );
    queryMark.appendChild(label('q', 13, 1, fontSizes.sm, colors.text, '600'));
    gMarks.appendChild(queryMark);

    // ── 캡션
    const caption = el('text', {
      x: W / 2,
      y: H - 22,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    root.appendChild(caption);

    /** 열린 칸. stopProbe 가 남은 칸을 가려내는 데 쓴다. */
    const opened = new Set<number>();

    function resetVisuals(): void {
      opened.clear();
      caption.textContent = '';
      queryMark.setAttribute('opacity', '0');
      queryMark.setAttribute('transform', `translate(${r2(qp.x)},${r2(qp.y - 36)})`);
      ring.setAttribute('d', '');
      while (gSpokes.firstChild) gSpokes.removeChild(gSpokes.firstChild);
      for (const dot of dots) {
        dot.setAttribute('fill', colors.bg);
        dot.setAttribute('stroke', colors.textMuted);
        dot.setAttribute('r', '4.4');
      }
      for (const cell of cells) {
        cell.lid.setAttribute('transform', 'translate(0,0)');
        cell.edge.setAttribute('stroke-opacity', '0');
        cell.mark.setAttribute('opacity', '0');
        cell.mark.setAttribute(
          'transform',
          `translate(${r2(cell.site.x)},${r2(cell.site.y)}) scale(0)`,
        );
        cell.ruler.setAttribute('x2', String(r2(qp.x)));
        cell.ruler.setAttribute('y2', String(r2(qp.y)));
        cell.distText.textContent = '';
        cell.distText.setAttribute('opacity', '0');
        cell.idText.setAttribute('opacity', '0');
        cell.countText.textContent = '';
        cell.rankText.textContent = '';
        cell.rankText.setAttribute('fill', colors.textMuted);
      }
    }

    resetVisuals();

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 질의가 위에서 평면으로 내려앉는다. */
      async showQuery(): Promise<void> {
        queryMark.setAttribute('opacity', '1');
        await tween(420, (k) => {
          queryMark.setAttribute(
            'transform',
            `translate(${r2(qp.x)},${r2(qp.y - 36 * (1 - k))})`,
          );
        });
      },

      /** 경계가 드러나고 대표가 선다. 뚜껑이 이음매에서 한 번 들썩인다. */
      async splitCells(p: { counts: number[] }): Promise<void> {
        for (let i = 0; i < cells.length; i += 1) {
          cells[i].idText.setAttribute('opacity', '1');
          const count = p.counts[i];
          cells[i].countText.textContent = typeof count === 'number' ? `n=${count}` : '';
        }
        await tween(460, (k) => {
          const jolt = Math.sin(k * Math.PI) * 4;
          for (const cell of cells) {
            cell.edge.setAttribute('stroke-opacity', String(r2(0.7 * k)));
            cell.mark.setAttribute('opacity', String(r2(k)));
            cell.mark.setAttribute(
              'transform',
              `translate(${r2(cell.site.x)},${r2(cell.site.y)}) scale(${r2(k)})`,
            );
            cell.lid.setAttribute(
              'transform',
              `translate(${r2(cell.out.x * jolt)},${r2(cell.out.y * jolt)})`,
            );
          }
        });
      },

      /** 자가 질의에서 대표까지 뻗는다. */
      async measureCell(p: { cell: number; dist: number }): Promise<void> {
        const cell = cells[p.cell];
        if (!cell) return;
        cell.distText.textContent = p.dist.toFixed(2);
        await tween(380, (k) => {
          cell.ruler.setAttribute('x2', String(r2(qp.x + (cell.site.x - qp.x) * k)));
          cell.ruler.setAttribute('y2', String(r2(qp.y + (cell.site.y - qp.y) * k)));
          cell.distText.setAttribute('opacity', String(r2(k)));
        });
      },

      /** 네 대표가 든 얇은 띠를 그린다. 차례는 그 띠 안에서 갈린다. */
      async rankCells(p: { order: number[]; near: number; far: number }): Promise<void> {
        for (let r = 0; r < p.order.length; r += 1) {
          const cell = cells[p.order[r]];
          if (cell) cell.rankText.textContent = `#${r + 1}`;
        }
        const inner = p.near * s;
        const outer = p.far * s;
        await tween(520, (k) => {
          ring.setAttribute('d', `${circleAt(outer * k)} ${circleAt(inner * k)}`);
        });
      },

      /** 뚜껑이 바깥으로 밀려 나가고, 드러난 점을 하나씩 견준다. */
      async openCell(p: { cell: number; members: number[] }): Promise<void> {
        const cell = cells[p.cell];
        if (!cell) return;
        opened.add(p.cell);
        await tween(600, (k) => {
          cell.lid.setAttribute(
            'transform',
            `translate(${r2(cell.out.x * cell.span * k)},${r2(cell.out.y * cell.span * k)})`,
          );
        });
        for (const index of p.members) {
          if (destroyed) return;
          const dot = dots[index];
          if (!dot) continue;
          const spoke = el('line', {
            x1: r2(qp.x),
            y1: r2(qp.y),
            x2: r2(qp.x),
            y2: r2(qp.y),
            stroke: colors.itemComparing,
            'stroke-opacity': 0.5,
            'stroke-width': 1,
          });
          gSpokes.appendChild(spoke);
          const tx = Number(dot.getAttribute('cx'));
          const ty = Number(dot.getAttribute('cy'));
          await tween(90, (k) => {
            spoke.setAttribute('x2', String(r2(qp.x + (tx - qp.x) * k)));
            spoke.setAttribute('y2', String(r2(qp.y + (ty - qp.y) * k)));
          });
          dot.setAttribute('fill', colors.itemComparing);
          dot.setAttribute('stroke', colors.itemComparing);
          spoke.setAttribute('stroke-opacity', '0.22');
        }
      },

      /** 멈춘다. 남은 뚜껑이 한 번 되눌린다 — 열리지 않는다는 뜻으로. */
      async stopProbe(): Promise<void> {
        const closed = cells.filter((_, i) => !opened.has(i));
        if (closed.length === 0) return;
        await tween(420, (k) => {
          const press = Math.sin(k * Math.PI) * -5;
          for (const cell of closed) {
            cell.lid.setAttribute(
              'transform',
              `translate(${r2(cell.out.x * press)},${r2(cell.out.y * press)})`,
            );
          }
        });
      },

      rewind(): void {
        resetVisuals();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
