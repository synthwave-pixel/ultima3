import { describe, it, expect } from 'vitest';
import { isIOS, isInstalled, launchWarning, warningDue, WARNING_INTERVAL_MS } from '../src/ui/platform.ts';

const iphone = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
};
const brave = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Brave/1.60',
};
const ipadOS = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
};
const mac = { userAgent: ipadOS.userAgent, platform: 'MacIntel', maxTouchPoints: 0 };
const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' };

describe('the iOS storage warning', () => {
  it('knows iPhones, iPads and iPadOS pretending to be a Mac, but not a Mac or Android', () => {
    expect(isIOS(iphone)).toBe(true);
    expect(isIOS(brave)).toBe(true);
    expect(isIOS(ipadOS)).toBe(true);
    expect(isIOS(mac)).toBe(false);
    expect(isIOS(android)).toBe(false);
  });

  it('shows for a browser tab on iOS, whatever the browser, and not for an installed app or elsewhere', () => {
    expect(launchWarning(iphone)).toContain('seven days');
    expect(launchWarning(brave)).toContain('Brave');
    expect(launchWarning({ ...iphone, standalone: true })).toBeNull();
    expect(launchWarning(iphone, () => ({ matches: true }))).toBeNull();
    expect(launchWarning(mac)).toBeNull();
    expect(launchWarning(android)).toBeNull();
    expect(isInstalled(iphone, () => ({ matches: false }))).toBe(false);
  });
});

describe('once a day', () => {
  it('is due when never shown, a day or more after the last showing, or when the clock has gone backwards', () => {
    const now = 1_800_000_000_000;
    expect(warningDue(null, now)).toBe(true);
    expect(warningDue(now - 1000, now)).toBe(false);
    expect(warningDue(now - WARNING_INTERVAL_MS + 1, now)).toBe(false);
    expect(warningDue(now - WARNING_INTERVAL_MS, now)).toBe(true);
    expect(warningDue(now + 60_000, now)).toBe(true);
    expect(warningDue(Number.NaN, now)).toBe(true);
  });
});
