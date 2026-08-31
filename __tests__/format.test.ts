import { formatCurrency, formatRelativeTime, greetingForHour } from '@/utils/format';

describe('formatCurrency', () => {
  it('formats a DRF decimal string as soles', () => {
    // Prices arrive as strings ("4899.00"); parsing must happen here and only
    // here, at the last moment before display.
    const result = formatCurrency('4899.00');
    expect(result).toContain('4,899.00');
    expect(result).toMatch(/S\/|PEN/);
  });

  it('keeps two decimal places', () => {
    expect(formatCurrency('129')).toContain('129.00');
  });

  it('returns a dash rather than NaN for an unparseable amount', () => {
    expect(formatCurrency('')).toBe('—');
    expect(formatCurrency('no-es-un-precio')).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('collapses the last minute into a single phrase', () => {
    expect(formatRelativeTime('2026-08-26T11:59:40.000Z', now)).toBe('hace un momento');
  });

  it('reports minutes, matching the Home screen copy', () => {
    expect(formatRelativeTime('2026-08-26T11:35:00.000Z', now)).toBe('hace 25 min');
  });

  it('reports hours past the first hour', () => {
    expect(formatRelativeTime('2026-08-26T09:00:00.000Z', now)).toBe('hace 3 h');
  });

  it('says "ayer" for exactly one day', () => {
    expect(formatRelativeTime('2026-08-25T11:00:00.000Z', now)).toBe('ayer');
  });

  it('falls back to an absolute date past a week', () => {
    // "hace 34 días" is less useful than a date, and starts to read as neglect.
    const result = formatRelativeTime('2026-07-12T12:00:00.000Z', now);
    expect(result).not.toContain('hace');
    expect(result).toContain('2026');
  });

  it('returns a dash for a missing or invalid timestamp', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime('not-a-date', now)).toBe('—');
  });
});

describe('greetingForHour', () => {
  it.each([
    [0, 'Buenos días'],
    [11, 'Buenos días'],
    [12, 'Buenas tardes'],
    [18, 'Buenas tardes'],
    [19, 'Buenas noches'],
    [23, 'Buenas noches'],
  ])('greets correctly at %i:00', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});
