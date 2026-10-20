import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CustomerAddressInput } from '@/domain/customer/address-types';
import type { CustomerProfileInput } from '@/domain/customer/profile-types';
import { queryKeys } from '@/providers/query-client';
import { useQueryScope } from '@/providers/use-query-scope';
import { repositories } from '@/repositories';
import { featureUnavailable } from '@/repositories/errors';

/**
 * «Mi cuenta» — the buyer's own record and address book, CLIENT-SEC-01 and
 * DELIVERY-01.
 *
 * PRIVATE READS, so `enabled` belongs to the caller: the screen holds them
 * back until a session exists rather than firing a request that can only come
 * back 401.
 *
 * `retry: false` throughout. The interesting failure is a permanent answer —
 * 404 for somebody who is not a client of this shop, 400 for a document the
 * shop owns — and repeating it only delays an honest screen.
 *
 * NOTHING IS OPTIMISTIC. The server judges every field, rewrites a phone into
 * the form it keeps, and refuses a save whole; the profile it answers with is
 * the one that now exists, so that answer is written into the cache and the
 * form is re-seeded from it.
 */
const UNAVAILABLE = 'Tu cuenta no está disponible en esta versión de la app.';

function account() {
  return repositories.customerAccount;
}

export function useCustomerProfile(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customerProfile(scope),
    queryFn: ({ signal }) => {
      const repository = account();
      return repository
        ? repository.getProfile(signal)
        : featureUnavailable('customerAccount', UNAVAILABLE);
    },
    enabled: options.enabled ?? true,
    retry: false,
  });
}

export function useAddressBook(options: { enabled?: boolean } = {}) {
  const scope = useQueryScope();
  return useQuery({
    queryKey: queryKeys.customerAddresses(scope),
    queryFn: ({ signal }) => {
      const repository = account();
      return repository
        ? repository.listAddresses(signal)
        : featureUnavailable('customerAccount', UNAVAILABLE);
    },
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/**
 * Every write here answers with the row as it now stands, so the cache is
 * written from the ANSWER and then refetched.
 *
 * `setQueryData` alone would be enough for the field that changed, but the
 * server can change more than was asked: saving a document can leave
 * `document_locked` true, and a first address can create the customer record
 * the profile reads from. The refetch is what keeps the two screens honest
 * about each other.
 */
function useAccountMutation<TInput, TResult>(
  run: (repository: NonNullable<ReturnType<typeof account>>, input: TInput) => Promise<TResult>,
  invalidate: 'profile' | 'addresses' | 'both',
) {
  const client = useQueryClient();
  const scope = useQueryScope();

  return useMutation({
    mutationFn: (input: TInput) => {
      const repository = account();
      return repository ? run(repository, input) : featureUnavailable('customerAccount', UNAVAILABLE);
    },
    onSuccess: () => {
      if (invalidate !== 'addresses') {
        void client.invalidateQueries({ queryKey: queryKeys.customerProfile(scope) });
      }
      if (invalidate !== 'profile') {
        void client.invalidateQueries({ queryKey: queryKeys.customerAddresses(scope) });
      }
    },
    // A profile save is not idempotent in one respect the server counts: a
    // document change spends one of the day's three attempts whether it
    // succeeds or not. Nothing here repeats itself.
    retry: false,
  });
}

export function useSaveProfile() {
  return useAccountMutation<CustomerProfileInput, unknown>(
    (repository, input) => repository.saveProfile(input),
    // A name saved here is what the address book needs before its first entry.
    'both',
  );
}

/**
 * Ask for a code for my own address.
 *
 * The address is never sent: the server reads it from the session. A 429 is
 * the shop's own «ya te enviamos un código hace poco», which is information,
 * not a failure to retry.
 */
export function useSendEmailCode() {
  return useAccountMutation<void, unknown>((repository) => repository.sendEmailCode(), 'profile');
}

export function useConfirmEmailCode() {
  return useAccountMutation<{ code: string }, unknown>(
    (repository, { code }) => repository.confirmEmailCode(code),
    'profile',
  );
}

export function useAddAddress() {
  return useAccountMutation<CustomerAddressInput, unknown>(
    (repository, input) => repository.addAddress(input),
    'both',
  );
}

export function useEditAddress() {
  return useAccountMutation<{ id: number; changes: CustomerAddressInput }, unknown>(
    (repository, { id, changes }) => repository.editAddress(id, changes),
    'addresses',
  );
}

export function useRemoveAddress() {
  return useAccountMutation<{ id: number }, unknown>(
    (repository, { id }) => repository.deleteAddress(id),
    'addresses',
  );
}

export function useMakeAddressDefault() {
  return useAccountMutation<{ id: number }, unknown>(
    (repository, { id }) => repository.makeAddressDefault(id),
    'addresses',
  );
}
