package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Fires when a scheduled session-notification alarm goes off — works even if
 * the app process has been killed, since AlarmManager wakes this receiver
 * directly via the system.
 */
class SessionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "ACTION_SESSION_TEARDOWN") {
            // Session finished! Dismiss ongoing notification and stop foreground service
            SessionNotifications.cancel(context, SessionNotifications.ACTIVE_NOTIFICATION_ID)
            try {
                val serviceIntent = Intent(context, AppBlockerService::class.java).apply {
                    action = "STOP"
                }
                context.startService(serviceIntent)
            } catch (_: Exception) {}
            return
        }

        if (intent.action == "ACTION_SESSION_SKIP") {
            // Dismiss upcoming notification immediately
            val notifId = intent.getIntExtra("id", -1)
            if (notifId != -1) {
                SessionNotifications.cancel(context, notifId)
            }
            try {
                val serviceIntent = Intent(context, AppBlockerService::class.java).apply {
                    action = "STOP"
                }
                context.startService(serviceIntent)
            } catch (_: Exception) {}

            val sessionId = intent.getStringExtra("sessionId") ?: return

            // Open app via deep link to trigger skip confirmation flow
            val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("focussive://session/$sessionId?action=skip")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(launchIntent)
            return
        }

        val id = intent.getIntExtra("id", -1)
        val sessionId = intent.getStringExtra("sessionId") ?: return
        if (id == -1) return
        val title = intent.getStringExtra("title") ?: return
        val body = intent.getStringExtra("body") ?: ""
        val targetAtMillis = intent.getLongExtra("targetAtMillis", 0L)
        val timeoutAtMillis = intent.getLongExtra("timeoutAtMillis", 0L)
        val isActive = intent.getBooleanExtra("isActive", false)
        val violationsText = intent.getStringExtra("violationsText")

        SessionNotifications.post(context, id, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive, violationsText)

        if (isActive) {
            // Dismiss reminder notifications immediately when session becomes active
            SessionNotifications.cancelAllReminders(context)
        }

        try {
            val serviceIntent = Intent(context, AppBlockerService::class.java).apply {
                action = if (isActive) "START_ACTIVE" else "START_REMINDER"
                putExtra("SESSION_ID", sessionId)
                putExtra("SESSION_NAME", title)
                putExtra("END_AT_MILLIS", targetAtMillis)
                putExtra("NOTIF_ID", id)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (_: Exception) {
            // Ignore if background service cannot start in restricted device states
        }
    }
}
