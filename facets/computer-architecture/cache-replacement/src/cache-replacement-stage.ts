/**
 * cache-replacement-stage — 네 칸짜리 캐시와 접근열을 한 폭에 그린다.
 *
 * 화면이 스스로 정책의 정의를 말해야 한다. 그래서 칸마다 **두 시각을 나란히**
 * 적어 두고, 지금 정책이 읽는 쪽만 밝게 둔다. "가장 오래 안 쓴 것" 과 "가장 먼저
 * 들어온 것" 은 칸이 다시 쓰였을 때만 갈리는데, 두 수가 같은 자리에 나란히
 * 있으면 그 갈림이 눈에 보인다 — 줄 0 이 `loaded 0` 인 채 `last used 7` 이 되는
 * 순간이 곧 LRU 와 FIFO 가 갈리는 순간이다.
 *
 * 운동은 둘이다. 버려지는 줄은 칸에서 **버려진 줄** 자리로 실제로 밀려 나가고,
 * 새로 드는 줄은 접근열의 그 자리에서 칸으로 날아든다. 정책을 바꾸면 같은
 * 걸음에서 **다른 칸이** 밀려 나가므로, 그 갈림이 좌표 이동으로 보인다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 칸 수와 접근열 길이는 선언이 정하고
 * 가로 폭 안에서 나누어 쓰므로, 내용이 늘어도 높이를 건드리지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;
const PAD = 16;

const RULE_Y = 22;
const SEQ_LABEL_Y = 42;
const SEQ_Y = 48;
const SEQ_H = 30;
const SEQ_GAP = 6;
const BAR_Y = 82;
const BAR_H = 4;
const CACHE_LABEL_Y = 106;
const SLOT_Y = 112;
const SLOT_H = 76;
const SLOT_GAP = 20;
const DISC_LABEL_Y = 204;
const DISC_Y = 208;
const DISC_H = 30;
const DISC_W = 48;
const DISC_GAP = 6;
const CAP_Y = 256;

/** 날아다니는 조각의 크기. 칸보다 작아야 어디로 가는지가 읽힌다. */
const FLY_W = 48;
const FLY_H = 30;

const EMPTY = -1;

type El = SVGElement;

function el(tag: string, attrs: Record<string, string | number>): El {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { 'font-family': fonts.body, ...attrs }) as SVGTextElement;
  node.textContent = content;
  return node;
}

/** 0..1 을 부드럽게 — 시작과 끝이 느리다. */
function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type SlotParts = {
  box: El;
  line: SVGTextElement;
  usedLabel: SVGTextElement;
  usedValue: SVGTextElement;
  loadLabel: SVGTextElement;
  loadValue: SVGTextElement;
};

