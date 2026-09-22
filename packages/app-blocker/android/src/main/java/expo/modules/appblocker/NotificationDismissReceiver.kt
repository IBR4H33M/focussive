package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the delete intent fired when Android 12+ force-dismisses
 * the active session notification. Immediately reposts the notification
 * to maintain the persistent session indicator.
 *
 * This is necessary because Android 12+ (API 31+) allows users to dismiss
 * foreground service notifications regardless of FLAG_ONGOING_EVENT.
 * Google made this a deliberate platform decision; a recovery loop is the
 * only viable workaround.
 */
class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "ACTION_ACTIVE_NOTIFICATION_DISMISSED") return

        val sessionId = intent.getStringExtra("sessionId") ?: return

        // Only repost if a session is genuinely still running.
        // AppBlockerService.instance is null if the service has been stopped,
        // which means the session ended legitimately — do not repost in that case.
        val service = AppBlockerService.instance ?: return

        if (!service.isSessionActive()) return

        // Retrieve the last built notification and repost it as foreground.
        val notification = SessionNotifications.latestActiveNotification ?: return
        service.startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)
    }
}
