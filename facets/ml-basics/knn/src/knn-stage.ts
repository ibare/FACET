/**
 * knn-stage — k-최근접 이웃 전용 화면 하나.
 *
 * 왼쪽은 평면이다. 24 × 24 격자 576 칸을 지금 k 로 판정한 색으로 칠하므로
 * **경계**가 그림에 직접 나온다. k 가 바뀌어 판정이 뒤집힌 칸은 테두리를 둘러
 * 어디가 갈렸는지 남긴다. 이름표 있는 자료 열여덟은 A 는 동그라미, B 는 네모로
 * 그려 색을 못 보는 눈에도 갈린다. 지금 k 에서 자기 이름표와 다르게 판정되는
 * 점에는 붉은 고리를 두른다.
 *
 * 오른쪽은 투표판이다. 불려 나온 이웃이 뽑힌 차례대로 띠에 한 칸씩 쌓이고,
 * 그 띠의 색깔 수가 곧 다수결이다. 물음점에서 자란 테두리(원)가 방금 뽑힌
 * 이웃까지 닿는 것을 왼쪽에서 함께 본다 — 조각 둘(가까운 다섯의 투표 ·
 * 테두리가 자라며 답이 뒤집힘)이 여기서 한 물건의 두 얼굴이 된다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 격자 크기도 물음점 수도 선언이 정하는 고정값이라 내용에 따라 커질 일이 없다.
 * `viewBox` 는 `canvas` 선언 그대로 두고 다시 재지 않는다.
 *
 * ── 뒷일
 *
 * 타이머도 프레임 루프도 리스너도 두지 않는다. 이 view 는 projector 가 부르는
 * 메서드에만 반응하며, 시간은 algorithm 쪽 `ctx.sleep` 이 잰다. `destroy()` 는
 * 캔버스 안쪽만 비운다 — 캔버스 자체는 러너가 만들어 붙인 것이라 그것을 지우면
 * 화면이 통째로 사라진다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 760;
const CANVAS_H = 456;

/** 평면 (왼쪽) 의 자리와 크기. */
const PLANE_X = 44;
const PLANE_Y = 20;
const PLANE_SIZE = 380;

/** 투표판 (오른쪽) 의 자리와 폭. */
const PANEL_X = 452;
const PANEL_W = 296;

/** 표식 — 도형에 새겨진 이름표 글자. 번역 대상이 아니다 (C10). */
const TAG_A = 'A';
const TAG_B = 'B';

/** 격자 tint 의 투명도. 자료 점과 겹쳐도 점이 이기도록 옅게 깐다. */
const CELL_OPACITY = 0.5;

type Attrs = Record<string, string | number>;

type BoundaryInput = {
  k: number;
  cells: number[];
  gridSize: number;
  aCells: number;
  cellTotal: number;
  flipped: number[];
  mislabeled: number[];
  prevK: number;
};

type QueryInput = { index: number; total: number; x: number; y: number; ownLabel: number };
type NeighborInput = { index: number; rank: number; radius: number; label: number };
type VoteInput = { votesA: number; votesB: number };
type VerdictInput = { label: number; votesA: number; votesB: number; ownLabel: number };

