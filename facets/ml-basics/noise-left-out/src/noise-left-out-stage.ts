/**
 * noise-left-out-stage — 잡음점 조각의 그림.
 *
 * 화면은 셋이다.
 *   왼쪽 판     같은 점 열여섯. 두 방법이 차례로 이 위에 걸린다.
 *   오른쪽 선반  "남겨진 것" — 방법이 남긴 것을 받아 적는 자리. 비어 있는 선반
 *               자체가 하나의 결과다.
 *   아래 자     점판과 **같은 축척**. eps 를 한 도막으로 깔아 두고, 무리가
 *               뻗어야 했던 거리를 그 위에 막대로 재 준다.
 *
 * 이 조각의 동사는 "남겨진다" 다. 그래서 남는 점은 끝까지 제자리에 있다 —
 * 움직이는 것은 번짐(선이 자라는 것) · 뻗음(선이 자라는 것) · 중심(미끄러지는
 * 것) · 방법 머리표(옆으로 미는 것)이고, 두 선의 길이 차이가 곧 논증이다.
 * 자와 선반이 그 차이를 수로 받아 적으므로 산점도는 무대이지 주인공이 아니다.
 *
 * 세로는 여기서 정한다 (S-view — 마운트 뒤 바꾸지 않는다). 가로는 러너가
 * PIECE_CANVAS_W 로 준다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 420;

const PAD = 24;
const GUTTER = 20;
/** 선반 폭 — 좌표 표기 한 줄이 들어가는 최소치. 남는 폭은 점판이 다 가진다. */
const BOARD_W = 192;
const PLOT_W = W - PAD * 2 - GUTTER - BOARD_W;
const PLOT_X = PAD;
const BOARD_X = PAD + PLOT_W + GUTTER;

const TAB_Y = 10;
const TAB_H = 22;
const TAB_GAP = 8;
const TAB_W = (PLOT_W - TAB_GAP) / 2;

const PLOT_Y = 40;
const PLOT_H = 288;

const BOARD_Y = PLOT_Y;
const BOARD_H = PLOT_H;
const BOARD_HEAD_H = 40;
const ROW_MAX_H = 48;

/** 자의 축선. 위쪽은 뻗은 거리, 아래쪽은 눈금과 eps 도막. */
const METER_Y = 368;
const METER_UNITS = 6;

const CAPTION_Y = 406;

const PT_R = 4.5;
const GHOST_R = 10;
const FRAME_MS = 24;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 1·3). */
const DASH = '—';
const EPS_SIGN = 'eps';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 토큰 hex 를 알파로 눕힌다. 색 리터럴이 아니라 순수 변환이다 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type NoiseScene = {
  points: { x: number; y: number }[];
  eps: number;
};

/**
 * `initialData` 를 좁히는 자리는 여기 하나다 (S-piece). projector 는 걸음마다
 * 오는 payload 만 좁힌다.
 */
function readScene(raw: unknown): NoiseScene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const points: { x: number; y: number }[] = [];
  if (Array.isArray(d.points)) {
    for (const item of d.points) {
      if (typeof item !== 'object' || item === null) continue;
      const p = item as Record<string, unknown>;
      if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      points.push({ x: p.x, y: p.y });
    }
  }
  return { points, eps: typeof d.eps === 'number' && d.eps > 0 ? d.eps : 1 };
}

export type LeftOutItem = { index: number; x: number; y: number; neighbors: number };

export type ClaimInfo = {
  index: number;
  cluster: number;
  dist: number;
  ratio: number;
  anchor: number;
  rank: number;
  total: number;
  remaining: number;
};