export const cacheReplacementStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';
    canvas.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const init = (params.initialData ?? {}) as {
      slotCount?: unknown;
      sequence?: unknown;
    };
    const slotCount = typeof init.slotCount === 'number' && init.slotCount > 0 ? init.slotCount : 4;
    const sequence = Array.isArray(init.sequence)
      ? (init.sequence as unknown[]).filter((n): n is number => typeof n === 'number')
      : [];
    const seqCount = sequence.length > 0 ? sequence.length : 1;

    const seqW = (W - 2 * PAD - SEQ_GAP * (seqCount - 1)) / seqCount;
    const slotW = (W - 2 * PAD - SLOT_GAP * (slotCount - 1)) / slotCount;
    const seqX = (i: number): number => PAD + i * (seqW + SEQ_GAP);
    const slotX = (i: number): number => PAD + i * (slotW + SLOT_GAP);
    const discX = (k: number): number => PAD + k * (DISC_W + DISC_GAP);

    // ── 시간 축 ────────────────────────────────────────────────────────────
    // 스스로 다음 회차를 예약하는 것은 없다. 한 번의 애니메이션이 자기 타이머만
    // 이어 가고, destroy 가 그 전부를 거두고 기다리던 약속도 풀어 준다 (S-view).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiting = new Set<() => void>();

    function animate(durMs: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || durMs <= 0) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        const done = (): void => {
          waiting.delete(done);
          resolve();
        };
        waiting.add(done);
        const tick = (): void => {
          if (destroyed) {
            step(1);
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / durMs);
          step(ease(p));
          if (p >= 1) {
            done();
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

    // ── 고정 뼈대 ──────────────────────────────────────────────────────────
    const ruleText = text('', {
      x: PAD,
      y: RULE_Y,
      'font-size': fontSizes.md,
      'font-weight': '600',
      fill: colors.text,
    });
    canvas.appendChild(ruleText);

    canvas.appendChild(
      text(tr('label.sequence', 'Access order'), {
        x: PAD,
        y: SEQ_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );
    canvas.appendChild(
      text(tr('label.cache', 'Cache slots'), {
        x: PAD,
        y: CACHE_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );
    canvas.appendChild(
      text(tr('label.discarded', 'Discarded'), {
        x: PAD,
        y: DISC_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );

    // 접근열 — 칸마다 줄 번호 하나와 그 아래 결과 막대 하나.
    const seqBoxes: El[] = [];
    const seqTexts: SVGTextElement[] = [];
    const seqBars: El[] = [];
    for (let i = 0; i < sequence.length; i += 1) {
      const box = el('rect', {
        x: seqX(i),
        y: SEQ_Y,
        width: seqW,
        height: SEQ_H,
        rx: 4,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const label = text(String(sequence[i]), {
        x: seqX(i) + seqW / 2,
        y: SEQ_Y + SEQ_H / 2 + 5,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'text-anchor': 'middle',
        fill: colors.text,
      });
      const bar = el('rect', {
        x: seqX(i),
        y: BAR_Y,
        width: seqW,
        height: BAR_H,
        rx: 2,
        fill: colors.border,
      });
      canvas.append(box, label, bar);
      seqBoxes.push(box);
      seqTexts.push(label);
      seqBars.push(bar);
    }

    // 캐시 칸 — 줄 번호 하나와 두 시각.
    const slots: SlotParts[] = [];
    for (let i = 0; i < slotCount; i += 1) {
      const x = slotX(i);
      const box = el('rect', {
        x,
        y: SLOT_Y,
        width: slotW,
        height: SLOT_H,
        rx: 6,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      const line = text(tr('label.empty', 'empty'), {
        x: x + slotW / 2,
        y: SLOT_Y + 28,
        'font-size': fontSizes.lg,
        'font-family': fonts.mono,
        'font-weight': '600',
        'text-anchor': 'middle',
        fill: colors.textMuted,
      });
      const usedLabel = text(tr('label.lastUsed', 'last used'), {
        x: x + 10,
        y: SLOT_Y + 50,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const usedValue = text('–', {
        x: x + slotW - 10,
        y: SLOT_Y + 50,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'text-anchor': 'end',
        fill: colors.textMuted,
      });
      const loadLabel = text(tr('label.loadedAt', 'loaded at'), {
        x: x + 10,
        y: SLOT_Y + 66,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const loadValue = text('–', {
        x: x + slotW - 10,
        y: SLOT_Y + 66,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'text-anchor': 'end',
        fill: colors.textMuted,
      });
      canvas.append(box, line, usedLabel, usedValue, loadLabel, loadValue);
      slots.push({ box, line, usedLabel, usedValue, loadLabel, loadValue });
    }

    const captionText = text('', {
      x: PAD,
      y: CAP_Y,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    canvas.appendChild(captionText);

    // ── 가변 상태 ──────────────────────────────────────────────────────────
    let activeClock: 'used' | 'loaded' = 'used';
    let current = -1;
    const held: number[] = new Array<number>(slotCount).fill(EMPTY);
    const discarded: El[] = [];

    function paintSlot(i: number, fill: string, ink: string): void {
      const s = slots[i];
      if (!s) return;
      s.box.setAttribute('fill', fill);
      s.line.setAttribute('fill', held[i] === EMPTY ? colors.textMuted : ink);
    }

    function restSlot(i: number): void {
      paintSlot(i, colors.itemDefault, colors.text);
    }

    /** 지금 정책이 읽는 시각만 밝게 둔다 — 정의가 화면에 남아 있게. */
    function paintClocks(): void {
      for (const s of slots) {
        const usedOn = activeClock === 'used';
        s.usedLabel.setAttribute('fill', usedOn ? colors.text : colors.textMuted);
        s.usedValue.setAttribute('fill', usedOn ? colors.text : colors.textMuted);
        s.usedValue.setAttribute('font-weight', usedOn ? '600' : '400');
        s.loadLabel.setAttribute('fill', usedOn ? colors.textMuted : colors.text);
        s.loadValue.setAttribute('fill', usedOn ? colors.textMuted : colors.text);
        s.loadValue.setAttribute('font-weight', usedOn ? '400' : '600');
      }
    }

    function clearSeq(): void {
      for (let i = 0; i < seqBoxes.length; i += 1) {
        seqBoxes[i]!.setAttribute('fill', colors.itemDefault);
        seqTexts[i]!.setAttribute('fill', colors.text);
        seqBars[i]!.setAttribute('fill', colors.border);
      }
      current = -1;
    }

    /** 날아다니는 조각 하나. 중심 좌표를 받아 그 자리에 놓는다. */
    function flyer(cx: number, cy: number, label: string, fill: string, ink: string): El {
      const g = el('g', {});
      g.appendChild(
        el('rect', {
          x: cx - FLY_W / 2,
          y: cy - FLY_H / 2,
          width: FLY_W,
          height: FLY_H,
          rx: 4,
          fill,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      g.appendChild(
        text(label, {
          x: cx,
          y: cy + 5,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          'font-weight': '600',
          'text-anchor': 'middle',
          fill: ink,
        }),
      );
      canvas.appendChild(g);
      return g;
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 약속을 풀어 준다 — 풀지 않으면 알고리즘이 emit 에서 영영
        // 돌아오지 않는다.
        for (const done of [...waiting]) done();
        waiting.clear();
        canvas.textContent = '';
      },

      /** 판을 비우고 이 정책의 규칙을 건다. */
      setPolicy(clock: 'used' | 'loaded', rule: string): void {
        activeClock = clock === 'loaded' ? 'loaded' : 'used';
        ruleText.textContent = rule;
        clearSeq();
        for (let i = 0; i < slotCount; i += 1) {
          held[i] = EMPTY;
          const s = slots[i]!;
          s.line.textContent = tr('label.empty', 'empty');
          s.usedValue.textContent = '–';
          s.loadValue.textContent = '–';
          restSlot(i);
        }
        for (const d of discarded) d.remove();
        discarded.length = 0;
        paintClocks();
        captionText.textContent = '';
      },

      setCaption(value: string): void {
        captionText.textContent = value;
      },

      /** 이번에 찾는 줄. 접근열의 그 자리를 짚는다. */
      probe(step: number): void {
        if (current >= 0 && seqBoxes[current]) {
          seqBoxes[current]!.setAttribute('fill', colors.itemDefault);
          seqTexts[current]!.setAttribute('fill', colors.textMuted);
        }
        current = step;
        const box = seqBoxes[step];
        if (box) {
          box.setAttribute('fill', colors.itemComparing);
          seqTexts[step]!.setAttribute('fill', colors.stateInk);
        }
        for (let i = 0; i < slotCount; i += 1) restSlot(i);
      },

      /** 적중/빗나감을 접근열 아래 막대에 남긴다 — 지나온 자취가 보이게. */
      markResult(step: number, hit: boolean): void {
        const bar = seqBars[step];
        if (bar) bar.setAttribute('fill', hit ? colors.accent : colors.danger);
      },

      async hit(slot: number, ms: number): Promise<void> {
        paintSlot(slot, colors.itemPivot, colors.stateInk);
        await animate(ms, () => undefined);
        restSlot(slot);
      },

      /** 버릴 칸을 골랐다. 아직 밀어내지는 않는다. */
      markVictim(slot: number): void {
        paintSlot(slot, colors.itemSwapping, colors.stateInk);
      },

      /** 버려지는 줄이 칸에서 실제로 밀려 나간다. */
      async evict(slot: number, line: number, ms: number): Promise<void> {
        const s = slots[slot];
        if (!s) return;
        const fromX = slotX(slot) + slotW / 2;
        const fromY = SLOT_Y + SLOT_H / 2;
        const toX = discX(discarded.length) + DISC_W / 2;
        const toY = DISC_Y + DISC_H / 2;

        // 칸은 그 자리에서 바로 빈다 — 날아가는 것이 그 줄이라는 것이 분명해진다.
        held[slot] = EMPTY;
        s.line.textContent = tr('label.empty', 'empty');
        s.usedValue.textContent = '–';
        s.loadValue.textContent = '–';
        restSlot(slot);

        const g = flyer(fromX, fromY, String(line), colors.itemSwapping, colors.stateInk);
        await animate(ms, (p) => {
          g.setAttribute('transform', `translate(${(toX - fromX) * p} ${(toY - fromY) * p})`);
          g.setAttribute('opacity', String(1 - 0.35 * p));
        });
        g.remove();

        const rest = flyer(toX, toY, String(line), colors.bgSubtle, colors.textMuted);
        rest.setAttribute('opacity', '0.65');
        discarded.push(rest);
      },

      /** 새 줄이 접근열의 그 자리에서 칸으로 날아든다. */
      async install(slot: number, line: number, step: number, ms: number): Promise<void> {
        const s = slots[slot];
        if (!s) return;
        const fromX = seqX(step) + seqW / 2;
        const fromY = SEQ_Y + SEQ_H / 2;
        const toX = slotX(slot) + slotW / 2;
        const toY = SLOT_Y + SLOT_H / 2;

        const g = flyer(fromX, fromY, String(line), colors.itemActive, colors.stateInk);
        await animate(ms, (p) => {
          g.setAttribute('transform', `translate(${(toX - fromX) * p} ${(toY - fromY) * p})`);
        });
        g.remove();

        held[slot] = line;
        s.line.textContent = String(line);
        paintSlot(slot, colors.itemActive, colors.stateInk);
      },

      /** 칸마다의 두 시각. 지금 정책이 읽는 쪽만 밝다. */
      setClocks(used: number[], loaded: number[]): void {
        for (let i = 0; i < slotCount; i += 1) {
          const s = slots[i]!;
          const filled = held[i] !== EMPTY;
          s.usedValue.textContent = filled ? String(used[i] ?? 0) : '–';
          s.loadValue.textContent = filled ? String(loaded[i] ?? 0) : '–';
        }
        paintClocks();
      },

      finish(): void {
        for (let i = 0; i < slotCount; i += 1) restSlot(i);
        if (current >= 0 && seqBoxes[current]) {
          seqBoxes[current]!.setAttribute('fill', colors.itemDefault);
          seqTexts[current]!.setAttribute('fill', colors.text);
        }
        current = -1;
      },
    };
  },
};
