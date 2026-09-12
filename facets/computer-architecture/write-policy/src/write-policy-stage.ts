/**
 * write-policy-stage — 쓰기 차례 · 캐시 칸 · 아래층을 한 폭에 세로로 쌓아 그린다.
 *
 * 이 화면의 동사는 **내려감**이다. 고친 값이 아래층으로 가는 일 자체가 운동이라,
 * 값이 갈아 끼워지는 것이 아니라 덩어리가 좌표를 옮겨 간다.
 *
 *   write-through  고칠 때마다 작은 덩어리 하나가 칸에서 아래층으로 내려간다
 *   write-back     고침은 칸 위에 쌓이기만 하다가, 쫓겨날 때 그동안 쌓인 것이
 *                  **한 덩어리로** 내려간다. 덩어리의 폭이 곧 쌓인 수다
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). viewBox 는 러너가 `canvas` 선언으로
 * 만들어 주고 여기서 다시 재지 않는다.
 *
 * `destroy()` 는 뒷일을 남기지 않는다 — 스스로 다음 회차를 예약하는 애니메이션
 * 타이머를 전부 거두고, 아직 기다리고 있는 약속도 그 자리에서 풀어 준다.
 * 풀어 주지 않으면 재생 도중에 접었을 때 알고리즘이 영영 돌아오지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, makeTranslator, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 680;
const CANVAS_H = 320;

// 쓰기 차례 띠
const WRITE_X = 106;
const WRITE_Y = 34;
const WRITE_W = 42;
const WRITE_H = 30;
const WRITE_PITCH = 50;

// 캐시 띠
const SLOT_X = 106;
const SLOT_Y = 112;
const SLOT_W = 104;
const SLOT_H = 64;
const SLOT_PITCH = 124;

// 아래층 띠
const MEM_X = 106;
const MEM_Y = 238;
const MEM_W = 476;
const MEM_H = 56;
const TICK_X = MEM_X + 12;
const TICK_Y = MEM_Y + 14;
const TICK_H = 28;
const TICK_PITCH = 36;

const LABEL_X = 96;
const FRAME_MS = 16;

/**
 * 도형에 새겨진 표식. 번역하면 오히려 화면과 어긋나는 것들이다 (C10 판정 1·2).
 * `writes` · `cache` · `memory` 는 소문자 도식 라벨 한 단어이고,
 * `write-through` · `write-back` 은 그 분야에서 원어 그대로 통용되는 이름이다.
 */
const MARK = {
  writes: 'writes',
  cache: 'cache',
  memory: 'memory',
  through: 'write-through',
  back: 'write-back',
} as const;

type Attrs = Record<string, string | number>;

function el(tag: string, attrs: Attrs): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textNode(attrs: Attrs, content: string): SVGElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/** 한 칸이 화면에서 차지하는 자리. */
function slotLeft(i: number): number {
  return SLOT_X + i * SLOT_PITCH;
}
function writeLeft(i: number): number {
  return WRITE_X + i * WRITE_PITCH;
}

