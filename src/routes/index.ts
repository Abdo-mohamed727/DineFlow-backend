import { Router, Request, Response } from 'express';

import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import categoryRoutes from './category.routes';
import productRoutes from './product.routes';
import tableRoutes from './table.routes';
import diningSessionRoutes from './diningSession.routes';
import orderRoutes from './order.routes';
import notificationRoutes from './notification.routes';
import waiterRequestRoutes from './waiterRequest.routes';
import billRoutes from './bill.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'DineFlow API is up', data: { ts: new Date().toISOString() } });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/tables', tableRoutes);
router.use('/dining-sessions', diningSessionRoutes);
router.use('/orders', orderRoutes);
router.use('/notifications', notificationRoutes);
router.use('/waiter-requests', waiterRequestRoutes);
router.use('/bills', billRoutes);

export default router;
