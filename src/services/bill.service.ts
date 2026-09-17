import { billRepository } from '../repositories/bill.repository';

export class BillService {
  async getById(id: string) {
    return billRepository.findById(id);
  }

  async getOrCreateForSession(diningSessionId: string) {
    return billRepository.getOrCreateForSession(diningSessionId);
  }

  async markPaid(id: string, paidBy: string) {
    return billRepository.markPaid(id, paidBy);
  }
}

export const billService = new BillService();