export const writePolicyStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    canvas.appendChild(root);

    // ── 타이머 살림. destroy 가 전부 거둔다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    }

    let pace = 1;
    const dur = (ms: number): number => Math.max(40, ms / Math.min(8, Math.max(0.25, pace)));

    /** 한 요소를 from 에서 to 로 옮긴다. 접히면 그 자리에서 끝낸다. */
    function glide(
      node: SVGElement,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      ms: number,
    ): Promise<void> {
      const place = (p: number): void => {
        const e = 1 - (1 - p) * (1 - p);
        const x = fromX + (toX - fromX) * e;
        const y = fromY + (toY - fromY) * e;
        node.setAttribute('transform', `translate(${x} ${y})`);
      };
      place(0);
      if (destroyed || ms <= 0) {
        place(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const started = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            place(1);
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          place(p);
          if (p >= 1) {
            finish();
            return;
          }
          later(tick, FRAME_MS);
        };
        later(tick, FRAME_MS);
      });
    }

    // ── 바탕 ────────────────────────────────────────────────
    const labelAttrs = {
      x: LABEL_X,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    };
    root.appendChild(textNode({ ...labelAttrs, y: WRITE_Y + 20 }, MARK.writes));
    root.appendChild(textNode({ ...labelAttrs, y: SLOT_Y + 36 }, MARK.cache));
    root.appendChild(textNode({ ...labelAttrs, y: MEM_Y + 32 }, MARK.memory));

    const policyMark = textNode(
      {
        x: CANVAS_W - 14,
        y: 22,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      },
      MARK.through,
    );
    root.appendChild(policyMark);

    const premise = textNode(
      {
        x: 14,
        y: 22,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '',
    );
    root.appendChild(premise);

    // 내려가는 길. 이 화면의 동사가 어느 쪽을 향하는지 바탕에 미리 그어 둔다.
    const GUIDE_X = MEM_X + MEM_W + 26;
    root.appendChild(
      el('line', {
        x1: GUIDE_X,
        y1: SLOT_Y + 12,
        x2: GUIDE_X,
        y2: MEM_Y + 2,
        stroke: colors.border,
        'stroke-width': 2,
        'stroke-dasharray': '3 5',
      }),
    );
    root.appendChild(
      el('polygon', {
        points: `${GUIDE_X - 6},${MEM_Y + 2} ${GUIDE_X + 6},${MEM_Y + 2} ${GUIDE_X},${MEM_Y + 14}`,
        fill: colors.border,
      }),
    );

    // 아래층 상자
    root.appendChild(
      el('rect', {
        x: MEM_X,
        y: MEM_Y,
        width: MEM_W,
        height: MEM_H,
        rx: 6,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    const memCount = textNode(
      {
        x: MEM_X + MEM_W - 12,
        y: MEM_Y + MEM_H - 10,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '',
    );
    root.appendChild(memCount);

    const caption = textNode(
      {
        x: CANVAS_W / 2,
        y: 308,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      },
      '',
    );
    root.appendChild(caption);

    // ── 움직이는 층 ──────────────────────────────────────────
    const streamLayer = el('g', {});
    const slotLayer = el('g', {});
    const memLayer = el('g', {});
    const flyLayer = el('g', {});
    root.append(streamLayer, slotLayer, memLayer, flyLayer);

    let writeCells: SVGElement[] = [];
    let slotFrames: SVGElement[] = [];
    let slotTokens: Array<SVGElement | null> = [];
    let landed = 0;

    function setMemCount(n: number): void {
      memCount.textContent = t('label.memoryWrites', 'memory writes: {n}', { n });
    }

    /** 칸 하나에 들어앉는 줄 딱지. 원점(0,0) 기준으로 그리고 transform 으로 옮긴다. */
    function makeToken(lineNo: number): SVGElement {
      const g = el('g', {});
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: WRITE_W,
          height: WRITE_H,
          rx: 4,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      g.appendChild(
        textNode(
          {
            x: WRITE_W / 2,
            y: WRITE_H / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          },
          String(lineNo),
        ),
      );
      return g;
    }

    function paintToken(g: SVGElement, dirty: boolean, pending: number): void {
      const rect = g.querySelector('rect');
      const label = g.querySelector('text');
      if (rect) rect.setAttribute('fill', dirty ? colors.itemActive : colors.itemDefault);
      if (label) label.setAttribute('fill', dirty ? colors.stateInk : colors.text);
      // 쌓인 고침 수는 수식 표기라 표식이다 — 값만 찍는다.
      let badge = g.querySelector('.wp-pending');
      if (pending > 1) {
        if (!badge) {
          badge = textNode(
            {
              class: 'wp-pending',
              x: WRITE_W + 10,
              y: WRITE_H / 2 + 4,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
            },
            '',
          );
          g.appendChild(badge);
        }
        badge.textContent = `+${pending}`;
      } else if (badge) {
        badge.remove();
      }
    }

    function paintWriteCell(i: number, state: 'future' | 'current' | 'done'): void {
      const cell = writeCells[i];
      if (!cell) return;
      const rect = cell.querySelector('rect');
      const label = cell.querySelector('text');
      const fill =
        state === 'current' ? colors.accent : state === 'done' ? colors.itemSorted : colors.itemDefault;
      const ink =
        state === 'current' ? colors.stateInk : state === 'done' ? colors.textInverse : colors.text;
      if (rect) rect.setAttribute('fill', fill);
      if (label) label.setAttribute('fill', ink);
    }

    // ── Projector 가 부르는 표면 ──────────────────────────────
    const api = {
      setup(writes: number[], slots: number, lineBytes: number): void {
        streamLayer.textContent = '';
        slotLayer.textContent = '';
        writeCells = [];
        slotFrames = [];
        slotTokens = [];

        premise.textContent = t('label.premise', '{slots} slots · {bytes} B lines · LRU', {
          slots,
          bytes: lineBytes,
        });

        for (let i = 0; i < writes.length; i += 1) {
          const g = el('g', { transform: `translate(${writeLeft(i)} ${WRITE_Y})` });
          g.appendChild(
            el('rect', {
              x: 0,
              y: 0,
              width: WRITE_W,
              height: WRITE_H,
              rx: 4,
              fill: colors.itemDefault,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
          g.appendChild(
            textNode(
              {
                x: WRITE_W / 2,
                y: WRITE_H / 2 + 4,
                'text-anchor': 'middle',
                'font-family': fonts.mono,
                'font-size': fontSizes.sm,
                fill: colors.text,
              },
              String(writes[i]),
            ),
          );
          streamLayer.appendChild(g);
          writeCells.push(g);
        }

        for (let s = 0; s < slots; s += 1) {
          const frame = el('rect', {
            x: slotLeft(s),
            y: SLOT_Y,
            width: SLOT_W,
            height: SLOT_H,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
          });
          slotLayer.appendChild(frame);
          slotFrames.push(frame);
          slotTokens.push(null);
        }
        setMemCount(0);
      },

      setPace(mul: number): void {
        pace = mul;
      },

      reset(policy: string): void {
        policyMark.textContent = policy === 'back' ? MARK.back : MARK.through;
        flyLayer.textContent = '';
        memLayer.textContent = '';
        landed = 0;
        setMemCount(0);
        for (let i = 0; i < writeCells.length; i += 1) paintWriteCell(i, 'future');
        for (let s = 0; s < slotTokens.length; s += 1) {
          const tok = slotTokens[s];
          if (tok) tok.remove();
          slotTokens[s] = null;
          const frame = slotFrames[s];
          if (frame) frame.setAttribute('stroke-dasharray', '4 4');
        }
      },

      focusWrite(step: number, _line: number): void {
        for (let i = 0; i < writeCells.length; i += 1) {
          paintWriteCell(i, i < step ? 'done' : i === step ? 'current' : 'future');
        }
      },

      /** 줄이 쓰기 띠에서 칸으로 내려앉는다. */
      async fill(slot: number, lineNo: number, step: number): Promise<void> {
        const tok = makeToken(lineNo);
        slotLayer.appendChild(tok);
        slotTokens[slot] = tok;
        const frame = slotFrames[slot];
        if (frame) frame.setAttribute('stroke-dasharray', 'none');
        const fromX = step >= 0 ? writeLeft(step) : slotLeft(slot) + (SLOT_W - WRITE_W) / 2;
        const toX = slotLeft(slot) + (SLOT_W - WRITE_W) / 2;
        await glide(tok, fromX, WRITE_Y, toX, SLOT_Y + 17, dur(300));
      },

      /** 줄이 칸에서 쫓겨나 위로 빠진다. */
      async evict(slot: number, _lineNo: number): Promise<void> {
        const tok = slotTokens[slot];
        slotTokens[slot] = null;
        const frame = slotFrames[slot];
        if (frame) frame.setAttribute('stroke-dasharray', '4 4');
        if (!tok) return;
        const x = slotLeft(slot) + (SLOT_W - WRITE_W) / 2;
        tok.setAttribute('opacity', '0.5');
        await glide(tok, x, SLOT_Y + 17, x, SLOT_Y - 26, dur(260));
        tok.remove();
      },

      markDirty(slot: number, pending: number): void {
        const tok = slotTokens[slot];
        if (tok) paintToken(tok, true, pending);
      },

      /**
       * 아래층으로 한 덩어리가 내려간다.
       *
       * folded 가 폭이다 — write-back 에서 쌓였다가 한꺼번에 내려가는 것이
       * 눈에 보이도록, 실려 가는 고침 수만큼 덩어리가 두꺼워진다.
       */
      async descend(slot: number, folded: number, _reason: string): Promise<void> {
        const width = Math.min(WRITE_W + 46, WRITE_W + (Math.max(1, folded) - 1) * 12);
        const block = el('g', {});
        block.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width,
            height: 24,
            rx: 4,
            fill: colors.itemActive,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        block.appendChild(
          textNode(
            {
              x: width / 2,
              y: 17,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.stateInk,
            },
            String(Math.max(1, folded)),
          ),
        );
        flyLayer.appendChild(block);

        const fromX = slotLeft(slot) + (SLOT_W - width) / 2;
        const toX = TICK_X + landed * TICK_PITCH;
        await glide(block, fromX, SLOT_Y + SLOT_H - 22, toX, TICK_Y, dur(420));
        block.remove();

        // 내려앉은 것은 아래층에 눈금으로 남는다.
        const tick = el('g', { transform: `translate(${toX} ${TICK_Y})` });
        tick.appendChild(
          el('rect', {
            x: 0,
            y: 0,
            width: 28,
            height: TICK_H,
            rx: 3,
            fill: colors.itemSorted,
          }),
        );
        tick.appendChild(
          textNode(
            {
              x: 14,
              y: 19,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textInverse,
            },
            String(Math.max(1, folded)),
          ),
        );
        memLayer.appendChild(tick);
        landed += 1;
        setMemCount(landed);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      finish(): void {
        for (let i = 0; i < writeCells.length; i += 1) paintWriteCell(i, 'done');
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 약속을 풀어 준다 — 풀지 않으면 재생 도중 접었을 때
        // 알고리즘이 영영 돌아오지 않는다.
        for (const release of [...waiters]) release();
        waiters.clear();
        if (root.parentNode) root.remove();
      },
    };

    return api as unknown as ViewInstance;
  },
};
