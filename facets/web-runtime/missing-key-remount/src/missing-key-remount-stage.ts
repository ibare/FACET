/**
 * missingKeyRemount 의 stage — 이름표 없는 목록을 자리로만 맞출 때, 실제 노드가
 * 제자리에 선 채 글자만 덮어써지고, 노드에 붙은 상태(눌린 칸)가 그 자리를 따라
 * 남는 모습을 그린다.
 *
 * 장면(scene) 은 이 파일을 모른다 — 여기 선언한 타입은 `scene.ts` 의 장면과 구조가
 * 같을 뿐, import 하지 않는다 (View 는 Algorithm/Scene 쪽을 참조하지 않는다).
 */
import {
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';

type SlotView = { id: number; text: string; checked: boolean };
type StepView =
  | { kind: 'patch'; index: number; from: string; to: string }
  | { kind: 'create'; index: number; text: string };
type SceneView = {
  newItems: string[];
  slots: SlotView[];
  nextId: number;
  patched: number;
  created: number;
  step: StepView | null;
};

function isSceneView(v: unknown): v is SceneView {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.newItems) && Array.isArray(s.slots);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 400;

const SIDE_MIN = 24;
const CHIP_GAP = 8;
const CHIP_MAX_W = 64;
const CHIP_H = 32;
const CHIP_Y = 46;
const LABEL1_Y = 26;
const LABEL2_Y = 106;
const SLOTS_TOP = 122;
const ROW_GAP = 10;
const ROW_MAX_H = 56;
const CAPTION_TOP = H - 74;
const CAPTION_LINE1_Y = CAPTION_TOP + 22;
const CAPTION_LINE2_Y = CAPTION_TOP + 46;
const CHECKBOX = 18;
const ANIM_MS = 420;
const ANIM_FRAMES = 12;

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 순수 색 변환 — 리터럴 색이 아니라 토큰 hex 를 옅게 태우는 함수라 view 에 둘 수 있다 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rowY(index: number, rowH: number): number {
  return SLOTS_TOP + index * rowH;
}

function computeRowH(rows: number): number {
  const available = CAPTION_TOP - 12 - SLOTS_TOP;
  const withoutGaps = available - Math.max(0, rows - 1) * ROW_GAP;
  return Math.max(28, Math.min(ROW_MAX_H, Math.floor(withoutGaps / Math.max(1, rows))));
}

function chipLayout(count: number): { chipW: number; startX: number } {
  const chipW = Math.min(CHIP_MAX_W, Math.floor((W - 2 * SIDE_MIN - (count - 1) * CHIP_GAP) / count));
  const totalW = count * chipW + (count - 1) * CHIP_GAP;
  const startX = Math.round((W - totalW) / 2);
  return { chipW, startX };
}

export const missingKeyRemountStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    const root = svg('g', {});
    canvas.textContent = '';
    canvas.appendChild(root);

    function clear(): void {
      root.textContent = '';
    }

    function drawLabels(colors: Palette): void {
      const l1 = svg('text', {
        x: SIDE_MIN,
        y: LABEL1_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      l1.textContent = t('label.newList', 'New list');
      root.appendChild(l1);

      const l2 = svg('text', {
        x: SIDE_MIN,
        y: LABEL2_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      l2.textContent = t('label.realList', 'Real nodes');
      root.appendChild(l2);
    }

    /**
     * 새 목록 칩 한 줄. `currentIndex` 는 이번 걸음(또는 스크럽으로 보는 걸음)이
     * 다룬 자리 — 그 칩만 강조하고, 그보다 앞선 자리는 이미 지나간 것으로 옅게 묻는다.
     * `overrideAlpha` 는 애니메이션 중 강조가 옅게 → 짙게 번지는 값(0~1). 생략하면 1.
     */
    function drawChips(colors: Palette, scene: SceneView, currentIndex: number, overrideAlpha?: number): void {
      const { chipW, startX } = chipLayout(scene.newItems.length);
      for (let i = 0; i < scene.newItems.length; i += 1) {
        const x = startX + i * (chipW + CHIP_GAP);
        const isCurrent = i === currentIndex;
        const isPast = currentIndex >= 0 && i < currentIndex;
        const g = svg('g', { 'data-chip': String(i) });
        const rect = svg('rect', {
          x,
          y: CHIP_Y,
          width: chipW,
          height: CHIP_H,
          rx: 6,
          fill: isCurrent ? colors.accent : colors.bg,
          'fill-opacity': isCurrent ? String(overrideAlpha ?? 1) : '1',
          stroke: colors.border,
          'stroke-width': 1,
        });
        g.appendChild(rect);
        const label = svg('text', {
          x: x + chipW / 2,
          y: CHIP_Y + CHIP_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: isCurrent ? colors.stateInk : isPast ? colors.textMuted : colors.text,
        });
        label.textContent = scene.newItems[i];
        g.appendChild(label);
        root.appendChild(g);
      }
    }

    /**
     * 실제 줄 자리 하나. `highlightAlpha` 가 있으면 이 자리가 방금 손댄 자리라는
     * 배경 tint 를 그 세기로 겹친다(0~1). `textOverride` 는 애니메이션 중 글자를
     * 다른 값·다른 자리(translateY)로 잠깐 그릴 때 쓴다.
     */
    function drawSlotRow(
      colors: Palette,
      index: number,
      rowH: number,
      slot: SlotView | null,
      opts: {
        highlightAlpha?: number;
        textOverride?: { text: string; dy: number; opacity: number };
        groupOpacity?: number;
        groupScale?: number;
      } = {},
    ): SVGGElement {
      const y = rowY(index, rowH);
      const liH = rowH - 8;
      const g = svg('g', { 'data-row': String(index) }) as SVGGElement;
      if (opts.groupOpacity !== undefined) g.setAttribute('opacity', String(opts.groupOpacity));
      if (opts.groupScale !== undefined && opts.groupScale !== 1) {
        const cx = W / 2;
        const cy = y + liH / 2;
        g.setAttribute('transform', `translate(${cx} ${cy}) scale(${opts.groupScale}) translate(${-cx} ${-cy})`);
      }

      const rect = svg('rect', {
        x: SIDE_MIN,
        y,
        width: W - 2 * SIDE_MIN,
        height: liH,
        rx: 6,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1,
      });
      g.appendChild(rect);

      if (opts.highlightAlpha) {
        const tint = svg('rect', {
          x: SIDE_MIN,
          y,
          width: W - 2 * SIDE_MIN,
          height: liH,
          rx: 6,
          fill: hexToRgba(colors.itemActive, 0.14),
          stroke: colors.itemActive,
          'stroke-width': 1.5,
          'fill-opacity': String(opts.highlightAlpha),
          'stroke-opacity': String(opts.highlightAlpha),
        });
        g.appendChild(tint);
      }

      if (slot) {
        const idTag = svg('text', {
          x: SIDE_MIN + 10,
          y: y + liH / 2 + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        idTag.textContent = `#${slot.id}`;
        g.appendChild(idTag);

        const mainText = svg('text', {
          x: SIDE_MIN + 46,
          y: y + liH / 2 + 5 + (opts.textOverride ? opts.textOverride.dy : 0),
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: opts.highlightAlpha ? colors.stateInk : colors.text,
          opacity: opts.textOverride ? String(opts.textOverride.opacity) : '1',
        });
        mainText.textContent = opts.textOverride ? opts.textOverride.text : slot.text;
        g.appendChild(mainText);

        const boxX = SIDE_MIN + (W - 2 * SIDE_MIN) - CHECKBOX - 14;
        const boxY = y + (liH - CHECKBOX) / 2;
        const box = svg('rect', {
          x: boxX,
          y: boxY,
          width: CHECKBOX,
          height: CHECKBOX,
          rx: 3,
          fill: slot.checked ? colors.primary : colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        });
        g.appendChild(box);
        if (slot.checked) {
          const mark = svg('polyline', {
            points: `${boxX + 3},${boxY + 9} ${boxX + 7},${boxY + 13} ${boxX + 15},${boxY + 4}`,
            fill: 'none',
            stroke: colors.textInverse,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          });
          g.appendChild(mark);
          const tag = svg('text', {
            x: boxX - 6,
            y: boxY + CHECKBOX / 2 + 4,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
          tag.textContent = t('label.checkedTag', 'checked');
          g.appendChild(tag);
        }
      }

      root.appendChild(g);
      return g;
    }

    function drawSlots(colors: Palette, scene: SceneView, currentIndex: number): void {
      const rows = scene.newItems.length;
      const rowH = computeRowH(rows);
      for (let i = 0; i < rows; i += 1) {
        const slot = scene.slots[i] ?? null;
        drawSlotRow(colors, i, rowH, slot, {
          highlightAlpha: i === currentIndex ? 1 : undefined,
        });
      }
    }

    function joinList(items: string[]): string {
      return items.join(' · ');
    }

    function checkedText(scene: SceneView): string {
      const found = scene.slots.find((s) => s.checked);
      return found ? found.text : '';
    }

    function drawCaption(colors: Palette, scene: SceneView): void {
      let line1: string;
      if (!scene.step) {
        line1 = t('caption.initial', 'Real nodes: {oldList}. Checked box next to {checkedText}.', {
          oldList: joinList(scene.slots.map((s) => s.text)),
          checkedText: checkedText(scene),
        });
      } else if (scene.step.kind === 'patch') {
        line1 = t('caption.patch', 'Position {n}: the same node stays — text {from} → {to}.', {
          n: scene.step.index + 1,
          from: scene.step.from,
          to: scene.step.to,
        });
      } else {
        line1 = t('caption.create', 'Position {n}: a new node appears — text {text}, box empty.', {
          n: scene.step.index + 1,
          text: scene.step.text,
        });
      }
      const line2 = t('caption.tally', 'Patched {patched} · created {created} · checked box now next to {checkedText}.', {
        patched: scene.patched,
        created: scene.created,
        checkedText: checkedText(scene),
      });

      const t1 = svg('text', {
        x: SIDE_MIN,
        y: CAPTION_LINE1_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      t1.textContent = line1;
      root.appendChild(t1);

      const t2 = svg('text', {
        x: SIDE_MIN,
        y: CAPTION_LINE2_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      t2.textContent = line2;
      root.appendChild(t2);
    }

    function drawStatic(scene: SceneView): void {
      clear();
      const colors = getColors(params.theme);
      const currentIndex = scene.step ? scene.step.index : -1;
      drawLabels(colors);
      drawChips(colors, scene, currentIndex);
      drawSlots(colors, scene, currentIndex);
      drawCaption(colors, scene);
    }

    async function runPatchTransition(prev: SceneView, next: SceneView, mine: number): Promise<void> {
      const step = next.step;
      if (!step || step.kind !== 'patch') return;
      const colors = getColors(params.theme);
      const rowH = computeRowH(next.newItems.length);
      const prevSlot = prev.slots[step.index];
      for (let f = 1; f <= ANIM_FRAMES; f += 1) {
        await wait(ANIM_MS / ANIM_FRAMES);
        if (destroyed || mine !== gen) return;
        const p = f / ANIM_FRAMES;
        // 배경 화면(라벨 · 다른 자리들 · 캡션)은 next 기준으로 이미 settle 된 모습으로
        // 두고, 이번 자리(row)와 칩만 겹쳐 다시 그린다.
        clear();
        drawLabels(colors);
        drawChips(colors, next, step.index, Math.min(1, p * 1.4));
        for (let i = 0; i < next.newItems.length; i += 1) {
          if (i === step.index) continue;
          drawSlotRow(colors, i, rowH, next.slots[i] ?? null, {});
        }
        const halfway = p < 0.5;
        const q = halfway ? p * 2 : (p - 0.5) * 2;
        const textOverride = halfway
          ? { text: step.from, dy: -6 * q, opacity: 1 - q }
          : { text: step.to, dy: 6 * (1 - q), opacity: q };
        drawSlotRow(colors, step.index, rowH, prevSlot ?? null, {
          highlightAlpha: Math.min(1, p * 1.4),
          textOverride,
        });
        drawCaption(colors, prev);
      }
    }

    async function runCreateTransition(prev: SceneView, next: SceneView, mine: number): Promise<void> {
      const step = next.step;
      if (!step || step.kind !== 'create') return;
      const colors = getColors(params.theme);
      const rowH = computeRowH(next.newItems.length);
      const newSlot = next.slots[step.index];
      for (let f = 1; f <= ANIM_FRAMES; f += 1) {
        await wait(ANIM_MS / ANIM_FRAMES);
        if (destroyed || mine !== gen) return;
        const p = f / ANIM_FRAMES;
        clear();
        drawLabels(colors);
        drawChips(colors, next, step.index, Math.min(1, p * 1.4));
        for (let i = 0; i < step.index; i += 1) {
          drawSlotRow(colors, i, rowH, next.slots[i] ?? null, {});
        }
        drawSlotRow(colors, step.index, rowH, newSlot, {
          highlightAlpha: Math.min(1, p * 1.4),
          groupOpacity: p,
          groupScale: 0.7 + 0.3 * p,
        });
        drawCaption(colors, prev);
      }
    }

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },

      async render(next: unknown, prev: unknown, opts: { animate: boolean }): Promise<void> {
        if (!isSceneView(next)) return;
        const mine = (gen += 1);
        if (!opts.animate || !isSceneView(prev) || !next.step) {
          drawStatic(next);
          return;
        }
        if (next.step.kind === 'patch') {
          await runPatchTransition(prev, next, mine);
        } else {
          await runCreateTransition(prev, next, mine);
        }
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
    };
  },
};
