/**
 * k-changes-boundary stage — 자란다, 그리고 뒤집힌다.
 *
 * 왼쪽은 무대다. 이름표 없는 물음점이 가운데 서고 이름표 있는 점 열이 흩어져
 * 있다. 그 위로 **테두리가 자란다** — 반지름은 k 번째 이웃과 k+1 번째 이웃
 * 거리의 한가운데라, 자라는 동안 담기는 이웃의 수가 딱 k 가 된다.
 *
 * 오른쪽이 주인공이 서는 자리다. 테두리에 든 이웃은 표 하나를 저울로 날려
 * 보내고, 표가 쌓이면 **저울이 기운다.** 기운 쪽이 답이고, 그 답은 물음점의
 * 카드에 새겨진다. k 가 커져 저울이 반대로 넘어가는 순간 카드가 뒤집힌다 —
 * 같은 점, 같은 데이터인데 답이 둘이 되는 순간이다.
 *
 * 운동은 셋 다 자리를 바꾸는 운동이다. 테두리의 반지름, 표의 비행, 저울대의
 * 회전. 색만 바뀌는 전이는 두지 않는다 (S-piece).
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 좌표는 전부 이 파일이 캔버스와
 * 데이터에서 역산한다 — 선언에는 점과 k 값만 있다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 356;

/** 산점도 판 — 정사각형이라야 테두리가 원으로 보인다. */
const PLOT_X = 22;
const PLOT_Y = 16;
const PLOT_SIZE = 300;
/** 가장 먼 점이 판 안에 여유 있게 들어오도록 데이터 반경에 곱하는 여백. */
const DOMAIN_PAD = 1.13;

/** 저울이 서는 오른쪽 폭. 남는 폭을 여백으로 버리지 않고 둘로 나눠 쓴다. */
const RIGHT_X = 346;
const RIGHT_W = 252;
const AXIS_CX = RIGHT_X + RIGHT_W / 2;

const K_ROW_Y = 60;
const K_SLOT_GAP = 54;
const K_PILL_W = 40;
const K_PILL_H = 34;

const PIVOT_Y = 200;
const BEAM_L = 98;
const ROD = 34;
const PAN_HALF = 32;
const TOKEN_R = 6;
const TOKEN_GAP = 16;
const TOKEN_ROW = 4;
const TOKEN_Y = -5;
const TILT_BASE = 12;
const TILT_STEP = 3;
const TILT_MAX = 20;

const POINT_R = 7.5;
/** 아직 묻지 않은 점의 흐리기. 물으면 1 로 또렷해진다. */
const DIM = 0.42;
const CARD = 36;
const CAPTION_Y = 338;

/**
 * 걸음 하나는 `stepMs` 위에 이 지속시간들이 더해진 길이다 (S-piece). 총 길이를
 * 줄여야 하면 `stepMs` 가 아니라 여기를 줄인다 — `stepMs` 를 줄이면 애니메이션이
 * 끝나기도 전에 다음 걸음이 와서 읽을 시간이 오히려 사라진다.
 */
const POSE_MS = 560;
const GROW_MS = 480;
const SPOKE_MS = 170;
const POP_MS = 150;
const FLIGHT_MS = 300;
const TILT_MS = 400;
const FLIP_MS = 360;
const CONCLUDE_MS = 700;
const FRAME_MS = 16;

/** 이름표 없는 물음점에 새기는 글리프. 도형에 각인된 표식이라 문안이 아니다 (C10). */
const UNKNOWN_GLYPH = '?';
/** 몇을 묻는지 세는 자리의 표식. 수식 기호라 문안이 아니다 (C10). */
const K_MARK = 'k';

export type StagePoint = { x: number; y: number; label: string };
export type Scene = {
  query: { x: number; y: number };
  points: StagePoint[];
  ks: number[];
  labels: string[];
};
type Tally = { labels: string[]; counts: number[]; verdict: string; flipped: boolean };
type Pan = { group: SVGGElement; letter: SVGTextElement; tokens: SVGCircleElement[]; side: -1 | 1 };
type PointParts = { group: SVGGElement; dot: SVGCircleElement; spoke: SVGLineElement | null };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** 토큰 색을 옅게 깔 때 쓰는 순수 변환. 입력 hex 는 토큰 경유다 (S-view 예외). */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * 열린 선언을 이 그림이 받는 모양으로 좁힌다. projector 가 `setScene` 에
 * 넘기기 전에 이것을 부르고, mount 는 자기 `params.initialData` 에 부른다 —
 * 좁히는 규칙이 두 벌로 갈리지 않게 이 파일이 한 벌만 갖는다 (C9).
 */
