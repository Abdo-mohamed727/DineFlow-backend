import { waiterRequestRepository } from '../repositories/waiterRequest.repository';
import { diningSessionRepository } from '../repositories/diningSession.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { NotFoundError, ForbiddenError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { WaiterRequestStatus } from '../types';
import type {
  CreateWaiterRequestInput,
  UpdateWaiterRequestStatusInput,
} from '../validators/waiterRequest.validator';

export class WaiterRequestService {
  async create(input: CreateWaiterRequestInput, customerId: string) {
    let tableId = input.tableId;
    if (input.diningSessionId) {
      // Resolve table from session if not provided
      const session = await diningSessionRepository.findByIdRaw(input.diningSessionId);
      if (session.status !== 'active') {
        throw new ForbiddenError('Dining session is not active');
      }
      if (!tableId) tableId = session.tableId.toString();
    }
    const req = await waiterRequestRepository.create({
      customerId,
      tableId,
      diningSessionId: input.diningSessionId,
      type: input.type,
      message: input.message,
    });

    return req;
  }

  async findMany(filter: {
    status?: WaiterRequestStatus;
    type?: 'CALL_WAITER' | 'REQUEST_BILL' | 'REQUEST_HELP';
    page?: number;
    limit?: number;
  }) {
    return waiterRequestRepository.findMany(filter);
  }

  async findByCustomer(customerId: string) {
    return waiterRequestRepository.findByCustomer(customerId);
  }

  async getById(id: string) {
    return waiterRequestRepository.findById(id);
  }

  async updateStatus(id: string, input: UpdateWaiterRequestStatusInput, handlerId: string) {
    const updated = await waiterRequestRepository.updateStatus(
      id,
      input.status as WaiterRequestStatus,
      handlerId,
    );
    // Notify the customer who made the request
    await notificationRepository.create({
      userId: (updated.customerId as unknown as { toString: () => string }).toString(),
      title: 'Waiter request updated',
      message: `Your request is now "${updated.status}".`,
      type: 'WAITER_REQUEST',
      data: { waiterRequestId: updated.id, status: updated.status },
    });
    return updated;
  }
}

export const waiterRequestService = new WaiterRequestService();
