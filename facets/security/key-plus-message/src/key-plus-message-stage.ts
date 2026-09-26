/**
 * key-plus-message 무대.
 *
 * 위에 세 사람(Alice · Mallory · Bob)과 각자의 열쇠, 그 아래 한 길, 길 아래 사람마다의 셈 상자,
 * Bob 아래에 판정한 글의 줄. 글과 표는 길 위를 실제로 건너가고, 셈에 들어가는 열쇠와 글은
 * 제자리에서 셈 상자로 내려가며, 나온 표는 글로 올라가 붙는다. Bob 의 셈이 붙은 표와
 * 나란히 서서 같거나 갈라진다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import type { KeyPlusMessageScene, Who } from './scene.js';

const H = 384;
const NS = 'http://www.w3.org/2000/svg';
const FRAME_MS = 16;

const WHO_INDEX: Record<Who, number> = { alice: 0, mallory: 1, bob: 2 };

// 세로 자리
const AV_Y = 32;
const AV_R = 15;
const NAME_Y = 64;
const KEY_Y = 88;
const ROAD_Y = 138;
const BOX_TOP = 170;
const BOX_H = 108;
const TITLE_Y = BOX_TOP + 18;
const IN_Y = BOX_TOP + 42;
const ARROW_Y0 = BOX_TOP + 56;
const ARROW_Y1 = BOX_TOP + 70;
const OUT_Y = BOX_TOP + 86;
const ROW_Y0 = 306;
const ROW_DY = 30;
const CAPTION_Y = 370;

const CH = 22;

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0');
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** p 가 [a, b] 안에서 얼마나 왔는가 (0..1, 굽힘 적용) */
function seg(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return ease((p - a) / (b - a));
}

type Geometry = {
  col: number;
  msgW: number;
  tagW: number;
  keyW: number;
  boxW: number;
  x(who: Who): number;
  /** 글 뭉치(글 칸 + 표 칸)의 가운데가 cx 일 때 글 칸 · 표 칸 가운데 */
  msgCx(cx: number): number;
  tagCx(cx: number): number;
  inKeyCx(cx: number): number;
  inMsgCx(cx: number): number;
  outCx(cx: number, compare: boolean): number;
  againstCx(cx: number): number;
  rowCx(): number;
};

function makeGeometry(): Geometry {
  const W = PIECE_CANVAS_W;
  const col = W / 3;
  const msgW = Math.min(72, col * 0.36);
  const tagW = Math.min(50, col * 0.25);
  const keyW = Math.min(58, col * 0.29);
  const boxW = Math.min(188, col - 14);
  const gap = 8;
  const g: Geometry = {
    col,
    msgW,
    tagW,
    keyW,
    boxW,
    x: (who) => col * (WHO_INDEX[who] + 0.5),
    msgCx: (cx) => cx - (msgW + tagW) / 2 + msgW / 2,
    tagCx: (cx) => cx - (msgW + tagW) / 2 + msgW + tagW / 2,
    inKeyCx: (cx) => cx - (keyW + gap + msgW) / 2 + keyW / 2,
    inMsgCx: (cx) => cx - (keyW + gap + msgW) / 2 + keyW + gap + msgW / 2,
    outCx: (cx, compare) => (compare ? cx - tagW / 2 - 14 : cx),
    againstCx: (cx) => cx + tagW / 2 + 14,
    rowCx: () => col * 2.5 - 64,
  };
  return g;
}

type ChipStyle = 'key' | 'noKey' | 'msg' | 'mac' | 'hash' | 'empty';

type PacketHandles = { g: SVGGElement; msgG: SVGGElement; msgText: SVGTextElement; tagG: SVGGElement };
type ComputeHandles = {
  keyG: SVGGElement | null;
  msgG: SVGGElement;
  outG: SVGGElement;
  signT: SVGTextElement | null;
  againstG: SVGGElement | null;
};
type RowHandles = { g: SVGGElement; mark: SVGGElement };
type Handles = {
  packet: PacketHandles | null;
  comp: Record<Who, ComputeHandles | null>;
  rows: RowHandles[];
};

function moveTo(el: SVGElement, dx: number, dy: number): void {
  const x = r1(dx);
  const y = r1(dy);
  if (x === 0 && y === 0) el.removeAttribute('transform');
  else el.setAttribute('transform', `translate(${x} ${y})`);
}

