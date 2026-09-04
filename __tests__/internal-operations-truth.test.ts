type FS = { readFileSync(p: string, e: 'utf8'): string };
const fs = jest.requireActual('fs') as FS;

/**
 * What the internal surface tells an operator, and whether it is still true.
 *
 * THE DEFECT THIS REPLACES. The service home carried a card reading:
 *
 *   "Diagnóstico, cotización, aprobación del cliente, repuestos, control de
 *    calidad y garantía no están construidos todavía — ni aquí ni en el
 *    servidor. El ciclo de vida llega hasta «esperando aprobación»."
 *
 * Every clause of it had become false except the last word. The backend ships
 * V1 routes for diagnostics, quotes, quote publication, customer decision,
 * execution, parts, quality, delivery and payments; the order detail renders
 * seven sections against them, each behind its own capability. Only warranty is
 * genuinely absent.
 *
 * A truthful screen is not a nicety here. An operator who reads "no está
 * construido" stops looking, and does on a web console what the device in their
 * hand would have done.
 *
 * These are source tests because the claim lives in copy, and copy is what
 * rots. Rendering the screen would need a tenant, a session, capabilities and
 * a branch to assert a sentence.
 */

const SERVICE_HOME = 'src/app/internal/service/index.tsx';
const ORDER_DETAIL = 'src/app/internal/service/orders/[id].tsx';

describe('the service home no longer denies what the app does', () => {
  const source = stripComments(fs.readFileSync(SERVICE_HOME, 'utf8'));

  it.each([
    ['diagnosis', /no están construidos todavía/],
    ['the server too', /ni aquí ni en el servidor/],
    ['a lifecycle that stops early', /llega hasta «esperando aprobación»/],
  ])('does not claim %s is missing', (_case, pattern) => {
    expect(source).not.toMatch(pattern);
  });

  it('still names warranty, which really is absent', () => {
    // The one true item in the old list. Dropping it would trade a false
    // statement for a missing one.
    expect(source).toMatch(/garantía/i);
  });

  it('points the operator at the order, where the work happens', () => {
    expect(source).toMatch(/dentro de cada orden/i);
  });
});

describe('the order detail really does host those stages', () => {
  const source = fs.readFileSync(ORDER_DETAIL, 'utf8');

  // If a section is ever removed, the home's new copy becomes false in the
  // other direction. This is the half of the claim that lives in code.
  it.each([
    'ServiceDiagnosticSection',
    'ServiceQuoteSection',
    'ServiceExecutionSection',
    'ServicePartsSection',
    'ServiceQualitySection',
    'ServicePaymentSection',
    'ServiceDeliverySection',
  ])('renders %s', (section) => {
    // Anchored on a boundary: `<ServiceQualitySection` alone would also match
    // `<ServiceQualitySectionX`, so a rename would slip past the guard.
    expect(source).toMatch(new RegExp(`<${section}[\\s/>]`));
  });

  it('gates each stage on a capability rather than a role', () => {
    expect(source).not.toMatch(/role\s*===/);
    expect(source).toMatch(/hasUxCapability\(/);
  });
});

describe('a card that opens something is the thing you press', () => {
  // Eight places already made the whole card the control — the orders list, the
  // service board, every customer-facing card. Two did not, and put a small
  // "Abrir" button inside a card the finger was already on: a second thing to
  // aim at, and the smaller one was the only one that worked.
  it.each([
    'src/app/internal/index.tsx',
    'src/app/internal/inventory/transfers/index.tsx',
  ])('%s has no redundant open button', (path) => {
    expect(stripComments(fs.readFileSync(path, 'utf8'))).not.toMatch(/label="Abrir"/);
  });

  it('gives the transfer card a label naming both ends and the state', () => {
    // Moving stock between shops is high-impact, and "Transferencia 12" alone
    // does not say between where and where.
    const source = fs.readFileSync('src/app/internal/inventory/transfers/index.tsx', 'utf8');
    expect(source).toMatch(/accessibilityLabel=\{`Transferencia \$\{t\.id\}, de \$\{t\.sourceBranchName\} a \$\{t\.destinationBranchName\}/);
  });
});

describe('operator lists do not truncate the facts they exist to show', () => {
  it('lets a service order show its device and its branch on two lines', () => {
    // The second line is `customerName · branchName`. Capped at one line, a long
    // customer name pushed the BRANCH off the end — the operator lost "where am
    // I working", not a few characters of a name.
    const source = fs.readFileSync('src/app/internal/service/orders/index.tsx', 'utf8');
    const device = between(source, '{item.deviceSummary}');
    const customer = between(source, '{item.customerName} · {item.branchName}');

    expect(device).toMatch(/numberOfLines=\{2\}/);
    expect(customer).toMatch(/numberOfLines=\{2\}/);
  });

  it('lets an internal order show a long customer name', () => {
    const source = fs.readFileSync('src/app/internal/orders/index.tsx', 'utf8');
    expect(between(source, "{item.customerName || 'Sin nombre'}")).toMatch(/numberOfLines=\{2\}/);
  });
});

describe('the till keeps the guarantees this checkpoint must not touch', () => {
  const source = stripComments(fs.readFileSync('src/app/internal/pos/index.tsx', 'utf8'));

  it('refuses to charge without a price the server issued for THESE conditions', () => {
    expect(source).toMatch(/const priced = pricedUnder === signature/);
    expect(source).toMatch(/const canSell = canPrice && priced !== null/);
  });

  it('never retries a sale', () => {
    expect(source).not.toMatch(/retry:\s*(true|[1-9])/);
  });
});

/**
 * The opening tag of the `<Text>` that RENDERS `marker`.
 *
 * A field name usually appears twice — once inside the card's accessibility
 * label and once as the rendered child — so matching the first occurrence finds
 * the wrong element and walks back to whatever `<Text>` came before it. The
 * rendered one is the occurrence whose last non-whitespace neighbour is the `>`
 * that closed its own opening tag.
 */
function between(source: string, marker: string): string {
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
    const before = source.slice(0, at).trimEnd();
    if (!before.endsWith('>')) continue;
    return source.slice(source.lastIndexOf('<Text', at), at);
  }
  throw new Error(`No rendered <Text> found for ${marker}`);
}

/** Guards must not fire on the prose that explains them. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}
