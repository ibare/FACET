/**
 * ip-routing-stage View — IP 라우팅 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 보조 정보 / 토폴로지 (호스트 2 + 라우터 4 + 링크 5 + R4 분기) /
 * 라우팅 테이블 펼침 패널 (한 시점 한 라우터) / 비트 비교 + 일치 길이 게이지 /
 * 시선 화살표 / 패킷 헤더 카드 + TTL 게이지 / 안개 레이어 + 자물쇠 / 시각화 안 텍스트 /
 * 참고 레퍼런스를 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ hosts, routers, links, defaultTtl, autoDemoSequence, ttlWarnThreshold })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - applyPacketSent(payload)
 *   - applyPacketLinkSlide(payload, opts?)        — 링크 위 카드 미끄러짐
 *   - applyPacketArrived(payload, opts?)          — 라우터 도착 + 안개 걷힘
 *   - applyTableOpened(payload, opts?)            — 표 커튼 펼침
 *   - applyLpmEvaluated(payload, opts?)           — 비트 비교 + 게이지 + 채택 행
 *   - applySightArrow(payload, opts?)             — 시선 화살표 그어짐
 *   - applyPacketDeparting(payload, opts?)        — TTL 카운트다운 + 카드 떠남 직전
 *   - applyTableClosed(payload, opts?)            — 표 접힘 + 안개 복귀
 *   - applyPacketDelivered(payload)               — 호스트 도착
 *   - applyPacketDropped(payload)                 — 폐기 (TTL=0 / no-route)
 *   - applyPacketExternal(payload)                — default → 외부 페이드
 *
 * 모든 운동 메서드는 Promise<void> 반환 — projector 가 await 한다.
 */

import type { View, ViewMountParams, ViewInstance } from '@facet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  categorical,
  type Palette,
} from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 화면 ───────────────────────────────────────────────────────────────────
const W = 720;
const H = 540;

// 영역 분할.
const CAPTION_BASE_Y = 18;
const CAPTION_EVENT_Y = 36;

const SUBINFO_X = 540;
const SUBINFO_Y = 50;
const SUBINFO_W = 168;
const SUBINFO_H = 64;

// 토폴로지.
const NODE_BOX_W = 76;
const NODE_BOX_H = 44;

// 테이블 패널 (한 시점 한 곳, 고정 위치).
const TABLE_X = 60;
const TABLE_Y = 310;
const TABLE_W = 460;
const TABLE_H = 180;

// 패킷 카드 (테이블과 같은 y 영역, 우측).
const CARD_X = 540;
const CARD_Y = 310;
const CARD_W = 168;
const CARD_H = 88;

// 노드 좌표.
type NodePos = { id: string; x: number; y: number; kind: 'host' | 'router' };
const NODE_POS: Record<string, NodePos> = {
  'host:A': { id: 'host:A', x: 60, y: 220, kind: 'host' },
  'router:R1': { id: 'router:R1', x: 180, y: 220, kind: 'router' },
  'router:R2': { id: 'router:R2', x: 300, y: 220, kind: 'router' },
  'router:R3': { id: 'router:R3', x: 420, y: 220, kind: 'router' },
  'host:B': { id: 'host:B', x: 540, y: 220, kind: 'host' },
  'router:R4': { id: 'router:R4', x: 180, y: 140, kind: 'router' },
};

const LINKS: Array<{ from: string; to: string }> = [
  { from: 'host:A', to: 'router:R1' },
  { from: 'router:R1', to: 'router:R2' },
  { from: 'router:R2', to: 'router:R3' },
  { from: 'router:R3', to: 'host:B' },
  { from: 'router:R1', to: 'router:R4' },
];

// ── 공통 helper ─────────────────────────────────────────────────────────────
function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  setAttrs(node, attrs);
  return node;
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

// ── 타입 ───────────────────────────────────────────────────────────────────
type TopologyHost = { id: string; ip: string; x: number; y: number };
type TopologyRouter = {
  id: string;
  x: number;
  y: number;
  table: Array<{
    prefix: string;
    prefixLen: number;
    nextHop: string;
    iface: string;
  }>;
};
type TopologyLink = { id: string; from: string; to: string };

type RouterRec = {
  data: TopologyRouter;
  group: SVGGElement;
  fog: SVGGElement;
  fogVisible: boolean;
};

type HostRec = {
  data: TopologyHost;
  group: SVGGElement;
};

type LinkRec = {
  data: TopologyLink;
  line: SVGLineElement;
};

