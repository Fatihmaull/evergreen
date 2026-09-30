import { expect, test } from 'vitest';
import { siteShell } from '../src/site.mjs';
import { shell } from '../src/chrome.mjs';

const LOGO = '/assets/evergreen-logo.jpeg';

test('marketing header shows the supplied mark beside the Evergreen name', () => {
  const html = siteShell({
    title: 'Evergreen',
    description: 'Testnet TTL monitoring',
    active: '/',
    eyebrow: '',
    heading: '',
    lead: '',
    body: '',
    navTone: 'dark',
  });
  const brand = html.match(/<a class="site-brand" href="\/">([\s\S]*?)<\/a>/)?.[1];

  expect(brand).toContain('<img');
  expect(brand).toContain(`src="${LOGO}"`);
  expect(brand).toContain('alt=""');
  expect(brand).toContain('Evergreen');
});

test('dashboard sidebar uses the same mark without duplicating its spoken name', () => {
  const html = shell({
    title: 'Dashboard',
    description: 'Testnet TTL dashboard',
    active: '/dashboard/',
    eyebrow: 'Overview',
    heading: 'Overview',
    lead: '',
    body: '',
    script: '',
    cadence: { value: '5 s' },
  });
  const brand = html.match(/<a class="brand" href="\/">([\s\S]*?)<\/a>/)?.[1];

  expect(brand).toContain('<img');
  expect(brand).toContain(`src="${LOGO}"`);
  expect(brand).toContain('alt=""');
  expect(brand).toContain('Evergreen');
});
