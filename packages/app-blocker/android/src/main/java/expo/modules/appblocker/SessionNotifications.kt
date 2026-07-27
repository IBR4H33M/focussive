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
    private const val CHANNEL_REMINDER = "session-reminder"
    private const val CHANNEL_ACTIVE = "session-active"
    private val COLOR_REMINDER = Color.parseColor("#BAC6B8")
    private val COLOR_ACTIVE = Color.parseColor("#8BA794")

    /** Dark notification surface — matches the custom layout backgrounds. */
    private val COLOR_SURFACE = Color.parseColor("#3D4654")

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
        bindChronometer(views, targetAtMillis)

        if (isActive) {
            views.setTextViewText(R.id.notif_violations, violationsText ?: "No violations")
        }
        return views
    }

    /**
     * Collapsed row — same deep-blue surface as the expanded view so the
     * notification looks intentional whether or not the user expands it.
     * Android caps collapsed custom views at ~48dp, so this is a single row.
     */
    private fun buildCollapsedView(
        context: Context,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
    ): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.notification_collapsed)
        views.setTextViewText(R.id.notif_title, title)
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis)
        return views
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
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setWhen(targetAtMillis)
            .setShowWhen(true)
            .setColor(COLOR_SURFACE)
            .setColorized(true)
            .setContentIntent(openSessionIntent(context, sessionId, id))

        // Fully custom views (no DecoratedCustomViewStyle) so our deep-blue surface
        // fills the notification body edge-to-edge instead of sitting in the
        // system's inset card. Needs API 24+; older devices get the plain template.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setPriority(Notification.PRIORITY_HIGH)
            builder.setCustomContentView(buildCollapsedView(context, title, targetAtMillis, isActive))
            builder.setCustomBigContentView(buildExpandedView(context, title, targetAtMillis, isActive, violationsText))
        }

        val timeoutMs = timeoutAtMillis - System.currentTimeMillis()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && timeoutMs > 0) {
            builder.setTimeoutAfter(timeoutMs)
        }

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(id, builder.build())
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
        val manager = context.getSystemService(NotificationManager::class.java)
        manager?.cancel(id)
    }
}
