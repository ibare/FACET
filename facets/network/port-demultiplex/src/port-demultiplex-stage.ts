/**
 * 포트 역다중화의 무대.
 *
 * 동사는 "갈라져 들어간다". 호스트의 왼쪽 벽에 문이 하나 있고, 문 안쪽 갈림목에서 길이
 * 듣고 있는 응용의 수만큼 갈라진다. 길 어귀마다 그 길이 받는 포트가 붙어 있다.
 * 조각은 바깥에서 문으로 들어와 갈림목에 서고, 받는 포트와 같은 어귀의 길을 따라
 * 응용의 받은 칸으로 흘러 들어간다. 받은 칸에는 보낸 쪽이 남는다 — 같은 곳에서 온 것이
 * 여러 응용으로 흩어지고, 다른 곳에서 온 것이 한 응용에 모이는 것이 그 칸에서 보인다.
 * 보낸 주소마다 점의 색이 같다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { PortDemultiplexSceneState, SceneDelivery } from './scene';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 조각이 바깥에서 문을 지나 응용에 닿기까지 */
const MOVE_MS = 700;
/** 그 가운데 문을 지나 갈림목에 서기까지의 몫 */
const DOOR_SHARE = 0.4;

const EDGE = 10;
const CAPTION_Y = 22;
const HOST_TOP = 40;
/** 박스 안쪽 머리줄(응용 이름) 높이의 상한 */
const APP_HEAD_MAX = 24;
/** 받은 칸 한 줄 높이의 상한 */
const CHIP_PITCH_MAX = 19;
/** 들어오는 조각 카드 폭의 상한 */
const CARD_W_MAX = 160;

type Layout = {
  hostX: number;
  doorY: number;
  doorHalf: number;
  junctionX: number;
  appX: number;
  appW: number;
  appTop: number[];
  appH: number;
  cardW: number;
  cardH: number;
  chipH: number;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** 세 제어점 베지어 — 갈림목에서 나가는 길 */
function bezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u: number,
): { x: number; y: number } {
  // 제어점: 갈림목에서 수평으로 나갔다가 목적 높이로 수평으로 들어간다
  const cx0 = lerp(x0, x1, 0.5);
  const cx1 = lerp(x0, x1, 0.5);
  const a = (1 - u) * (1 - u) * (1 - u);
  const b = 3 * (1 - u) * (1 - u) * u;
  const c = 3 * (1 - u) * u * u;
  const d = u * u * u;
  return { x: a * x0 + b * cx0 + c * cx1 + d * x1, y: a * y0 + b * y0 + c * y1 + d * y1 };
}

function layoutFor(appCount: number): Layout {
  const W = PIECE_CANVAS_W;
  // 바깥은 조각이 문 앞에 서는 자리만큼 — 조각은 문턱에 걸쳐 나타나 안으로 든다
  const hostX = r2(W * 0.12);
  const doorY = r2((HOST_TOP + H - EDGE) / 2);
  const cardW = r2(Math.min(CARD_W_MAX, W * 0.26));
  const cardH = 38;
  const appX = r2(W * 0.55);
  const appW = r2(W - EDGE - 12 - appX);
  const bandTop = HOST_TOP + 34;
  const bandBottom = H - EDGE - 10;
  const n = Math.max(appCount, 1);
  const pitch = (bandBottom - bandTop) / n;
  const appH = r2(pitch - 10);
  const appTop: number[] = [];
  for (let i = 0; i < appCount; i += 1) appTop.push(r2(bandTop + i * pitch + 5));
  return {
    hostX,
    doorY,
    doorHalf: cardH / 2 + 8,
    junctionX: r2(hostX + (appX - hostX) * 0.3),
    appX,
    appW,
    appTop,
    appH,
    cardW,
    cardH,
    chipH: 16,
  };
}

function node<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(el);
  return el;
}

