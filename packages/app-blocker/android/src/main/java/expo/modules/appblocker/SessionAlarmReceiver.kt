package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Fires when a scheduled session-notification alarm goes off — works even if
 * the app process has been killed, since AlarmManager wakes this receiver
 * directly via the system.
 */
class SessionAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
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
    }
}
