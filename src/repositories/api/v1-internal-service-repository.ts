import {
  fetchServiceAssignmentOptions,
  fetchServiceContext,
  fetchServiceDevices,
  fetchServiceOrder,
  fetchServiceOrders,
  postServiceAssignment,
  postServiceDevice,
  postServiceOrder,
  postServiceTransition,
  searchServiceCustomers,
  type ServiceOrderQuery,
} from '@/api/endpoints/internal-service-v1';
import type { RefreshCoordinator } from '@/auth/refresh-coordinator';
import type {
  ServiceAssignmentOptions,
  ServiceContext,
  ServiceCustomerPage,
  ServiceDeviceCreated,
  ServiceDeviceInput,
  ServiceDevicePage,
  ServiceOrderDetail,
  ServiceOrderInput,
  ServiceOrderPage,
} from '@/domain/internal/service-types';

/**
 * The company's workshop, over `/api/v1/internal/<slug>/service/`.
 *
 * A SEPARATE repository from `V1CustomerRepairRepository`, and the separation is
 * the point: one answers "this company's repairs" under a capability, the other
 * answers "my repairs" as a client. The same person can legitimately ask both,
 * and a single class that switched between them would be one refactor away from
 * answering the wrong one.
 *
 * Never touches `/api/admin/`.
 */
export class V1InternalServiceRepository {
  constructor(private readonly deps: { refreshCoordinator: RefreshCoordinator }) {}

  async getContext(signal?: AbortSignal): Promise<ServiceContext> {
    return fetchServiceContext(this.deps, signal);
  }

  async searchCustomers(
    query: { search?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<ServiceCustomerPage> {
    return searchServiceCustomers(query, this.deps, signal);
  }

  async listDevices(
    query: { customerId?: number; search?: string; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<ServiceDevicePage> {
    return fetchServiceDevices(query, this.deps, signal);
  }

  async createDevice(
    input: ServiceDeviceInput,
    signal?: AbortSignal,
  ): Promise<ServiceDeviceCreated> {
    return postServiceDevice(input, this.deps, signal);
  }

  async listOrders(
    query: ServiceOrderQuery = {},
    signal?: AbortSignal,
  ): Promise<ServiceOrderPage> {
    return fetchServiceOrders(query, this.deps, signal);
  }

  async getOrder(id: number, signal?: AbortSignal): Promise<ServiceOrderDetail> {
    return fetchServiceOrder(id, this.deps, signal);
  }

  /**
   * Receive a device.
   *
   * Deliberately NOT called `createOrder(order)`. The payload is an intent: the
   * number, the state, the company and the receiver are the server's, and a
   * name that implied the client was supplying a finished order would invite a
   * caller to look for fields that do not exist.
   */
  async receiveDevice(
    input: ServiceOrderInput,
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceOrder(input, this.deps, signal);
  }

  async transition(
    input: { id: number; status: string; comment?: string },
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceTransition(input, this.deps, signal);
  }

  async getAssignmentOptions(
    id: number,
    signal?: AbortSignal,
  ): Promise<ServiceAssignmentOptions> {
    return fetchServiceAssignmentOptions(id, this.deps, signal);
  }

  async assignTechnician(
    input: { id: number; technicianId: number | null },
    signal?: AbortSignal,
  ): Promise<ServiceOrderDetail> {
    return postServiceAssignment(input, this.deps, signal);
  }
}