export const knnStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const dark = params.theme === 'dark';

    /** 두 부류를 가르는 색. 이름표는 카테고리라 categorical 로 받는다 (S-view 3번). */
    const inkFor = categorical(2, 'vivid');
    const tintFor = categorical(2, dark ? 'deep' : 'pastel');

    function mk(tag: string, attrs: Attrs, parent: SVGElement): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      parent.appendChild(node);
      return node;
    }

    function text(
      content: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      parent: SVGElement,
      anchor = 'start',
      weight = '400',
    ): SVGElement {
      const node = mk(
        'text',
        {
          x,
          y,
          'font-family': fonts.body,
          'font-size': size,
          'font-weight': weight,
          fill,
          'text-anchor': anchor,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    /**
     * SVG 는 줄바꿈이 없다. 글자 폭을 어림해 잘라 여러 줄로 민다 — 번역이
     * 길어지는 언어에서 오른쪽으로 흘러 나가지 않게. 한글·한자 낱자는 글꼴
     * 크기만큼, 라틴 글자는 그 절반쯤으로 친다.
     */
    function wrap(content: string, size: string, width: number): string[] {
      const px = parseFloat(size) || 12;
      const widthOf = (s: string): number => {
        let sum = 0;
        for (const ch of s) sum += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]/.test(ch) ? px : px * 0.55;
        return sum;
      };
      const lines: string[] = [];
      let line = '';
      for (const word of content.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && widthOf(next) > width) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    // ── 레이어. 아래에서 위로 겹친다.
    const cellsLayer = mk('g', {}, svg);
    const flipLayer = mk('g', {}, svg);
    const frameLayer = mk('g', {}, svg);
    const spokeLayer = mk('g', {}, svg);
    const linkLayer = mk('g', {}, svg);
    const ringLayer = mk('g', {}, svg);
    const pointLayer = mk('g', {}, svg);
    const queryLayer = mk('g', {}, svg);
    const panelLayer = mk('g', {}, svg);
    const captionLayer = mk('g', {}, svg);

    // ── 초기 데이터에서 구조만 읽는다. 좌표 셈은 여기(stage) 가 한다.
    const raw = params.initialData as
      | { points?: unknown; planeMin?: unknown; planeMax?: unknown }
      | undefined;
    const points: Array<{ x: number; y: number; label: number }> = [];
    if (Array.isArray(raw?.points)) {
      for (const p of raw.points) {
        if (typeof p !== 'object' || p === null) continue;
        const rec = p as Record<string, unknown>;
        if (typeof rec.x !== 'number' || typeof rec.y !== 'number') continue;
        points.push({ x: rec.x, y: rec.y, label: rec.label === 1 ? 1 : 0 });
      }
    }
    const planeMin = typeof raw?.planeMin === 'number' ? raw.planeMin : 0;
    const planeMax = typeof raw?.planeMax === 'number' ? raw.planeMax : 8;
    const span = planeMax - planeMin || 1;

    const toX = (x: number): number => PLANE_X + ((x - planeMin) / span) * PLANE_SIZE;
    const toY = (y: number): number => PLANE_Y + PLANE_SIZE - ((y - planeMin) / span) * PLANE_SIZE;
    const toLen = (d: number): number => (d / span) * PLANE_SIZE;

    // ── 평면 테두리와 눈금.
    mk(
      'rect',
      {
        x: PLANE_X,
        y: PLANE_Y,
        width: PLANE_SIZE,
        height: PLANE_SIZE,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      },
      frameLayer,
    );
    text(String(planeMin), PLANE_X - 8, PLANE_Y + PLANE_SIZE + 4, fontSizes.xs, colors.textMuted, frameLayer, 'end');
    text(String(planeMax), PLANE_X - 8, PLANE_Y + 10, fontSizes.xs, colors.textMuted, frameLayer, 'end');
    text(String(planeMax), PLANE_X + PLANE_SIZE, PLANE_Y + PLANE_SIZE + 16, fontSizes.xs, colors.textMuted, frameLayer, 'middle');

    // ── 자료 점. A 는 동그라미, B 는 네모 — 색을 못 봐도 갈린다.
    const mislabelNodes: SVGElement[] = [];
    for (const p of points) {
      const cx = toX(p.x);
      const cy = toY(p.y);
      mislabelNodes.push(
        mk(
          'circle',
          { cx, cy, r: 9, fill: 'none', stroke: colors.danger, 'stroke-width': 2, opacity: 0 },
          pointLayer,
        ),
      );
      const ink = inkFor[p.label];
      if (p.label === 0) {
        mk('circle', { cx, cy, r: 5, fill: ink, stroke: colors.bg, 'stroke-width': 1.2 }, pointLayer);
      } else {
        mk(
          'rect',
          { x: cx - 4.6, y: cy - 4.6, width: 9.2, height: 9.2, fill: ink, stroke: colors.bg, 'stroke-width': 1.2 },
          pointLayer,
        );
      }
    }

    // ── 자란 테두리 — 방금 뽑은 이웃까지 닿는 원. 점보다 아래에 둔다.
    const reachRing = mk(
      'circle',
      {
        cx: -50,
        cy: -50,
        r: 0,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
        opacity: 0,
      },
      ringLayer,
    );

    // ── 물음점 표식.
    const queryCross = mk(
      'path',
      { d: '', stroke: colors.stateInk, 'stroke-width': 1.2, fill: 'none' },
      queryLayer,
    );
    const queryRing = mk(
      'circle',
      { cx: -50, cy: -50, r: 7, fill: colors.accent, stroke: colors.stateInk, 'stroke-width': 1.5 },
      queryLayer,
    );

    // ── 투표판.
    const askingLine = text('', PANEL_X, 30, fontSizes.md, colors.text, panelLayer, 'start', '600');

    const STRIP_Y = 44;
    const STRIP_H = 22;
    const stripLayer = mk('g', {}, panelLayer);

    mk('circle', { cx: PANEL_X + 6, cy: 84, r: 5, fill: inkFor[0] }, panelLayer);
    const tallyTextA = text('', PANEL_X + 18, 88, fontSizes.sm, colors.text, panelLayer);
    mk('rect', { x: PANEL_X + 90, y: 79, width: 10, height: 10, fill: inkFor[1] }, panelLayer);
    const tallyTextB = text('', PANEL_X + 108, 88, fontSizes.sm, colors.text, panelLayer);

    const verdictLine = text('', PANEL_X, 118, fontSizes.lg, colors.text, panelLayer, 'start', '600');
    const ownLayer = mk('g', {}, panelLayer);

    mk(
      'line',
      { x1: PANEL_X, y1: 186, x2: PANEL_X + PANEL_W, y2: 186, stroke: colors.border, 'stroke-width': 1 },
      panelLayer,
    );

    const statsLayer = mk('g', {}, panelLayer);

    // ── 범례.
    const LEGEND_Y = 362;
    text(tr('label.legend', 'tagged data'), PANEL_X, LEGEND_Y, fontSizes.xs, colors.textMuted, panelLayer);
    mk('circle', { cx: PANEL_X + 7, cy: LEGEND_Y + 20, r: 5, fill: inkFor[0] }, panelLayer);
    text(TAG_A, PANEL_X + 20, LEGEND_Y + 24, fontSizes.sm, colors.text, panelLayer);
    mk('rect', { x: PANEL_X + 62, y: LEGEND_Y + 15, width: 10, height: 10, fill: inkFor[1] }, panelLayer);
    text(TAG_B, PANEL_X + 80, LEGEND_Y + 24, fontSizes.sm, colors.text, panelLayer);
    mk(
      'circle',
      { cx: PANEL_X + 129, cy: LEGEND_Y + 20, r: 7, fill: 'none', stroke: colors.danger, 'stroke-width': 2 },
      panelLayer,
    );
    text(
      tr('label.overruledRing', 'overruled'),
      PANEL_X + 144,
      LEGEND_Y + 24,
      fontSizes.xs,
      colors.textMuted,
      panelLayer,
    );

    const captionLines = mk('g', {}, captionLayer);

    // ── 상태. projector 가 부르는 메서드가 이것만 갈아 끼운다.
    let currentK = 0;
    let queryX = -50;
    let queryY = -50;

    function clearGroup(group: SVGElement): void {
      group.textContent = '';
    }

    function setCaption(content: string): void {
      clearGroup(captionLines);
      const lines = wrap(content, fontSizes.sm, CANVAS_W - PLANE_X * 2);
      for (let i = 0; i < lines.length && i < 2; i += 1) {
        text(lines[i], PLANE_X, 436 + i * 16, fontSizes.sm, colors.textMuted, captionLines);
      }
    }

    function drawStrip(k: number, taken: number[]): void {
      clearGroup(stripLayer);
      if (k <= 0) return;
      const gap = 2;
      const cellW = (PANEL_W - gap * (k - 1)) / k;
      for (let i = 0; i < k; i += 1) {
        mk(
          'rect',
          {
            x: PANEL_X + i * (cellW + gap),
            y: STRIP_Y,
            width: cellW,
            height: STRIP_H,
            rx: 2,
            fill: i < taken.length ? inkFor[taken[i]] : colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          },
          stripLayer,
        );
      }
    }

    function drawStats(input: BoundaryInput): void {
      clearGroup(statsLayer);
      let y = 208;
      const push = (content: string): void => {
        for (const line of wrap(content, fontSizes.sm, PANEL_W)) {
          text(line, PANEL_X, y, fontSizes.sm, colors.textMuted, statsLayer);
          y += 17;
        }
        y += 7;
      };
      push(
        tr('label.aCells', 'cells judged A: {a} out of {total}', {
          a: input.aCells,
          total: input.cellTotal,
        }),
      );
      if (input.prevK >= 0) {
        push(
          tr('label.flipped', 'moving k from {prev} to {k} flipped {n} cells', {
            prev: input.prevK,
            k: input.k,
            n: input.flipped.length,
          }),
        );
      } else {
        push(tr('label.firstDraw', 'the first drawing, with no earlier k to compare against'));
      }
      push(
        tr('label.mislabeled', 'points judged against their own tag: {n}', {
          n: input.mislabeled.length,
        }),
      );
    }

    function setOwnNote(content: string, tone: string): void {
      clearGroup(ownLayer);
      if (!content) return;
      const lines = wrap(content, fontSizes.sm, PANEL_W);
      for (let i = 0; i < lines.length && i < 3; i += 1) {
        text(lines[i], PANEL_X, 144 + i * 16, fontSizes.sm, tone, ownLayer);
      }
    }

    /** 처음 화면의 글. 두 곳에서 쓰이므로 en 원본이 한 번만 나오게 모은다 (C10). */
    const idleCaption = (): string =>
      tr('caption.idle', 'every spot on the plane already has an answer, and that is the boundary');

    setCaption(idleCaption());

    return {
      destroy(): void {
        // 타이머도 리스너도 두지 않았으므로 거둘 것은 그린 것뿐이다.
        // 캔버스 자체는 러너 소유라 안쪽만 비운다 (S-view).
        svg.textContent = '';
      },

      /** 평면 전체를 다시 칠한다. */
      setBoundary(input: BoundaryInput): void {
        currentK = input.k;
        clearGroup(cellsLayer);
        clearGroup(flipLayer);
        const size = PLANE_SIZE / input.gridSize;
        for (let cell = 0; cell < input.cells.length; cell += 1) {
          const col = cell % input.gridSize;
          const row = Math.floor(cell / input.gridSize);
          mk(
            'rect',
            {
              x: PLANE_X + col * size,
              y: PLANE_Y + PLANE_SIZE - (row + 1) * size,
              width: size + 0.5,
              height: size + 0.5,
              fill: tintFor[input.cells[cell]],
              'fill-opacity': CELL_OPACITY,
            },
            cellsLayer,
          );
        }
        for (const cell of input.flipped) {
          const col = cell % input.gridSize;
          const row = Math.floor(cell / input.gridSize);
          mk(
            'rect',
            {
              x: PLANE_X + col * size + 0.5,
              y: PLANE_Y + PLANE_SIZE - (row + 1) * size + 0.5,
              width: size - 1,
              height: size - 1,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 1.5,
            },
            flipLayer,
          );
        }
        const flagged = new Set(input.mislabeled);
        for (let i = 0; i < mislabelNodes.length; i += 1) {
          mislabelNodes[i].setAttribute('opacity', flagged.has(i) ? '1' : '0');
        }
        askingLine.textContent = tr('label.asking', 'asking the nearest {k}', { k: input.k });
        drawStrip(input.k, []);
        drawStats(input);
      },

      /** 물음점을 그 자리로 옮기고, 앞 물음의 흔적을 지운다. */
      beginQuery(input: QueryInput): void {
        queryX = toX(input.x);
        queryY = toY(input.y);
        queryRing.setAttribute('cx', String(queryX));
        queryRing.setAttribute('cy', String(queryY));
        queryCross.setAttribute(
          'd',
          `M ${queryX - 11} ${queryY} L ${queryX + 11} ${queryY} M ${queryX} ${queryY - 11} L ${queryX} ${queryY + 11}`,
        );
        reachRing.setAttribute('cx', String(queryX));
        reachRing.setAttribute('cy', String(queryY));
        reachRing.setAttribute('r', '0');
        reachRing.setAttribute('opacity', '0');
        clearGroup(spokeLayer);
        clearGroup(linkLayer);
        drawStrip(currentK, []);
        tallyTextA.textContent = `${TAG_A} 0`;
        tallyTextB.textContent = `${TAG_B} 0`;
        verdictLine.textContent = '';
        setOwnNote('', colors.textMuted);
        setCaption(
          tr('caption.moved', 'spot {index} of {total} is being asked', {
            index: input.index + 1,
            total: input.total,
          }),
        );
      },

      /** 자료 전부까지의 거리를 실오라기로 그린다 — 물을 때마다 전부 잰다. */
      showDistances(dists: number[]): void {
        clearGroup(spokeLayer);
        for (let i = 0; i < points.length && i < dists.length; i += 1) {
          mk(
            'line',
            {
              x1: queryX,
              y1: queryY,
              x2: toX(points[i].x),
              y2: toY(points[i].y),
              stroke: colors.border,
              'stroke-width': 1,
            },
            spokeLayer,
          );
        }
        setCaption(
          tr('caption.measuring', 'the distance to all {n} is measured again', { n: points.length }),
        );
      },

      /** 이웃 하나를 집는다 — 선이 이어지고 테두리가 그만큼 자란다. */
      takeNeighbor(input: NeighborInput): void {
        const target = points[input.index];
        if (target) {
          mk(
            'line',
            {
              x1: queryX,
              y1: queryY,
              x2: toX(target.x),
              y2: toY(target.y),
              stroke: inkFor[input.label],
              'stroke-width': 2,
            },
            linkLayer,
          );
        }
        reachRing.setAttribute('r', String(Math.max(1, toLen(input.radius))));
        reachRing.setAttribute('opacity', '1');
        setCaption(
          tr('caption.taking', 'the closest one still unpicked is called out, which makes {n}', {
            n: input.rank + 1,
          }),
        );
      },

      /** 집은 이웃이 표를 던진다 — 띠에 한 칸이 쌓인다. */
      castVote(input: VoteInput): void {
        const taken: number[] = [];
        for (let i = 0; i < input.votesA; i += 1) taken.push(0);
        for (let i = 0; i < input.votesB; i += 1) taken.push(1);
        drawStrip(currentK, taken);
        tallyTextA.textContent = `${TAG_A} ${input.votesA}`;
        tallyTextB.textContent = `${TAG_B} ${input.votesB}`;
      },

      /** 다수결이 끝났다. */
      setVerdict(input: VerdictInput): void {
        const tag = input.label === 0 ? TAG_A : TAG_B;
        verdictLine.textContent = tr('caption.verdict', 'this spot is judged {label}', {
          label: tag,
        });
        if (input.ownLabel < 0) {
          setOwnNote('', colors.textMuted);
        } else {
          const own = input.ownLabel === 0 ? TAG_A : TAG_B;
          const agrees = input.ownLabel === input.label;
          setOwnNote(
            agrees
              ? tr('caption.kept', 'its own tag is {own}, and the neighbours said the same', { own })
              : tr('caption.swallowed', 'its own tag is {own}, but the neighbours overruled it', {
                  own,
                }),
            agrees ? colors.textMuted : colors.danger,
          );
        }
        setCaption(
          tr('caption.settled', 'votes went {a} to {b}, so the answer is {label}', {
            a: input.votesA,
            b: input.votesB,
            label: tag,
          }),
        );
      },

      /** 한 바퀴 다 돌았다. */
      finish(): void {
        setCaption(
          tr('caption.done', 'the tour is over, and moving k changes the whole field at once'),
        );
      },

      /** 러너의 reset — 그린 것을 걷고 처음 글로 돌아간다. */
      clear(): void {
        clearGroup(spokeLayer);
        clearGroup(linkLayer);
        clearGroup(cellsLayer);
        clearGroup(flipLayer);
        clearGroup(statsLayer);
        for (const node of mislabelNodes) node.setAttribute('opacity', '0');
        reachRing.setAttribute('opacity', '0');
        queryRing.setAttribute('cx', '-50');
        queryRing.setAttribute('cy', '-50');
        queryCross.setAttribute('d', '');
        verdictLine.textContent = '';
        askingLine.textContent = '';
        tallyTextA.textContent = '';
        tallyTextB.textContent = '';
        setOwnNote('', colors.textMuted);
        drawStrip(0, []);
        setCaption(idleCaption());
      },
    };
  },
};