export function readScene(raw: unknown): Scene | null {
  const data = raw as { query?: unknown; points?: unknown; ks?: unknown } | undefined;
  const query = data?.query as { x?: unknown; y?: unknown } | undefined;
  const rawPoints = data?.points;
  if (typeof query?.x !== 'number' || typeof query?.y !== 'number') return null;
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return null;

  const points: StagePoint[] = [];
  const labels: string[] = [];
  for (const item of rawPoints) {
    const p = item as { x?: unknown; y?: unknown; label?: unknown };
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.label !== 'string') {
      return null;
    }
    points.push({ x: p.x, y: p.y, label: p.label });
    if (!labels.includes(p.label)) labels.push(p.label);
  }

  const rawKs = data?.ks;
  const ks = Array.isArray(rawKs) ? rawKs.filter((v): v is number => typeof v === 'number') : [];
  return { query: { x: query.x, y: query.y }, points, ks, labels };
}

const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
/** 넘어갔다 되돌아오는 맺음. 뒤집히는 순간에만 쓴다. */
const backOut = (p: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
};


export const kChangesBoundaryStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const palette: Palette = getColors(params.theme);
    const svg = params.canvas;

    // ── destroy 가 거두어야 하는 것들 (S-piece)
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(duration: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || duration <= 0) {
          onFrame(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return;
          const p = Math.min(1, (Date.now() - start) / duration);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    // ── 장면 상태
    const root = el('g');
    svg.appendChild(root);

    let scene: Scene | null = null;
    let scale = 1;
    let qx = PLOT_X + PLOT_SIZE / 2;
    let qy = PLOT_Y + PLOT_SIZE / 2;
    let classColors: readonly string[] = categorical(2, 'vivid');

    let ringNode: SVGCircleElement | null = null;
    let spokeLayer: SVGGElement | null = null;
    let pointLayer: SVGGElement | null = null;
    let flightLayer: SVGGElement | null = null;
    let cardGroup: SVGGElement | null = null;
    let cardRect: SVGRectElement | null = null;
    let cardText: SVGTextElement | null = null;
    let beamBar: SVGGElement | null = null;
    let kPill: SVGRectElement | null = null;
    let captionNode: SVGTextElement | null = null;
    const pointParts: PointParts[] = [];
    const pans = new Map<string, Pan>();
    const kSlots: number[] = [];
    const kTexts: SVGTextElement[] = [];

    let ringR = 0;
    let angle = 0;
    let pillX = AXIS_CX;
    let cardLabel: string | null = null;

    const toX = (v: number): number => qx + (v - (scene?.query.x ?? 0)) * scale;
    const toY = (v: number): number => qy - (v - (scene?.query.y ?? 0)) * scale;
    const colorOf = (label: string): string => {
      const idx = scene ? scene.labels.indexOf(label) : -1;
      return idx >= 0 ? (classColors[idx] ?? palette.textMuted) : palette.textMuted;
    };

    function applyRing(): void {
      if (!ringNode) return;
      ringNode.setAttribute('r', String(Math.max(0, ringR)));
      ringNode.setAttribute('opacity', ringR > 0.5 ? '1' : '0');
    }

    function applyPill(): void {
      if (!kPill) return;
      kPill.setAttribute('x', String(pillX - K_PILL_W / 2));
    }

    function endOf(side: -1 | 1): { x: number; y: number } {
      const rad = (angle * Math.PI) / 180;
      return {
        x: AXIS_CX + side * BEAM_L * Math.cos(rad),
        y: PIVOT_Y + side * BEAM_L * Math.sin(rad),
      };
    }

    function applyBeam(): void {
      beamBar?.setAttribute('transform', `rotate(${angle} ${AXIS_CX} ${PIVOT_Y})`);
      for (const pan of pans.values()) {
        const end = endOf(pan.side);
        pan.group.setAttribute('transform', `translate(${end.x} ${end.y + ROD})`);
      }
    }

    function setCardScale(sx: number, sy: number): void {
      cardGroup?.setAttribute('transform', `translate(${qx} ${qy}) scale(${sx} ${sy})`);
    }

    function setCardLabel(label: string | null): void {
      cardLabel = label;
      if (!cardRect || !cardText) return;
      if (label === null) {
        cardRect.setAttribute('fill', palette.bg);
        cardRect.setAttribute('stroke', palette.ghostOutline);
        cardRect.setAttribute('stroke-dasharray', '4 3');
        cardText.setAttribute('fill', palette.text);
        cardText.textContent = UNKNOWN_GLYPH;
        return;
      }
      cardRect.setAttribute('fill', colorOf(label));
      cardRect.setAttribute('stroke', palette.text);
      cardRect.setAttribute('stroke-dasharray', 'none');
      cardText.setAttribute('fill', palette.stateInk);
      cardText.textContent = label;
    }

    function tokenSlot(i: number): { x: number; y: number } {
      const row = Math.floor(i / TOKEN_ROW);
      const col = i % TOKEN_ROW;
      return {
        x: -((TOKEN_ROW - 1) * TOKEN_GAP) / 2 + col * TOKEN_GAP,
        y: TOKEN_Y - row * (TOKEN_R * 2 + 2),
      };
    }

    function build(next: Scene): void {
      root.textContent = '';
      pointParts.length = 0;
      pans.clear();
      kSlots.length = 0;
      kTexts.length = 0;
      scene = next;
      classColors = categorical(Math.max(2, next.labels.length), 'vivid');

      let reach = 0;
      for (const p of next.points) {
        reach = Math.max(reach, Math.abs(p.x - next.query.x), Math.abs(p.y - next.query.y));
      }
      const half = (reach > 0 ? reach : 1) * DOMAIN_PAD;
      scale = PLOT_SIZE / (2 * half);
      qx = PLOT_X + PLOT_SIZE / 2;
      qy = PLOT_Y + PLOT_SIZE / 2;

      root.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_Y,
          width: PLOT_SIZE,
          height: PLOT_SIZE,
          rx: 12,
          fill: palette.bgSubtle,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );

      ringNode = el('circle', {
        cx: qx,
        cy: qy,
        r: 0,
        fill: withAlpha(palette.accent, 0.16),
        stroke: palette.text,
        'stroke-width': 1.6,
        'stroke-dasharray': '6 4',
        opacity: 0,
      });
      root.appendChild(ringNode);

      spokeLayer = el('g');
      root.appendChild(spokeLayer);

      pointLayer = el('g');
      root.appendChild(pointLayer);
      for (const p of next.points) {
        const group = el('g', { opacity: DIM });
        const dot = el('circle', {
          cx: toX(p.x),
          cy: toY(p.y),
          r: POINT_R,
          fill: colorOf(p.label),
          stroke: palette.bg,
          'stroke-width': 1.2,
        });
        const mark = el('text', {
          x: toX(p.x),
          y: toY(p.y),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: palette.stateInk,
        });
        mark.textContent = p.label;
        group.appendChild(dot);
        group.appendChild(mark);
        pointLayer.appendChild(group);
        pointParts.push({ group, dot, spoke: null });
      }

      cardGroup = el('g');
      cardRect = el('rect', {
        x: -CARD / 2,
        y: -CARD / 2,
        width: CARD,
        height: CARD,
        rx: 9,
        'stroke-width': 2,
      });
      cardText = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 700,
      });
      cardGroup.appendChild(cardRect);
      cardGroup.appendChild(cardText);
      root.appendChild(cardGroup);
      setCardScale(1, 1);
      setCardLabel(null);

      // ── 몇을 묻는지 세는 자리
      const kRow = el('g');
      root.appendChild(kRow);
      const count = Math.max(1, next.ks.length);
      const start = AXIS_CX - ((count - 1) * K_SLOT_GAP) / 2;
      kPill = el('rect', {
        x: start - K_PILL_W / 2,
        y: K_ROW_Y - K_PILL_H / 2,
        width: K_PILL_W,
        height: K_PILL_H,
        rx: 9,
        fill: palette.accent,
        opacity: 0,
      });
      kRow.appendChild(kPill);
      pillX = start;

      const kMark = el('text', {
        x: start - K_SLOT_GAP,
        y: K_ROW_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.textMuted,
      });
      kMark.textContent = K_MARK;
      kRow.appendChild(kMark);

      next.ks.forEach((value, i) => {
        const x = start + i * K_SLOT_GAP;
        kSlots.push(x);
        const label = el('text', {
          x,
          y: K_ROW_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: palette.textMuted,
        });
        label.textContent = String(value);
        kRow.appendChild(label);
        kTexts.push(label);
      });

      // ── 저울
      const beam = el('g');
      root.appendChild(beam);
      beam.appendChild(
        el('path', {
          d: `M ${AXIS_CX - 16} ${PIVOT_Y + 30} L ${AXIS_CX + 16} ${PIVOT_Y + 30} L ${AXIS_CX} ${PIVOT_Y} Z`,
          fill: palette.bgSubtle,
          stroke: palette.text,
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
        }),
      );
      beamBar = el('g');
      beamBar.appendChild(
        el('line', {
          x1: AXIS_CX - BEAM_L,
          y1: PIVOT_Y,
          x2: AXIS_CX + BEAM_L,
          y2: PIVOT_Y,
          stroke: palette.text,
          'stroke-width': 4,
          'stroke-linecap': 'round',
        }),
      );
      beam.appendChild(beamBar);

      next.labels.slice(0, 2).forEach((label, i) => {
        const side: -1 | 1 = i === 0 ? -1 : 1;
        const group = el('g');
        group.appendChild(
          el('line', {
            x1: 0,
            y1: -ROD,
            x2: 0,
            y2: -14,
            stroke: palette.textMuted,
            'stroke-width': 1.2,
          }),
        );
        group.appendChild(
          el('path', {
            d: `M ${-PAN_HALF} -14 L ${PAN_HALF} -14 L ${PAN_HALF - 8} 2 L ${-PAN_HALF + 8} 2 Z`,
            fill: palette.bg,
            stroke: palette.text,
            'stroke-width': 1.4,
            'stroke-linejoin': 'round',
          }),
        );
        const letter = el('text', {
          x: 0,
          y: 24,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: palette.textMuted,
        });
        letter.textContent = label;
        group.appendChild(letter);
        beam.appendChild(group);
        pans.set(label, { group, letter, tokens: [], side });
      });

      flightLayer = el('g');
      root.appendChild(flightLayer);

      captionNode = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: palette.text,
      });
      root.appendChild(captionNode);

      ringR = 0;
      angle = 0;
      applyRing();
      applyPill();
      applyBeam();
    }

    function clearRun(): void {
      ringR = 0;
      angle = 0;
      applyRing();
      applyBeam();
      if (spokeLayer) spokeLayer.textContent = '';
      if (flightLayer) flightLayer.textContent = '';
      for (const pan of pans.values()) {
        for (const token of pan.tokens) token.remove();
        pan.tokens.length = 0;
        pan.letter.setAttribute('fill', palette.textMuted);
      }
      for (const part of pointParts) {
        part.group.setAttribute('opacity', String(DIM));
        part.dot.setAttribute('r', String(POINT_R));
        part.dot.setAttribute('stroke', palette.bg);
        part.dot.setAttribute('stroke-width', '1.2');
        part.spoke = null;
      }
      for (const text of kTexts) text.setAttribute('fill', palette.textMuted);
      kPill?.setAttribute('opacity', '0');
      pillX = kSlots.length > 0 ? kSlots[0] : AXIS_CX;
      applyPill();
      setCardScale(1, 1);
      setCardLabel(null);
      if (captionNode) captionNode.textContent = '';
    }

    const initial = readScene(params.initialData);
    if (initial) {
      build(initial);
      clearRun();
    }

    return {
      setScene(scene: Scene): void {
        build(scene);
        clearRun();
      },

      setCaption(text: string): void {
        if (captionNode) captionNode.textContent = text;
      },

      /** 물음점을 세운다. 이름표가 없다는 것을 한 번 두드려 보인다. */
      async pose(): Promise<void> {
        await animate(POSE_MS, (p) => {
          const s = 1 + 0.24 * Math.sin(Math.PI * p);
          setCardScale(s, s);
        });
        setCardScale(1, 1);
      },

      /** 테두리가 k 를 담는 크기까지 자란다. 세는 자리의 알약도 함께 옮겨 간다. */
      async growRing(k: number, radius: number): Promise<void> {
        if (!scene) return;
        const from = ringR;
        const to = radius * scale;
        const slotIndex = scene.ks.indexOf(k);
        const fromX = pillX;
        const toX2 = slotIndex >= 0 ? kSlots[slotIndex] : pillX;
        kPill?.setAttribute('opacity', '1');
        await animate(GROW_MS, (p) => {
          const e = easeOut(p);
          ringR = from + (to - from) * e;
          pillX = fromX + (toX2 - fromX) * e;
          applyRing();
          applyPill();
        });
        ringR = to;
        pillX = toX2;
        applyRing();
        applyPill();
        kTexts.forEach((text, i) => {
          text.setAttribute('fill', i === slotIndex ? palette.stateInk : palette.textMuted);
        });
      },

      /** 테두리에 든 이웃 하나가 이어지고, 표 하나가 저울로 날아간다. */
      async capture(index: number, label: string): Promise<void> {
        const part = pointParts[index];
        const point = scene?.points[index];
        if (!part || !point || !spokeLayer || !flightLayer) return;
        const tx = toX(point.x);
        const ty = toY(point.y);

        const spoke = el('line', {
          x1: qx,
          y1: qy,
          x2: qx,
          y2: qy,
          stroke: palette.textMuted,
          'stroke-width': 1.3,
        });
        spokeLayer.appendChild(spoke);
        part.spoke = spoke;
        await animate(SPOKE_MS, (p) => {
          const e = easeOut(p);
          spoke.setAttribute('x2', String(qx + (tx - qx) * e));
          spoke.setAttribute('y2', String(qy + (ty - qy) * e));
        });

        part.group.setAttribute('opacity', '1');
        part.dot.setAttribute('stroke', palette.text);
        await animate(POP_MS, (p) => {
          part.dot.setAttribute('r', String(POINT_R * (1 + 0.4 * Math.sin(Math.PI * p))));
        });
        part.dot.setAttribute('r', String(POINT_R));

        const pan = pans.get(label);
        if (!pan) return;
        const slot = tokenSlot(pan.tokens.length);
        const end = endOf(pan.side);
        const targetX = end.x + slot.x;
        const targetY = end.y + ROD + slot.y;
        const flier = el('circle', { cx: tx, cy: ty, r: TOKEN_R, fill: colorOf(label) });
        flightLayer.appendChild(flier);
        await animate(FLIGHT_MS, (p) => {
          const e = easeInOut(p);
          flier.setAttribute('cx', String(tx + (targetX - tx) * e));
          flier.setAttribute('cy', String(ty + (targetY - ty) * e - 28 * Math.sin(Math.PI * p)));
        });
        flier.remove();

        const token = el('circle', {
          cx: slot.x,
          cy: slot.y,
          r: TOKEN_R,
          fill: colorOf(label),
          stroke: palette.text,
          'stroke-width': 1,
        });
        pan.group.appendChild(token);
        pan.tokens.push(token);
      },

      /** 표를 세어 저울이 기운다. 답이 달라지면 물음점의 카드가 뒤집힌다. */
      async settle(tally: Tally): Promise<void> {
        const left = tally.counts[0] ?? 0;
        const right = tally.counts[1] ?? 0;
        const diff = right - left;
        const target =
          diff === 0
            ? 0
            : Math.sign(diff) * Math.min(TILT_MAX, TILT_BASE + TILT_STEP * (Math.abs(diff) - 1));
        const from = angle;
        const ease = tally.flipped ? backOut : easeOut;
        await animate(TILT_MS, (p) => {
          angle = from + (target - from) * ease(p);
          applyBeam();
        });
        angle = target;
        applyBeam();

        for (const [label, pan] of pans) {
          pan.letter.setAttribute(
            'fill',
            label === tally.verdict ? colorOf(label) : palette.textMuted,
          );
        }

        if (cardLabel === tally.verdict) return;
        let swapped = false;
        await animate(FLIP_MS, (p) => {
          if (p < 0.5) {
            setCardScale(1 - p * 2, 1);
            return;
          }
          if (!swapped) {
            swapped = true;
            setCardLabel(tally.verdict);
          }
          const t = (p - 0.5) * 2;
          setCardScale(tally.flipped ? backOut(t) : t, 1);
        });
        setCardLabel(tally.verdict);
        setCardScale(1, 1);
      },

      /**
       * 마지막에 가장 가까운 하나를 한 번 두드린다. 카드에는 다른 이름표가
       * 새겨져 있으니, 둘을 나란히 보이는 것이 이 조각의 맺음이다.
       */
      async conclude(index: number): Promise<void> {
        const part = pointParts[index];
        if (!part) return;
        part.spoke?.setAttribute('stroke', palette.text);
        part.spoke?.setAttribute('stroke-width', '2.4');
        part.dot.setAttribute('stroke-width', '2');
        await animate(CONCLUDE_MS, (p) => {
          part.dot.setAttribute('r', String(POINT_R * (1 + 0.5 * Math.abs(Math.sin(2 * Math.PI * p)))));
        });
        part.dot.setAttribute('r', String(POINT_R * 1.2));
      },

      reset(): void {
        clearRun();
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
