import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { updateUserSchema } from '../validators/user.validator';
import { uploadSingle } from '../middlewares/upload.middleware';

const router = Router();

router.use(authenticate);

router.get('/me', userController.getMe);
router.patch('/me', validate(updateUserSchema, 'body'), userController.updateMe);
router.patch('/me/profile-image', uploadSingle('image'), userController.updateProfileImage);

export default router;
