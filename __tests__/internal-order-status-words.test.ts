type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

import { describeFulfillmentStatus } from '@/domain/orders/status';
import type { FulfillmentStatus } from '@/domain/orders/types';

/**
 * STAFF READ THE SAME WORDS AS CUSTOMERS.
 *
 * The internal order screen drew its fulfilment buttons from
 * `available_fulfillment_transitions`, which carries the server's CODES —
 * `ready_for_pickup`, `shipped`. Labelling a button with the code puts the
 * machine's English name for a state in front of somebody at a counter, and no
 * test noticed because the codes are perfectly valid strings.
 */

const SCREEN = 'src/app/internal/orders/[id].tsx';

describe('the internal order screen says the state in words', () => {
  const source = fs.readFileSync(SCREEN, 'utf8');

  it('never labels a transition button with the raw status', () => {
    expect(source).not.toMatch(/label=\{next\}/);
  });

  it('routes the transition through the shared describer', () => {
    expect(source).toMatch(/label=\{describeFulfillmentStatus\(next\)\.label\}/);
  });
});

describe('every fulfilment code has a word', () => {
  const codes: FulfillmentStatus[] = [
    'pending',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'shipped',
    'delivered',
    'cancelled',
  ];

  it.each(codes)('%s reads as Spanish, not as itself', (code) => {
    const { label } = describeFulfillmentStatus(code);
    expect(label).not.toBe(code);
    expect(label).not.toMatch(/_/);
  });
});
