import { Link } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import {
  CaretDown,
  Sparkle,
  ArrowRight,
  Lock,
  Cpu,
  Code,
  Stack,
  Network,
  Database,
  Translate,
  Brain,
  Lightning,
  Buildings,
  ShieldCheck,
  PaintBrush,
  MathOperations,
  Atom,
} from '@phosphor-icons/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import {
  catalog,
  countAllTopics,
  countImplementedTopics,
  type Domain,
  type Subdomain,
  type Topic,
} from '../catalog.js';

const ICONS: Record<string, PhIcon> = {
  Cpu,
  Code,
  Stack,
  Network,
  Database,
  Translate,
  Brain,
  Lightning,
  Buildings,
  ShieldCheck,
  PaintBrush,
  MathOperations,
};

type AccentTokens = {
  ringSoft: string;
  text: string;
  textHover: string;
  dot: string;
  iconBg: string;
  iconRing: string;
  badge: string;
  glow: string;
};

function tok(c: string): AccentTokens {
  return {
    ringSoft: `ring-${c}-400/20`,
    text: `text-${c}-300`,
    textHover: `group-hover/tile:text-${c}-300`,
    dot: `bg-${c}-400`,
    iconBg: `bg-${c}-400/10`,
    iconRing: `ring-${c}-400/30`,
    badge: `bg-${c}-400/15 text-${c}-200 ring-${c}-400/30`,
    glow: `${c}`,
  };
}

const ACCENTS: Record<string, AccentTokens> = {
  amber: tok('amber'),
  cyan: tok('cyan'),
  violet: tok('violet'),
  sky: tok('sky'),
  emerald: tok('emerald'),
  rose: tok('rose'),
  fuchsia: tok('fuchsia'),
  yellow: tok('yellow'),
  indigo: tok('indigo'),
  red: tok('red'),
  pink: tok('pink'),
  teal: tok('teal'),
};

// Tailwind safelist — 동적으로 조합되는 색상 클래스가 빌드시 purge 되지 않도록.
// 이 배열을 export 해서 미사용 경고를 회피하면서 Tailwind v4 의 소스 스캔에 클래스 토큰을 노출.
export const SAFELIST: readonly string[] = [
  'ring-amber-400/20', 'text-amber-300', 'group-hover/tile:text-amber-300', 'bg-amber-400', 'bg-amber-400/10', 'ring-amber-400/30', 'bg-amber-400/15', 'text-amber-200',
  'ring-cyan-400/20', 'text-cyan-300', 'group-hover/tile:text-cyan-300', 'bg-cyan-400', 'bg-cyan-400/10', 'ring-cyan-400/30', 'bg-cyan-400/15', 'text-cyan-200',
  'ring-violet-400/20', 'text-violet-300', 'group-hover/tile:text-violet-300', 'bg-violet-400', 'bg-violet-400/10', 'ring-violet-400/30', 'bg-violet-400/15', 'text-violet-200',
  'ring-sky-400/20', 'text-sky-300', 'group-hover/tile:text-sky-300', 'bg-sky-400', 'bg-sky-400/10', 'ring-sky-400/30', 'bg-sky-400/15', 'text-sky-200',
  'ring-emerald-400/20', 'text-emerald-300', 'group-hover/tile:text-emerald-300', 'bg-emerald-400', 'bg-emerald-400/10', 'ring-emerald-400/30', 'bg-emerald-400/15', 'text-emerald-200',
  'ring-rose-400/20', 'text-rose-300', 'group-hover/tile:text-rose-300', 'bg-rose-400', 'bg-rose-400/10', 'ring-rose-400/30', 'bg-rose-400/15', 'text-rose-200',
  'ring-fuchsia-400/20', 'text-fuchsia-300', 'group-hover/tile:text-fuchsia-300', 'bg-fuchsia-400', 'bg-fuchsia-400/10', 'ring-fuchsia-400/30', 'bg-fuchsia-400/15', 'text-fuchsia-200',
  'ring-yellow-400/20', 'text-yellow-300', 'group-hover/tile:text-yellow-300', 'bg-yellow-400', 'bg-yellow-400/10', 'ring-yellow-400/30', 'bg-yellow-400/15', 'text-yellow-200',
  'ring-indigo-400/20', 'text-indigo-300', 'group-hover/tile:text-indigo-300', 'bg-indigo-400', 'bg-indigo-400/10', 'ring-indigo-400/30', 'bg-indigo-400/15', 'text-indigo-200',
  'ring-red-400/20', 'text-red-300', 'group-hover/tile:text-red-300', 'bg-red-400', 'bg-red-400/10', 'ring-red-400/30', 'bg-red-400/15', 'text-red-200',
  'ring-pink-400/20', 'text-pink-300', 'group-hover/tile:text-pink-300', 'bg-pink-400', 'bg-pink-400/10', 'ring-pink-400/30', 'bg-pink-400/15', 'text-pink-200',
  'ring-teal-400/20', 'text-teal-300', 'group-hover/tile:text-teal-300', 'bg-teal-400', 'bg-teal-400/10', 'ring-teal-400/30', 'bg-teal-400/15', 'text-teal-200',
];

function accentOf(name: string): AccentTokens {
  return ACCENTS[name] ?? ACCENTS.cyan;
}