function hide(el: SVGElement): void {
  el.setAttribute('opacity', '0');
}

function show(el: SVGElement): void {
  el.removeAttribute('opacity');
}

function mustHave<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`key-plus-message stage: ${what} 이 없다`);
  return v;
}

export const keyPlusMessageStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const geo = makeGeometry();

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { fill: string; size?: string; family?: string; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'dominant-baseline': 'central',
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill,
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    function chip(parent: Element, cx: number, cy: number, w: number, body: string, style: ChipStyle): SVGGElement {
      const g = el(parent, 'g', {});
      const rect = el(g, 'rect', { x: cx - w / 2, y: cy - CH / 2, width: w, height: CH, rx: 4 });
      let ink: string = colors.text;
      switch (style) {
        case 'key':
        case 'mac':
          rect.setAttribute('fill', colors.accent);
          rect.setAttribute('stroke', colors.accent);
          ink = colors.stateInk;
          break;
        case 'hash':
          rect.setAttribute('fill', colors.bg);
          rect.setAttribute('stroke', colors.danger);
          rect.setAttribute('stroke-width', '1.5');
          ink = colors.danger;
          break;
        case 'msg':
          rect.setAttribute('fill', colors.bg);
          rect.setAttribute('stroke', colors.text);
          break;
        case 'noKey':
        case 'empty':
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', colors.textMuted);
          rect.setAttribute('stroke-dasharray', '3 3');
          ink = colors.textMuted;
          break;
      }
      const family = style === 'noKey' || style === 'empty' ? fonts.body : fonts.mono;
      const size = style === 'noKey' || style === 'empty' ? fontSizes.xs : fontSizes.sm;
      label(g, cx, cy, body, { fill: ink, family, size });
      return g;
    }

    function tagStyle(by: 'mac' | 'hash'): ChipStyle {
      return by === 'mac' ? 'mac' : 'hash';
    }

    function packetShape(parent: Element, cx: number, cy: number, msg: string, tag: number | null, by: 'mac' | 'hash' | null): PacketHandles {
      const g = el(parent, 'g', {});
      const msgG = chip(g, geo.msgCx(cx), cy, geo.msgW, msg, 'msg');
      const msgText = mustHave(msgG.querySelector('text'), '글 칸의 글자');
      let tagG: SVGGElement;
      if (tag === null || by === null) {
        tagG = chip(g, geo.tagCx(cx), cy, geo.tagW, t('label.tag', 'tag'), 'empty');
      } else {
        tagG = chip(g, geo.tagCx(cx), cy, geo.tagW, hex4(tag), tagStyle(by));
      }
      return { g, msgG, msgText, tagG };
    }

    function person(parent: Element, who: Who, name: string, key: number): void {
      const cx = geo.x(who);
      const hostile = who === 'mallory';
      el(parent, 'circle', {
        cx,
        cy: AV_Y,
        r: AV_R,
        fill: colors.bgSubtle,
        stroke: hostile ? colors.danger : colors.text,
        'stroke-width': 1.5,
      });
      label(parent, cx, NAME_Y, name, { fill: hostile ? colors.danger : colors.text, size: fontSizes.md, weight: '600' });
      if (hostile) chip(parent, cx, KEY_Y, geo.keyW, t('label.noKey', 'no K'), 'noKey');
      else chip(parent, cx, KEY_Y, geo.keyW, t('label.key', 'K {k}', { k: hex4(key) }), 'key');
    }

    function computeBox(parent: Element, who: Who, scene: KeyPlusMessageScene): ComputeHandles | null {
      const c = scene.computes[who];
      if (c === null) return null;
      const cx = geo.x(who);
      el(parent, 'rect', {
        x: cx - geo.boxW / 2,
        y: BOX_TOP,
        width: geo.boxW,
        height: BOX_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      const title = c.kind === 'mac' ? t('label.mac', 'MAC(K, m)') : t('label.hash', 'H(m)');
      label(parent, cx, TITLE_Y, title, { fill: colors.textMuted, family: fonts.mono });
      let keyG: SVGGElement | null = null;
      if (c.kind === 'mac') {
        keyG = chip(parent, geo.inKeyCx(cx), IN_Y, geo.keyW, t('label.key', 'K {k}', { k: hex4(scene.key) }), 'key');
      } else {
        chip(parent, geo.inKeyCx(cx), IN_Y, geo.keyW, t('label.noKey', 'no K'), 'noKey');
      }
      const msgG = chip(parent, geo.inMsgCx(cx), IN_Y, geo.msgW, c.msg, 'msg');
      // 아래로 가는 화살
      el(parent, 'line', { x1: cx, y1: ARROW_Y0, x2: cx, y2: ARROW_Y1 - 4, stroke: colors.textMuted, 'stroke-width': 1.5 });
      el(parent, 'path', {
        d: `M ${r1(cx - 4)} ${ARROW_Y1 - 5} L ${r1(cx + 4)} ${ARROW_Y1 - 5} L ${r1(cx)} ${ARROW_Y1} Z`,
        fill: colors.textMuted,
      });
      const compare = c.against !== null;
      const outG = chip(parent, geo.outCx(cx, compare), OUT_Y, geo.tagW, hex4(c.out), c.kind === 'mac' ? 'mac' : 'hash');
      let signT: SVGTextElement | null = null;
      let againstG: SVGGElement | null = null;
      if (c.against !== null) {
        const same = c.against.tag === c.out;
        signT = label(parent, cx, OUT_Y, same ? '=' : '≠', {
          fill: same ? colors.text : colors.danger,
          size: fontSizes.lg,
          weight: '700',
        });
        againstG = chip(parent, geo.againstCx(cx), OUT_Y, geo.tagW, hex4(c.against.tag), tagStyle(c.against.by));
      }
      return { keyG, msgG, outG, signT, againstG };
    }

    function verdictRow(parent: Element, i: number, v: KeyPlusMessageScene['log'][number]): RowHandles {
      const cx = geo.rowCx();
      const cy = ROW_Y0 + i * ROW_DY;
      const shape = packetShape(parent, cx, cy, v.msg, v.tag, v.tagBy);
      const mark = el(parent, 'g', {});
      const mx = cx + (geo.msgW + geo.tagW) / 2 + 14;
      if (v.accepted) {
        el(mark, 'path', {
          d: `M ${r1(mx - 5)} ${cy} L ${r1(mx - 1)} ${cy + 4} L ${r1(mx + 6)} ${cy - 5}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2.2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        label(mark, mx + 12, cy, t('label.accept', 'accepted'), { fill: colors.text, anchor: 'start', size: fontSizes.xs });
      } else {
        el(mark, 'path', {
          d: `M ${r1(mx - 5)} ${cy - 5} L ${r1(mx + 5)} ${cy + 5} M ${r1(mx + 5)} ${cy - 5} L ${r1(mx - 5)} ${cy + 5}`,
          fill: 'none',
          stroke: colors.danger,
          'stroke-width': 2.2,
          'stroke-linecap': 'round',
        });
        label(mark, mx + 12, cy, t('label.reject', 'rejected'), {
          fill: colors.danger,
          anchor: 'start',
          size: fontSizes.xs,
          weight: '600',
        });
      }
      return { g: shape.g, mark };
    }

    function caption(parent: Element, scene: KeyPlusMessageScene): void {
      const step = scene.step;
      let body: string;
      switch (step.kind) {
        case 'start':
          body = t('caption.start', 'Only Alice and Bob hold key K {k}. Mallory, midway on the road, does not.', {
            k: hex4(scene.key),
          });
          break;
        case 'tag': {
          const c = mustHave(scene.computes.alice, 'Alice 의 셈');
          body = t('caption.tag', 'Alice: MAC(K, {m}) = {tag}. The tag travels with the message.', {
            m: c.msg,
            tag: hex4(c.out),
          });
          break;
        }
        case 'verify': {
          const v = mustHave(scene.log[scene.log.length - 1], 'Bob 의 판정');
          body = v.accepted
            ? t('caption.accept', 'Bob: MAC(K, {m}) = {mine} = attached tag {tag} → accept.', {
                m: v.msg,
                mine: hex4(v.mine),
                tag: hex4(v.tag),
              })
            : t('caption.reject', 'Bob: MAC(K, {m}) = {mine} ≠ attached tag {tag} → reject.', {
                m: v.msg,
                mine: hex4(v.mine),
                tag: hex4(v.tag),
              });
          break;
        }
        case 'alter': {
          const pk = mustHave(scene.packet, '길 위의 글');
          body = t('caption.alter', 'Mallory: message {from} → {to}. Attached tag unchanged: {tag}.', {
            from: step.from,
            to: pk.msg,
            tag: hex4(mustHave(pk.tag, '붙은 표')),
          });
          break;
        }
        case 'forge': {
          const c = mustHave(scene.computes.mallory, 'Mallory 의 셈');
          body = t('caption.forge', 'Mallory has no K and computes H({m}) = {tag} — the new attached tag.', {
            m: c.msg,
            tag: hex4(c.out),
          });
          break;
        }
      }
      label(parent, PIECE_CANVAS_W / 2, CAPTION_Y, body, { fill: colors.text, size: fontSizes.md });
    }

    function drawStatic(scene: KeyPlusMessageScene): Handles {
      svg.textContent = '';
      const root = el(svg, 'g', {});
      const W = PIECE_CANVAS_W;
      // 한 길
      el(root, 'line', {
        x1: geo.col * 0.12,
        y1: ROAD_Y,
        x2: W - geo.col * 0.12,
        y2: ROAD_Y,
        stroke: colors.border,
        'stroke-width': 4,
        'stroke-linecap': 'round',
      });
      person(root, 'alice', t('label.alice', 'Alice'), scene.key);
      person(root, 'mallory', t('label.mallory', 'Mallory'), scene.key);
      person(root, 'bob', t('label.bob', 'Bob'), scene.key);
      const comp: Record<Who, ComputeHandles | null> = {
        alice: computeBox(root, 'alice', scene),
        mallory: computeBox(root, 'mallory', scene),
        bob: computeBox(root, 'bob', scene),
      };
      const rows = scene.log.map((v, i) => verdictRow(root, i, v));
      const pk = scene.packet;
      const packet = pk === null ? null : packetShape(root, geo.x(pk.at), ROAD_Y, pk.msg, pk.tag, pk.tagBy);
      caption(root, scene);
      return { packet, comp, rows };
    }

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 한 시계 — ms 동안 16ms 걸음마다 fn(p) 를 부른다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function clock(ms: number, mine: number, fn: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (!alive(mine)) {
          finish();
          return;
        }
        waiters.add(finish);
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let frame = 0;
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          frame += 1;
          const p = Math.min(1, frame / total);
          fn(p);
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
        fn(0);
        const id0 = setTimeout(() => {
          timers.delete(id0);
          tick();
        }, FRAME_MS);
        timers.add(id0);
      });
    }

    /** 끝 자리에 선 요소를 (fx, fy) 에서 (tx, ty) 로 오는 도중에 둔다 */
    function fly(node: SVGElement, fx: number, fy: number, tx: number, ty: number, k: number): void {
      moveTo(node, (fx - tx) * (1 - k), (fy - ty) * (1 - k));
    }

    async function animate(next: KeyPlusMessageScene, hs: Handles, mine: number): Promise<void> {
      const step = next.step;
      switch (step.kind) {
        case 'start':
          return;
        case 'tag': {
          const c = mustHave(hs.comp.alice, 'Alice 의 셈 상자');
          const pk = mustHave(hs.packet, '길 위의 글');
          const cx = geo.x('alice');
          const keyG = mustHave(c.keyG, 'Alice 의 셈 상자 열쇠');
          hide(c.outG);
          hide(pk.tagG);
          await clock(720, mine, (p) => {
            const a = seg(p, 0, 0.42);
            fly(keyG, cx, KEY_Y, geo.inKeyCx(cx), IN_Y, a);
            fly(c.msgG, geo.msgCx(cx), ROAD_Y, geo.inMsgCx(cx), IN_Y, a);
            if (p >= 0.46) show(c.outG);
            if (p >= 0.58) {
              show(pk.tagG);
              fly(pk.tagG, geo.outCx(cx, false), OUT_Y, geo.tagCx(cx), ROAD_Y, seg(p, 0.58, 1));
            }
          });
          return;
        }
        case 'verify': {
          const c = mustHave(hs.comp.bob, 'Bob 의 셈 상자');
          const row = mustHave(hs.rows[hs.rows.length - 1], '판정 줄');
          const keyG = mustHave(c.keyG, 'Bob 의 셈 상자 열쇠');
          const againstG = mustHave(c.againstG, 'Bob 이 견준 표');
          const signT = mustHave(c.signT, '견줌 기호');
          const bx = geo.x('bob');
          const fromX = geo.x(step.from);
          const rowCx = geo.rowCx();
          const rowCy = ROW_Y0 + (hs.rows.length - 1) * ROW_DY;
          hide(c.outG);
          hide(signT);
          hide(row.mark);
          await clock(1150, mine, (p) => {
            // 한 길로 건너가 Bob 앞에 머물다, 판정 뒤 줄로 내려간다
            const road = seg(p, 0, 0.34);
            const px = fromX + (bx - fromX) * road;
            const down = seg(p, 0.82, 1);
            fly(row.g, px, ROAD_Y, rowCx, rowCy, down);
            // 열쇠와 받은 글이 셈으로 들어간다
            const a = seg(p, 0.36, 0.54);
            fly(keyG, bx, KEY_Y, geo.inKeyCx(bx), IN_Y, a);
            fly(c.msgG, geo.msgCx(bx), ROAD_Y, geo.inMsgCx(bx), IN_Y, a);
            if (p >= 0.56) show(c.outG);
            // 붙은 표가 내려와 Bob 의 셈에 겹쳐 본 뒤 제자리로 — 같으면 =, 아니면 ≠
            const outX = geo.outCx(bx, true);
            const agX = geo.againstCx(bx);
            if (p < 0.72) {
              const d = seg(p, 0.58, 0.72);
              const sx = geo.tagCx(bx);
              moveTo(againstG, sx + (outX - sx) * d - agX, ROAD_Y + (OUT_Y - ROAD_Y) * d - OUT_Y);
            } else {
              fly(againstG, outX, OUT_Y, agX, OUT_Y, seg(p, 0.72, 0.8));
            }
            if (p >= 0.8) show(signT);
            if (p >= 0.96) show(row.mark);
          });
          return;
        }
        case 'alter': {
          const pk = mustHave(hs.packet, '길 위의 글');
          const ax = geo.x('alice');
          const mx = geo.x('mallory');
          const current = mustHave(next.packet, '장면의 길 위 글').msg;
          pk.msgText.textContent = step.from;
          let old: SVGTextElement | null = null;
          await clock(820, mine, (p) => {
            fly(pk.g, ax, ROAD_Y, mx, ROAD_Y, seg(p, 0, 0.5));
            if (p >= 0.54) {
              if (old === null) {
                pk.msgText.textContent = current;
                old = label(pk.msgG, geo.msgCx(mx), ROAD_Y, step.from, { fill: colors.textMuted, family: fonts.mono });
              }
              // 옛 글은 길 아래로 떨어지고, 새 글은 Mallory 손에서 내려온다
              const k = seg(p, 0.54, 1);
              moveTo(old, 0, 34 * k);
              old.setAttribute('opacity', String(r1(1 - k)));
              fly(pk.msgText, mx, AV_Y, geo.msgCx(mx), ROAD_Y, k);
            }
          });
          return;
        }
        case 'forge': {
          const c = mustHave(hs.comp.mallory, 'Mallory 의 셈 상자');
          const pk = mustHave(hs.packet, '길 위의 글');
          const mx = geo.x('mallory');
          hide(c.outG);
          hide(pk.tagG);
          const wasG = chip(pk.g, geo.tagCx(mx), ROAD_Y, geo.tagW, hex4(step.was), 'mac');
          await clock(820, mine, (p) => {
            fly(c.msgG, geo.msgCx(mx), ROAD_Y, geo.inMsgCx(mx), IN_Y, seg(p, 0, 0.38));
            if (p >= 0.42) show(c.outG);
            // 옛 표가 떨어져 나가고 열쇠 없이 셈한 값이 올라와 붙는다
            const off = seg(p, 0.46, 0.8);
            moveTo(wasG, 26 * off, -30 * off);
            wasG.setAttribute('opacity', String(r1(1 - off)));
            if (p >= 0.52) {
              show(pk.tagG);
              fly(pk.tagG, geo.outCx(mx, false), OUT_Y, geo.tagCx(mx), ROAD_Y, seg(p, 0.52, 1));
            }
          });
          return;
        }
      }
    }

    return {
      render(next: KeyPlusMessageScene, _prev: KeyPlusMessageScene | null, opts: { animate: boolean }): void | Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const hs = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        return animate(next, hs, mine).then(() => {
          if (alive(mine)) drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
