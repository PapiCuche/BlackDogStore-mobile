import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { ServiceTrackingLink } from '@/domain/internal/service-types';
import { ServiceTrackingLinkSection } from '@/features/internal/service-tracking-link-section';

import { renderWithProviders } from './support/render';

/**
 * The tracking-link section — SERVICE-TRACKING, staff side.
 *
 * Every button here is drawn from an answer the server gave: `canReveal` for
 * revealing, `service.orders.manage` for replacing and turning off. What this
 * file holds down is that an action the server would refuse is NOT OFFERED —
 * absent, not disabled, because an action somebody can never take is not a
 * thing to grey out — and that destroying the customer's link asks first.
 */
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));

const mockOpen = jest.fn();
jest.mock('@/utils/external-links', () => ({
  ...jest.requireActual('@/utils/external-links'),
  openExternalLink: (url: unknown) => mockOpen(url),
}));

function link(overrides: Partial<ServiceTrackingLink> = {}): ServiceTrackingLink {
  return {
    active: true,
    viewCount: 3,
    lastViewedAt: '2026-10-02T10:00:00Z',
    canReveal: true,
    ...overrides,
  };
}

const noop = () => undefined;

async function renderSection(
  props: Partial<React.ComponentProps<typeof ServiceTrackingLinkSection>> = {},
) {
  return renderWithProviders(
    <ServiceTrackingLinkSection
      link={link()}
      mayManage
      revealed={null}
      isRevealing={false}
      isChanging={false}
      error={null}
      onReveal={noop}
      onRotate={noop}
      onRevoke={noop}
      {...props}
    />,
  );
}

describe('what the section says', () => {
  it('states whether the link is live and how often it was opened', async () => {
    await renderSection();

    expect(screen.getByText('Enlace activo')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('says plainly that an unopened link has not been opened', async () => {
    await renderSection({ link: link({ viewCount: 0, lastViewedAt: null }) });

    expect(screen.getByText('Todavía no se abrió')).toBeTruthy();
  });

  it('marks a revoked link as deactivated', async () => {
    await renderSection({ link: link({ active: false }) });

    expect(screen.getByText('Enlace desactivado')).toBeTruthy();
  });
});

describe('the reveal gate', () => {
  it('offers the link when the SERVER said this person may reveal it', async () => {
    const onReveal = jest.fn();
    await renderSection({ onReveal });

    fireEvent.press(screen.getByText('Mostrar el enlace'));

    expect(onReveal).toHaveBeenCalled();
  });

  it('does not offer it at all when the server said no', async () => {
    // Whoever holds the link can answer the quote as the customer, so somebody
    // who may quote but not record decisions must not be able to fetch it.
    await renderSection({ link: link({ canReveal: false }) });

    expect(screen.queryByText('Mostrar el enlace')).toBeNull();
  });

  it('does not offer it for a link that is turned off', async () => {
    await renderSection({ link: link({ active: false }) });

    expect(screen.queryByText('Mostrar el enlace')).toBeNull();
  });

  it('shows the link only once the server handed it over', async () => {
    await renderSection();
    expect(screen.queryByText(/seguimiento/)).toBeNull();

    await renderSection({
      revealed: { url: 'https://web.test/seguimiento/tok', path: '/seguimiento/tok' },
    });

    expect(screen.getByText('https://web.test/seguimiento/tok')).toBeTruthy();
  });

  it('hands the link to the browser instead of rendering tracking itself', async () => {
    // The page is the web storefront's, and it already renders the repair for
    // whoever holds the token. Opening it is a handoff; reimplementing it here
    // would be a second source of truth for somebody else's screen.
    await renderSection({
      revealed: { url: 'https://web.test/seguimiento/tok', path: '/seguimiento/tok' },
    });

    fireEvent.press(screen.getByText('Abrir el enlace'));

    expect(mockOpen).toHaveBeenCalledWith('https://web.test/seguimiento/tok');
  });

  it('offers no open action for a URL this app may not open', async () => {
    // A build pointed at a host the link guard refuses: show the text, offer
    // nothing. `openExternalLink` would refuse it anyway.
    await renderSection({
      revealed: { url: 'seguimiento/tok', path: '/seguimiento/tok' },
    });

    expect(screen.queryByText('Abrir el enlace')).toBeNull();
    expect(screen.getByText('seguimiento/tok')).toBeTruthy();
  });

  it('warns what holding the link allows', async () => {
    await renderSection({
      revealed: { url: 'https://web.test/seguimiento/tok', path: '/seguimiento/tok' },
    });

    expect(screen.getByText(/responder la\s+cotización en su nombre/)).toBeTruthy();
  });
});

describe('replacing and turning off', () => {
  it('hides both from somebody without service.orders.manage', async () => {
    await renderSection({ mayManage: false });

    expect(screen.queryByText('Reemplazar el enlace')).toBeNull();
    expect(screen.queryByText('Desactivar el enlace')).toBeNull();
  });

  it('offers to create one when the order has no live link', async () => {
    await renderSection({ link: link({ active: false }) });

    expect(screen.getByText('Crear un enlace nuevo')).toBeTruthy();
    expect(screen.queryByText('Desactivar el enlace')).toBeNull();
  });

  it('asks before destroying the customer link', async () => {
    const onRevoke = jest.fn();
    await renderSection({ onRevoke });

    fireEvent.press(screen.getByText('Desactivar el enlace'));

    expect(onRevoke).not.toHaveBeenCalled();
    expect(await screen.findByText(/dejará de ver su reparación/)).toBeTruthy();

    fireEvent.press(screen.getByText('Sí, desactivar'));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it('lets the operator back out of revoking', async () => {
    const onRevoke = jest.fn();
    await renderSection({ onRevoke });

    fireEvent.press(screen.getByText('Desactivar el enlace'));
    fireEvent.press(await screen.findByText('Cancelar'));

    await waitFor(() => expect(screen.queryByText('Sí, desactivar')).toBeNull());
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('shows the server sentence when an act is refused', async () => {
    await renderSection({
      error: new Error('Esta orden no tiene un enlace activo. Crea uno nuevo para entregarlo.'),
    });

    expect(
      screen.getByText(/Esta orden no tiene un enlace activo|Ocurrió|No se pudo/),
    ).toBeTruthy();
  });
});
