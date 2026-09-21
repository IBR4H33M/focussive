package expo.modules.appblocker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews

/**
 * Posts and schedules the two live, non-dismissible session notifications:
 * an upcoming-session reminder and a running-session status.
 *
 * Both use Android's native chronometer so the on-screen countdown ticks every
 * second without any app process running, and both use fully custom collapsed
 * and expanded layouts (a deep-blue surface with a large countdown) so the text
 * stays legible over any wallpaper.
 */
object SessionNotifications {
    const val ACTIVE_NOTIFICATION_ID = 1001
    private const val CHANNEL_REMINDER = "session-reminder"
    private const val CHANNEL_ACTIVE = "session-active"
    private val COLOR_REMINDER = Color.parseColor("#6B7280") // Gray for upcoming reminder
    private val COLOR_ACTIVE = Color.parseColor("#10B981")   // Emerald green for running session countdown

    @Volatile
    var latestActiveNotification: Notification? = null

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_REMINDER) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_REMINDER, "Session Reminders", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        if (manager.getNotificationChannel(CHANNEL_ACTIVE) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ACTIVE, "Session Running", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    private fun openSessionIntent(context: Context, sessionId: String, requestCode: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("focussive://session/$sessionId")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun alarmPendingIntent(context: Context, id: Int): PendingIntent {
        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "com.focussive.app.SESSION_NOTIFICATION_$id"
        }
        return PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Cancel any posted reminder notifications when active session begins. */
    fun cancelAllReminders(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                manager.activeNotifications?.forEach { sbn ->
                    if (sbn.id != ACTIVE_NOTIFICATION_ID) {
                        cancel(context, sbn.id)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    /** Schedule automatic dismissal of the active notification when session ends. */
    fun scheduleTeardown(context: Context, timeoutAtMillis: Long) {
        if (timeoutAtMillis <= System.currentTimeMillis()) return
        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "ACTION_SESSION_TEARDOWN"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, 99999, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeoutAtMillis, pendingIntent)
        } catch (_: SecurityException) {
            alarmManager.set(AlarmManager.RTC_WAKEUP, timeoutAtMillis, pendingIntent)
        }
    }

    /**
     * Wire up a Chronometer to tick down to [targetAtMillis].
     *
     * Chronometer's clock is elapsedRealtime, not wall-clock, so the base has to
     * be translated. Countdown mode must be set on the *view* — setting it on the
     * Notification.Builder only affects the system template's own chronometer, so
     * without this the widget counts up from a future base and renders a leading
     * minus sign.
     */
    private fun bindChronometer(views: RemoteViews, targetAtMillis: Long) {
        val base = SystemClock.elapsedRealtime() + (targetAtMillis - System.currentTimeMillis())
        views.setChronometer(R.id.notif_chronometer, base, null, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometerCountDown(R.id.notif_chronometer, true)
        }
    }

    /** Build the large, card-like expanded layout with the live countdown. */
    private fun buildExpandedView(
        context: Context,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
        violationsText: String?,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_active else R.layout.notification_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, title)
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis)

        if (isActive) {
            views.setTextViewText(R.id.notif_violations, violationsText ?: "No violations")
        }
        return views
    }

    /** Collapsed row */
    private fun buildCollapsedView(
        context: Context,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_collapsed else R.layout.notification_collapsed_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, title)
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis)
        return views
    }

    /** Resolve the small status bar icon from custom app resources with fallbacks. */
    private fun getSmallIconResId(context: Context): Int {
        val notifIconId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        if (notifIconId != 0) return notifIconId

        val icNotifId = context.resources.getIdentifier("ic_notification", "drawable", context.packageName)
        if (icNotifId != 0) return icNotifId

        if (context.applicationInfo.icon != 0) {
            return context.applicationInfo.icon
        }

        return android.R.drawable.ic_dialog_info
    }

    /** Build a complete notification instance. */
    fun buildNotification(
        context: Context,
        id: Int,
        sessionId: String,
        title: String,
        body: String,
        targetAtMillis: Long,
        timeoutAtMillis: Long,
        isActive: Boolean,
        violationsText: String? = null,
    ): Notification {
        ensureChannels(context)
        val channel = if (isActive) CHANNEL_ACTIVE else CHANNEL_REMINDER
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, channel)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }

        builder
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(getSmallIconResId(context))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setWhen(targetAtMillis)
            .setShowWhen(true)
            .setContentIntent(openSessionIntent(context, sessionId, id))

        // DecoratedCustomViewStyle: clean native system card style with no ugly fill container
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setPriority(Notification.PRIORITY_HIGH)
            builder.setStyle(Notification.DecoratedCustomViewStyle())
            builder.setCustomContentView(buildCollapsedView(context, title, targetAtMillis, isActive))
            builder.setCustomBigContentView(buildExpandedView(context, title, targetAtMillis, isActive, violationsText))
        }

        val timeoutMs = timeoutAtMillis - System.currentTimeMillis()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && timeoutMs > 0) {
            builder.setTimeoutAfter(timeoutMs)
        }

        val notification = builder.build()
        // Lock notification so it cannot be dismissed or cleared for both running and upcoming reminder
        if (isActive) {
            notification.flags = notification.flags or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
        } else {
            notification.flags = notification.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
        }
        return notification
    }

    /** Post (or silently update) a live notification immediately. */
    fun post(
        context: Context,
        id: Int,
        sessionId: String,
        title: String,
        body: String,
        targetAtMillis: Long,
        timeoutAtMillis: Long,
        isActive: Boolean,
        violationsText: String? = null,
    ) {
        val targetId = if (isActive) ACTIVE_NOTIFICATION_ID else id
        val notification = buildNotification(
            context, targetId, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive, violationsText
        )

        if (isActive) {
            // Dismiss reminder notifications immediately when session is active
            cancelAllReminders(context)

            // Schedule teardown when session finishes so notification disappears
            if (timeoutAtMillis > System.currentTimeMillis()) {
                scheduleTeardown(context, timeoutAtMillis)
            }

            latestActiveNotification = notification
            val service = AppBlockerService.instance
            if (service != null) {
                // If service is running, update the foreground service notification directly!
                service.startForeground(ACTIVE_NOTIFICATION_ID, notification)
                return
            }
        }

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(targetId, notification)
    }

    /** Schedule a future post via AlarmManager; fires natively even if the app is killed. */
    fun schedule(
        context: Context,
        id: Int,
        sessionId: String,
        title: String,
        body: String,
        targetAtMillis: Long,
        timeoutAtMillis: Long,
        fireAtMillis: Long,
        isActive: Boolean,
        violationsText: String? = null,
    ) {
        val now = System.currentTimeMillis()

        // Already due (or nearly so) — post right away instead of dropping it.
        if (fireAtMillis <= now + 1000) {
            post(context, id, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive, violationsText)
            return
        }

        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "com.focussive.app.SESSION_NOTIFICATION_$id"
            putExtra("id", id)
            putExtra("sessionId", sessionId)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("targetAtMillis", targetAtMillis)
            putExtra("timeoutAtMillis", timeoutAtMillis)
            putExtra("isActive", isActive)
            putExtra("violationsText", violationsText)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, pendingIntent)
        } catch (e: SecurityException) {
            // Exact-alarm permission not granted — fall back to an inexact alarm.
            alarmManager.set(AlarmManager.RTC_WAKEUP, fireAtMillis, pendingIntent)
        }
    }

    /** Cancel a pending alarm (if any) and dismiss the notification (if shown). */
    fun cancel(context: Context, id: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pendingIntent = alarmPendingIntent(context, id)
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
        if (id == ACTIVE_NOTIFICATION_ID) {
            latestActiveNotification = null
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        manager?.cancel(id)
    }
}
