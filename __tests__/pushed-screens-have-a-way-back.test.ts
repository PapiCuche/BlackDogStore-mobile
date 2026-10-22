type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * EVERY PUSHED SCREEN HAS A WAY BACK.
 *
 * The root stack hides headers (`headerShown: false`) because the tabs draw
 * their own chrome. A screen pushed on top of them inherits that, so an
 * unregistered route opens with no navigation bar and no back button: on «Mi
 * cuenta» the server answered 404 for a staff account, the error state filled
 * the screen, and there was nothing on it to press.
 *
 * The route's own `Stack.Screen options={{ title }}` is not enough — it names
 * a bar that is not being drawn.
 */

const LAYOUT = 'src/app/_layout.tsx';

/** Pushed from the tabs, never a tab itself. */
const PUSHED = [
  'products/[slug]',
  'repairs/[id]',
  'orders/[id]',
  'cart',
  'checkout',
  'account/index',
  'notifications',
];

describe('the root stack', () => {
  const source = fs.readFileSync(LAYOUT, 'utf8');

  it('hides headers by default, which is what makes the rest of this matter', () => {
    expect(source).toMatch(/headerShown:\s*false/);
  });

  it.each(PUSHED)('registers %s with a header', (route) => {
    const escaped = route.replace(/[[\]]/g, '\\$&');
    const block = new RegExp(`name="${escaped}"[\\s\\S]{0,200}?headerShown:\\s*true`);
    expect(source).toMatch(block);
  });

  it.each(PUSHED)('gives %s a back title', (route) => {
    const escaped = route.replace(/[[\]]/g, '\\$&');
    const block = new RegExp(`name="${escaped}"[\\s\\S]{0,200}?headerBackTitle:\\s*'Atrás'`);
    expect(source).toMatch(block);
  });
});
