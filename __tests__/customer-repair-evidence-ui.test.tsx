import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RepairEvidence } from '@/domain/repairs/evidence';
import { describeEvidenceStage } from '@/domain/repairs/evidence';
import { RepairEvidenceGallery } from '@/features/repairs/repair-evidence-gallery';
import { queryKeys } from '@/providers/query-client';
import { makeQueryScope } from '@/providers/query-scope';

import { renderWithProviders } from './support/render';

/**
 * The gallery — M12D, customer side.
 *
 * Every image is an authorised request, so the one thing this file must hold
 * down is that NOTHING loads without the Bearer header. A thumbnail that
 * rendered with a bare URL would be asking a private route anonymously, and the
 * failure would look like a broken photo instead of a missing credential.
 */
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));

const SCOPE = makeQueryScope({ tenantSlug: 'blackdog', userId: 42 });

function photo(overrides: Partial<RepairEvidence> = {}): RepairEvidence {
  return {
    id: 12,
    stage: 'repair_after',
    caption: 'Pantalla nueva instalada',
    width: 1200,
    height: 900,
    createdAt: '2026-10-01T15:04:05Z',
    ...overrides,
  };
}

const contentUrl = (id: number) =>
  `https://api.example.test/api/v1/customer/blackdog/repairs/31/evidence/${id}/content/`;


type RenderedView = Awaited<ReturnType<typeof renderWithProviders>>;
type ImageSource = { uri: string; headers?: Record<string, string> } | undefined;
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown };

/** Flatten the rendered tree: the host output is what the loader actually gets. */
function nodes(view: RenderedView): Node[] {
  const out: Node[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const typed = node as Node;
    out.push(typed);
    walk(typed.children);
  };
  walk(view.toJSON() as unknown);
  return out;
}

/**
 * Every source the image loader was actually handed.
 *
 * The host node is `ViewManagerAdapter_ExpoImage` and its `source` is an ARRAY,
 * which is why this flattens rather than reading one object: asserting on the
 * React element's props would test what was written, not what the native view
 * received.
 */
function imageSources(view: RenderedView): ImageSource[] {
  return nodes(view)
    .filter((node) => String(node.type ?? '').toLowerCase().includes('image'))
    .flatMap((node) => {
      const source = node.props?.source;
      return (Array.isArray(source) ? source : [source]) as ImageSource[];
    });
}



describe('the gallery', () => {
  it('shows the stage the workshop recorded', async () => {
    await renderWithProviders(
      <RepairEvidenceGallery
        evidence={[photo()]}
        authorization="Bearer t"
        contentUrl={contentUrl}
      />,
    );

    expect(screen.getByText('Después de reparar')).toBeTruthy();
  });

  it('draws nothing at all when the shop shared nothing', async () => {
    const { toJSON } = await renderWithProviders(
      <RepairEvidenceGallery evidence={[]} authorization="Bearer t" contentUrl={contentUrl} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('sends the Bearer header with every image', async () => {
    const view = await renderWithProviders(
      <RepairEvidenceGallery
        evidence={[photo(), photo({ id: 13, stage: 'intake' })]}
        authorization="Bearer t"
        contentUrl={contentUrl}
      />,
    );

    const sources = imageSources(view);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source?.headers?.Authorization).toBe('Bearer t');
      expect(source?.uri).toMatch(/\/api\/v1\/customer\/blackdog\/repairs\/31\//);
    }
  });

  it('requests NOTHING until the header is resolved', async () => {
    // `authorization: null` is the window while a refresh is in flight. A URL
    // sent without the header would be an anonymous call to a private route.
    const view = await renderWithProviders(
      <RepairEvidenceGallery evidence={[photo()]} authorization={null} contentUrl={contentUrl} />,
    );

    // Nothing is handed to the loader at all: with no header there is no
    // request to make, and a URL on its own would be an anonymous call to a
    // private route.
    expect(imageSources(view).filter(Boolean)).toHaveLength(0);
  });

  it('expands one photo in place and closes it again', async () => {
    await renderWithProviders(
      <RepairEvidenceGallery
        evidence={[photo()]}
        authorization="Bearer t"
        contentUrl={contentUrl}
      />,
    );

    expect(screen.queryByText('Cerrar')).toBeNull();

    fireEvent.press(screen.getByLabelText('Después de reparar: Pantalla nueva instalada'));
    expect(await screen.findByText('Cerrar')).toBeTruthy();
    expect(screen.getByText('Pantalla nueva instalada')).toBeTruthy();

    fireEvent.press(screen.getByText('Cerrar'));
    await waitFor(() => expect(screen.queryByText('Cerrar')).toBeNull());
  });

  it('invents no caption for a photo that has none', async () => {
    await renderWithProviders(
      <RepairEvidenceGallery
        evidence={[photo({ caption: '' })]}
        authorization="Bearer t"
        contentUrl={contentUrl}
      />,
    );

    // The stage is the only thing said about it. Narrating the workshop's
    // evidence would be the app inventing what a photo means.
    // The stage, once as the button's label and once as the badge. Nothing else
    // is said about the photo.
    expect(screen.getAllByLabelText(/Después de reparar/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Foto de la reparación/)).toBeNull();
  });
});

describe('stages are one word everywhere', () => {
  it('uses the labels the workshop already uses', () => {
    expect(describeEvidenceStage('intake').label).toBe('Ingreso');
    expect(describeEvidenceStage('quality').tone).toBe('info');
    expect(describeEvidenceStage('warranty').tone).toBe('warning');
    expect(describeEvidenceStage('ready').tone).toBe('success');
  });
});

describe('the cache', () => {
  it('nests the photos under the repair that owns them', () => {
    // Invalidating a repair must sweep its photos: a withdrawn photo that
    // survived would keep showing an image the content route now refuses.
    expect(queryKeys.repairEvidence(SCOPE, 31).join('/')).toContain('repair/31');
    expect(queryKeys.repairEvidence(SCOPE, 31)).not.toEqual(
      queryKeys.repairEvidence(SCOPE, 32),
    );
  });

  it('keeps one credential key per user, not one per photo', () => {
    expect(queryKeys.evidenceAuthorization(SCOPE).join('/')).toContain('evidence-authorization');
    expect(queryKeys.evidenceAuthorization(SCOPE)).not.toEqual(
      queryKeys.evidenceAuthorization(makeQueryScope({ tenantSlug: 'otra', userId: 42 })),
    );
  });
});
