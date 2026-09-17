import { diningSessionRepository } from '../repositories/diningSession.repository';
import { tableRepository } from '../repositories/table.repository';
import { TABLE_STATUSES } from '../types';
import { ConflictError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import type { CreateDiningSessionInput } from '../validators/diningSession.validator';

export class DiningSessionService {
  async listActive() {
    return diningSessionRepository.findActive();
  }

  async getById(id: string) {
    return diningSessionRepository.findById(id);
  }

  async start(input: CreateDiningSessionInput, startedBy?: string) {
    const table = await tableRepository.findById(input.tableId);
    if (table.status === TABLE_STATUSES.OCCUPIED) {
      throw new ConflictError(
        `Table ${table.tableNumber} is currently occupied`,
        ErrorCodes.TABLE_NOT_AVAILABLE,
      );
    }
    const session = await diningSessionRepository.create({
      tableId: input.tableId,
      startedBy,
      guestCount: input.guestCount,
      notes: input.notes,
    });
    // Mark the table occupied
    await tableRepository.setStatus(input.tableId, TABLE_STATUSES.OCCUPIED);
    return session;
  }

  async close(id: string, _closedBy?: string) {
    const session = await diningSessionRepository.close(id);
    // Free the table
    await tableRepository.setStatus(session.tableId.toString(), TABLE_STATUSES.AVAILABLE);
    return session;
  }
}

export const diningSessionService = new DiningSessionService();
