package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Receives the restart alarm fired from AppBlockerService.onTaskRemoved.
 * Restarts the blocker service after the app is swiped from recents,
 * maintaining the active session notification and blocking behavior.
 *
 * AlarmManager alarms survive app process death, so this receiver fires
 * even after the OS kills the app process — allowing near-instant recovery.
 */
class ServiceRestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "ACTION_RESTART_BLOCKER_SERVICE") return

        val sessionId = intent.getStringExtra("SESSION_ID") ?: return
        val sessionName = intent.getStringExtra("SESSION_NAME") ?: return
        val endAtMillis = intent.getLongExtra("END_AT_MILLIS", 0L)

        // Do not restart if the session has already expired
        if (endAtMillis > 0 && System.currentTimeMillis() >= endAtMillis) return

        val serviceIntent = Intent(context, AppBlockerService::class.java).apply {
            action = "START_ACTIVE"
            putExtra("SESSION_ID", sessionId)
            putExtra("SESSION_NAME", sessionName)
            putExtra("END_AT_MILLIS", endAtMillis)
            putExtra("IS_RESTART", true)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            // Device is in a state where the service cannot start — nothing to do
        }
    }
}