// ── 본체 ───────────────────────────────────────────────────────────────────
export const ipRoutingStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors: Palette = getColors(params.theme);
    const cat = categorical(8, 'vivid');
    const HOST_COLOR = cat[1]!; // 청록 (호스트)
    const ROUTER_COLOR = colors.bg;
    const PACKET_COLOR = cat[1]!;
    const ADOPTED_COLOR = cat[1]!; // 채택 행 강조
    const DROP_COLOR = colors.danger;

    const root = document.createElement('div');
    root.style.fontFamily = fonts.body;
    root.style.color = colors.text;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
    });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.background = colors.bgSubtle;
    root.appendChild(svg);
    container.appendChild(root);

    // ── defs (markers) ────────────────────────────────────────────────────
    const defs = svgEl('defs');
    svg.appendChild(defs);

    {
      const marker = svgEl('marker', {
        id: 'fct-iproute-arrow',
        viewBox: '0 0 10 10',
        refX: '8',
        refY: '5',
        markerWidth: '8',
        markerHeight: '8',
        orient: 'auto',
      });
      marker.appendChild(
        svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: ADOPTED_COLOR }),
      );
      defs.appendChild(marker);
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────
    const baseCaption = svgEl('text', {
      x: 12,
      y: CAPTION_BASE_Y,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    svg.appendChild(baseCaption);

    const eventCaption = svgEl('text', {
      x: 12,
      y: CAPTION_EVENT_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    svg.appendChild(eventCaption);

    // ── 보조 정보 영역 ───────────────────────────────────────────────────
    const subInfoBox = svgEl('rect', {
      x: SUBINFO_X,
      y: SUBINFO_Y,
      width: SUBINFO_W,
      height: SUBINFO_H,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '4',
    });
    svg.appendChild(subInfoBox);

    const subInfoTitle = svgEl('text', {
      x: SUBINFO_X + 8,
      y: SUBINFO_Y + 14,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    subInfoTitle.textContent = '현재 사건';
    svg.appendChild(subInfoTitle);

    const subInfoText1 = svgEl('text', {
      x: SUBINFO_X + 8,
      y: SUBINFO_Y + 32,
      fill: colors.text,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    svg.appendChild(subInfoText1);

    const subInfoText2 = svgEl('text', {
      x: SUBINFO_X + 8,
      y: SUBINFO_Y + 50,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    svg.appendChild(subInfoText2);

    function setSubInfo(line1: string, line2 = ''): void {
      subInfoText1.textContent = line1;
      subInfoText2.textContent = line2;
    }

    // ── 토폴로지 영역 (links 먼저) ───────────────────────────────────────
    const linksGroup = svgEl('g');
    svg.appendChild(linksGroup);

    const linkRecs = new Map<string, LinkRec>();

    function makeLink(rec: { id: string; from: string; to: string }): void {
      const a = NODE_POS[rec.from]!;
      const b = NODE_POS[rec.to]!;
      const line = svgEl('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: colors.border,
        'stroke-width': '1.4',
      });
      linksGroup.appendChild(line);
      linkRecs.set(rec.id, { data: rec, line });
    }

    function flashLink(linkId: string, color: string, ms = 600): void {
      const r = linkRecs.get(linkId);
      if (!r) return;
      r.line.setAttribute('stroke', color);
      r.line.setAttribute('stroke-width', '2.5');
      setTimeout(() => {
        r.line.setAttribute('stroke', colors.border);
        r.line.setAttribute('stroke-width', '1.4');
      }, ms);
    }

    // 호스트/라우터 그룹.
    const nodesGroup = svgEl('g');
    svg.appendChild(nodesGroup);

    const hostRecs = new Map<string, HostRec>();
    const routerRecs = new Map<string, RouterRec>();

    function buildHostNode(host: TopologyHost): HostRec {
      const pos = NODE_POS[host.id] ?? { x: host.x, y: host.y, kind: 'host', id: host.id };
      const g = svgEl('g');
      // 모니터 아이콘 (둥근 사각형 + 받침대).
      const screen = svgEl('rect', {
        x: pos.x - NODE_BOX_W / 2,
        y: pos.y - NODE_BOX_H / 2,
        width: NODE_BOX_W,
        height: NODE_BOX_H - 8,
        fill: HOST_COLOR,
        stroke: colors.text,
        'stroke-width': '1.2',
        rx: '6',
      });
      g.appendChild(screen);
      const stand = svgEl('rect', {
        x: pos.x - 16,
        y: pos.y + NODE_BOX_H / 2 - 8,
        width: 32,
        height: 5,
        fill: colors.text,
        rx: '1',
      });
      g.appendChild(stand);
      const labelId = svgEl('text', {
        x: pos.x,
        y: pos.y - 3,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      labelId.textContent = host.id.replace('host:', '호스트 ');
      g.appendChild(labelId);
      const labelIp = svgEl('text', {
        x: pos.x,
        y: pos.y + 10,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-size': '8px',
        'font-family': fonts.mono,
      });
      labelIp.textContent = host.ip;
      g.appendChild(labelIp);
      nodesGroup.appendChild(g);
      return { data: host, group: g };
    }

    function buildRouterNode(router: TopologyRouter): RouterRec {
      const pos = NODE_POS[router.id] ?? { x: router.x, y: router.y, kind: 'router', id: router.id };
      const g = svgEl('g');
      const box = svgEl('rect', {
        x: pos.x - NODE_BOX_W / 2,
        y: pos.y - NODE_BOX_H / 2,
        width: NODE_BOX_W,
        height: NODE_BOX_H,
        fill: ROUTER_COLOR,
        stroke: colors.text,
        'stroke-width': '1.2',
        rx: '4',
      });
      g.appendChild(box);
      const arrow = svgEl('path', {
        d: `M${pos.x - 10},${pos.y - 6} L${pos.x + 6},${pos.y - 6} L${pos.x + 6},${pos.y - 10} L${pos.x + 14},${pos.y - 2} L${pos.x + 6},${pos.y + 6} L${pos.x + 6},${pos.y + 2} L${pos.x - 10},${pos.y + 2} z`,
        fill: colors.textMuted,
        opacity: '0.5',
      });
      g.appendChild(arrow);
      const labelId = svgEl('text', {
        x: pos.x,
        y: pos.y + NODE_BOX_H / 2 - 4,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      labelId.textContent = router.id.replace('router:', '');
      g.appendChild(labelId);

      // 안개 레이어 + 자물쇠 — 박스와 같은 영역 위.
      const fog = svgEl('g');
      const fogRect = svgEl('rect', {
        x: pos.x - NODE_BOX_W / 2,
        y: pos.y - NODE_BOX_H / 2,
        width: NODE_BOX_W,
        height: NODE_BOX_H,
        fill: colors.text,
        opacity: '0.32',
        rx: '4',
      });
      fog.appendChild(fogRect);
      const lockBg = svgEl('circle', {
        cx: pos.x,
        cy: pos.y - 4,
        r: 9,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': '1',
      });
      fog.appendChild(lockBg);
      const lockShackle = svgEl('rect', {
        x: pos.x - 3,
        y: pos.y - 11,
        width: 6,
        height: 6,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': '1.2',
        rx: '2',
      });
      fog.appendChild(lockShackle);
      const lockBody = svgEl('rect', {
        x: pos.x - 4,
        y: pos.y - 7,
        width: 8,
        height: 6,
        fill: colors.text,
        rx: '1',
      });
      fog.appendChild(lockBody);
      g.appendChild(fog);

      nodesGroup.appendChild(g);
      return { data: router, group: g, fog, fogVisible: true };
    }

    function setFog(rec: RouterRec, visible: boolean, ms = 200): void {
      rec.fogVisible = visible;
      const target = visible ? '1' : '0';
      const fog = rec.fog;
      const start = performance.now();
      const startOpacity = parseFloat(fog.getAttribute('opacity') ?? '1');
      const endOpacity = parseFloat(target);
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / Math.max(10, ms));
        const v = startOpacity + (endOpacity - startOpacity) * t;
        fog.setAttribute('opacity', String(v));
        if (t < 1) raf(tick);
        else if (!visible) fog.style.pointerEvents = 'none';
      }
      raf(tick);
    }

    function pulseRing(cx: number, cy: number, color: string, ms = 600): void {
      const c = svgEl('circle', {
        cx,
        cy,
        r: NODE_BOX_W / 2,
        fill: 'none',
        stroke: color,
        'stroke-width': '2',
        opacity: '0.9',
      });
      svg.appendChild(c);
      const start = performance.now();
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / Math.max(10, ms));
        c.setAttribute('r', String(NODE_BOX_W / 2 + 18 * t));
        c.setAttribute('opacity', String(0.9 * (1 - t)));
        if (t < 1) raf(tick);
        else c.remove();
      }
      raf(tick);
    }

    // ── 테이블 패널 (한 시점 한 곳) ────────────────────────────────────
    const tablePanel = svgEl('g');
    tablePanel.setAttribute('opacity', '0');
    svg.appendChild(tablePanel);

    const tablePanelBg = svgEl('rect', {
      x: TABLE_X,
      y: TABLE_Y,
      width: TABLE_W,
      height: TABLE_H,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1.2',
      rx: '5',
    });
    tablePanel.appendChild(tablePanelBg);

    const tableTitle = svgEl('text', {
      x: TABLE_X + 10,
      y: TABLE_Y + 16,
      fill: colors.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    tablePanel.appendChild(tableTitle);

    // dst 비트 표시줄.
    const dstBitsLabel = svgEl('text', {
      x: TABLE_X + 10,
      y: TABLE_Y + 34,
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.mono,
    });
    dstBitsLabel.textContent = 'dst bits';
    tablePanel.appendChild(dstBitsLabel);

    const dstBitsText = svgEl('text', {
      x: TABLE_X + 50,
      y: TABLE_Y + 34,
      fill: colors.text,
      'font-size': '11px',
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    tablePanel.appendChild(dstBitsText);

    // 표 헤더.
    const COL_PREFIX_X = TABLE_X + 12;
    const COL_NEXT_X = TABLE_X + 184;
    const COL_IFACE_X = TABLE_X + 256;
    const COL_GAUGE_X = TABLE_X + 308;
    const COL_GAUGE_W = 130;

    const tableHeaderY = TABLE_Y + 50;
    {
      const h1 = svgEl('text', {
        x: COL_PREFIX_X,
        y: tableHeaderY,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'font-weight': '700',
      });
      h1.textContent = 'prefix';
      tablePanel.appendChild(h1);
      const h2 = svgEl('text', {
        x: COL_NEXT_X,
        y: tableHeaderY,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'font-weight': '700',
      });
      h2.textContent = 'next-hop';
      tablePanel.appendChild(h2);
      const h3 = svgEl('text', {
        x: COL_IFACE_X,
        y: tableHeaderY,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'font-weight': '700',
      });
      h3.textContent = 'iface';
      tablePanel.appendChild(h3);
      const h4 = svgEl('text', {
        x: COL_GAUGE_X,
        y: tableHeaderY,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'font-weight': '700',
      });
      h4.textContent = '일치 길이';
      tablePanel.appendChild(h4);
    }

    type TableRowGroup = {
      rowGroup: SVGGElement;
      bg: SVGRectElement;
      prefixText: SVGTextElement;
      nextText: SVGTextElement;
      ifaceText: SVGTextElement;
      gaugeBg: SVGRectElement;
      gaugeFill: SVGRectElement;
      gaugeLabel: SVGTextElement;
      prefixLen: number;
    };
    let tableRowGroups: TableRowGroup[] = [];
    let tableSightArrow: SVGPathElement | null = null;

    function clearTableRows(): void {
      for (const r of tableRowGroups) r.rowGroup.remove();
      tableRowGroups = [];
      if (tableSightArrow) {
        tableSightArrow.remove();
        tableSightArrow = null;
      }
    }

    // 라우터 표 펼침.
    function openTableForRouter(router: TopologyRouter, dst: string, dstBits: string): void {
      clearTableRows();
      tableTitle.textContent = `라우팅 테이블 (${router.id.replace('router:', '')}) — dst ${dst}`;
      dstBitsText.textContent = dstBits;
      const rowsTopY = tableHeaderY + 14;
      const rowH = 22;
      for (let i = 0; i < router.table.length; i++) {
        const row = router.table[i]!;
        const y = rowsTopY + i * rowH;
        const g = svgEl('g');
        const bg = svgEl('rect', {
          x: TABLE_X + 6,
          y: y - 12,
          width: TABLE_W - 12,
          height: rowH - 2,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': '0.6',
          rx: '2',
        });
        g.appendChild(bg);
        const prefixText = svgEl('text', {
          x: COL_PREFIX_X,
          y: y + 2,
          fill: colors.text,
          'font-size': '11px',
          'font-family': fonts.mono,
        });
        prefixText.textContent = row.prefix;
        g.appendChild(prefixText);
        const nextText = svgEl('text', {
          x: COL_NEXT_X,
          y: y + 2,
          fill: colors.text,
          'font-size': '11px',
          'font-family': fonts.mono,
          'font-weight': '700',
        });
        nextText.textContent = row.nextHop;
        g.appendChild(nextText);
        const ifaceText = svgEl('text', {
          x: COL_IFACE_X,
          y: y + 2,
          fill: colors.textMuted,
          'font-size': '10px',
          'font-family': fonts.mono,
        });
        ifaceText.textContent = row.iface;
        g.appendChild(ifaceText);
        const gaugeBg = svgEl('rect', {
          x: COL_GAUGE_X,
          y: y - 6,
          width: COL_GAUGE_W,
          height: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': '0.5',
          rx: '2',
        });
        g.appendChild(gaugeBg);
        const gaugeFill = svgEl('rect', {
          x: COL_GAUGE_X,
          y: y - 6,
          width: 0,
          height: 8,
          fill: colors.textMuted,
          rx: '2',
        });
        g.appendChild(gaugeFill);
        const gaugeLabel = svgEl('text', {
          x: COL_GAUGE_X + COL_GAUGE_W + 4,
          y: y + 2,
          fill: colors.textMuted,
          'font-size': '9px',
          'font-family': fonts.mono,
        });
        gaugeLabel.textContent = `/${row.prefixLen}`;
        g.appendChild(gaugeLabel);
        tablePanel.appendChild(g);
        tableRowGroups.push({
          rowGroup: g,
          bg,
          prefixText,
          nextText,
          ifaceText,
          gaugeBg,
          gaugeFill,
          gaugeLabel,
          prefixLen: row.prefixLen,
        });
      }
      // 펼침 애니메이션.
      tablePanel.setAttribute('opacity', '0');
      const start = performance.now();
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / 250);
        tablePanel.setAttribute('opacity', String(easeInOut(t)));
        if (t < 1) raf(tick);
      }
      raf(tick);
    }

    function closeTablePanel(): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / 250);
          tablePanel.setAttribute('opacity', String(1 - easeInOut(t)));
          if (t < 1) raf(tick);
          else {
            clearTableRows();
            tableTitle.textContent = '';
            dstBitsText.textContent = '';
            resolve();
          }
        }
        raf(tick);
      });
    }

    // 비트 비교 + 게이지 차오름.
    async function animateLpm(
      atRouter: string,
      rows: Array<{ rowIdx: number; matchLen: number; matched: boolean }>,
      adoptedRowIdx: number,
      duration: number,
    ): Promise<void> {
      void atRouter;
      const dur = Math.max(160, duration);
      // 동시에 모든 행 게이지 차오름.
      const gaugePromises: Promise<void>[] = rows.map((r) => {
        const g = tableRowGroups[r.rowIdx];
        if (!g) return Promise.resolve();
        const targetWidth = Math.min(1, r.matchLen / 32) * COL_GAUGE_W;
        const isAdopted = r.rowIdx === adoptedRowIdx;
        const fillColor = isAdopted ? ADOPTED_COLOR : r.matched ? cat[5]! : colors.textMuted;
        g.gaugeFill.setAttribute('fill', fillColor);
        g.gaugeLabel.textContent = `${r.matchLen} bit`;
        return new Promise<void>((resolve) => {
          const start = performance.now();
          function tick(now: number): void {
            const t = Math.min(1, (now - start) / dur);
            g.gaugeFill.setAttribute('width', String(easeInOut(t) * targetWidth));
            if (t < 1) raf(tick);
            else resolve();
          }
          raf(tick);
        });
      });
      await Promise.all(gaugePromises);
      // 채택 행 강조 + 비채택 옅음.
      for (let i = 0; i < tableRowGroups.length; i++) {
        const g = tableRowGroups[i]!;
        const r = rows.find((x) => x.rowIdx === i);
        if (i === adoptedRowIdx) {
          g.bg.setAttribute('stroke', ADOPTED_COLOR);
          g.bg.setAttribute('stroke-width', '2');
          g.rowGroup.setAttribute('opacity', '1');
        } else if (r && r.matched) {
          g.rowGroup.setAttribute('opacity', '0.7');
        } else {
          g.rowGroup.setAttribute('opacity', '0.45');
        }
      }
      // 채택 행 next-hop 셀 펄스.
      if (adoptedRowIdx >= 0) {
        const g = tableRowGroups[adoptedRowIdx]!;
        const x = COL_NEXT_X + 24;
        const yY = TABLE_Y + 50 + 14 + adoptedRowIdx * 22 - 4;
        const c = svgEl('circle', {
          cx: x,
          cy: yY,
          r: 4,
          fill: 'none',
          stroke: ADOPTED_COLOR,
          'stroke-width': '2',
          opacity: '1',
        });
        tablePanel.appendChild(c);
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / 480);
          c.setAttribute('r', String(4 + 14 * t));
          c.setAttribute('opacity', String(1 - t));
          if (t < 1) raf(tick);
          else c.remove();
        }
        raf(tick);
        // gaugeLabel 도 강조.
        g.gaugeLabel.setAttribute('fill', ADOPTED_COLOR);
        g.gaugeLabel.setAttribute('font-weight', '700');
      }
    }

    // 시선 화살표.
    async function drawSightArrow(fromRouter: string, toNode: string): Promise<void> {
      if (tableSightArrow) {
        tableSightArrow.remove();
        tableSightArrow = null;
      }
      const fromPos = NODE_POS[fromRouter];
      const toPos = NODE_POS[toNode];
      if (!fromPos || !toPos) return;
      // 표의 채택 행 next-hop 셀에서 시작 → 토폴로지 노드.
      const startX = COL_NEXT_X + 30;
      const startY = TABLE_Y + 50;
      const endX = toPos.x;
      const endY = toPos.y + NODE_BOX_H / 2 + 4;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2 - 50;
      const path = svgEl('path', {
        d: `M${startX},${startY} Q${midX},${midY} ${endX},${endY}`,
        fill: 'none',
        stroke: ADOPTED_COLOR,
        'stroke-width': '1.6',
        'stroke-dasharray': '4 3',
        'marker-end': 'url(#fct-iproute-arrow)',
      });
      tablePanel.appendChild(path);
      tableSightArrow = path;
      // 길이 기반 dasharray 트윅 — 점진 등장.
      path.setAttribute('opacity', '0');
      await new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / 250);
          path.setAttribute('opacity', String(t));
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    // ── 패킷 카드 ────────────────────────────────────────────────────────
    type PacketCardState = {
      group: SVGGElement;
      bg: SVGRectElement;
      srcText: SVGTextElement;
      dstText: SVGTextElement;
      ttlValueText: SVGTextElement;
      ttlGaugeBg: SVGRectElement;
      ttlGaugeFill: SVGRectElement;
      crossX: SVGGElement;
      ttl: number;
      ttlMax: number;
      ttlWarn: number;
      pos: { x: number; y: number };
      visible: boolean;
    };

    const packet: PacketCardState = {
      group: svgEl('g'),
      bg: svgEl('rect'),
      srcText: svgEl('text'),
      dstText: svgEl('text'),
      ttlValueText: svgEl('text'),
      ttlGaugeBg: svgEl('rect'),
      ttlGaugeFill: svgEl('rect'),
      crossX: svgEl('g'),
      ttl: 0,
      ttlMax: 64,
      ttlWarn: 4,
      pos: { x: CARD_X, y: CARD_Y },
      visible: false,
    };

    function buildPacketCard(): void {
      packet.group.setAttribute('opacity', '0');
      setAttrs(packet.bg, {
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        fill: colors.bg,
        stroke: PACKET_COLOR,
        'stroke-width': '1.6',
        rx: '6',
      });
      packet.group.appendChild(packet.bg);
      const titleText = svgEl('text', {
        x: 8,
        y: 14,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.body,
        'font-weight': '700',
      });
      titleText.textContent = '패킷 헤더';
      packet.group.appendChild(titleText);
      setAttrs(packet.srcText, {
        x: 8,
        y: 32,
        fill: colors.text,
        'font-size': '10px',
        'font-family': fonts.mono,
      });
      packet.group.appendChild(packet.srcText);
      setAttrs(packet.dstText, {
        x: 8,
        y: 46,
        fill: colors.text,
        'font-size': '10px',
        'font-family': fonts.mono,
      });
      packet.group.appendChild(packet.dstText);
      setAttrs(packet.ttlValueText, {
        x: 8,
        y: 62,
        fill: colors.text,
        'font-size': '10px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      packet.group.appendChild(packet.ttlValueText);
      setAttrs(packet.ttlGaugeBg, {
        x: 8,
        y: 70,
        width: CARD_W - 16,
        height: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': '0.5',
        rx: '2',
      });
      packet.group.appendChild(packet.ttlGaugeBg);
      setAttrs(packet.ttlGaugeFill, {
        x: 8,
        y: 70,
        width: 0,
        height: 8,
        fill: PACKET_COLOR,
        rx: '2',
      });
      packet.group.appendChild(packet.ttlGaugeFill);
      // X 표지 (드롭 시).
      packet.crossX.setAttribute('opacity', '0');
      const x1 = svgEl('line', {
        x1: 18,
        y1: 18,
        x2: CARD_W - 18,
        y2: CARD_H - 18,
        stroke: DROP_COLOR,
        'stroke-width': '3',
      });
      packet.crossX.appendChild(x1);
      const x2 = svgEl('line', {
        x1: CARD_W - 18,
        y1: 18,
        x2: 18,
        y2: CARD_H - 18,
        stroke: DROP_COLOR,
        'stroke-width': '3',
      });
      packet.crossX.appendChild(x2);
      packet.group.appendChild(packet.crossX);

      svg.appendChild(packet.group);
      packet.group.setAttribute('transform', `translate(${packet.pos.x},${packet.pos.y})`);
    }

    function renderPacketTtl(): void {
      packet.ttlValueText.textContent = `TTL: ${packet.ttl} / ${packet.ttlMax}`;
      const ratio = packet.ttlMax > 0 ? Math.max(0, packet.ttl) / packet.ttlMax : 0;
      packet.ttlGaugeFill.setAttribute('width', String((CARD_W - 16) * ratio));
      const isWarn = packet.ttl <= packet.ttlWarn;
      packet.ttlGaugeFill.setAttribute('fill', isWarn ? cat[5]! : PACKET_COLOR);
      packet.bg.setAttribute('stroke', isWarn ? cat[5]! : PACKET_COLOR);
    }

    function setPacketCard(src: string, dst: string, ttl: number, ttlMax: number): void {
      packet.srcText.textContent = `src: ${src}`;
      packet.dstText.textContent = `dst: ${dst}`;
      packet.ttl = ttl;
      packet.ttlMax = ttlMax;
      packet.crossX.setAttribute('opacity', '0');
      packet.bg.setAttribute('opacity', '1');
      renderPacketTtl();
      packet.group.setAttribute('opacity', '1');
      packet.visible = true;
    }

    function movePacketTo(x: number, y: number): void {
      packet.pos.x = x;
      packet.pos.y = y;
      packet.group.setAttribute('transform', `translate(${x},${y})`);
    }

    async function slidePacketTo(targetX: number, targetY: number, ms: number): Promise<void> {
      const sx = packet.pos.x;
      const sy = packet.pos.y;
      const dur = Math.max(60, ms);
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / dur);
          const e = easeInOut(t);
          movePacketTo(sx + (targetX - sx) * e, sy + (targetY - sy) * e);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    function getNodeAnchor(nodeId: string): { x: number; y: number } {
      const pos = NODE_POS[nodeId];
      if (!pos) return { x: CARD_X, y: CARD_Y };
      // 카드는 노드 아래쪽 (호스트는 노드 옆에 안착).
      return { x: pos.x - CARD_W / 2, y: pos.y - NODE_BOX_H / 2 - CARD_H - 8 };
    }

    // ── 모델 상태 ─────────────────────────────────────────────────────────
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    let routersOrder: TopologyRouter[] = [];

    function clearCaption(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    // ── 메서드 ────────────────────────────────────────────────────────────
    function reset(): void {
      clearCaption();
      // 라우터/호스트 그룹 제거.
      while (nodesGroup.firstChild) nodesGroup.firstChild.remove();
      while (linksGroup.firstChild) linksGroup.firstChild.remove();
      hostRecs.clear();
      routerRecs.clear();
      linkRecs.clear();
      routersOrder = [];
      tablePanel.setAttribute('opacity', '0');
      clearTableRows();
      tableTitle.textContent = '';
      dstBitsText.textContent = '';
      packet.group.setAttribute('opacity', '0');
      packet.visible = false;
      eventCaption.textContent = '';
      setSubInfo('초기화 됨', '발신 / 한 hop / 자동 시연 / 초기 TTL');
    }

    function init(payload: {
      hosts: TopologyHost[];
      routers: TopologyRouter[];
      links: TopologyLink[];
      defaultTtl: number;
      ttlWarnThreshold: number;
      autoDemoSequence: Array<{ dst: string; ttl: number; note?: string }>;
    }): void {
      reset();
      // 링크.
      for (const l of payload.links) makeLink({ id: l.id, from: l.from, to: l.to });
      // 호스트 / 라우터.
      for (const h of payload.hosts) hostRecs.set(h.id, buildHostNode(h));
      for (const r of payload.routers) routerRecs.set(r.id, buildRouterNode(r));
      routersOrder = [...payload.routers];
      packet.ttlMax = payload.defaultTtl;
      packet.ttlWarn = payload.ttlWarnThreshold;
      // 패킷 카드는 t0 에 비어 있다 — 첫 발신 때 표시.
      setSubInfo(
        `라우터 ${payload.routers.length} 대 / 링크 ${payload.links.length} 줄`,
        `초기 TTL ${payload.defaultTtl}, 자동 시연 ${payload.autoDemoSequence.length} 발신`,
      );
    }

    function setBaseCaption(text: string): void {
      baseCaption.textContent = text;
    }

    function setCaption(
      text: string,
      opts?: { kind?: 'concept' | 'event'; duration?: number },
    ): void {
      clearCaption();
      eventCaption.textContent = text;
      eventCaption.setAttribute('fill', opts?.kind === 'concept' ? colors.textMuted : colors.text);
      const dur = opts?.duration ?? (opts?.kind === 'concept' ? 3000 : 1800);
      captionTimer = setTimeout(() => {
        eventCaption.textContent = '';
      }, dur);
    }

    function applyPacketSent(payload: {
      traceIndex: number;
      packet: { src: string; dst: string; ttl: number };
      fromHost: string;
      note?: string | null;
    }): void {
      packet.ttlMax = Math.max(packet.ttlMax, payload.packet.ttl);
      const fromPos = NODE_POS[payload.fromHost];
      if (fromPos) {
        movePacketTo(fromPos.x - CARD_W / 2, fromPos.y - NODE_BOX_H / 2 - CARD_H - 8);
      } else {
        movePacketTo(CARD_X, CARD_Y);
      }
      setPacketCard(payload.packet.src, payload.packet.dst, payload.packet.ttl, packet.ttlMax);
      setSubInfo(
        `${payload.fromHost.replace('host:', '호스트 ')} 발신 #${payload.traceIndex + 1}`,
        payload.note ? String(payload.note) : `dst ${payload.packet.dst} / TTL ${payload.packet.ttl}`,
      );
    }

    async function applyPacketLinkSlide(
      payload: { traceIndex: number; fromNode: string; toNode: string },
      opts?: { duration?: number },
    ): Promise<void> {
      void payload.traceIndex;
      const fromPos = NODE_POS[payload.fromNode];
      const toPos = NODE_POS[payload.toNode];
      if (!fromPos || !toPos) return;
      const linkRec = LINKS.find(
        (l) =>
          (l.from === payload.fromNode && l.to === payload.toNode) ||
          (l.to === payload.fromNode && l.from === payload.toNode),
      );
      if (linkRec) {
        const linkId =
          linkRec.from === payload.fromNode
            ? `link:${linkRec.from.split(':')[1]}-${linkRec.to.split(':')[1]}`
            : `link:${linkRec.from.split(':')[1]}-${linkRec.to.split(':')[1]}`;
        flashLink(linkId, ADOPTED_COLOR, opts?.duration ?? 400);
      }
      const target = getNodeAnchor(payload.toNode);
      // 호스트 도착이면 카드는 호스트 옆에.
      const isHost = NODE_POS[payload.toNode]?.kind === 'host';
      const targetX = isHost
        ? toPos.x - CARD_W / 2
        : toPos.x - CARD_W / 2;
      const targetY = isHost
        ? toPos.y - NODE_BOX_H / 2 - CARD_H - 8
        : target.y;
      await slidePacketTo(targetX, targetY, opts?.duration ?? 400);
    }

    async function applyPacketArrived(
      payload: { traceIndex: number; atRouter: string },
      opts?: { duration?: number },
    ): Promise<void> {
      void payload.traceIndex;
      const rec = routerRecs.get(payload.atRouter);
      if (rec) setFog(rec, false, opts?.duration ?? 200);
      const pos = NODE_POS[payload.atRouter];
      if (pos) pulseRing(pos.x, pos.y, ADOPTED_COLOR, 600);
      setSubInfo(`${payload.atRouter.replace('router:', '')} 도착`, '표를 펼친다');
      await sleep(opts?.duration ?? 200);
    }

    async function applyTableOpened(
      payload: { atRouter: string; dst: string; dstBits: string },
      opts?: { duration?: number },
    ): Promise<void> {
      const router = routersOrder.find((r) => r.id === payload.atRouter);
      if (!router) return;
      openTableForRouter(router, payload.dst, payload.dstBits);
      setSubInfo(
        `${payload.atRouter.replace('router:', '')} 표 펼침`,
        `dst ${payload.dst} 비트 비교 시작`,
      );
      await sleep(opts?.duration ?? 250);
    }

    async function applyLpmEvaluated(
      payload: {
        atRouter: string;
        rows: Array<{ rowIdx: number; matchLen: number; matched: boolean }>;
        adoptedRowIdx: number;
        nextHopNode: string | null;
        nextHopIface: string | null;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      await animateLpm(
        payload.atRouter,
        payload.rows,
        payload.adoptedRowIdx,
        opts?.duration ?? 350,
      );
      if (payload.nextHopNode) {
        setSubInfo(
          `LPM 결과 — ${payload.atRouter.replace('router:', '')} → ${payload.nextHopNode}`,
          payload.nextHopIface ? `via ${payload.nextHopIface}` : '',
        );
      } else {
        setSubInfo(`LPM 결과 — 일치 없음`, '패킷이 폐기된다');
      }
    }

    async function applySightArrow(
      payload: { fromRouter: string; toNode: string; iface: string },
      opts?: { duration?: number },
    ): Promise<void> {
      // 토폴로지 외부 노드 (host / router) 만 — external/direct 는 그리지 않음.
      const targetExists = NODE_POS[payload.toNode] !== undefined;
      if (!targetExists) {
        await sleep(opts?.duration ?? 250);
        return;
      }
      await drawSightArrow(payload.fromRouter, payload.toNode);
      setSubInfo(
        `시선 화살표 → ${payload.toNode}`,
        payload.iface ? `via ${payload.iface}` : '',
      );
    }

    async function applyPacketDeparting(
      payload: {
        traceIndex: number;
        fromRouter: string;
        toNode: string;
        ttlBefore: number;
        ttlAfter: number;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      void payload.traceIndex;
      void payload.fromRouter;
      void payload.toNode;
      // TTL 카운트다운 운동.
      const dur = Math.max(60, opts?.duration ?? 200);
      const start = performance.now();
      const ttlStart = payload.ttlBefore;
      const ttlEnd = payload.ttlAfter;
      return new Promise<void>((resolve) => {
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / dur);
          const v = Math.round(ttlStart + (ttlEnd - ttlStart) * t);
          packet.ttl = v;
          renderPacketTtl();
          if (t < 1) raf(tick);
          else {
            packet.ttl = ttlEnd;
            renderPacketTtl();
            resolve();
          }
        }
        raf(tick);
      });
    }

    async function applyTableClosed(
      payload: { atRouter: string },
      opts?: { duration?: number },
    ): Promise<void> {
      void opts;
      await closeTablePanel();
      const rec = routerRecs.get(payload.atRouter);
      if (rec) setFog(rec, true, 200);
    }

    function applyPacketDelivered(payload: {
      traceIndex: number;
      atHost: string;
      ttlRemaining: number;
    }): void {
      void payload.traceIndex;
      packet.ttl = payload.ttlRemaining;
      renderPacketTtl();
      packet.bg.setAttribute('stroke', cat[2]!);
      packet.bg.setAttribute('stroke-width', '2.5');
      const pos = NODE_POS[payload.atHost];
      if (pos) pulseRing(pos.x, pos.y, cat[2]!, 700);
      setSubInfo(
        `${payload.atHost.replace('host:', '호스트 ')} 도달`,
        `TTL ${payload.ttlRemaining} 남음`,
      );
    }

    function applyPacketDropped(payload: {
      traceIndex: number;
      atRouter: string;
      reason: 'ttl-zero' | 'no-route';
    }): void {
      void payload.traceIndex;
      packet.bg.setAttribute('opacity', '0.45');
      packet.crossX.setAttribute('opacity', '1');
      packet.bg.setAttribute('stroke', DROP_COLOR);
      const pos = NODE_POS[payload.atRouter];
      if (pos) pulseRing(pos.x, pos.y, DROP_COLOR, 700);
      setSubInfo(
        `폐기 — ${payload.atRouter.replace('router:', '')}`,
        payload.reason === 'ttl-zero' ? 'TTL 이 0 에 닿았다' : '일치 행 없음',
      );
    }

    function applyPacketExternal(payload: {
      traceIndex: number;
      atRouter: string;
      viaInterface: string;
    }): void {
      void payload.traceIndex;
      packet.bg.setAttribute('opacity', '0.4');
      const pos = NODE_POS[payload.atRouter];
      if (pos) pulseRing(pos.x, pos.y, colors.textMuted, 600);
      setSubInfo(
        `외부 인터페이스로 나감 — ${payload.atRouter.replace('router:', '')}`,
        payload.viaInterface ? `via ${payload.viaInterface}` : '',
      );
    }

    // ── 시각화 안 텍스트 / 레퍼런스 ────────────────────────────────────
    const refText = svgEl('text', {
      x: 12,
      y: H - 20,
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    refText.textContent =
      '참고: Kurose-Ross LPM Interactive · INET/OMNeT++ Routing Visualizer · Cisco Packet Tracer · Practical Networking — Packet Traveling';
    svg.appendChild(refText);

    const narrative = svgEl('text', {
      x: 12,
      y: H - 6,
      fill: colors.text,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    narrative.textContent =
      '한 시점에 단 한 라우터의 표만 펼쳐진다 — 라우터는 자기 표만 본다. 가장 긴 일치가 이긴다. 한 hop 마다 TTL 이 한 칸 줄어든다.';
    svg.appendChild(narrative);

    // 패킷 카드 init.
    buildPacketCard();
    packet.group.setAttribute('opacity', '0');

    // 사용 안내 (활성화 시 사라짐).
    setSubInfo('대기 중', '발신 / 자동 시연 / 한 hop / 초기 TTL');

    return {
      destroy() {
        clearCaption();
        if (root.parentElement) root.remove();
      },
      reset,
      init,
      setBaseCaption,
      setCaption,
      applyPacketSent,
      applyPacketLinkSlide,
      applyPacketArrived,
      applyTableOpened,
      applyLpmEvaluated,
      applySightArrow,
      applyPacketDeparting,
      applyTableClosed,
      applyPacketDelivered,
      applyPacketDropped,
      applyPacketExternal,
    };
  },
};
