/**
 * partition-around-pivot-stage — 기준선 하나와 그것을 건너는 값들.
 *
 * 화면의 뼈대는 가운데를 세로로 가르는 **기준선**이다. 선의 아래 끝에 기준값이
 * 박혀 있고, 값들은 위쪽 줄에 흩어져 있다가 하나씩 선 위로 내려와 선에 걸터앉는다
 * (견줌). 그리고 선을 넘어 좌 또는 우의 방으로 미끄러져 내려가 자리를 잡는다.
 *
 * 그래서 이 view 의 운동은 전부 **위치 이동**이다. 색은 지금 누가 견주어지고
 * 있는지만 말한다.
 *
 * ── 왜 이 좌표인가
 *   - 값은 크기를 막대 높이로 그리지 않는다. 이 조각이 말하는 대소는 "기준보다
 *     작다 / 크다" 뿐이고, 그것은 **어느 쪽 방에 있는가**로 이미 다 말해진다.
 *   - 두 방이 캔버스의 좌우를 가득 채운다. 방 폭에서 칩 크기를 역산하므로
 *     상수는 상한(`CHIP_MAX_W`)만 둔다 (S-piece).
 *   - 방은 값이 아니라 **영역**이다. 두 방이 늘 캔버스를 좌우로 채우고, 값은
 *     기준선 쪽에서 바깥으로 쌓인다. 방이 덜 차는 것은 감추지 않는다 — 가른
 *     결과가 반반이 아니라는 것도 이 화면이 말해야 할 사실이다.
 *
 * ── 뒷일
 *   `destroy()` 는 진행 중인 rAF 를 모두 끊고 붙인 노드를 떼어낸다. 스스로
 *   다음 회차를 예약하는 루프는 애니메이션 하나가 끝나면 멈추며, `destroyed`
 *   플래그가 그 사이의 프레임도 막는다. 남겨 두는 타이머는 없다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { PartitionSide } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로: 두 방이 캔버스를 좌우로 채우고 그 사이에 기준이 선다.
const W = PIECE_CANVAS_W;
const PAD = 24;
const CX = Math.round(W / 2);
const PIVOT_R = 23;
/** 기준 배지와 방 사이의 숨. */
const GATE_GAP = 14;
const CHIP_MAX_W = 56;
const CHIP_GAP = 8;
const CHIP_H = 34;

// ── 세로: 흩어진 줄 → 기준선 위 견줌 자리 → 두 방. 내용이 정하고 바뀌지 않는다.
const RAIL_Y = 32;
const LINE_TOP = 60;
const CMP_Y = 102;
const LAND_Y = 176;
const ROOM_H = 46;
const ROOM_Y = LAND_Y - ROOM_H / 2;
const LINE_BOT = LAND_Y + PIVOT_R + 5;
const LABEL_Y = 218;
const CAPTION_Y = 244;
const STAGE_H = 258;

const ROOM_W = CX - PIVOT_R - GATE_GAP - PAD;
const ROOM_LEFT_X = PAD;
const ROOM_RIGHT_X = CX + PIVOT_R + GATE_GAP;

// ── 지속시간. 걸음 간격(stepMs) 위에 더해지므로 짧게 잡는다 (S-piece).
const DESCEND_MS = 260;
const CROSS_MS = 380;
const SETTLE_MS = 300;

const LINE_W_IDLE = 3;
const LINE_W_ACTIVE = 6;

/** 방에 새겨진 부등호 표기. 문장이 아니라 수식이므로 번역 대상이 아니다 (C10). */
const LESS_GLYPH = '<';
const GREATER_GLYPH = '>';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
const easeOut = (t: number): number => 1 - (1 - t) ** 2;
const easeIn = (t: number): number => t * t;

type Chip = {
  group: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  railX: number;
};

type StageData = { values: number[]; pivot: number };

function readData(initialData: Record<string, unknown> | undefined): StageData {
  const raw = initialData ?? {};
  const values = Array.isArray(raw.values)
    ? raw.values.filter((v): v is number => typeof v === 'number')
    : [];
  const pivot = typeof raw.pivot === 'number' ? raw.pivot : 0;
  return { values, pivot };
}