function countDomainImplemented(d: Domain): number {
  let n = 0;
  for (const s of d.subdomains) for (const t of s.topics) if (t.facetId) n++;
  return n;
}

function countDomainTopics(d: Domain): number {
  let n = 0;
  for (const s of d.subdomains) n += s.topics.length;
  return n;
}

function countSubdomainImplemented(s: Subdomain): number {
  return s.topics.filter((t) => t.facetId).length;
}

export function IndexPage() {
  const total = countAllTopics();
  const ready = countImplementedTopics();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-24">
        <header className="mb-12">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/50">
            <Atom weight="duotone" className="h-4 w-4" />
            FACET · Visualization Catalog
          </div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-white sm:text-5xl">
            컴퓨터 세상의 개념을
            <br />
            <span className="bg-gradient-to-r from-sky-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              살아 움직이는 형태
            </span>
            로.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/60">
            12개 분야, {total}개 시각화 목록. 알고리즘이 표준 이벤트를 발신하면 Projector 가 등록된 View 를 갱신한다 — 동일한 한 흐름에서 그래픽·코드·메트릭이 동기화된다.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-200 ring-1 ring-emerald-400/30">
              <Sparkle weight="fill" className="h-3.5 w-3.5" />
              <span className="font-medium">{ready}</span>
              <span className="text-emerald-200/70">개 구현 완료</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-white/60 ring-1 ring-white/10">
              <Lock weight="duotone" className="h-3.5 w-3.5" />
              <span className="font-medium">{total - ready}</span>
              <span className="text-white/40">개 예정</span>
            </div>
          </div>
        </header>

        <Accordion.Root
          type="multiple"
          className="space-y-4"
          defaultValue={['cs-fundamentals']}
        >
          {catalog.map((domain) => (
            <DomainCard key={domain.id} domain={domain} />
          ))}
        </Accordion.Root>
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: Domain }) {
  const accent = accentOf(domain.accent);
  const Icon = ICONS[domain.icon] ?? Cpu;
  const implemented = countDomainImplemented(domain);
  const total = countDomainTopics(domain);

  return (
    <Accordion.Item
      value={domain.id}
      className={`group relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10 backdrop-blur-sm transition hover:ring-white/20 ${accent.ringSoft}`}
    >
      <div className={`pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full ${accent.iconBg} opacity-50 blur-3xl`} />
      <Accordion.Header>
        <Accordion.Trigger className="group/trigger flex w-full items-center gap-4 px-5 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.iconBg} ring-1 ${accent.iconRing}`}>
            <Icon weight="duotone" className={`h-6 w-6 ${accent.text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">{domain.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${accent.badge}`}>
                {implemented}/{total}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-white/50">{domain.tagline}</p>
          </div>
          <CaretDown
            weight="bold"
            className="h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden">
        <div className="px-5 pb-5 pt-1">
          <Accordion.Root type="multiple" className="space-y-2">
            {domain.subdomains.map((sub) => (
              <SubdomainItem key={sub.id} subdomain={sub} accent={accent} />
            ))}
          </Accordion.Root>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

function SubdomainItem({ subdomain, accent }: { subdomain: Subdomain; accent: AccentTokens }) {
  const implemented = countSubdomainImplemented(subdomain);

  return (
    <Accordion.Item
      value={subdomain.id}
      className="overflow-hidden rounded-xl bg-black/20 ring-1 ring-white/5"
    >
      <Accordion.Header>
        <Accordion.Trigger className="group/sub flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-white/20">
          <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${implemented > 0 ? accent.dot : 'bg-white/15'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-white/85">{subdomain.name}</h3>
              {implemented > 0 && (
                <span className={`shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium ring-1 ${accent.badge}`}>
                  {implemented}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-white/30">{subdomain.topics.length}</span>
            </div>
          </div>
          <CaretDown
            weight="bold"
            className="h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 group-data-[state=open]/sub:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden">
        <div className="grid grid-cols-1 gap-1.5 px-3 pb-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
          {subdomain.topics.map((topic) => (
            <TopicTile key={topic.id} topic={topic} accent={accent} />
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

function TopicTile({ topic, accent }: { topic: Topic; accent: AccentTokens }) {
  if (topic.facetId) {
    return (
      <Link
        to={`/facet/${encodeURIComponent(topic.facetId)}`}
        className={`group/tile relative flex items-center justify-between gap-2 overflow-hidden rounded-lg bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10 transition hover:bg-white/[0.08] hover:ring-white/25 focus-visible:outline-none focus-visible:ring-2 ${accent.ringSoft}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Sparkle weight="fill" className={`h-3 w-3 shrink-0 ${accent.text}`} />
          <span className="truncate text-sm text-white/90">{topic.name}</span>
        </div>
        <ArrowRight
          weight="bold"
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition group-hover/tile:translate-x-0.5 ${accent.textHover}`}
        />
      </Link>
    );
  }

  return (
    <div className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2.5 ring-1 ring-white/[0.04]">
      <div className="flex min-w-0 items-center gap-2">
        <Lock weight="duotone" className="h-3 w-3 shrink-0 text-white/25" />
        <span className="truncate text-sm text-white/40">{topic.name}</span>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/25">soon</span>
    </div>
  );
}
