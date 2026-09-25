/**
 * 인스턴스화 stage — 왼쪽에 프로그램, 오른쪽 위에 틀, 그 아래로 찍혀 나온 객체들.
 *
 * 동사 "찍혀 나온다" — `new` 걸음에서 새 객체가 틀과 같은 자리·같은 모양으로 떠서
 * 제 자리까지 내려오고, 내려앉은 뒤 칸의 `null` 이 `create` 가 넣은 값으로 굴러 바뀐다.
 * 동사 "제 것만 바뀐다" — `tick` 걸음에서는 한 객체의 한 칸만 굴러 바뀌고 나머지는 서 있다.
 * `show` 걸음에서는 읽은 칸의 값이 출력 줄로 날아간다. 틀은 끝까지 값을 갖지 않는다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { InstantiateScene, SceneVal } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 14;
const SLOT_MAX = 132;
const SLOT_GAP = 8;
const FLY_MS = 420;
const ROLL_MS = 300;
const SHOW_MS = 450;

/** 흐르는 도중의 자세. 1 이면 그 운동은 끝난 것이다. */
type Pose = { fly: number; roll: number; show: number };
const DONE: Pose = { fly: 1, roll: 1, show: 1 };

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function fmt(v: SceneVal): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

type Layout = {
  codeX: number;
  codeY: number;
  codeLH: number;
  codeW: number;
  charW: number;
  slotW: number;
  headH: number;
  rowH: number;
  boxH: number;
  tplX: number;
  tplY: number;
  rowX: number;
  nameY: number;
  objY: number;
  outY: number;
  rightX: number;
};

function layoutOf(scene: InstantiateScene): Layout {
  const codePx = parseFloat(fontSizes.sm);
  const charW = codePx * 0.6;
  const codeLH = Math.round(codePx * 1.45);
  const maxChars = scene.lines.reduce((m, ln) => Math.max(m, ln.indent * 4 + ln.text.length), 20);
  const codeX = PAD + 10;
  const codeW = maxChars * charW + 6;
  const rightX = codeX + codeW + 10;
  const rightW = PIECE_CANVAS_W - PAD - rightX;
  const n = Math.max(1, scene.objectCount);
  const slotW = Math.min(SLOT_MAX, (rightW - SLOT_GAP * (n - 1)) / n);
  const rowW = slotW * n + SLOT_GAP * (n - 1);
  const fieldCount = scene.classes[0]?.fields.length ?? 0;
  const headH = 22;
  const rowH = 22;
  const boxH = headH + rowH * fieldCount + 4;
  const tplY = 34;
  const objY = tplY + boxH + 76;
  return {
    codeX,
    codeY: 34,
    codeLH,
    codeW,
    charW,
    slotW,
    headH,
    rowH,
    boxH,
    tplX: rightX + (rightW - slotW) / 2,
    tplY,
    rowX: rightX + (rightW - rowW) / 2,
    nameY: objY - 14,
    objY,
    outY: objY + boxH + 42,
    rightX,
  };
}

