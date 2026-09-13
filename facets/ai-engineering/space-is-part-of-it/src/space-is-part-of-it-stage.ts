/**
 * 빈칸 표식이 낱말 앞으로 미끄러져 붙는 그림.
 *
 * 동사가 "달라붙는다" 이므로 표식은 실제로 **움직인다.** 처음에는 낱말 사이의
 * 빈칸 한복판에 홀로 서 있다가, 걸음 하나 동안 뒤 낱말의 왼쪽 끝으로 미끄러져
 * 가 붙는다 (`attached`). 낱말들도 함께 죄어들어 여섯 조각이 된다. 색만 바뀌는
 * 걸음으로는 이 말을 할 수 없다 (S-piece).
 *
 * 화면은 위에서 아래로 세 층이다.
 *   1. 문장 두 줄 — 빈칸이 붙는 일이 실제로 일어나는 자리
 *   2. 어휘 선반 두 줄 — 붙은 꼴(아래)과 안 붙은 꼴(위)이 세로로 짝을 이룬다
 *   3. 캡션
 *
 * 짝을 세로로 세우는 것이 이 그림의 요지다 — 같은 낱말이 위아래 두 자리를
 * 차지하는 것이 한눈에 보여야 한다.
 *
 * ── 장면을 그린다
 *
 * 걸음마다 부르는 메서드를 두지 않고 `render` 하나로 산다 (S-scene). 화면은 늘
 * 비우고 그 장면의 단계가 쌓아 올린 것을 통째로 다시 세운다. 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 오든 같은 그림이 선다.
 *
 * 걸음의 운동(미끄러짐 · 들어섬 · 쪼개짐)은 버리지 않고 각 그리기 함수 안에 남겨
 * 두었다. `withAnim` 이 거짓이면 같은 함수가 곧바로 끝 자리를 세운다 — 되짚기가
 * 그 길로 오므로 거기서는 타이머도 프레임도 걸지 않는다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { PHASE_RANK, type SpaceScene, type UnseenSplit } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-piece). */
const CANVAS_H = 244;
const W = PIECE_CANVAS_W;

const SIDE_MIN = 24;
const ROW_A_Y = 20;
const ROW_B_Y = 58;
const SENT_CHIP_H = 26;
const RULE_Y = 100;
const SHELF_X = 108;
const BARE_Y = 126;
const SPACED_Y = 172;
const SHELF_CHIP_H = 24;
const CAPTION_Y = 226;

/** 칸 너비는 상한만 못박고 나머지는 캔버스에서 역산한다 (S-piece 의 "그 폭을 채운다"). */
const COL_MAX_W = 56;
const SENT_PAD = 9;
const GAP_MIN = 16;
const GAP_MAX = 48;
const TIGHT_GAP = 14;

/** 고정폭 글꼴의 글자 하나 너비 비율. 자리 셈에만 쓴다. */
const MONO_RATIO = 0.6;
const FRAME_MS = 16;

const ATTACH_MS = 560;
const ENTER_MS = 320;
const STAGGER_MS = 55;
const LINK_MS = 260;
const SPLIT_MS = 380;
const FINISH_MS = 280;

/** 짝을 잇는 선이 다 서고 나서의 굵기. `done` 이 물들이며 여기까지 굵어진다. */
const LINK_DONE_WIDTH = 2;

const px = (value: string): number => Number.parseFloat(value);

const SENT_FS = px(fontSizes.lg);
const CHIP_FS = px(fontSizes.md);
const LABEL_FS = px(fontSizes.xs);
const CAP_FS = px(fontSizes.sm);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** 살짝 지나쳤다 돌아오는 감속 — 표식이 낱말에 "딱" 붙는 느낌을 낸다. */
const BACK = 1.1;
const easeOutBack = (p: number): number =>
  1 + (BACK + 1) * Math.pow(p - 1, 3) + BACK * Math.pow(p - 1, 2);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const textW = (s: string, fs: number): number => s.length * fs * MONO_RATIO;

type Span = { x: number; w: number };