export const noiseLeftOutStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const hue = categorical(2, 'vivid');
    const soft = categorical(2, 'pastel');
    const tone = (k: number): string => hue[Math.max(0, k) % hue.length];
    const softTone = (k: number): string => soft[Math.max(0, k) % soft.length];

    // ── 축척. 점판과 자가 같은 픽셀/단위를 쓴다. 거리가 논증이므로 가로세로를
    //    다른 배율로 늘일 수 없다. 여백은 eps 하나만큼 — 가장자리 점의 이웃
    //    반지름이 판 밖으로 새지 않을 최소치다.
    const xs = scene.points.map((p) => p.x);
    const ys = scene.points.map((p) => p.y);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 1;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxY = ys.length > 0 ? Math.max(...ys) : 1;
    const spanX = maxX - minX + scene.eps * 2;
    const spanY = maxY - minY + scene.eps * 2;
    const unit = Math.min(PLOT_W / spanX, PLOT_H / spanY);
    const originX = PLOT_X + (PLOT_W - spanX * unit) / 2 + (scene.eps - minX) * unit;
    const originY = PLOT_Y + PLOT_H - (PLOT_H - spanY * unit) / 2 - (scene.eps - minY) * unit;
    const sx = (x: number): number => originX + x * unit;
    const sy = (y: number): number => originY - y * unit;

    // ── 기다림. destroy 가 걸어 둔 것을 거두고 기다리던 것을 깨운다 (S-piece).
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

    /** CSS 전이를 걸고 한 틱 뒤에 값을 바꾼다 — 그래야 실제로 움직인다. */
    async function move(
      nodes: SVGElement[],
      props: string[],
      ms: number,
      timing: string,
      apply: () => void,
    ): Promise<void> {
      const decl = props.map((p) => `${p} ${ms}ms ${timing}`).join(', ');
      for (const n of nodes) n.style.transition = decl;
      await wait(FRAME_MS);
      if (destroyed) return;
      apply();
      await wait(ms);
      for (const n of nodes) n.style.transition = '';
    }

    /** 선이 한쪽 끝에서 다른 끝으로 자란다. 걸리는 시간이 곧 길이다. */
    async function grow(line: SVGLineElement, ms: number): Promise<void> {
      const x1 = Number(line.getAttribute('x1'));
      const y1 = Number(line.getAttribute('y1'));
      const x2 = Number(line.getAttribute('x2'));
      const y2 = Number(line.getAttribute('y2'));
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      line.setAttribute('stroke-dasharray', String(len));
      line.setAttribute('stroke-dashoffset', String(len));
      await move([line], ['stroke-dashoffset'], ms, 'linear', () => {
        line.setAttribute('stroke-dashoffset', '0');
      });
    }

    /** 자와 뻗음이 같은 시간 감각을 쓰도록, 길이에서 재생 시간을 뽑는다. */
    const reachMs = (d: number): number => Math.round(200 + d * unit * 1.8);

    // ── 그릴 것들. rewind 는 root 를 통째로 갈아 끼운다.
    let root = el('g', {});
    let layers = {
      disc: el('g', {}),
      edge: el('g', {}),
      tether: el('g', {}),
      dot: el('g', {}),
      tag: el('g', {}),
      centroid: el('g', {}),
      board: el('g', {}),
      meter: el('g', {}),
    };
    let dots: SVGCircleElement[] = [];
    let discs: SVGCircleElement[] = [];
    let countTags: SVGTextElement[] = [];
    let ghosts = new Map<number, SVGCircleElement>();
    let rowValues = new Map<number, SVGTextElement>();
    let rowGroups = new Map<number, SVGGElement>();
    let letters = new Map<number, string>();
    let centroids: SVGGElement[] = [];
    let liveBar: SVGElement[] = [];
    let tabMark = el('rect', {});
    let tabTexts: SVGTextElement[] = [];
    let countText = el('text', {});
    let caption = el('text', {});

    function label(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.text,
        ...attrs,
      });
      node.textContent = value;
      return node;
    }

    function prose(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      return label(x, y, value, { 'font-family': fonts.body, ...attrs });
    }

    function build(): void {
      root.remove();
      root = el('g', {});
      svg.appendChild(root);

      layers = {
        disc: el('g', {}),
        edge: el('g', {}),
        tether: el('g', {}),
        dot: el('g', {}),
        tag: el('g', {}),
        centroid: el('g', {}),
        board: el('g', {}),
        meter: el('g', {}),
      };
      dots = [];
      discs = [];
      countTags = [];
      ghosts = new Map();
      rowValues = new Map();
      rowGroups = new Map();
      letters = new Map();
      centroids = [];
      liveBar = [];

      // 방법 머리표 둘. 활성 표시가 옆으로 미끄러지는 것이 방법이 바뀌는 신호다.
      tabMark = el('rect', {
        x: PLOT_X,
        y: TAB_Y,
        width: TAB_W,
        height: TAB_H,
        rx: 5,
        fill: hexToRgba(c.text, 0.07),
      });
      root.appendChild(tabMark);
      tabTexts = [
        prose(PLOT_X + TAB_W / 2, TAB_Y + 15, t('tab.density', 'Group by density'), {
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: c.text,
        }),
        prose(
          PLOT_X + TAB_W + TAB_GAP + TAB_W / 2,
          TAB_Y + 15,
          t('tab.nearest', 'Attach to the nearer side'),
          { 'font-size': fontSizes.sm, 'text-anchor': 'middle', fill: c.textMuted },
        ),
      ];
      for (const node of tabTexts) root.appendChild(node);

      root.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_Y,
          width: PLOT_W,
          height: PLOT_H,
          rx: 6,
          fill: c.bg,
          stroke: c.border,
        }),
      );

      // 선반. 첫 걸음부터 빈 채로 놓인다 — 무엇이 남을 것인가를 먼저 묻는다.
      layers.board.appendChild(
        el('rect', {
          x: BOARD_X,
          y: BOARD_Y,
          width: BOARD_W,
          height: BOARD_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      layers.board.appendChild(
        prose(BOARD_X + 14, BOARD_Y + 26, t('board.title', 'Left out'), {
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }),
      );
      countText = label(BOARD_X + BOARD_W - 14, BOARD_Y + 28, DASH, {
        'font-size': fontSizes.xl,
        'text-anchor': 'end',
        fill: c.textMuted,
      });
      layers.board.appendChild(countText);
      layers.board.appendChild(
        el('line', {
          x1: BOARD_X + 12,
          y1: BOARD_Y + BOARD_HEAD_H,
          x2: BOARD_X + BOARD_W - 12,
          y2: BOARD_Y + BOARD_HEAD_H,
          stroke: c.border,
        }),
      );

      for (const key of ['disc', 'edge', 'tether', 'dot', 'tag', 'centroid', 'board', 'meter'] as const) {
        root.appendChild(layers[key]);
      }

      caption = prose(PAD, CAPTION_Y, '', { 'font-size': fontSizes.md, fill: c.text });
      root.appendChild(caption);
    }

    build();

    function pointAt(i: number): { x: number; y: number } {
      return scene.points[i] ?? { x: 0, y: 0 };
    }

    /** 아래 자. 눈금은 점판과 같은 단위이고, eps 도막이 견줌의 기준이다. */
    function buildMeter(): void {
      const axisLen = METER_UNITS * unit;
      layers.meter.appendChild(
        el('line', { x1: PAD, y1: METER_Y, x2: PAD + axisLen, y2: METER_Y, stroke: c.border }),
      );
      for (let u = 0; u <= METER_UNITS; u += 1) {
        layers.meter.appendChild(
          el('line', {
            x1: PAD + u * unit,
            y1: METER_Y,
            x2: PAD + u * unit,
            y2: METER_Y + 3,
            stroke: c.border,
          }),
        );
      }
      layers.meter.appendChild(
        el('rect', { x: PAD, y: METER_Y + 6, width: scene.eps * unit, height: 5, fill: c.text }),
      );
      // `eps = 1.2` 는 수식 표기라 표식으로 둔다 (C10 판정 3). 도막 바로 옆에
      // 붙여 두어야 그 검은 도막이 무엇인지가 한눈에 잡힌다.
      layers.meter.appendChild(
        label(PAD + scene.eps * unit + 8, METER_Y + 12, `${EPS_SIGN} = ${scene.eps}`, {
          fill: c.textMuted,
        }),
      );
      layers.meter.appendChild(
        prose(
          PAD + axisLen + 24,
          METER_Y + 4,
          t('meter.note', 'How far a group had to reach, measured against eps.'),
          { fill: c.textMuted },
        ),
      );
    }

    /**
     * 뻗은 거리를 자 위에 다시 재 준다. 앞 막대는 걷고 눈금만 남긴다 — 막대가
     * 쌓이면 겹쳐서 길이를 못 읽는다.
     */
    async function meterReach(info: ClaimInfo): Promise<void> {
      for (const node of liveBar) node.remove();
      liveBar = [];
      const end = PAD + info.dist * unit;
      layers.meter.appendChild(
        el('line', {
          x1: end,
          y1: METER_Y - 5,
          x2: end,
          y2: METER_Y + 1,
          stroke: tone(info.cluster),
          'stroke-width': 2,
        }),
      );
      const bar = el('line', {
        x1: PAD,
        y1: METER_Y - 7,
        x2: end,
        y2: METER_Y - 7,
        stroke: tone(info.cluster),
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
      layers.meter.appendChild(bar);
      // 막대 끝에 그 점의 표식과 잰 값을 함께 적어 판·선반·자를 잇는다.
      const value = label(
        end + 4,
        METER_Y - 13,
        `${letters.get(info.index) ?? ''} ${info.dist.toFixed(2)}`,
        { fill: tone(info.cluster), opacity: 0 },
      );
      layers.meter.appendChild(value);
      liveBar = [bar, value];
      await grow(bar, reachMs(info.dist));
      if (destroyed) return;
      await move([value], ['opacity'], 120, 'ease-out', () => {
        value.setAttribute('opacity', '1');
      });
    }

    const api = {
      setCaption(value: string): void {
        caption.textContent = value;
      },

      async placePoints(): Promise<void> {
        for (let i = 0; i < scene.points.length; i += 1) {
          const p = pointAt(i);
          const dot = el('circle', {
            cx: sx(p.x),
            cy: sy(p.y),
            r: 0,
            fill: c.bg,
            stroke: c.text,
            'stroke-width': 1.6,
          });
          layers.dot.appendChild(dot);
          dots.push(dot);
        }
        await move(dots, ['r'], 260, 'ease-out', () => {
          for (const dot of dots) dot.setAttribute('r', String(PT_R));
        });
      },

      async showRadius(counts: number[]): Promise<void> {
        buildMeter();
        for (let i = 0; i < scene.points.length; i += 1) {
          const p = pointAt(i);
          discs.push(
            layers.disc.appendChild(
              el('circle', {
                cx: sx(p.x),
                cy: sy(p.y),
                r: 0,
                fill: hexToRgba(c.text, 0.05),
                stroke: c.border,
              }),
            ),
          );
          countTags.push(
            layers.tag.appendChild(
              label(sx(p.x) + 9, sy(p.y) - 8, String(counts[i] ?? 0), {
                fill: c.textMuted,
                opacity: 0,
              }),
            ),
          );
        }
        await move(discs, ['r'], 300, 'ease-out', () => {
          for (const disc of discs) disc.setAttribute('r', String(scene.eps * unit));
        });
        if (destroyed) return;
        await move(countTags, ['opacity'], 140, 'ease-out', () => {
          for (const tag of countTags) tag.setAttribute('opacity', '1');
        });
      },

      async markCores(core: number[], sparse: number[]): Promise<void> {
        for (const i of sparse) {
          const disc = discs[i];
          if (!disc) continue;
          disc.setAttribute('fill', 'none');
          disc.setAttribute('stroke', c.ghostOutline);
          disc.setAttribute('stroke-dasharray', '3 3');
        }
        const dense = core.map((i) => dots[i]).filter((n): n is SVGCircleElement => Boolean(n));
        await move(dense, ['r', 'stroke-width'], 200, 'ease-out', () => {
          for (const dot of dense) {
            dot.setAttribute('r', String(PT_R + 1.5));
            dot.setAttribute('stroke-width', '2.4');
          }
        });
      },

      async spread(cluster: number, edges: [number, number][]): Promise<void> {
        const lines: SVGLineElement[] = [];
        const touched = new Set<number>();
        for (const [a, b] of edges) {
          const pa = pointAt(a);
          const pb = pointAt(b);
          lines.push(
            layers.edge.appendChild(
              el('line', {
                x1: sx(pa.x),
                y1: sy(pa.y),
                x2: sx(pb.x),
                y2: sy(pb.y),
                stroke: tone(cluster),
                'stroke-width': 2,
                'stroke-linecap': 'round',
                opacity: 0.7,
              }),
            ),
          );
          touched.add(a);
          touched.add(b);
        }
        await Promise.all(lines.map((line) => grow(line, 200)));
        if (destroyed) return;
        const filled = [...touched]
          .map((i) => dots[i])
          .filter((n): n is SVGCircleElement => Boolean(n));
        await move(filled, ['fill', 'stroke'], 140, 'ease-out', () => {
          for (const dot of filled) {
            dot.setAttribute('fill', tone(cluster));
            dot.setAttribute('stroke', tone(cluster));
          }
        });
      },

      async haltSpread(border: { index: number; cluster: number }[]): Promise<void> {
        // 가장자리 — 무리에 들었으나 스스로는 번지지 못한 점. 번짐이 여기서
        // 멎었다는 것을 한 번 부풀었다 앉는 것으로 보인다. 이 걸음은 논증의
        // 축이라 색만 바꾸고 지나가면 캡션만 바뀐 것이 된다.
        const edgeDots: SVGCircleElement[] = [];
        const clusters = new Map<SVGCircleElement, number>();
        for (const { index, cluster } of border) {
          const dot = dots[index];
          if (!dot) continue;
          clusters.set(dot, cluster);
          edgeDots.push(dot);
        }
        await move(edgeDots, ['r', 'fill', 'stroke-width'], 160, 'ease-out', () => {
          for (const dot of edgeDots) {
            dot.setAttribute('r', String(PT_R + 3));
            dot.setAttribute('fill', softTone(clusters.get(dot) ?? 0));
            dot.setAttribute('stroke-width', '2.2');
          }
        });
        if (destroyed) return;
        await move(edgeDots, ['r'], 160, 'ease-out', () => {
          for (const dot of edgeDots) dot.setAttribute('r', String(PT_R));
        });
      },

      async listLeftOut(items: LeftOutItem[]): Promise<void> {
        const area = BOARD_H - BOARD_HEAD_H - 12;
        const rowH = items.length > 0 ? Math.min(ROW_MAX_H, area / items.length) : ROW_MAX_H;
        const top = BOARD_Y + BOARD_HEAD_H + 8 + (area - rowH * items.length) / 2;

        const rings: SVGCircleElement[] = [];
        const rows: SVGGElement[] = [];

        items.forEach((item, i) => {
          const mark = String.fromCharCode(97 + i);
          letters.set(item.index, mark);

          // 점은 움직이지 않는다. 둘레에 점선 고리가 펴질 뿐이다.
          const ring = layers.disc.appendChild(
            el('circle', {
              cx: sx(item.x),
              cy: sy(item.y),
              r: 0,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1.6,
              'stroke-dasharray': '3 3',
            }),
          );
          ghosts.set(item.index, ring);
          rings.push(ring);
          layers.tag.appendChild(label(sx(item.x) + 12, sy(item.y) - 10, mark, { fill: c.text }));

          const mid = top + rowH * i + rowH / 2;
          const row = el('g', { opacity: 0 });
          row.style.transform = 'translateX(-14px)';
          row.appendChild(
            el('circle', {
              cx: BOARD_X + 26,
              cy: mid,
              r: 10,
              fill: 'none',
              stroke: c.ghostOutline,
            }),
          );
          row.appendChild(
            label(BOARD_X + 26, mid + 4, mark, { 'text-anchor': 'middle', fill: c.text }),
          );
          // 좌표 표기는 표식이다 (C10 판정 3).
          row.appendChild(
            label(BOARD_X + 46, mid - 3, `(${item.x.toFixed(1)}, ${item.y.toFixed(1)})`),
          );
          const value = label(
            BOARD_X + BOARD_W - 14,
            mid + 14,
            t('board.neighbors', 'nbrs {n}', { n: item.neighbors }),
            { 'text-anchor': 'end', fill: c.textMuted },
          );
          row.appendChild(value);
          rowValues.set(item.index, value);
          rowGroups.set(item.index, row);
          rows.push(layers.board.appendChild(row));
        });

        countText.textContent = String(items.length);
        countText.setAttribute('fill', c.text);

        await move(rings, ['r'], 220, 'ease-out', () => {
          for (const ring of rings) ring.setAttribute('r', String(GHOST_R));
        });
        if (destroyed) return;
        await move(rows, ['opacity', 'transform'], 240, 'ease-out', () => {
          for (const row of rows) {
            row.setAttribute('opacity', '1');
            row.style.transform = 'translateX(0px)';
          }
        });
      },

      async beginNearest(seeds: { x: number; y: number }[]): Promise<void> {
        tabTexts.forEach((node, i) => {
          node.setAttribute('fill', i === 1 ? c.text : c.textMuted);
        });
        seeds.forEach((seed, k) => {
          const glyph = el('g', { opacity: 0 });
          glyph.style.transform = `translate(${sx(seed.x)}px, ${sy(seed.y)}px)`;
          glyph.appendChild(
            el('path', {
              d: 'M0,-9 L9,0 L0,9 L-9,0 Z',
              fill: c.bg,
              stroke: tone(k),
              'stroke-width': 2.2,
            }),
          );
          glyph.appendChild(el('circle', { cx: 0, cy: 0, r: 2, fill: tone(k) }));
          centroids.push(layers.centroid.appendChild(glyph));
        });

        // 방법이 바뀌는 것은 한 박자다 — 머리표가 미끄러지는 동안 eps 원반과
        // 이웃 수가 걷히고 중심이 들어선다. 순차로 두면 같은 사건이 셋으로
        // 쪼개져 보인다. 자에 깔린 eps 도막만 견줌의 기준으로 남는다.
        await Promise.all([
          move([tabMark], ['transform'], 300, 'ease-out', () => {
            tabMark.style.transform = `translateX(${TAB_W + TAB_GAP}px)`;
          }),
          move([...discs, ...countTags, ...centroids], ['opacity', 'r'], 260, 'ease-out', () => {
            for (const disc of discs) disc.setAttribute('r', '0');
            for (const tag of countTags) tag.setAttribute('opacity', '0');
            for (const glyph of centroids) glyph.setAttribute('opacity', '1');
          }),
        ]);
        for (const disc of discs) disc.remove();
        for (const tag of countTags) tag.remove();
        discs = [];
        countTags = [];
        for (const line of Array.from(layers.edge.children)) {
          (line as SVGElement).setAttribute('opacity', '0.22');
        }
      },

      async settleCentroids(next: { x: number; y: number }[]): Promise<void> {
        await move(centroids, ['transform'], 320, 'ease-in-out', () => {
          centroids.forEach((glyph, k) => {
            const target = next[k];
            if (!target) return;
            glyph.style.transform = `translate(${sx(target.x)}px, ${sy(target.y)}px)`;
          });
        });
      },

      async claimStray(info: ClaimInfo): Promise<void> {
        const from = pointAt(info.anchor);
        const to = pointAt(info.index);
        const tether = layers.tether.appendChild(
          el('line', {
            x1: sx(from.x),
            y1: sy(from.y),
            x2: sx(to.x),
            y2: sy(to.y),
            stroke: tone(info.cluster),
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            opacity: 0.85,
          }),
        );

        // 무리가 뻗는 것과 자가 재는 것이 같은 걸음이다.
        await Promise.all([grow(tether, reachMs(info.dist)), meterReach(info)]);
        if (destroyed) return;

        const dot = dots[info.index];
        const ring = ghosts.get(info.index);
        const moving: SVGElement[] = [];
        if (dot) moving.push(dot);
        if (ring) moving.push(ring);
        await move(moving, ['fill', 'stroke', 'r'], 200, 'ease-out', () => {
          if (dot) {
            dot.setAttribute('fill', tone(info.cluster));
            dot.setAttribute('stroke', tone(info.cluster));
            dot.setAttribute('r', String(PT_R + 1));
          }
          if (ring) ring.setAttribute('r', '0');
        });
        if (destroyed) return;

        const value = rowValues.get(info.index);
        if (value) {
          value.textContent = t('board.reach', 'reach {d}', { d: info.dist.toFixed(2) });
          value.setAttribute('fill', tone(info.cluster));
        }
        rowGroups.get(info.index)?.setAttribute('opacity', '0.55');
        // 0 은 흐리게 두지 않는다 — 이 방법이 아무것도 남기지 못했다는 것이
        // 결론이지 빈 값이 아니다.
        countText.textContent = String(info.remaining);
      },

      rewind(): void {
        build();
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

    return api;
  },
};
