// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResearchWeb } from '../convex/researchWeb';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => [{ address: hostname === 'private.example.org' ? '127.0.0.1' : '8.8.8.8', family: 4 }]),
}));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function settle<T>(pending: Promise<T>) {
  await vi.runAllTimersAsync();
  return await pending;
}

function mockFetch(page: (url: string, method: string) => Response, robots = 'User-agent: *\nAllow: /') {
  const fetch = vi.fn(async (url: string, init: RequestInit) => url.endsWith('/robots.txt')
    ? new Response(robots, { status: 200 }) : page(url, init.method ?? 'GET'));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('HTTP source checks', () => {
  it('keeps a successful HEAD and caches the result', async () => {
    const fetch = mockFetch(() => new Response(null, { status: 200 }));
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeGreaterThan(0);
    expect(await web.check(url)).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].method).toBe('HEAD');
  });

  it('falls back to GET when HEAD is unsupported', async () => {
    const fetch = mockFetch((_url, method) => new Response(null, { status: method === 'HEAD' ? 405 : 200 }));
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeGreaterThan(0);
    expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'HEAD', 'GET']);
  });

  it.each([403, 404, 410, 429, 500])('drops HTTP %s instead of claiming the page is live', async (status) => {
    mockFetch(() => new Response(null, { status }));
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeNull();
  });

  it('does not request a page disallowed by robots', async () => {
    const fetch = mockFetch(() => new Response(null, { status: 200 }), 'User-agent: *\nDisallow: /course');
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a private DNS address before making any HTTP request', async () => {
    const fetch = mockFetch(() => new Response(null, { status: 200 }));
    const web = new ResearchWeb(); const url = 'https://private.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not follow a redirect to a private address', async () => {
    const fetch = mockFetch(() => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }));
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    expect(await settle(web.check(url))).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not read restricted aggregators even if search returned them', async () => {
    const fetch = mockFetch(() => new Response(null, { status: 200 }));
    const web = new ResearchWeb(); const url = 'https://www.linkedin.com/jobs/1'; web.remember(url);
    expect(await settle(web.check(url))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses bounded page text and does not add model-invented links to provenance', async () => {
    mockFetch(() => new Response(`<title>Example course</title><script>private script</script><main>${'course '.repeat(40_000)}</main>`));
    const web = new ResearchWeb(); const url = 'https://learn.example.org/course'; web.remember(url);
    const text = await settle(web.read(url));
    expect(text).toContain('Untrusted source content');
    expect(text).not.toContain('private script');
    expect(text.length).toBeLessThan(9200);
    expect(web.sources.size).toBe(1);
  });
});