/** 선언이 주는 말뭉치. 장면(`SpaceScene`) 과 달리 걸음 내내 바뀌지 않는다. */
export type SpaceData = {
  mark: string;
  lineA: string[];
  lineB: string[];
  bareStems: string[];
  spacedStems: string[];
};

const FALLBACK_MARK = '▁';

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * `initialData` 를 좁히는 자리는 mount 다 — 장면은 말뭉치를 담지 않으므로
 * (담으면 되짚을 때 굴러간 자료를 보게 된다, S-scene) 여기가 유일한 경로다.
 * 단언 뒤에 필드마다 검사가 따르므로 `Record<string, unknown>` 은 회피가 아니라
 * 좁히개다 (C9).
 */
function readData(data: unknown): SpaceData {
  if (typeof data !== 'object' || data === null) {
    return { mark: FALLBACK_MARK, lineA: [], lineB: [], bareStems: [], spacedStems: [] };
  }
  const source = data as Record<string, unknown>;
  return {
    mark: typeof source.mark === 'string' && source.mark !== '' ? source.mark : FALLBACK_MARK,
    lineA: strings(source.lineA),
    lineB: strings(source.lineB),
    bareStems: strings(source.bareStems),
    spacedStems: strings(source.spacedStems),
  };
}

/** 낱말을 띄엄띄엄 놓는다. 남는 폭을 사이에 나눠 주되 너무 벌어지지 않게 막는다. */
function looseRow(words: string[], fs: number): { chips: Span[]; gap: number } {
  const widths = words.map((word) => textW(word, fs) + SENT_PAD * 2);
  const sum = widths.reduce((a, b) => a + b, 0);
  const n = words.length;
  const gap =
    n > 1
      ? Math.min(GAP_MAX, Math.max(GAP_MIN, (W - SIDE_MIN * 2 - sum) / (n - 1)))
      : 0;
  let x = (W - (sum + gap * Math.max(0, n - 1))) / 2;
  const chips: Span[] = [];
  for (let i = 0; i < n; i += 1) {
    chips.push({ x, w: widths[i] });
    x += widths[i] + gap;
  }
  return { chips, gap };
}

/** 붙고 난 뒤의 자리 — 조각끼리만 좁게 떨어져 선다. */
function tightRow(pieces: string[], fs: number): Span[] {
  const widths = pieces.map((piece) => textW(piece, fs) + SENT_PAD * 2);
  const sum = widths.reduce((a, b) => a + b, 0);
  const n = pieces.length;
  let x = (W - (sum + TIGHT_GAP * Math.max(0, n - 1))) / 2;
  const out: Span[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ x, w: widths[i] });
    x += widths[i] + TIGHT_GAP;
  }
  return out;
}

