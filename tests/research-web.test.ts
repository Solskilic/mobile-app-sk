// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { publicAddress, ResearchWeb, robotRules, robotsAllow, sourceUrl } from '../convex/researchWeb';

describe('source URLs', () => {
  it('keeps the exact path and query while removing tracking and fragment', () => {
    expect(sourceUrl('https://www.example.org/jobs/12?lang=en&utm_source=search#apply')).toBe('https://www.example.org/jobs/12?lang=en');
  });

  it.each([
    'http://example.org/a', 'https://localhost/a', 'https://127.0.0.1/a',
    'https://[::1]/a', 'file:///etc/passwd', 'https://user:pass@example.org/',
    'https://example.org:444/a', 'https://service.internal/a', 'javascript:alert(1)',
  ])('rejects unsafe source %s', (url) => expect(sourceUrl(url)).toBeNull());

  it.each(['127.0.0.1', '10.0.1.2', '172.19.0.4', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1'])('rejects private address %s', (address) => {
    expect(publicAddress(address)).toBe(false);
  });

  it('accepts public IPs after DNS lookup', () => {
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('never opens a URL that did not appear in web search', async () => {
    const web = new ResearchWeb();
    web.remember('https://example.org/courses');
    expect(await web.check('https://example.org/courses/made-up-course')).toBeNull();
    expect(await web.read('https://example.org/courses/made-up-course')).toContain('exact URLs already returned');
  });
});

describe('robots policies', () => {
  it('uses longest match, allow wins ties, and supports wildcard/end markers', () => {
    const policy = robotRules('User-agent: *\nDisallow: /jobs/\nAllow: /jobs/public/\nDisallow: /*?private=*$\nAllow: /jobs/same\nDisallow: /jobs/same');
    expect(robotsAllow(policy, '/jobs/secret')).toBe(false);
    expect(robotsAllow(policy, '/jobs/public/123')).toBe(true);
    expect(robotsAllow(policy, '/course?private=1')).toBe(false);
    expect(robotsAllow(policy, '/jobs/same')).toBe(true);
    expect(robotsAllow(policy, '/courses')).toBe(true);
  });

  it('uses named bot directives instead of wildcard directives', () => {
    const policy = robotRules('User-agent: *\nDisallow: /\nUser-agent: RouteResearch\nAllow: /courses\nDisallow: /private\nCrawl-delay: 3');
    expect(policy.delay).toBe(3);
    expect(robotsAllow(policy, '/courses/1')).toBe(true);
    expect(robotsAllow(policy, '/private')).toBe(false);
  });

  it('does not ignore an unreasonably slow crawl policy', () => {
    expect(robotsAllow(robotRules('User-agent: *\nCrawl-delay: 60'), '/')).toBe(false);
  });

  it('uses the most specific named agent and handles encoded unreserved paths', () => {
    const policy = robotRules('User-agent: Route\nAllow: /\nUser-agent: RouteResearch\nDisallow: /private');
    expect(robotsAllow(policy, '/%70rivate/data')).toBe(false);
    expect(robotsAllow(policy, '/public')).toBe(true);
  });
});