function writeText(
  parent: Element,
  x: number,
  y: number,
  content: string,
  style: { size: string; fill: string; mono?: boolean; weight?: number; anchor?: string },
): SVGTextElement {
  const el = node(parent, 'text', {
    x,
    y,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (style.weight !== undefined) el.setAttribute('font-weight', String(style.weight));
  el.textContent = content;
  return el;
}

function addrPort(addr: string, port: number): string {
  return [addr, String(port)].join(':');
}

export const portDemultiplexStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.xs);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function appName(id: string): string {
      if (id === 'web') return t('label.app.web', 'Web server');
      if (id === 'ssh') return t('label.app.ssh', 'SSH server');
      if (id === 'mail') return t('label.app.mail', 'Mail server');
      return id;
    }

    /** 점 색의 차례는 장면의 바탕(보낸 주소 목록)이 정한다 */
    function sourceColor(scene: PortDemultiplexSceneState, addr: string): string {
      const i = scene.sources.indexOf(addr);
      if (i < 0) throw new Error(`port-demultiplex-stage: 바탕에 없는 보낸 주소 ${addr}`);
      const palette = categorical(scene.sources.length);
      const color = palette[i];
      if (color === undefined) throw new Error('port-demultiplex-stage: 점 색이 모자란다');
      return color;
    }

    function chipSlot(
      scene: PortDemultiplexSceneState,
      L: Layout,
      d: SceneDelivery,
    ): { x: number; y: number; w: number } {
      const ai = scene.apps.findIndex((a) => a.id === d.app);
      const top = L.appTop[ai] ?? 0;
      const mine = scene.delivered.filter((x) => x.app === d.app);
      const k = mine.indexOf(d);
      const head = Math.min(APP_HEAD_MAX, L.appH * 0.4);
      const pitch = Math.min(CHIP_PITCH_MAX, (L.appH - head - 4) / Math.max(mine.length, 1));
      return { x: L.appX + 8, y: top + head + pitch * k + pitch / 2, w: L.appW - 16 };
    }

    /** 받은 칸 하나 — 보낸 쪽의 점과 주소:포트 */
    function drawChip(
      parent: Element,
      x: number,
      y: number,
      w: number,
      h: number,
      scene: PortDemultiplexSceneState,
      d: SceneDelivery,
      fresh: boolean,
    ): void {
      node(parent, 'rect', {
        x,
        y: y - h / 2,
        width: w,
        height: h,
        rx: 4,
        fill: colors.bg,
        stroke: fresh ? colors.accent : colors.border,
        'stroke-width': fresh ? 2 : 1,
      });
      node(parent, 'circle', { cx: x + 9, cy: y, r: 4, fill: sourceColor(scene, d.srcAddr) });
      writeText(parent, x + 19, y, addrPort(d.srcAddr, d.srcPort), {
        size: fontSizes.xs,
        fill: colors.text,
        mono: true,
      });
    }

    function drawStatic(scene: PortDemultiplexSceneState, holdBack: SceneDelivery | null): void {
      svg.textContent = '';
      const L = layoutFor(scene.apps.length);
      const W = PIECE_CANVAS_W;
      const step = scene.step;
      const latest = step.kind === 'deliver' ? scene.delivered[scene.delivered.length - 1] : undefined;

      // 캡션 — 지금 일어나는 일
      const caption =
        latest === undefined
          ? t('caption.start', 'Apps listening at {addr}: {n}', {
              addr: scene.host,
              n: scene.apps.length,
            })
          : t('caption.deliver', 'Segment {i}: destination port {port} → {app}', {
              i: latest.index,
              port: latest.dstPort,
              app: appName(latest.app),
            });
      writeText(svg, W / 2, CAPTION_Y, caption, {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'middle',
        weight: 600,
      });

      // 호스트 — 왼쪽 벽에 문 하나
      const right = W - EDGE;
      const bottom = H - EDGE;
      node(svg, 'rect', {
        x: L.hostX,
        y: HOST_TOP,
        width: right - L.hostX,
        height: bottom - HOST_TOP,
        rx: 10,
        fill: colors.bgSubtle,
        stroke: 'none',
      });
      const doorA = L.doorY - L.doorHalf;
      const doorB = L.doorY + L.doorHalf;
      node(svg, 'path', {
        d: [
          `M ${r2(L.hostX)} ${r2(doorA)}`,
          `L ${r2(L.hostX)} ${HOST_TOP}`,
          `L ${r2(right)} ${HOST_TOP}`,
          `L ${r2(right)} ${r2(bottom)}`,
          `L ${r2(L.hostX)} ${r2(bottom)}`,
          `L ${r2(L.hostX)} ${r2(doorB)}`,
        ].join(' '),
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 2,
      });
      for (const y of [doorA, doorB]) {
        node(svg, 'line', {
          x1: L.hostX - 6,
          y1: y,
          x2: L.hostX + 6,
          y2: y,
          stroke: colors.textMuted,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
      }
      writeText(svg, L.hostX + 12, HOST_TOP + 14, t('label.host', 'Receiving host'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      writeText(svg, L.hostX + 12, HOST_TOP + 30, scene.host, {
        size: fontSizes.md,
        fill: colors.text,
        mono: true,
        weight: 600,
      });

      // 문에서 갈림목까지 한 줄기
      const taken = latest?.app;
      node(svg, 'line', {
        x1: L.hostX,
        y1: L.doorY,
        x2: L.junctionX,
        y2: L.doorY,
        stroke: taken !== undefined ? colors.accent : colors.border,
        'stroke-width': taken !== undefined ? 3 : 2,
      });

      // 갈림목에서 응용 수만큼 갈라지는 길 — 어귀에 그 길이 받는 포트
      scene.apps.forEach((app, i) => {
        const top = L.appTop[i] ?? 0;
        const endY = top + L.appH / 2;
        const on = app.id === taken;
        const pts: string[] = [];
        for (let s = 0; s <= 24; s += 1) {
          const p = bezier(L.junctionX, L.doorY, L.appX, endY, s / 24);
          pts.push(`${r2(p.x)},${r2(p.y)}`);
        }
        node(svg, 'polyline', {
          points: pts.join(' '),
          fill: 'none',
          stroke: on ? colors.accent : colors.border,
          'stroke-width': on ? 3 : 2,
        });
        const tag = bezier(L.junctionX, L.doorY, L.appX, endY, 0.78);
        const label = String(app.port);
        const tagW = label.length * monoPx * 0.62 + 12;
        node(svg, 'rect', {
          x: tag.x - tagW / 2,
          y: tag.y - 9,
          width: tagW,
          height: 18,
          rx: 9,
          fill: colors.bg,
          stroke: on ? colors.accent : colors.border,
          'stroke-width': on ? 2 : 1,
        });
        writeText(svg, tag.x, tag.y, label, {
          size: fontSizes.xs,
          fill: on ? colors.text : colors.textMuted,
          mono: true,
          weight: 700,
          anchor: 'middle',
        });

        // 응용 — 이름 · 받은 칸 (듣는 포트는 길 어귀가 말한다)
        node(svg, 'rect', {
          x: L.appX,
          y: top,
          width: L.appW,
          height: L.appH,
          rx: 6,
          fill: colors.bg,
          stroke: on ? colors.itemActive : colors.border,
          'stroke-width': on ? 2 : 1,
        });
        const head = Math.min(APP_HEAD_MAX, L.appH * 0.4);
        writeText(svg, L.appX + 10, top + head / 2 + 2, appName(app.id), {
          size: fontSizes.sm,
          fill: colors.text,
          weight: 600,
        });
        const mine = scene.delivered.filter((d) => d.app === app.id);
        const pitch = Math.min(CHIP_PITCH_MAX, (L.appH - head - 4) / Math.max(mine.length, 1));
        const chipH = Math.min(L.chipH, pitch - 2);
        for (const d of mine) {
          if (d === holdBack) continue;
          const slot = chipSlot(scene, L, d);
          drawChip(svg, slot.x, slot.y, slot.w, chipH, scene, d, d === latest);
        }
      });
    }

    function frame(): Promise<number> {
      return new Promise((resolve) => {
        const id = requestAnimationFrame((now) => {
          frames.delete(id);
          waiters.delete(wake);
          resolve(now);
        });
        const wake = (): void => {
          cancelAnimationFrame(id);
          frames.delete(id);
          resolve(-1);
        };
        frames.add(id);
        waiters.add(wake);
      });
    }

    /** 조각이 문으로 들어와 갈림목에 섰다가 제 길로 흘러 들어간다 */
    async function flowIn(scene: PortDemultiplexSceneState, d: SceneDelivery, mine: number): Promise<void> {
      const L = layoutFor(scene.apps.length);
      const ai = scene.apps.findIndex((a) => a.id === d.app);
      const top = L.appTop[ai] ?? 0;
      const slot = chipSlot(scene, L, d);
      const endY = top + L.appH / 2;

      const card = node(svg, 'g', {});
      const box = node(card, 'rect', { x: 0, y: 0, width: L.cardW, height: L.cardH, rx: 5 });
      box.setAttribute('fill', colors.bg);
      box.setAttribute('stroke', colors.accent);
      box.setAttribute('stroke-width', '2');
      const dot = node(card, 'circle', { cx: 9, cy: 0, r: 4, fill: sourceColor(scene, d.srcAddr) });
      const from = writeText(card, 19, 0, addrPort(d.srcAddr, d.srcPort), {
        size: fontSizes.xs,
        fill: colors.text,
        mono: true,
      });
      const to = writeText(card, 19, 0, '', {
        size: fontSizes.xs,
        fill: colors.textMuted,
        mono: true,
      });
      const arrow = document.createElementNS(SVG_NS, 'tspan');
      arrow.textContent = ['→ ', d.dstAddr, ':'].join('');
      const port = document.createElementNS(SVG_NS, 'tspan');
      port.setAttribute('fill', colors.text);
      port.setAttribute('font-weight', '700');
      port.textContent = String(d.dstPort);
      to.appendChild(arrow);
      to.appendChild(port);

      const startX = EDGE;
      const gateX = L.junctionX - L.cardW * 0.35;

      const place = (u: number): void => {
        let x: number;
        let y: number;
        let w = L.cardW;
        let h = L.cardH;
        let fade = 1;
        if (u <= DOOR_SHARE) {
          const a = ease(u / DOOR_SHARE);
          x = lerp(startX, gateX, a);
          y = L.doorY;
        } else {
          const b = ease((u - DOOR_SHARE) / (1 - DOOR_SHARE));
          // 길을 따라가되 끝은 받은 칸 자리
          const p = bezier(gateX, L.doorY, L.appX, endY, b);
          const q = { x: lerp(p.x, slot.x, b * b), y: lerp(p.y, slot.y, b * b) };
          x = q.x;
          y = q.y;
          w = lerp(L.cardW, slot.w, b);
          h = lerp(L.cardH, L.chipH, b);
          fade = 1 - b;
        }
        card.setAttribute('transform', `translate(${r2(x)} ${r2(y)})`);
        box.setAttribute('y', String(r2(-h / 2)));
        box.setAttribute('width', String(r2(w)));
        box.setAttribute('height', String(r2(h)));
        const spread = (h / 2 - 4) * fade;
        dot.setAttribute('cy', String(r2(-spread / 2)));
        from.setAttribute('y', String(r2(-spread / 2)));
        to.setAttribute('y', String(r2(spread / 2 + 1)));
        to.setAttribute('opacity', String(r2(fade)));
      };

      place(0);
      let start = -1;
      for (;;) {
        const now = await frame();
        if (destroyed || mine !== gen || now < 0) return;
        if (start < 0) start = now;
        const u = Math.min(1, (now - start) / MOVE_MS);
        place(u);
        if (u >= 1) return;
      }
    }

    const renderer: SceneRenderer<PortDemultiplexSceneState> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const fresh =
          next.step.kind === 'deliver' && prev !== null && next.delivered.length === prev.delivered.length + 1
            ? next.delivered[next.delivered.length - 1]
            : undefined;
        if (!opts.animate || fresh === undefined) {
          drawStatic(next, null);
          return;
        }
        drawStatic(next, fresh);
        await flowIn(next, fresh, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return renderer as unknown as ViewInstance;
  },
};