export const spaceIsPartOfItStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const data = readData(params.initialData);

    const markW = textW(data.mark, SENT_FS);
    const piecesA = data.lineA.map((word, i) => (i === 0 ? word : data.mark + word));
    const piecesB = data.lineB.map((word, i) => (i === 0 ? word : data.mark + word));
    const looseA = looseRow(data.lineA, SENT_FS);
    const tightA = tightRow(piecesA, SENT_FS);
    const tightB = tightRow(piecesB, SENT_FS);

    const colCount = Math.max(1, data.spacedStems.length);
    const colW = Math.min(COL_MAX_W, Math.floor((W - SHELF_X - SIDE_MIN) / colCount));
    const colX = (j: number): number => SHELF_X + j * colW;
    const chipW = colW - 6;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한꺼번에 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          return resolve();
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = clamp01((Date.now() - started) / ms);
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
        tick();
      });
    }

    const dyn = el('g');
    svg.appendChild(dyn);

    function label(
      text: string,
      x: number,
      y: number,
      fs: number,
      fill: string,
      family: string,
      anchor: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': family,
        'font-size': fs,
        'text-anchor': anchor,
        fill,
      });
      node.textContent = text;
      return node;
    }

    const caption = label('', W / 2, CAPTION_Y, CAP_FS, colors.textMuted, fonts.body, 'middle');
    svg.appendChild(caption);

    /** 붙기 전 자리에서 붙은 뒤 자리로 옮겨 갈 것들. 붙는 걸음에서만 생긴다. */
    type Mover = { node: SVGElement; dx: number; snap: boolean };

    /**
     * 짝을 잇는 세로 선. `bare` 가 세우고 `done` 이 물들이므로 두 그리기가
     * 나눠 쓴다 — 한 번의 `render` 안에서만이라 장면이 상태를 쥐는 것과는 다르다.
     */
    let linkLines: SVGLineElement[] = [];

    function clearScene(): void {
      while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
      linkLines = [];
    }

    /** 여럿을 조금씩 어긋나게 들여보낸다. */
    async function enter(nodes: SVGElement[], dx: number, dy: number): Promise<void> {
      if (nodes.length === 0) return;
      const total = ENTER_MS + STAGGER_MS * (nodes.length - 1);
      for (const node of nodes) node.setAttribute('opacity', '0');
      await tween(total, (p) => {
        const now = p * total;
        nodes.forEach((node, i) => {
          const e = easeOutCubic(clamp01((now - STAGGER_MS * i) / ENTER_MS));
          node.setAttribute('opacity', String(e));
          node.setAttribute('transform', `translate(${(1 - e) * dx}, ${(1 - e) * dy})`);
        });
      });
      // 들어서기가 남긴 자국을 걷는다. 놓아두면 흐르며 선 화면과 곧바로 세운
      // 화면이 속성 하나만큼 달라지고, 되짚기를 견주는 검사가 그것을 잡는다.
      for (const node of nodes) {
        node.removeAttribute('transform');
        node.removeAttribute('opacity');
      }
    }

    /** 빈칸 표식 한 벌 — 노란 타일 위의 글리프. */
    function markGroup(x: number, centerY: number, fs: number): SVGGElement {
      const group = el('g');
      const tileH = fs + 6;
      const glyphW = textW(data.mark, fs);
      group.appendChild(
        el('rect', {
          x: x - 2,
          y: centerY - tileH / 2,
          width: glyphW + 4,
          height: tileH,
          rx: 3,
          fill: colors.accent,
        }),
      );
      group.appendChild(
        label(data.mark, x, centerY + fs * 0.35, fs, colors.stateInk, fonts.mono, 'start'),
      );
      return group;
    }

    function shelfChip(stem: string, x: number, y: number, withMark: boolean): SVGGElement {
      const group = el('g');
      group.appendChild(
        el('rect', {
          x,
          y,
          width: chipW,
          height: SHELF_CHIP_H,
          rx: 4,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      const glyphW = withMark ? textW(data.mark, CHIP_FS) : 0;
      const stemW = textW(stem, CHIP_FS);
      const startX = x + (chipW - (glyphW + stemW)) / 2;
      const centerY = y + SHELF_CHIP_H / 2;
      if (withMark) {
        const tileH = CHIP_FS + 4;
        group.appendChild(
          el('rect', {
            x: startX - 1,
            y: centerY - tileH / 2,
            width: glyphW + 2,
            height: tileH,
            rx: 2,
            fill: colors.accent,
          }),
        );
        group.appendChild(
          label(
            data.mark,
            startX,
            centerY + CHIP_FS * 0.35,
            CHIP_FS,
            colors.stateInk,
            fonts.mono,
            'start',
          ),
        );
      }
      group.appendChild(
        label(
          stem,
          startX + glyphW,
          centerY + CHIP_FS * 0.35,
          CHIP_FS,
          colors.text,
          fonts.mono,
          'start',
        ),
      );
      return group;
    }

    // ── 층마다의 그리기 ───────────────────────────────────────────────────
    //
    // 저마다 그 층을 통째로 세우고, 방금 넘어온 단계일 때만 운동을 얹는다.

    /** 이 조각의 동사. 표식이 뒤 낱말로 미끄러져 가 붙는다. */
    async function slideAttach(movers: Mover[], slots: SVGElement[]): Promise<void> {
      await tween(ATTACH_MS, (p) => {
        const slide = easeInOutCubic(p);
        const snap = easeOutBack(p);
        for (const mover of movers) {
          const e = mover.snap ? snap : slide;
          // 이미 붙은 자리에 세워 두었으므로 아직 못 온 만큼을 뒤로 물려 잡는다.
          mover.node.setAttribute('transform', `translate(${mover.dx * (e - 1)}, 0)`);
        }
        for (const slot of slots) slot.setAttribute('opacity', String(clamp01(1 - p * 2)));
      });
      for (const mover of movers) mover.node.removeAttribute('transform');
      for (const slot of slots) slot.remove();
    }

    /**
     * 첫 줄. 한 함수가 세 단계를 겸한다 — 낱말만(`sentence`) · 표식까지(`marked`) ·
     * 붙은 뒤(`attached`). 붙기 전과 뒤는 서는 자리가 다를 뿐 그리는 것이 같아서다.
     */
    async function drawFirstLine(
      rank: number,
      animWords: boolean,
      animMarks: boolean,
      animAttach: boolean,
    ): Promise<void> {
      const attached = rank >= PHASE_RANK.attached;
      const showMarks = rank >= PHASE_RANK.marked;
      const centerY = ROW_A_Y + SENT_CHIP_H / 2;
      const baseline = centerY + SENT_FS * 0.35;

      const movers: Mover[] = [];
      const slots: SVGElement[] = [];
      const wordNodes: SVGElement[] = [];
      const markNodes: SVGElement[] = [];

      data.lineA.forEach((word, i) => {
        const looseX = looseA.chips[i].x + SENT_PAD;
        // 붙고 나면 표식이 낱말 앞자리를 차지하므로 낱말은 그만큼 오른쪽에 선다.
        const tightX = tightA[i].x + SENT_PAD + (i === 0 ? 0 : markW);
        const group = el('g');
        group.appendChild(
          label(
            word,
            attached ? tightX : looseX,
            baseline,
            SENT_FS,
            colors.text,
            fonts.mono,
            'start',
          ),
        );
        dyn.appendChild(group);
        wordNodes.push(group);
        // 낱말도 죄어들며 제자리를 찾는다.
        if (animAttach) {
          const dx = tightX - looseX;
          group.setAttribute('transform', `translate(${-dx}, 0)`);
          movers.push({ node: group, dx, snap: false });
        }
      });

      // 낱말 사이의 빈칸 — 아직 아무것도 아닌 자리. 붙으면서 사라지므로 붙는
      // 걸음에서는 마지막으로 한 번 더 세워 지워지는 것을 보인다.
      if (!attached || animAttach) {
        for (let i = 1; i < data.lineA.length; i += 1) {
          const center = looseA.chips[i].x - looseA.gap / 2;
          const slotW = Math.max(14, Math.min(26, looseA.gap - 10));
          const slot = el('rect', {
            x: center - slotW / 2,
            y: ROW_A_Y + 3,
            width: slotW,
            height: SENT_CHIP_H - 6,
            rx: 4,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
          dyn.appendChild(slot);
          slots.push(slot);
        }
      }

      if (showMarks) {
        for (let i = 1; i < data.lineA.length; i += 1) {
          const looseX = looseA.chips[i].x - looseA.gap / 2 - markW / 2;
          const tightX = tightA[i].x + SENT_PAD;
          const group = markGroup(attached ? tightX : looseX, centerY, SENT_FS);
          dyn.appendChild(group);
          markNodes.push(group);
          if (animAttach) {
            const dx = tightX - looseX;
            group.setAttribute('transform', `translate(${-dx}, 0)`);
            movers.push({ node: group, dx, snap: true });
          }
        }
      }

      if (animWords) {
        await enter([...wordNodes, ...slots], 0, -10);
        return;
      }
      if (animMarks) {
        await enter(markNodes, 0, -14);
        return;
      }
      if (animAttach) await slideAttach(movers, slots);
    }

    /** 붙은 채로 잘린 조각의 테두리. 가운데에서 좌우로 벌어지며 그어진다. */
    async function drawCutFrames(withAnim: boolean): Promise<void> {
      const frames = tightA.map((chip) => {
        const rect = el('rect', {
          x: withAnim ? chip.x + chip.w / 2 : chip.x,
          y: ROW_A_Y,
          width: withAnim ? 0 : chip.w,
          height: SENT_CHIP_H,
          rx: 5,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        });
        dyn.appendChild(rect);
        return rect;
      });
      if (!withAnim || frames.length === 0) return;
      const total = ENTER_MS + STAGGER_MS * (frames.length - 1);
      await tween(total, (p) => {
        const now = p * total;
        frames.forEach((rect, i) => {
          const e = easeOutCubic(clamp01((now - STAGGER_MS * i) / ENTER_MS));
          rect.setAttribute('x', String(tightA[i].x + (tightA[i].w / 2) * (1 - e)));
          rect.setAttribute('width', String(tightA[i].w * e));
        });
      });
    }

    /** 둘째 줄. 처음부터 붙은 꼴로 선다 — 맨 앞 낱말만 표식이 없다. */
    async function drawSecondLine(withAnim: boolean): Promise<void> {
      const nodes: SVGElement[] = [];
      const centerY = ROW_B_Y + SENT_CHIP_H / 2;
      const baseline = centerY + SENT_FS * 0.35;

      data.lineB.forEach((word, i) => {
        const chip = tightB[i];
        const group = el('g');
        group.appendChild(
          el('rect', {
            x: chip.x,
            y: ROW_B_Y,
            width: chip.w,
            height: SENT_CHIP_H,
            rx: 5,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        let textX = chip.x + SENT_PAD;
        if (i > 0) {
          const tileH = SENT_FS + 6;
          group.appendChild(
            el('rect', {
              x: textX - 2,
              y: centerY - tileH / 2,
              width: markW + 4,
              height: tileH,
              rx: 3,
              fill: colors.accent,
            }),
          );
          group.appendChild(
            label(data.mark, textX, baseline, SENT_FS, colors.stateInk, fonts.mono, 'start'),
          );
          textX += markW;
        }
        group.appendChild(label(word, textX, baseline, SENT_FS, colors.text, fonts.mono, 'start'));
        dyn.appendChild(group);
        nodes.push(group);
      });

      if (withAnim) await enter(nodes, -24, 0);
    }

    /** 선반 아래 칸 — 붙은 꼴. 어휘의 자리가 여기서부터 세어진다. */
    async function drawSpacedShelf(withAnim: boolean): Promise<void> {
      dyn.appendChild(
        el('line', {
          x1: SIDE_MIN,
          y1: RULE_Y,
          x2: W - SIDE_MIN,
          y2: RULE_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      dyn.appendChild(
        label(
          tr('label.spaced', 'blank attached'),
          SHELF_X - 12,
          SPACED_Y + SHELF_CHIP_H / 2 + LABEL_FS * 0.35,
          LABEL_FS,
          colors.textMuted,
          fonts.body,
          'end',
        ),
      );
      const nodes: SVGElement[] = [];
      data.spacedStems.forEach((stem, j) => {
        const group = shelfChip(stem, colX(j) + 3, SPACED_Y, true);
        dyn.appendChild(group);
        nodes.push(group);
      });
      if (withAnim) await enter(nodes, 0, -18);
    }

    /** 선반 위 칸 — 안 붙은 꼴, 그리고 짝을 잇는 세로 선. */
    async function drawBareShelf(withAnim: boolean): Promise<void> {
      dyn.appendChild(
        label(
          tr('label.bare', 'no blank'),
          SHELF_X - 12,
          BARE_Y + SHELF_CHIP_H / 2 + LABEL_FS * 0.35,
          LABEL_FS,
          colors.textMuted,
          fonts.body,
          'end',
        ),
      );

      // 붙은 꼴과 같은 칸에 세운다 — 짝이 세로로 서야 "두 자리" 가 보인다.
      // 짝 없는 안 붙은 꼴은 이 말뭉치에 없다 (bareStems ⊂ spacedStems).
      const nodes: SVGElement[] = [];
      const twinCols: number[] = [];
      data.spacedStems.forEach((stem, j) => {
        if (data.bareStems.includes(stem)) {
          const group = shelfChip(stem, colX(j) + 3, BARE_Y, false);
          dyn.appendChild(group);
          nodes.push(group);
          twinCols.push(j);
          return;
        }
        dyn.appendChild(
          el('rect', {
            x: colX(j) + 3,
            y: BARE_Y,
            width: chipW,
            height: SHELF_CHIP_H,
            rx: 4,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
      });
      if (withAnim) await enter(nodes, 0, -18);

      const from = BARE_Y + SHELF_CHIP_H;
      for (const j of twinCols) {
        const x = colX(j) + colW / 2;
        const line = el('line', {
          x1: x,
          y1: from,
          x2: x,
          y2: withAnim ? from : SPACED_Y,
          stroke: colors.textMuted,
          'stroke-width': 1,
        });
        dyn.appendChild(line);
        linkLines.push(line);
      }
      if (!withAnim) return;
      await tween(LINK_MS, (p) => {
        const y2 = from + (SPACED_Y - from) * easeOutCubic(p);
        for (const line of linkLines) line.setAttribute('y2', String(y2));
      });
    }

    /**
     * 한 번도 안 붙은 꼴로 나오지 않은 낱말. 통째로 위 칸에 들어가려다 쪼개진다.
     *
     * 통째인 유령은 그 걸음에서만 보이고 사라지는 것이라, 정적으로 세울 때는
     * 남는 조각들만 끝 자리에 앉힌다 (S-scene 의 "머무는 것과 지나가는 것").
     */
    async function drawSplit(split: UnseenSplit, withAnim: boolean): Promise<void> {
      const j = data.spacedStems.indexOf(split.token);
      if (j < 0) return;

      const x = colX(j) + 3;
      const centerX = x + chipW / 2;

      let ghost: SVGGElement | null = null;
      if (withAnim) {
        ghost = el('g');
        ghost.appendChild(
          el('rect', {
            x,
            y: BARE_Y,
            width: chipW,
            height: SHELF_CHIP_H,
            rx: 4,
            fill: colors.bg,
            stroke: colors.danger,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          }),
        );
        ghost.appendChild(
          label(
            split.token,
            centerX,
            BARE_Y + SHELF_CHIP_H / 2 + CHIP_FS * 0.35,
            CHIP_FS,
            colors.danger,
            fonts.mono,
            'middle',
          ),
        );
        dyn.appendChild(ghost);

        // 빈 자리로 내려온다.
        const descending = ghost;
        await tween(ENTER_MS, (p) => {
          const e = easeOutCubic(p);
          descending.setAttribute('transform', `translate(0, ${(1 - e) * -26})`);
          descending.setAttribute('opacity', String(clamp01(p * 2)));
        });
      }

      // 통째로는 못 들어간다 — 쪼개져 좌우로 밀려난다.
      const partH = SHELF_CHIP_H - 2;
      const pieces = split.parts.map((part) => {
        const partW = textW(part, CHIP_FS) + 14;
        const group = el('g', { opacity: 0 });
        group.appendChild(
          el('rect', {
            x: centerX - partW / 2,
            y: BARE_Y + 1,
            width: partW,
            height: partH,
            rx: 4,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        group.appendChild(
          label(
            part,
            centerX,
            BARE_Y + 1 + partH / 2 + CHIP_FS * 0.35,
            CHIP_FS,
            colors.text,
            fonts.mono,
            'middle',
          ),
        );
        dyn.appendChild(group);
        return group;
      });

      const spread = pieces.length > 1 ? pieces.length - 1 : 1;
      /** 밀려난 정도 `e` 에서의 자리. 1 이 다 밀려난 끝 자리다. */
      const place = (group: SVGGElement, k: number, e: number): void => {
        const dir = pieces.length === 1 ? 0 : (k / spread) * 2 - 1;
        group.setAttribute('transform', `translate(${dir * 22 * e}, ${14 * e})`);
        group.setAttribute('opacity', String(e));
      };

      if (ghost === null) {
        pieces.forEach((group, k) => place(group, k, 1));
        return;
      }

      const fading = ghost;
      await tween(SPLIT_MS, (p) => {
        const e = easeOutCubic(p);
        fading.setAttribute('opacity', String(1 - e));
        pieces.forEach((group, k) => place(group, k, e));
      });
      fading.remove();
    }

    /** 마지막 걸음. 짝을 잇는 선이 물들고 굵어진 채 **남는다.** */
    async function markDone(withAnim: boolean): Promise<void> {
      for (const line of linkLines) line.setAttribute('stroke', colors.accent);
      if (!withAnim) {
        for (const line of linkLines) line.setAttribute('stroke-width', String(LINK_DONE_WIDTH));
        return;
      }
      await tween(FINISH_MS, (p) => {
        const width = 1 + (LINK_DONE_WIDTH - 1) * p;
        for (const line of linkLines) line.setAttribute('stroke-width', String(width));
      });
    }

    /** 단계가 정하는 캡션. 문안은 여기서 만든다 — 장면은 무엇을 말할지만 안다 (C10). */
    function captionFor(next: SpaceScene): string {
      switch (next.phase) {
        case 'sentence':
          return tr('caption.gaps', 'A blank sits between the words.');
        case 'marked':
          return tr('caption.mark', 'Write each blank as a character of its own.');
        case 'attached':
          return tr('caption.attach', 'The blank slides onto the word that follows it.');
        case 'cut':
          return tr('caption.cut', 'Pieces the sentence is cut into: {n}.', { n: next.pieceCount });
        case 'second':
          return tr('caption.second', 'Only the first word carries no blank.');
        case 'spaced':
          return tr('caption.spaced', 'Each form with a blank takes one slot in the vocabulary.');
        case 'bare':
          return tr('caption.bare', 'The bare form takes a slot of its own. Pairs: {n}.', {
            n: next.pairCount,
          });
        case 'split':
          return tr('caption.split', 'A form never seen without its blank cannot stay whole.');
        case 'done':
          return tr(
            'caption.done',
            'Whether the blank is attached decides the piece. Vocabulary: {n}.',
            { n: next.vocabSize },
          );
        default:
          return '';
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면의 단계가 쌓아 올린 층을 위에서 아래로 다시 세운다. 화면이
    // 쌓이기만 하는 조각이라 "이 단계 이하" 라는 견줌 하나로 무엇을 그릴지 정해진다.
    async function render(
      next: SpaceScene,
      prev: SpaceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      clearScene();
      caption.textContent = captionFor(next);

      const rank = PHASE_RANK[next.phase];
      if (rank === PHASE_RANK.idle) return; // 되감은 뒤의 빈 화면

      // 걸음 하나만큼 앞으로 온 것이 확실할 때만 그 단계의 운동을 보인다. 걸음이
      // 이어지지 않은 채로 오면 (되짚은 뒤 다시 재생 등) 저절로 걸러진다.
      const advanced = opts.animate && prev !== null && rank === PHASE_RANK[prev.phase] + 1;
      const just = (phase: SpaceScene['phase']): boolean => advanced && next.phase === phase;

      await drawFirstLine(rank, just('sentence'), just('marked'), just('attached'));
      if (rank >= PHASE_RANK.cut) await drawCutFrames(just('cut'));
      if (rank >= PHASE_RANK.second) await drawSecondLine(just('second'));
      if (rank >= PHASE_RANK.spaced) await drawSpacedShelf(just('spaced'));
      if (rank >= PHASE_RANK.bare) await drawBareShelf(just('bare'));
      if (rank >= PHASE_RANK.split && next.split) await drawSplit(next.split, just('split'));
      if (rank >= PHASE_RANK.done) await markDone(just('done'));
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨우지 않으면 render 가 붙들려 알고리즘이 영영
        // 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        dyn.remove();
        caption.remove();
      },
    };
  },
};
