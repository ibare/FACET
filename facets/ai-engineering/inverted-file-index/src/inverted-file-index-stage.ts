/**
 * 역파일 색인 stage — 왼쪽은 점이 놓인 평면, 오른쪽은 색인 그 자체.
 *
 * ── 형태를 이렇게 잡은 까닭
 *
 * 이 화면의 동사는 **되찾는다** 이다. 칸을 하나 더 열면 빠뜨렸던 점이 답으로
 * 돌아오고 그만큼 본 점이 는다. 그래서 움직이는 것을 셋 두었다.
 *
 *   1. **답의 번호표가 평면을 가로질러 옮겨 간다.** 점은 제자리에 있고(좌표가
 *      곧 거리이므로 점을 움직이면 거짓이 된다) 1~5 번 번호표가 임자를 바꾼다.
 *      칸 1 을 열면 4 번 표가 왼쪽 아래에서 오른쪽 아래로 날아간다 — 그것이
 *      "빠뜨렸던 것이 답으로 돌아온다" 의 실제 모습이다.
 *   2. **색인의 줄이 여는 차례로 스스로 정렬한다.** 마운트 직후에는 칸 번호
 *      차례로 서 있고, 차례를 재는 걸음에서 질의에 가까운 줄이 위로 올라온다.
 *   3. **대표에서 자기 점으로 살이 뻗는다.** 칸을 여는 일은 그 명단을 훑는
 *      일이므로, 영역을 칠하는 대신 대표와 점을 잇는 선이 자란다.
 *
 * 칸을 영역(보로노이)으로 칠하지 않는다. 형제 조각이 이미 그 골격을 썼고, 여기서
 * 중요한 것은 영역의 모양이 아니라 **명단을 몇 줄 훑었는가** 다.
 *
 * ── 축척
 *
 * 평면은 가로세로 축척이 같다 (한 칸 = 15px). 거리가 뜻을 지는 화면이라 다른
 * 선택지가 없다. 데이터가 정사각(0.5~20.5) 이므로 평면도 정사각이고, 그래서
 * 남는 폭이 오른쪽에 생긴다 — 그 폭에 색인 패널을 둔다. 패널 폭이 270 인 것은
 * 취향이 아니라 정사각 평면을 620 에서 뺀 나머지다.
 *
 * ── 화면이 말하는 수와 화면에 선 것
 *
 * 본 점의 수는 `scanned` 배열의 길이이고, 칠해지는 점도 칩도 **그 배열 하나**를
 * 돌며 정해진다. 세는 배열과 그리는 배열이 같으므로 둘이 어긋날 자리가 없다.
 *
 * 색인 줄의 칩도 마찬가지로 algorithm 이 준 명단(`cells[c]`)을 그대로 짓는다.
 * 칩 수를 상수로 못박아 두면 한 칸에 일곱이 드는 데이터로 바뀌었을 때 일곱째가
 * 조용히 사라지고, 계기는 7 을 세는데 화면에는 6 만 선다. 칩 너비는 패널 폭에서
 * 역산하고 상수는 **상한**만 진다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core';

const NS = 'http://www.w3.org/2000/svg';

const CANVAS_H = 380;
const PAD = 14;
const CAPTION_BASELINE = 26;
const TOP = 46;
/** 평면의 한 변. 데이터가 정사각이라 이 값 하나가 가로세로를 함께 정한다. */
const PLANE = 300;
const PLANE_X = PAD;
const PLANE_Y = TOP;
const PANEL_GAP = 22;
const PANEL_X = PAD + PLANE + PANEL_GAP;
const PANEL_W = PIECE_CANVAS_W - PANEL_X - PAD;
const ROW_H = 66;
const ROW_GAP = 12;
/** 칩 너비의 상한. 실제 너비는 명단 길이로 패널 폭에서 역산한다. */
const CHIP_MAX_W = 42;
const CHIP_H = 20;
const CHIP_GAP = 3;
const CHIP_MARGIN = 4;
const LEGEND_BASELINE = TOP + PLANE + 22;

/** 데이터 영역 — 점이 2~19 에 있으므로 0.5~20.5 로 잡아 가장자리를 띄운다. */
const DOMAIN_MIN = 0.5;
const DOMAIN_SPAN = 20;
const UNIT = PLANE / DOMAIN_SPAN;

const DOT_R = 4.5;
const RING_R = 9.5;
const BADGE_R = 8.5;

const FRAME_MS = 24;
const SPOKE_MS = 340;
const MOVE_MS = 420;
const ROW_MS = 380;