export const instantiateFromClassStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Record<string, string | number>, parent: Element, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function slotX(L: Layout, i: number): number {
      return L.rowX + i * (L.slotW + SLOT_GAP);
    }

    function cellCenter(L: Layout, obj: number, row: number): { x: number; y: number } {
      return {
        x: slotX(L, obj) + L.slotW - 6,
        y: L.objY + L.headH + row * L.rowH + L.rowH / 2,
      };
    }

    function captionOf(scene: InstantiateScene): string {
      const st = scene.step;
      if (st.kind === 'start') return t('caption.start', 'Nothing has run yet.');
      const nameOf = (i: number): string => scene.objects[i]?.names[0] ?? '';
      if (st.stamped.length > 0) {
        const o = st.stamped[st.stamped.length - 1];
        return t('caption.stamp', 'new {cls}: a new object is stamped out of the template · name {name}', {
          cls: scene.objects[o]?.cls ?? '',
          name: nameOf(o),
        });
      }
      if (st.changed.length > 0) {
        const ch = st.changed[st.changed.length - 1];
        const others = scene.objects
          .map((_, i) => i)
          .filter((i) => !st.changed.some((x) => x.obj === i))
          .map(nameOf)
          .join(', ');
        return t('caption.set', '{name}.{field}: {from} → {to} · unchanged: {others}', {
          name: nameOf(ch.obj),
          field: ch.field,
          from: fmt(ch.from),
          to: fmt(ch.to),
          others: others === '' ? '-' : others,
        });
      }
      if (st.shown.length > 0) {
        const sh = st.shown[st.shown.length - 1];
        return t('caption.show', 'show {name}.{field} · output {value}', {
          name: sh.src === null ? '' : nameOf(sh.src.obj),
          field: sh.src?.field ?? '',
          value: fmt(sh.value),
        });
      }
      return '';
    }

    function drawCode(scene: InstantiateScene, L: Layout, g: Element): void {
      const st = scene.step;
      const codePx = parseFloat(fontSizes.sm);
      scene.lines.forEach((ln, i) => {
        const y = L.codeY + i * L.codeLH;
        if (st.kind === 'line' && st.line === i) {
          el('rect', { x: L.codeX - 4, y: y - L.codeLH + 4, width: L.codeW, height: L.codeLH, rx: 3, fill: c.accent, 'fill-opacity': 0.4 }, g);
        }
        if (st.kind === 'line' && st.inner.includes(i)) {
          el('rect', { x: PAD, y: y - L.codeLH + 5, width: 4, height: L.codeLH - 2, rx: 2, fill: c.primary }, g);
        }
        el(
          'text',
          {
            x: L.codeX + ln.indent * 4 * L.charW,
            y,
            'font-family': fonts.mono,
            'font-size': codePx,
            fill: c.text,
          },
          g,
          ln.text,
        );
      });
    }

    function drawBox(
      L: Layout,
      g: Element,
      x: number,
      y: number,
      head: string,
      cells: { field: string; text: string | null; hot: boolean; roll: { from: string; to: string; p: number } | null }[],
      template: boolean,
      stroke: string,
      strokeW: number,
    ): void {
      const box = el('g', { transform: `translate(${r1(x)} ${r1(y)})` }, g);
      el('rect', {
        x: 0,
        y: 0,
        width: L.slotW,
        height: L.boxH,
        rx: 6,
        fill: template ? 'none' : c.bg,
        stroke,
        'stroke-width': strokeW,
        ...(template ? { 'stroke-dasharray': '5 4' } : {}),
      }, box);
      if (!template) el('rect', { x: 1, y: 1, width: L.slotW - 2, height: L.headH - 2, rx: 5, fill: c.bgSubtle }, box);
      el('text', {
        x: L.slotW / 2,
        y: L.headH / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': parseFloat(fontSizes.sm),
        'font-weight': 600,
        fill: template ? c.textMuted : c.text,
      }, box, head);
      cells.forEach((cell, row) => {
        const cy = L.headH + row * L.rowH;
        const mid = cy + L.rowH / 2 + 4;
        if (cell.hot) el('rect', { x: 3, y: cy + 1, width: L.slotW - 6, height: L.rowH - 2, rx: 3, fill: c.accent, 'fill-opacity': 0.45 }, box);
        el('text', {
          x: 6,
          y: mid,
          'font-family': fonts.mono,
          'font-size': parseFloat(fontSizes.xs),
          fill: c.textMuted,
        }, box, cell.field);
        if (template) {
          const w = L.slotW * 0.42;
          el('rect', {
            x: L.slotW - 6 - w,
            y: cy + 4,
            width: w,
            height: L.rowH - 8,
            rx: 3,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '3 3',
          }, box);
          return;
        }
        const valueAttrs = {
          x: L.slotW - 6,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': parseFloat(fontSizes.sm),
        };
        if (cell.roll !== null && cell.roll.p < 1) {
          const p = ease(cell.roll.p);
          const dy = L.rowH * 0.6;
          if (p < 1) el('text', { ...valueAttrs, y: mid - p * dy, fill: c.textMuted, 'fill-opacity': 1 - p }, box, cell.roll.from);
          if (p > 0) el('text', { ...valueAttrs, y: mid + (1 - p) * dy, fill: c.text, 'fill-opacity': p }, box, cell.roll.to);
          return;
        }
        if (cell.text !== null) {
          el('text', { ...valueAttrs, y: mid, fill: cell.text === 'null' ? c.textMuted : c.text }, box, cell.text);
        }
      });
    }

    function drawFrame(scene: InstantiateScene, pose: Pose): void {
      svg.textContent = '';
      if (scene.lines.length === 0) return;
      const L = layoutOf(scene);
      const st = scene.step;
      const root = el('g', {}, svg);
      drawCode(scene, L, root);
      // 바탕(init)이 서기 전에는 프로그램만 보인다
      if (scene.classes.length === 0) return;

      const labelAttrs = { 'font-family': fonts.body, 'font-size': parseFloat(fontSizes.xs), fill: c.textMuted };
      const cls = scene.classes[0];
      el('text', { ...labelAttrs, x: L.tplX, y: L.tplY - 8 }, root, t('label.template', 'template'));
      if (cls !== undefined) {
        drawBox(
          L,
          root,
          L.tplX,
          L.tplY,
          cls.name,
          cls.fields.map((field) => ({ field, text: null, hot: false, roll: null })),
          true,
          c.textMuted,
          1.5,
        );
      }
      el('text', { ...labelAttrs, x: L.rowX, y: L.nameY - 22 }, root, t('label.objects', 'objects'));

      const stamped = st.kind === 'line' ? st.stamped : [];
      const changed = st.kind === 'line' ? st.changed : [];
      const shownNow = st.kind === 'line' ? st.shown : [];
      const flyP = ease(pose.fly);

      scene.objects.forEach((obj, i) => {
        if (obj === undefined) return;
        const isNew = stamped.includes(i);
        const hx = slotX(L, i);
        const x = isNew ? L.tplX + (hx - L.tplX) * flyP : hx;
        const y = isNew ? L.tplY + (L.objY - L.tplY) * flyP : L.objY;
        const cells = obj.cells.map((cell) => {
          const ch = changed.find((x2) => x2.obj === i && x2.field === cell.field);
          const hot = ch !== undefined;
          let roll: { from: string; to: string; p: number } | null = null;
          if (ch !== undefined && pose.roll < 1) roll = { from: fmt(ch.from), to: fmt(ch.to), p: pose.roll };
          return { field: cell.field, text: fmt(cell.value), hot, roll };
        });
        const touched = isNew || changed.some((x2) => x2.obj === i);
        drawBox(L, root, x, y, obj.cls, cells, false, touched ? c.primary : c.text, touched ? 2 : 1.2);
        if (!isNew || pose.fly >= 1) {
          const name = obj.names.join(' · ');
          if (name !== '') {
            el('text', {
              x: hx + L.slotW / 2,
              y: L.nameY - 4,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': parseFloat(fontSizes.md),
              'font-weight': 700,
              fill: c.text,
            }, root, name);
            el('line', { x1: hx + L.slotW / 2, y1: L.nameY, x2: hx + L.slotW / 2, y2: L.objY - 2, stroke: c.textMuted, 'stroke-width': 1.2 }, root);
          }
        }
      });

      // 출력 줄
      el('text', { ...labelAttrs, x: L.rowX, y: L.outY - 8 }, root, t('label.output', 'output'));
      const chipH = 22;
      const valPx = parseFloat(fontSizes.sm);
      let cx = L.rowX;
      const fresh = scene.outputs.length - shownNow.length;
      scene.outputs.forEach((v, i) => {
        const text = fmt(v);
        const w = text.length * valPx * 0.6 + 16;
        const isFresh = i >= fresh;
        const sh = isFresh ? shownNow[i - fresh] : undefined;
        if (isFresh && pose.show < 1) {
          const p = ease(pose.show);
          let from = { x: cx + w / 2, y: L.outY + chipH / 2 };
          if (sh?.src != null) {
            const obj = scene.objects[sh.src.obj];
            const row = obj?.cells.findIndex((cell) => cell.field === sh.src?.field) ?? -1;
            if (row >= 0) {
              const cc = cellCenter(L, sh.src.obj, row);
              from = { x: cc.x - (text.length * valPx * 0.6) / 2, y: cc.y };
            }
          }
          const tx = from.x + (cx + w / 2 - from.x) * p;
          const ty = from.y + (L.outY + chipH / 2 - from.y) * p;
          el('text', {
            x: tx,
            y: ty + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': valPx,
            'font-weight': 700,
            fill: c.text,
          }, root, text);
        } else {
          el('rect', {
            x: cx,
            y: L.outY,
            width: w,
            height: chipH,
            rx: 4,
            fill: isFresh ? c.accent : c.bgSubtle,
            'fill-opacity': isFresh ? 0.45 : 1,
            stroke: isFresh ? c.primary : c.border,
          }, root);
          el('text', {
            x: cx + w / 2,
            y: L.outY + chipH / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': valPx,
            fill: c.text,
          }, root, text);
        }
        cx += w + 8;
      });

      // 캡션 두 줄 — 지금 일어난 일, 그리고 센 수
      const capAttrs = { x: PAD, 'font-family': fonts.body, fill: c.text };
      el('text', { ...capAttrs, y: H - 34, 'font-size': parseFloat(fontSizes.md) }, root, captionOf(scene));
      el('text', { ...capAttrs, y: H - 12, 'font-size': parseFloat(fontSizes.sm), fill: c.textMuted }, root,
        t('caption.count', 'Classes: {classes} · Objects: {objects}', {
          classes: scene.classes.length,
          objects: scene.objects.filter((o) => o !== undefined).length,
        }));
    }

    function drawStatic(scene: InstantiateScene): void {
      drawFrame(scene, DONE);
    }

    /** ms 동안 p 를 0→1 로 흘린다. 세대가 바뀌거나 거두어지면 false 로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = performance.now();
        let wake: (() => void) | null = null;
        const finish = (ok: boolean): void => {
          if (wake !== null) waiters.delete(wake);
          resolve(ok);
        };
        wake = () => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish(true);
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

    async function render(next: InstantiateScene, prev: InstantiateScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      if (!opts.animate || prev === null || destroyed) return;
      const st = next.step;
      if (st.kind !== 'line') return;
      const pose: Pose = {
        fly: st.stamped.length > 0 ? 0 : 1,
        roll: st.changed.length > 0 ? 0 : 1,
        show: st.shown.length > 0 ? 0 : 1,
      };
      if (pose.fly < 1) {
        const ok = await tween(FLY_MS, mine, (p) => {
          pose.fly = p;
          drawFrame(next, pose);
        });
        if (!ok) return;
      }
      if (pose.roll < 1) {
        const ok = await tween(ROLL_MS, mine, (p) => {
          pose.roll = p;
          drawFrame(next, pose);
        });
        if (!ok) return;
      }
      if (pose.show < 1) {
        const ok = await tween(SHOW_MS, mine, (p) => {
          pose.show = p;
          drawFrame(next, pose);
        });
        if (!ok) return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
