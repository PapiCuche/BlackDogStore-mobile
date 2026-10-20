import {
  createAddress,
  fetchAddressBook,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '@/api/endpoints/customer-addresses-v1';
import {
  confirmOwnEmailCode,
  fetchCustomerProfile,
  sendOwnEmailCode,
  updateCustomerProfile,
} from '@/api/endpoints/customer-profile-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type { CustomerAddressInput } from '@/domain/customer/address-types';
import type { CustomerProfileInput } from '@/domain/customer/profile-types';

/**
 * «Mi cuenta» — the buyer's own record and address book in this shop.
 *
 * One class for both because they are one page on the web and one screen here,
 * and because they are tied: the first entry of a book needs a record with a
 * name, so the server refuses an address with «Completa tu nombre en «Mi
 * cuenta»» until the profile has one.
 */
export class V1CustomerAccountRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getProfile(signal?: AbortSignal) {
    return fetchCustomerProfile(this.deps, signal);
  }

  async saveProfile(input: CustomerProfileInput, signal?: AbortSignal) {
    return updateCustomerProfile(input, this.deps, signal);
  }

  async sendEmailCode(signal?: AbortSignal) {
    return sendOwnEmailCode(this.deps, signal);
  }

  async confirmEmailCode(code: string, signal?: AbortSignal) {
    return confirmOwnEmailCode(code, this.deps, signal);
  }

  async listAddresses(signal?: AbortSignal) {
    return fetchAddressBook(this.deps, signal);
  }

  async addAddress(input: CustomerAddressInput, signal?: AbortSignal) {
    return createAddress(input, this.deps, signal);
  }

  async editAddress(id: number, input: CustomerAddressInput, signal?: AbortSignal) {
    return updateAddress(id, input, this.deps, signal);
  }

  async deleteAddress(id: number, signal?: AbortSignal) {
    return removeAddress(id, this.deps, signal);
  }

  async makeAddressDefault(id: number, signal?: AbortSignal) {
    return setDefaultAddress(id, this.deps, signal);
  }
}
