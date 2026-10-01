import { initializeApp, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from './env';

/**
 * Firebase Admin SDK initialization.
 *
 * Configuration source: the `FIREBASE_SERVICE_ACCOUNT` env var holds the
 * ENTIRE service-account JSON as a single string. We parse it at startup.
 * This avoids the headaches of pointing to a service-account-key.json file
 * (which doesn't work in containerized / serverless environments and tends
 * to leak into git).
 *
 * When the env var is unset (development mode without FCM), `firebaseConfigured`
 * is `false` and the FCM service becomes a no-op — notifications are still
 * persisted to MongoDB and visible via GET /api/notifications, but no push is
 * sent to devices. This matches the Cloudinary configuration pattern.
 *
 * Security:
 *   - The service-account JSON grants full Firebase Admin access — never
 *     commit it to git. Always inject via .env (which is gitignored) or a
 *     secrets manager in production.
 *   - The Flutter app NEVER receives these credentials. It only receives the
 *     push notifications through FCM and registers device tokens via the
 *     /api/notifications/device-token endpoint.
 *
 * In firebase-admin v12+ the SDK is split into modular subpath exports
 * (`firebase-admin/app`, `firebase-admin/messaging`, ...). We import only
 * what we need from those subpaths to keep the bundle small and types clean.
 */

export const firebaseConfigured = !!env.FIREBASE_SERVICE_ACCOUNT;

let firebaseApp: App | null = null;
let messagingInstance: Messaging | null = null;

if (firebaseConfigured) {
  try {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT as string) as ServiceAccount;
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID || serviceAccount.projectId,
    });
    messagingInstance = getMessaging(firebaseApp);
    // eslint-disable-next-line no-console
    console.log('✅ Firebase Admin initialized for FCM push notifications');
  } catch (err) {
    // Don't crash the server — log and degrade to no-FCM mode. The order
    // flow continues to work; only push notifications are unavailable.
    // eslint-disable-next-line no-console
    console.error('❌ Failed to initialize Firebase Admin (FCM disabled):', (err as Error).message);
  }
} else if (env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT is not set — FCM push notifications disabled.');
}

/**
 * Get the Messaging instance (or null when FCM is not configured).
 * The FCM service calls this to obtain the messaging API without caring
 * about app-lifecycle details.
 */
export function getMessagingInstance(): Messaging | null {
  return messagingInstance;
}

export { firebaseApp };
