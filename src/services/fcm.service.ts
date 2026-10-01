import { firebaseConfigured, getMessagingInstance } from '../config/firebase';
import type { BatchResponse } from 'firebase-admin/messaging';

/**
 * FCM (Firebase Cloud Messaging) service.
 *
 * Responsibilities:
 *   - Send push notifications to one or more FCM tokens via Firebase Admin SDK.
 *   - Detect invalid/expired tokens from the FCM response and report them
 *     so the caller can remove them from the user's record.
 *   - Keep all Firebase-specific logic isolated from Order/Notification
 *     business logic.
 *
 * Failure contract:
 *   - If FCM is not configured (no service-account), `sendPush` returns
 *     `{ success: false, reason: 'not-configured' }` and never throws.
 *   - If FCM throws (network, auth, etc.), `sendPush` logs and returns
 *     `{ success: false, reason: 'error', error }` — it NEVER throws.
 *   - This ensures order-status updates remain successful even if FCM fails,
 *     matching the failure-handling contract in the spec.
 */

export interface FcmMessage {
  title: string;
  body: string;
  /** Arbitrary key-value data payload sent to the client. Values MUST be strings. */
  data?: Record<string, string>;
}

export interface FcmSendResult {
  /** Total tokens the message was attempted against. */
  attempted: number;
  /** Tokens that FCM reported as invalid/unregistered and should be removed. */
  invalidTokens: string[];
  /** Whether at least one token accepted the message. */
  success: boolean;
  /** Stable reason code: 'sent' | 'partial' | 'no-tokens' | 'not-configured' | 'error'. */
  reason: 'sent' | 'partial' | 'no-tokens' | 'not-configured' | 'error';
  /** Error message when reason === 'error'. */
  error?: string;
}

class FcmService {
  /**
   * Send a push notification to multiple FCM tokens. Never throws.
   *
   * Implementation detail: we use `sendEachForMulticast`, which is the
   * current recommended API (the older `sendMulticast` is deprecated in
   * firebase-admin v12+). Each token gets an individual response, so we
   * can identify which ones are invalid.
   */
  async sendPush(tokens: string[], message: FcmMessage): Promise<FcmSendResult> {
    if (!firebaseConfigured) {
      return { attempted: 0, invalidTokens: [], success: false, reason: 'not-configured' };
    }
    if (!tokens || tokens.length === 0) {
      return { attempted: 0, invalidTokens: [], success: false, reason: 'no-tokens' };
    }

    const messaging = getMessagingInstance();
    if (!messaging) {
      return { attempted: 0, invalidTokens: [], success: false, reason: 'not-configured' };
    }

    try {
      const response: BatchResponse = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data,
        // Android + APNs channels — let FCM use defaults. The Flutter app
        // typically configures a default notification channel; we don't
        // override that here.
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      const invalidTokens: string[] = [];
      let successCount = 0;
      response.responses.forEach((r: { success: boolean; error?: { code?: string; message: string } | undefined }, i: number) => {
        if (r.success) {
          successCount++;
        } else {
          const err = r.error;
          // Firebase error codes that indicate the token is no longer valid.
          // These should be removed from the user's record to keep it clean
          // and avoid wasting future send quota on dead tokens.
          const code = err?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.push(tokens[i]);
          }
          if (err) {
            // eslint-disable-next-line no-console
            console.warn(`[FCM] token ${tokens[i].slice(0, 12)}... failed: ${err.message}`);
          }
        }
      });

      const reason: FcmSendResult['reason'] =
        successCount === tokens.length ? 'sent'
        : successCount === 0 ? 'error'
        : 'partial';

      return {
        attempted: tokens.length,
        invalidTokens,
        success: successCount > 0,
        reason,
      };
    } catch (err) {
      // Network failure, FCM auth error, etc. — never propagate.
      // eslint-disable-next-line no-console
      console.error('[FCM] sendPush error:', (err as Error).message);
      return {
        attempted: tokens.length,
        invalidTokens: [],
        success: false,
        reason: 'error',
        error: (err as Error).message,
      };
    }
  }
}

export const fcmService = new FcmService();
