import catalogJson from './catalog.json';

export type Topic = {
  id: string;
  name: string;
  facetId?: string;
  /**
   * 이 주제를 한 대목씩 확대한 보조 facet.
   *
   * 인덱스에는 내지 않는다 — 부모를 고른 사람에게만 보이는 것이 발췌의 지위다.
   * facet 페이지가 canonical 아래에 이어 붙여 렌더한다.
   */
  aspectFacetIds?: string[];
};

export type Subdomain = {
  id: string;
  name: string;
  topics: Topic[];
};

export type Domain = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  subdomains: Subdomain[];
};

type CatalogJson = {
  $schema?: string;
  domains: Domain[];
};

export const catalog: Domain[] = (catalogJson as CatalogJson).domains;

export type TopicLocation = {
  domain: Domain;
  subdomain: Subdomain;
  topic: Topic;
};

export function findTopicByFacetId(facetId: string): TopicLocation | null {
  for (const domain of catalog) {
    for (const subdomain of domain.subdomains) {
      for (const topic of subdomain.topics) {
        if (topic.facetId === facetId) return { domain, subdomain, topic };
      }
    }
  }
  return null;
}

export function countImplementedTopics(): number {
  let n = 0;
  for (const d of catalog) for (const s of d.subdomains) for (const t of s.topics) if (t.facetId) n++;
  return n;
}

export function countAllTopics(): number {
  let n = 0;
  for (const d of catalog) for (const s of d.subdomains) n += s.topics.length;
  return n;
}