type Scene = {
  points: number[][];
  centroids: number[][];
  query: number[];
  k: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function pair(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [a, b] = value as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return [a, b];
}

function pairs(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: number[][] = [];
  for (const item of value) {
    const p = pair(item);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}

/**
 * `initialData` 를 좁히는 자리는 여기 하나다. projector 가 같은 것을 다시 좁혀
 * 밀어 넣지 않는다 — mount 가 반드시 불리는 유일한 경로다.
 */
function readScene(raw: unknown): Scene {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('역파일 색인 stage: initialData 가 없다');
  }
  const d = raw as Record<string, unknown>;
  const points = pairs(d.points);
  const centroids = pairs(d.centroids);
  const query = pair(d.query);
  const k = typeof d.k === 'number' ? d.k : 0;
  if (points === null || centroids === null || query === null || k <= 0) {
    throw new Error('역파일 색인 stage: points · centroids · query · k 가 모두 있어야 한다');
  }
  return { points, centroids, query, k };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

export const invertedFileIndexStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  // 컨테이너는 쓰지 않는다 — 러너가 만들어 붙인 캔버스 안에만 그린다. 컨테이너를
  // 건드리면 그 캔버스가 떨어져 나간다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const cellCount = scene.centroids.length;
    const px = (x: number): number => PLANE_X + (x - DOMAIN_MIN) * UNIT;
    const py = (y: number): number => PLANE_Y + PLANE - (y - DOMAIN_MIN) * UNIT;
    const qx = px(scene.query[0]);
    const qy = py(scene.query[1]);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

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

    /** 프레임마다 apply(0~1) 를 부른다. 접히면 끝 모습으로 건너뛴다. */
    async function tween(ms: number, apply: (t: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (destroyed) {
          apply(1);
          return;
        }
        await wait(FRAME_MS);
        apply(f / frames);
      }
    }

    const root = el('g', {});
    svg.appendChild(root);

    // ── 평면
    root.appendChild(
      el('rect', {
        x: PLANE_X,
        y: PLANE_Y,
        width: PLANE,
        height: PLANE,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    for (const line of [
      { x1: PLANE_X, y1: qy, x2: PLANE_X + PLANE, y2: qy },
      { x1: qx, y1: PLANE_Y, x2: qx, y2: PLANE_Y + PLANE },
    ]) {
      root.appendChild(
        el('line', {
          ...line,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 4',
        }),
      );
    }

    const spokeLayer = el('g', {});
    root.appendChild(spokeLayer);

    const ringLayer = el('g', {});
    root.appendChild(ringLayer);
    const rings = scene.points.map((p) =>
      el('circle', {
        cx: px(p[0]),
        cy: py(p[1]),
        r: RING_R,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.4,
        'stroke-dasharray': '3 3',
        opacity: 0,
      }),
    );
    for (const ring of rings) ringLayer.appendChild(ring);

    const dotLayer = el('g', {});
    root.appendChild(dotLayer);
    const dots = scene.points.map((p) =>
      el('circle', {
        cx: px(p[0]),
        cy: py(p[1]),
        r: DOT_R,
        fill: colors.itemDefault,
        stroke: colors.textMuted,
        'stroke-width': 1.2,
      }),
    );
    for (const dot of dots) dotLayer.appendChild(dot);

    // 대표 — 마름모에 칸 번호. 색인 패널의 줄머리와 같은 글리프다.
    const centroidLayer = el('g', {});
    root.appendChild(centroidLayer);
    for (let c = 0; c < cellCount; c += 1) {
      const cx = px(scene.centroids[c][0]);
      const cy = py(scene.centroids[c][1]);
      const g = el('g', { transform: `translate(${cx} ${cy})` });
      g.appendChild(
        el('rect', {
          x: -9,
          y: -9,
          width: 18,
          height: 18,
          rx: 3,
          transform: 'rotate(45)',
          fill: colors.primary,
          stroke: colors.bg,
          'stroke-width': 1.2,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 3.5,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      label.textContent = String(c + 1);
      g.appendChild(label);
      centroidLayer.appendChild(g);
    }

    // 질의 — 굵은 십자.
    const queryG = el('g', {});
    for (const line of [
      { x1: qx - 9, y1: qy, x2: qx + 9, y2: qy },
      { x1: qx, y1: qy - 9, x2: qx, y2: qy + 9 },
    ]) {
      queryG.appendChild(el('line', { ...line, stroke: colors.danger, 'stroke-width': 2.6 }));
    }
    root.appendChild(queryG);

    // 답의 번호표 — 임자를 바꾸며 평면을 가로지른다.
    const badgeLayer = el('g', {});
    root.appendChild(badgeLayer);
    const badges: SVGGElement[] = [];
    const badgeAt: number[][] = [];
    for (let r = 0; r < scene.k; r += 1) {
      const g = el('g', { transform: `translate(${qx} ${qy})`, opacity: 0 });
      g.appendChild(
        el('circle', {
          cx: 0,
          cy: 0,
          r: BADGE_R,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1,
        }),
      );
      const label = el('text', {
        x: 0,
        y: 3.5,
        'text-anchor': 'middle',
        fill: colors.stateInk,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      label.textContent = String(r + 1);
      g.appendChild(label);
      badgeLayer.appendChild(g);
      badges.push(g);
      badgeAt.push([qx, qy]);
    }
    function badgeAnchor(pointIndex: number): number[] {
      const p = scene.points[pointIndex];
      return [px(p[0]) + 12, py(p[1]) - 12];
    }

    // ── 색인 패널
    const panelHead = el('text', {
      x: PANEL_X,
      y: TOP - 8,
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    panelHead.textContent = t('label.index', 'Index cells');
    root.appendChild(panelHead);

    const rowSlotY = (slot: number): number => TOP + slot * (ROW_H + ROW_GAP);

    type Chip = { box: SVGRectElement; text: SVGTextElement };
    type Row = {
      g: SVGGElement;
      box: SVGRectElement;
      /** 칩이 사는 자리. 명단을 받을 때마다 통째로 다시 짓는다. */
      chipsG: SVGGElement;
      chips: Chip[];
      slot: number;
    };
    const rows: Row[] = [];
    const rowLayer = el('g', {});
    root.appendChild(rowLayer);

    for (let c = 0; c < cellCount; c += 1) {
      const g = el('g', { transform: `translate(0 ${rowSlotY(c)})` });
      const box = el('rect', {
        x: PANEL_X,
        y: 0,
        width: PANEL_W,
        height: ROW_H,
        rx: 5,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1,
      });
      g.appendChild(box);

      const glyph = el('g', { transform: `translate(${PANEL_X + 17} 17)` });
      glyph.appendChild(
        el('rect', {
          x: -7,
          y: -7,
          width: 14,
          height: 14,
          rx: 2,
          transform: 'rotate(45)',
          fill: colors.primary,
        }),
      );
      const glyphText = el('text', {
        x: 0,
        y: 3.2,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      glyphText.textContent = String(c + 1);
      glyph.appendChild(glyphText);
      g.appendChild(glyph);

      // 대표가 질의에서 얼마나 떨어져 있는가 — 줄의 차례가 왜 그런지를 댄다.
      const dx = scene.centroids[c][0] - scene.query[0];
      const dy = scene.centroids[c][1] - scene.query[1];
      const dist = el('text', {
        x: PANEL_X + 34,
        y: 21,
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      dist.textContent = `d = ${Math.sqrt(dx * dx + dy * dy).toFixed(2)}`;
      g.appendChild(dist);

      const chipsG = el('g', {});
      g.appendChild(chipsG);

      rowLayer.appendChild(g);
      rows.push({ g, box, chipsG, chips: [], slot: c });
    }

    /** 한 줄의 칩을 명단대로 다시 짓는다. 너비는 패널 폭에서 역산한다. */
    function buildChips(row: Row, members: number[]): Chip[] {
      while (row.chipsG.firstChild !== null) row.chipsG.firstChild.remove();
      const count = members.length;
      if (count === 0) return [];
      const span = PANEL_W - CHIP_MARGIN * 2;
      const width = Math.min(CHIP_MAX_W, Math.floor((span - CHIP_GAP * (count - 1)) / count));
      const x0 = PANEL_X + Math.round((PANEL_W - (count * width + CHIP_GAP * (count - 1))) / 2);
      const out: Chip[] = [];
      for (let s = 0; s < count; s += 1) {
        const cx = x0 + s * (width + CHIP_GAP);
        const box = el('rect', {
          x: cx,
          y: 34,
          width,
          height: CHIP_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const text = el('text', {
          x: cx + width / 2,
          y: 48,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        const p = scene.points[members[s]];
        text.textContent = `${p[0]},${p[1]}`;
        row.chipsG.appendChild(box);
        row.chipsG.appendChild(text);
        out.push({ box, text });
      }
      return out;
    }

    /** 점 번호 → 그 점이 앉은 칩. round-begin 에서 명단을 받아 채운다. */
    const chipOf = new Map<number, { box: SVGRectElement; text: SVGTextElement }>();

    // ── 캡션과 범례
    const caption = el('text', {
      x: PAD,
      y: CAPTION_BASELINE,
      fill: colors.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    root.appendChild(caption);

    const legend = el('g', {});
    root.appendChild(legend);
    let legendX = PAD;
    function legendItem(draw: (x: number) => SVGElement, text: string): void {
      legend.appendChild(draw(legendX));
      const label = el('text', {
        x: legendX + 14,
        y: LEGEND_BASELINE + 4,
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      label.textContent = text;
      legend.appendChild(label);
      legendX += 22 + text.length * 7;
    }
    legendItem((x) => {
      const g = el('g', {});
      g.appendChild(
        el('line', {
          x1: x - 5,
          y1: LEGEND_BASELINE,
          x2: x + 5,
          y2: LEGEND_BASELINE,
          stroke: colors.danger,
          'stroke-width': 2.4,
        }),
      );
      g.appendChild(
        el('line', {
          x1: x,
          y1: LEGEND_BASELINE - 5,
          x2: x,
          y2: LEGEND_BASELINE + 5,
          stroke: colors.danger,
          'stroke-width': 2.4,
        }),
      );
      return g;
    }, t('label.query', 'query'));
    legendItem(
      (x) =>
        el('circle', {
          cx: x,
          cy: LEGEND_BASELINE,
          r: 6,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.4,
          'stroke-dasharray': '3 3',
        }),
      t('label.truth', 'true five'),
    );
    legendItem(
      (x) =>
        el('circle', {
          cx: x,
          cy: LEGEND_BASELINE,
          r: 6,
          fill: colors.accent,
          stroke: colors.stateInk,
          'stroke-width': 1,
        }),
      t('label.answer', 'answer'),
    );

    // ── 상태를 처음으로 되돌리는 일 (mount 직후 = reset 직후)
    let spokes: SVGPathElement[] = [];
    /** 이번 판에 이미 켜 둔 점. 이번 걸음에 새로 켤 것을 가리는 데만 쓴다. */
    const litPoints = new Set<number>();

    function clearSpokes(): void {
      for (const spoke of spokes) spoke.remove();
      spokes = [];
    }

    function resetVisual(): void {
      clearSpokes();
      litPoints.clear();
      for (const ring of rings) ring.setAttribute('opacity', '0');
      for (const dot of dots) {
        dot.setAttribute('fill', colors.itemDefault);
        dot.setAttribute('stroke', colors.textMuted);
      }
      chipOf.clear();
      for (const row of rows) {
        while (row.chipsG.firstChild !== null) row.chipsG.firstChild.remove();
        row.chips = [];
        row.box.setAttribute('stroke', colors.border);
        row.box.setAttribute('stroke-width', '1');
        row.g.setAttribute('opacity', '1');
      }
      for (let c = 0; c < rows.length; c += 1) {
        rows[c].slot = c;
        rows[c].g.setAttribute('transform', `translate(0 ${rowSlotY(c)})`);
      }
      for (let r = 0; r < badges.length; r += 1) {
        badges[r].setAttribute('opacity', '0');
        badges[r].setAttribute('transform', `translate(${qx} ${qy})`);
        badgeAt[r] = [qx, qy];
      }
      caption.textContent = '';
    }

    /** 번호표를 새 임자에게 옮긴다. 빈 자리는 질의로 거둔다. */
    async function moveBadges(holders: number[]): Promise<void> {
      const from = badgeAt.map((p) => [p[0], p[1]]);
      const to = badges.map((_, r) => {
        const holder = holders[r];
        return holder === undefined ? [qx, qy] : badgeAnchor(holder);
      });
      for (let r = 0; r < badges.length; r += 1) {
        if (holders[r] !== undefined) badges[r].setAttribute('opacity', '1');
      }
      await tween(MOVE_MS, (t0) => {
        const e = easeInOut(t0);
        for (let r = 0; r < badges.length; r += 1) {
          const x = from[r][0] + (to[r][0] - from[r][0]) * e;
          const y = from[r][1] + (to[r][1] - from[r][1]) * e;
          badges[r].setAttribute('transform', `translate(${x} ${y})`);
        }
      });
      for (let r = 0; r < badges.length; r += 1) {
        badgeAt[r] = to[r];
        if (holders[r] === undefined) badges[r].setAttribute('opacity', '0');
      }
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.remove();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 판을 세운다 — 명단을 칩에 적고, 참값에 고리를 두르고, 번호표를 거둔다. */
      async beginRound(args: { truth: number[]; cells: number[][] }): Promise<void> {
        clearSpokes();
        litPoints.clear();
        for (const dot of dots) {
          dot.setAttribute('fill', colors.itemDefault);
          dot.setAttribute('stroke', colors.textMuted);
        }
        chipOf.clear();
        for (let c = 0; c < rows.length; c += 1) {
          const members = args.cells[c] ?? [];
          rows[c].g.setAttribute('opacity', '1');
          rows[c].box.setAttribute('stroke', colors.border);
          rows[c].box.setAttribute('stroke-width', '1');
          // 칩은 명단 그대로 짓는다 — 칸에 든 점이 여섯이 아니어도 하나가
          // 조용히 사라지지 않는다.
          rows[c].chips = buildChips(rows[c], members);
          for (let s = 0; s < members.length; s += 1) chipOf.set(members[s], rows[c].chips[s]);
        }
        for (let i = 0; i < rings.length; i += 1) {
          rings[i].setAttribute('opacity', args.truth.includes(i) ? '1' : '0');
        }
        await moveBadges([]);
      },

      /** 여는 차례대로 줄이 스스로 정렬한다. */
      async showOrder(args: { order: number[] }): Promise<void> {
        const from = rows.map((row) => rowSlotY(row.slot));
        const to = rows.map((row, c) => {
          const slot = args.order.indexOf(c);
          return rowSlotY(slot < 0 ? row.slot : slot);
        });
        await tween(ROW_MS, (t0) => {
          const e = easeInOut(t0);
          for (let c = 0; c < rows.length; c += 1) {
            const y = from[c] + (to[c] - from[c]) * e;
            rows[c].g.setAttribute('transform', `translate(0 ${y})`);
          }
        });
        for (let c = 0; c < rows.length; c += 1) {
          const slot = args.order.indexOf(c);
          if (slot >= 0) rows[c].slot = slot;
        }
      },

      /** 칸 하나를 연다 — 살이 뻗고, 명단이 켜지고, 번호표가 옮겨 간다. */
      async openCell(args: { cell: number; scanned: number[]; answer: number[] }): Promise<void> {
        const row = rows[args.cell];
        if (row !== undefined) {
          row.box.setAttribute('stroke', colors.text);
          row.box.setAttribute('stroke-width', '1.8');
        }

        const cx = px(scene.centroids[args.cell][0]);
        const cy = py(scene.centroids[args.cell][1]);
        // 이번 걸음에 새로 켤 점 — 살은 그것들에만 뻗는다.
        const fresh = args.scanned
          .filter((i) => !litPoints.has(i))
          .map((i) => {
            const p = scene.points[i];
            const path = el('path', {
              d: `M ${cx} ${cy} L ${cx} ${cy}`,
              stroke: colors.itemComparing,
              'stroke-width': 1.2,
              fill: 'none',
            });
            spokeLayer.appendChild(path);
            spokes.push(path);
            return { path, x: px(p[0]), y: py(p[1]) };
          });
        await tween(SPOKE_MS, (t0) => {
          const e = easeInOut(t0);
          for (const spoke of fresh) {
            const x = cx + (spoke.x - cx) * e;
            const y = cy + (spoke.y - cy) * e;
            spoke.path.setAttribute('d', `M ${cx} ${cy} L ${x} ${y}`);
          }
        });

        // 본 점은 `scanned` 하나만 돌며 정한다 — 계기가 세는 배열과 같은 것이다.
        for (const i of args.scanned) {
          litPoints.add(i);
          dots[i].setAttribute('fill', colors.itemComparing);
          dots[i].setAttribute('stroke', colors.stateInk);
          const chip = chipOf.get(i);
          if (chip !== undefined) {
            chip.box.setAttribute('fill', colors.itemComparing);
            chip.box.setAttribute('stroke', colors.stateInk);
            chip.text.setAttribute('fill', colors.stateInk);
          }
        }

        await moveBadges(args.answer);
      },

      /** 열지 않은 줄을 흐리게 둔다 — 이번 판이 무엇을 건너뛰었는지 남긴다. */
      finishRound(args: { opened: number[] }): void {
        for (let c = 0; c < rows.length; c += 1) {
          rows[c].g.setAttribute('opacity', args.opened.includes(c) ? '1' : '0.4');
        }
      },

      reset(): void {
        resetVisual();
      },
    };
  },
};