export const partitionAroundPivotStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const { values, pivot } = readData(params.initialData);
    const n = Math.max(1, values.length);

    // 칩 크기는 방 폭에서 역산한다. 한쪽으로 전부 몰려도 겹치지 않는 크기.
    const chipW = Math.min(
      CHIP_MAX_W,
      Math.floor((ROOM_W - CHIP_GAP * (n - 1)) / n),
    );
    const railStep = (W - PAD * 2) / n;
    const railX = (i: number): number => PAD + railStep * (i + 0.5);
    // 두 방 모두 기준선 쪽에서 바깥으로 쌓인다. 먼저 건넌 값이 선에 가깝다 —
    // 그래야 기준이 양쪽에 끼인 채로 남아 "두 쪽 사이" 가 눈에 보인다.
    const slotX = (side: PartitionSide, slot: number): number =>
      side === 'less'
        ? ROOM_LEFT_X + ROOM_W - chipW / 2 - slot * (chipW + CHIP_GAP)
        : ROOM_RIGHT_X + chipW / 2 + slot * (chipW + CHIP_GAP);

    const root = el('g');
    svg.appendChild(root);

    // ── 두 방. 좌는 중성 tint, 우는 강조 tint (좌소우대 색지).
    const roomLeft = el('rect', {
      x: ROOM_LEFT_X, y: ROOM_Y, width: ROOM_W, height: ROOM_H, rx: 10,
      fill: c.subtreeShadeLeft, stroke: 'none',
    });
    const roomRight = el('rect', {
      x: ROOM_RIGHT_X, y: ROOM_Y, width: ROOM_W, height: ROOM_H, rx: 10,
      fill: c.subtreeShadeRight, stroke: 'none',
    });
    root.appendChild(roomLeft);
    root.appendChild(roomRight);

    const mkRoomLabel = (x: number, glyph: string): SVGTextElement => {
      const t = el('text', {
        x, y: LABEL_Y, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted,
      });
      t.textContent = `${glyph} ${pivot}`;
      return t;
    };
    const labelLeft = mkRoomLabel(ROOM_LEFT_X + ROOM_W / 2, LESS_GLYPH);
    const labelRight = mkRoomLabel(ROOM_RIGHT_X + ROOM_W / 2, GREATER_GLYPH);
    root.appendChild(labelLeft);
    root.appendChild(labelRight);

    // ── 기준선. 처음에는 배지 안에 접혀 있고 pivot-set 에서 위로 자란다.
    const line = el('line', {
      x1: CX, y1: ROOM_Y, x2: CX, y2: LINE_BOT,
      stroke: c.itemPivot, 'stroke-width': LINE_W_IDLE, 'stroke-linecap': 'round',
    });
    root.appendChild(line);

    // ── 기준 배지. 건너지 않는 유일한 값.
    const badge = el('g', { transform: `translate(${CX} ${LAND_Y})` });
    const badgeDisc = el('circle', {
      cx: 0, cy: 0, r: PIVOT_R,
      fill: c.itemPivot, stroke: c.stateInk, 'stroke-width': 1.5,
    });
    const badgeText = el('text', {
      x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': '600',
      fill: c.stateInk,
    });
    badgeText.textContent = String(pivot);
    badge.appendChild(badgeDisc);
    badge.appendChild(badgeText);
    root.appendChild(badge);

    // ── 값 칩.
    const chips: Chip[] = values.map((v, i) => {
      const group = el('g');
      const box = el('rect', {
        x: -chipW / 2, y: -CHIP_H / 2, width: chipW, height: CHIP_H, rx: 6,
        fill: c.itemDefault, stroke: c.border, 'stroke-width': 1.5,
      });
      const label = el('text', {
        x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text,
      });
      label.textContent = String(v);
      group.appendChild(box);
      group.appendChild(label);
      root.appendChild(group);
      return { group, box, label, railX: railX(i) };
    });

    const caption = el('text', {
      x: CX, y: CAPTION_Y, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted,
    });
    root.appendChild(caption);

    // ── 움직임 살림 ──────────────────────────────────────────────
    let destroyed = false;
    const rafs = new Set<number>();

    const canRaf = typeof requestAnimationFrame === 'function';

    function animate(durMs: number, onFrame: (t: number) => void): Promise<void> {
      if (destroyed || !canRaf || durMs <= 0) {
        if (!destroyed) onFrame(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const tick = (): void => {
          if (destroyed) {
            resolve();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / durMs);
          onFrame(t);
          if (t >= 1) {
            resolve();
            return;
          }
          const next = requestAnimationFrame(() => {
            rafs.delete(next);
            tick();
          });
          rafs.add(next);
        };
        const first = requestAnimationFrame(() => {
          rafs.delete(first);
          tick();
        });
        rafs.add(first);
      });
    }

    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const place = (chip: Chip, x: number, y: number): void => {
      chip.group.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
    };

    const dressChip = (chip: Chip, active: boolean): void => {
      chip.box.setAttribute('fill', active ? c.itemComparing : c.itemDefault);
      chip.box.setAttribute('stroke', active ? c.stateInk : c.border);
      chip.label.setAttribute('fill', active ? c.stateInk : c.text);
    };

    const setLineTop = (y: number): void => {
      line.setAttribute('y1', String(y));
    };

    const setBadgeScale = (s: number): void => {
      badge.setAttribute('transform', `translate(${CX} ${LAND_Y}) scale(${s})`);
    };

    // ── 초기 배치.
    const layoutInitial = (): void => {
      chips.forEach((chip) => {
        place(chip, chip.railX, RAIL_Y);
        dressChip(chip, false);
      });
      setLineTop(ROOM_Y);
      line.setAttribute('stroke-width', String(LINE_W_IDLE));
      setBadgeScale(1);
      badgeDisc.setAttribute('stroke-width', '1.5');
      roomLeft.setAttribute('stroke', 'none');
      roomRight.setAttribute('stroke', 'none');
      labelLeft.setAttribute('fill', c.textMuted);
      labelRight.setAttribute('fill', c.textMuted);
      caption.textContent = '';
    };
    layoutInitial();

    return {
      /** 기준선이 배지에서 위로 자라 화면을 좌우로 가른다. */
      async armPivot(): Promise<void> {
        await animate(SETTLE_MS, (t) => {
          const e = easeOut(t);
          setLineTop(ROOM_Y + (LINE_TOP - ROOM_Y) * e);
        });
      },

      /** 값 하나가 줄에서 내려와 기준선 위에 걸터앉는다. */
      async compare(index: number): Promise<void> {
        const chip = chips[index];
        if (!chip) return;
        root.appendChild(chip.group); // 견주는 칩이 선 위로 올라온다
        dressChip(chip, true);
        line.setAttribute('stroke-width', String(LINE_W_ACTIVE));
        badgeDisc.setAttribute('stroke-width', '3');
        const fromX = chip.railX;
        await animate(DESCEND_MS, (t) => {
          const e = easeInOut(t);
          place(chip, fromX + (CX - fromX) * e, RAIL_Y + (CMP_Y - RAIL_Y) * e);
        });
      },

      /** 선을 넘어 한쪽 방으로 미끄러져 내려간다. 옆으로 먼저, 그 다음 아래로. */
      async cross(index: number, side: PartitionSide, slot: number): Promise<void> {
        const chip = chips[index];
        if (!chip) return;
        const toX = slotX(side, slot);
        await animate(CROSS_MS, (t) => {
          place(chip, CX + (toX - CX) * easeOut(t), CMP_Y + (LAND_Y - CMP_Y) * easeIn(t));
        });
        dressChip(chip, false);
        line.setAttribute('stroke-width', String(LINE_W_IDLE));
        badgeDisc.setAttribute('stroke-width', '1.5');
      },

      /** 기준선은 할 일을 마치고 오므라들고, 기준값의 자리만 남는다. */
      async settlePivot(): Promise<void> {
        const from = LINE_TOP;
        await animate(SETTLE_MS, (t) => {
          const e = easeInOut(t);
          setLineTop(from + (ROOM_Y - from) * e);
          setBadgeScale(1 + Math.sin(Math.PI * t) * 0.18);
        });
        setBadgeScale(1);
        badgeDisc.setAttribute('stroke-width', '3');
      },

      /** 두 방의 테두리가 드러나 "작은 쪽" 과 "큰 쪽" 이 각각 한 덩어리가 된다. */
      finish(): void {
        roomLeft.setAttribute('stroke', c.border);
        roomLeft.setAttribute('stroke-width', '1.5');
        roomRight.setAttribute('stroke', c.border);
        roomRight.setAttribute('stroke-width', '1.5');
        labelLeft.setAttribute('fill', c.text);
        labelRight.setAttribute('fill', c.text);
      },

      /** 처음 배치로 되돌린다. 되감기는 보여 줄 것이 아니라 자리 되돌림이다. */
      rewind(): void {
        layoutInitial();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        destroyed = true;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of rafs) cancelAnimationFrame(id);
        }
        rafs.clear();
        root.remove();
      },
    };
  },
};
