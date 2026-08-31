import { screen } from '@testing-library/react-native';

import { StatusBadge } from '@/design-system';
import { describeFulfillmentStatus, describePaymentStatus } from '@/domain/orders/status';
import { describeRepairStatus } from '@/domain/repairs/status';

import { renderWithProviders } from './support/render';

describe('StatusBadge', () => {
  it('always carries the meaning in words, not only in colour', async () => {
    // Colour alone fails greyscale, low vision and colour blindness. The label
    // is the contract.
    await renderWithProviders(<StatusBadge label="En reparación" tone="progress" />);
    expect(screen.getByText('En reparación')).toBeOnTheScreen();
  });

  it('prefixes the announcement so the status has a subject', async () => {
    await renderWithProviders(
      <StatusBadge label="Pagado" tone="success" accessibilityPrefix="Estado del pedido" />,
    );
    // A bare "Pagado" tells a screen reader user nothing about what is paid.
    expect(screen.getByLabelText('Estado del pedido: Pagado')).toBeOnTheScreen();
  });

  it('falls back to the bare label when no prefix is given', async () => {
    await renderWithProviders(<StatusBadge label="Entregado" tone="success" />);
    expect(screen.getByLabelText('Entregado')).toBeOnTheScreen();
  });

  it('renders every repair status the domain can produce', async () => {
    const statuses = [
      'received',
      'diagnosis',
      'awaiting_approval',
      'in_repair',
      'quality_check',
      'ready_for_pickup',
      'delivered',
      'cancelled',
    ] as const;

    for (const status of statuses) {
      const meta = describeRepairStatus(status);
      const { unmount } = await renderWithProviders(
        <StatusBadge label={meta.label} tone={meta.tone} />,
      );
      expect(screen.getByText(meta.label)).toBeOnTheScreen();
      await unmount();
    }
  });

  it('uses different tones for payment and fulfilment of the same order', async () => {
    const payment = describePaymentStatus('paid');
    const fulfillment = describeFulfillmentStatus('preparing');

    await renderWithProviders(
      <>
        <StatusBadge label={payment.label} tone={payment.tone} accessibilityPrefix="Pago" />
        <StatusBadge label={fulfillment.label} tone={fulfillment.tone} accessibilityPrefix="Entrega" />
      </>,
    );

    // Both must be present and separately announced — never merged into one.
    expect(screen.getByLabelText('Pago: Pagado')).toBeOnTheScreen();
    expect(screen.getByLabelText('Entrega: En preparación')).toBeOnTheScreen();
  });
});
