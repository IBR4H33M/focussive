package expo.modules.appblocker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.text.Html
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
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
    const val COMPLETED_NOTIFICATION_ID = 1002
    private const val CHANNEL_REMINDER = "session-reminder-v2"
    private const val CHANNEL_ACTIVE = "session-active-v2"
    private const val CHANNEL_COMPLETE = "session-complete-v2"

    private const val SOUND_REMINDER = "focustone_1_session_reminder_warm_kalimba"
    private const val SOUND_ACTIVE = "focustone_2_session_start_zen_bell"
    private const val SOUND_COMPLETE = "focustone_3_session_end_zen_bell"

    // Reminder: 2 short pulses; Start & End: 1 short pulse
    private val VIBRATION_REMINDER = longArrayOf(0, 150, 100, 150)
    private val VIBRATION_SINGLE_PULSE = longArrayOf(0, 150)

    private val COLOR_REMINDER = Color.parseColor("#F87171") // Light red countdown matching active
    private val COLOR_ACTIVE = Color.parseColor("#B91C1C")   // Dark red for running session countdown

    /** Notification surface colors matching custom layouts */
    private val COLOR_SURFACE_ACTIVE = Color.parseColor("#258F44")
    private val COLOR_SURFACE_REMINDER = Color.parseColor("#FEF3C7")

    @Volatile
    var latestActiveNotification: Notification? = null

    @Volatile
    var latestReminderNotification: Notification? = null

    @Volatile
    private var lastCompletedSessionId: String? = null
    @Volatile
    private var lastCompletedTimestamp: Long = 0L

    fun getSoundUri(context: Context, soundName: String): Uri? {
        val resId = context.resources.getIdentifier(soundName, "raw", context.packageName)
        return if (resId != 0) {
            Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/$resId")
        } else {
            Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/$soundName")
        }
    }

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        // Delete legacy silent channels so they do not conflict
        try {
            manager.deleteNotificationChannel("session-reminder")
            manager.deleteNotificationChannel("session-active")
        } catch (_: Exception) {}

        val audioAttributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .build()

        if (manager.getNotificationChannel(CHANNEL_REMINDER) == null) {
            val reminderSoundUri = getSoundUri(context, SOUND_REMINDER)
            val reminderChannel = NotificationChannel(
                CHANNEL_REMINDER,
                "Session Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                setShowBadge(false)
                enableLights(true)
                lightColor = Color.parseColor("#FEF3C7")
                enableVibration(true)
                vibrationPattern = VIBRATION_REMINDER
                if (reminderSoundUri != null) {
                    setSound(reminderSoundUri, audioAttributes)
                }
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(reminderChannel)
        }

        if (manager.getNotificationChannel(CHANNEL_ACTIVE) == null) {
            val activeSoundUri = getSoundUri(context, SOUND_ACTIVE)
            val activeChannel = NotificationChannel(
                CHANNEL_ACTIVE,
                "Session Running",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                setShowBadge(false)
                enableLights(true)
                lightColor = Color.parseColor("#258F44")
                enableVibration(true)
                vibrationPattern = VIBRATION_SINGLE_PULSE
                if (activeSoundUri != null) {
                    setSound(activeSoundUri, audioAttributes)
                }
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(activeChannel)
        }

        if (manager.getNotificationChannel(CHANNEL_COMPLETE) == null) {
            val completeSoundUri = getSoundUri(context, SOUND_COMPLETE)
            val completeChannel = NotificationChannel(
                CHANNEL_COMPLETE,
                "Session Completed",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                setShowBadge(true)
                enableLights(true)
                lightColor = Color.parseColor("#258F44")
                enableVibration(true)
                vibrationPattern = VIBRATION_SINGLE_PULSE
                if (completeSoundUri != null) {
                    setSound(completeSoundUri, audioAttributes)
                }
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(completeChannel)
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
    fun scheduleTeardown(context: Context, timeoutAtMillis: Long, sessionId: String = "", title: String = "") {
        if (timeoutAtMillis <= System.currentTimeMillis()) return
        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "ACTION_SESSION_TEARDOWN"
            putExtra("sessionId", sessionId)
            putExtra("title", title)
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

    /** Schedule automatic dismissal of the reminder notification when session starts. */
    fun scheduleReminderTeardown(context: Context, id: Int, timeoutAtMillis: Long) {
        if (timeoutAtMillis <= System.currentTimeMillis()) {
            cancel(context, id)
            return
        }
        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "ACTION_REMINDER_TEARDOWN"
            putExtra("id", id)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, id + 40000, intent,
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
     * Formats notification titles so that the session name is in bold.
     * Handles both HTML-tagged strings (e.g. <b>...</b>) and standard patterns:
     * - "<session_name> is running" -> bold session name
     * - "<session_name> is scheduled at <time>" -> bold session name
     */
    fun formatTitle(rawTitle: String): CharSequence {
        if (rawTitle.isEmpty()) return rawTitle

        if (rawTitle.contains("<b>") || rawTitle.contains("</b>")) {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Html.fromHtml(rawTitle, Html.FROM_HTML_MODE_LEGACY)
            } else {
                @Suppress("DEPRECATION")
                Html.fromHtml(rawTitle)
            }
        }

        val runningSuffix = " is running"
        val scheduledInfix = " is scheduled at "

        return when {
            rawTitle.endsWith(runningSuffix) -> {
                val sessionName = rawTitle.removeSuffix(runningSuffix)
                val ssb = SpannableStringBuilder()
                ssb.append(sessionName)
                ssb.setSpan(
                    StyleSpan(Typeface.BOLD),
                    0,
                    sessionName.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                ssb.append(runningSuffix)
                ssb
            }
            rawTitle.contains(scheduledInfix) -> {
                val parts = rawTitle.split(scheduledInfix, limit = 2)
                val sessionName = parts[0]
                val ssb = SpannableStringBuilder()
                ssb.append(sessionName)
                ssb.setSpan(
                    StyleSpan(Typeface.BOLD),
                    0,
                    sessionName.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                ssb.append(scheduledInfix).append(parts[1])
                ssb
            }
            else -> {
                val ssb = SpannableStringBuilder()
                ssb.append(rawTitle)
                ssb.setSpan(
                    StyleSpan(Typeface.BOLD),
                    0,
                    rawTitle.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                ssb
            }
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
    private fun bindChronometer(views: RemoteViews, targetAtMillis: Long, isPaused: Boolean = false) {
        val diff = (targetAtMillis - System.currentTimeMillis()).coerceAtLeast(0L)
        val base = SystemClock.elapsedRealtime() + diff
        views.setChronometer(R.id.notif_chronometer, base, null, !isPaused)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometerCountDown(R.id.notif_chronometer, true)
        }
    }

    private fun skipSessionPendingIntent(context: Context, sessionId: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, SessionAlarmReceiver::class.java).apply {
            action = "ACTION_SESSION_SKIP"
            putExtra("id", requestCode)
            putExtra("sessionId", sessionId)
        }
        return PendingIntent.getBroadcast(
            context, requestCode + 30000, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun sessionActionIntent(context: Context, sessionId: String, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("focussive://session/$sessionId?action=$action")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Build the large, card-like expanded layout with the live countdown. */
    private fun buildExpandedView(
        context: Context,
        id: Int,
        sessionId: String,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
        violationsText: String?,
        isOnBreak: Boolean = false,
        remainingBreakSeconds: Int = 0,
        allowBreaks: Boolean = true,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_active else R.layout.notification_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, formatTitle(title))
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis, isPaused = isOnBreak)

        if (isActive) {
            val skipIntent = sessionActionIntent(context, sessionId, "skip", id + 100)
            views.setOnClickPendingIntent(R.id.notif_skip_btn, skipIntent)

            val hasBreakBalance = allowBreaks && remainingBreakSeconds > 0
            if (isOnBreak) {
                views.setTextViewText(R.id.notif_label, "Break ongoing (timer paused)")
                views.setTextViewText(R.id.notif_break_btn, "On break")
                views.setTextColor(R.id.notif_break_btn, Color.parseColor("#80FFFFFF"))
                views.setInt(R.id.notif_break_btn, "setBackgroundResource", R.drawable.notif_btn_disabled)
                views.setOnClickPendingIntent(R.id.notif_break_btn, null)
            } else if (!hasBreakBalance) {
                views.setTextViewText(R.id.notif_label, "Remaining time")
                views.setTextViewText(R.id.notif_break_btn, "Take a break")
                views.setTextColor(R.id.notif_break_btn, Color.parseColor("#80FFFFFF"))
                views.setInt(R.id.notif_break_btn, "setBackgroundResource", R.drawable.notif_btn_disabled)
                views.setOnClickPendingIntent(R.id.notif_break_btn, null)
            } else {
                views.setTextViewText(R.id.notif_label, "Remaining time")
                views.setTextViewText(R.id.notif_break_btn, "Take a break")
                views.setTextColor(R.id.notif_break_btn, Color.WHITE)
                views.setInt(R.id.notif_break_btn, "setBackgroundResource", R.drawable.notif_active_break_bg)
                val breakIntent = sessionActionIntent(context, sessionId, "break", id + 200)
                views.setOnClickPendingIntent(R.id.notif_break_btn, breakIntent)
            }
        } else {
            val skipIntent = skipSessionPendingIntent(context, sessionId, id)
            views.setOnClickPendingIntent(R.id.notif_skip_btn, skipIntent)
        }
        return views
    }

    /** Collapsed row */
    private fun buildCollapsedView(
        context: Context,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
        isOnBreak: Boolean = false,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_collapsed else R.layout.notification_collapsed_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, formatTitle(title))
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis, isPaused = isOnBreak)
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
        isOnBreak: Boolean = false,
        remainingBreakSeconds: Int = 0,
        allowBreaks: Boolean = true,
    ): Notification {
        ensureChannels(context)
        val channel = if (isActive) CHANNEL_ACTIVE else CHANNEL_REMINDER
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, channel)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }

        val surfaceColor = if (isActive) COLOR_SURFACE_ACTIVE else COLOR_SURFACE_REMINDER

        builder
            .setContentTitle(formatTitle(title))
            .setContentText(body)
            .setSmallIcon(getSmallIconResId(context))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setWhen(targetAtMillis)
            .setShowWhen(true)
            .setColor(surfaceColor)
            .setColorized(true)
            .setContentIntent(openSessionIntent(context, sessionId, id))

        // Eliminate Android 12+ foreground notification appearance delay
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(
                Notification.FOREGROUND_SERVICE_IMMEDIATE
            )
        }

        // Android 12+: OS can force-dismiss foreground service notifications.
        // Attach a delete intent so we can immediately repost when this happens.
        if (isActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val dismissIntent = Intent(context, NotificationDismissReceiver::class.java).apply {
                action = "ACTION_ACTIVE_NOTIFICATION_DISMISSED"
                putExtra("sessionId", sessionId)
                putExtra("notifId", id)
            }
            val dismissPendingIntent = PendingIntent.getBroadcast(
                context,
                id + 50000,
                dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.setDeleteIntent(dismissPendingIntent)
        }

        // Fully custom views so our custom surface fills the notification body edge-to-edge
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setPriority(Notification.PRIORITY_HIGH)
            builder.setCustomContentView(buildCollapsedView(context, title, targetAtMillis, isActive, isOnBreak))
            builder.setCustomBigContentView(buildExpandedView(context, id, sessionId, title, targetAtMillis, isActive, violationsText, isOnBreak, remainingBreakSeconds, allowBreaks))
        }

        val soundName = if (isActive) SOUND_ACTIVE else SOUND_REMINDER
        val soundUri = getSoundUri(context, soundName)
        if (soundUri != null) {
            @Suppress("DEPRECATION")
            builder.setSound(soundUri)
        }
        @Suppress("DEPRECATION")
        builder.setVibrate(if (isActive) VIBRATION_SINGLE_PULSE else VIBRATION_REMINDER)

        val timeoutMs = timeoutAtMillis - System.currentTimeMillis()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && timeoutMs > 0) {
            builder.setTimeoutAfter(timeoutMs)
        }

        val notification = builder.build()
        // Lock notification so it cannot be dismissed or cleared for both running and upcoming reminder
        if (isActive) {
            notification.flags = notification.flags or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
        } else {
            notification.flags = notification.flags or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
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
        isOnBreak: Boolean? = null,
        remainingBreakSeconds: Int? = null,
        allowBreaks: Boolean? = null,
    ) {
        val service = AppBlockerService.instance
        val effectiveIsOnBreak = isOnBreak ?: (service?.isBreakActive() ?: false)
        val serviceBreakSec = service?.getRemainingBreakSeconds()
        val effectiveAllowBreaks = allowBreaks ?: (service?.getAllowBreaks() ?: true)
        val effectiveRemainingBreak = if (remainingBreakSeconds != null && remainingBreakSeconds > 0) {
            remainingBreakSeconds
        } else if (serviceBreakSec != null && serviceBreakSec > 0) {
            serviceBreakSec
        } else if (remainingBreakSeconds != null && remainingBreakSeconds >= 0) {
            remainingBreakSeconds
        } else if (effectiveAllowBreaks) {
            300
        } else {
            0
        }

        val targetId = if (isActive) ACTIVE_NOTIFICATION_ID else id
        val notification = buildNotification(
            context, targetId, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive, violationsText,
            isOnBreak = effectiveIsOnBreak,
            remainingBreakSeconds = effectiveRemainingBreak,
            allowBreaks = effectiveAllowBreaks
        )
        if (isActive) {
            latestActiveNotification = notification
        } else {
            latestReminderNotification = notification
        }

        if (isActive) {
            // Dismiss reminder notifications immediately when session is active
            cancelAllReminders(context)

            // Schedule teardown when session finishes so notification disappears
            if (timeoutAtMillis > System.currentTimeMillis()) {
                scheduleTeardown(context, timeoutAtMillis, sessionId, title)
            }

            latestActiveNotification = notification
            val service = AppBlockerService.instance
            if (service != null) {
                // If service is running, synchronize break state, target time, and foreground notification directly!
                service.syncBreakState(
                    isOnBreak = effectiveIsOnBreak,
                    newTargetAtMillis = targetAtMillis,
                    remainingBreakSec = effectiveRemainingBreak,
                    allowBreaksParam = effectiveAllowBreaks
                )
                return
            }
        } else {
            // Schedule teardown when session start time is reached so reminder never stays past start time
            if (timeoutAtMillis > System.currentTimeMillis()) {
                scheduleReminderTeardown(context, targetId, timeoutAtMillis)
            }
            val service = AppBlockerService.instance
            if (service != null) {
                service.startForeground(targetId, notification)
                return
            }
        }

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(targetId, notification)
    }

    /** Post session-completed notification with 1 short pulse and focustone_3 sound. */
    fun postCompleted(context: Context, sessionId: String, sessionTitle: String) {
        val now = System.currentTimeMillis()
        if (sessionId.isNotEmpty() && sessionId == lastCompletedSessionId && (now - lastCompletedTimestamp) < 10000L) {
            return
        }
        lastCompletedSessionId = sessionId
        lastCompletedTimestamp = now

        ensureChannels(context)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_COMPLETE)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }

        val cleanTitle = sessionTitle.replace(Regex(" is running$", RegexOption.IGNORE_CASE), "")
        val displayTitle = if (cleanTitle.isNotBlank()) {
            formatTitle("<b>$cleanTitle</b> completed")
        } else {
            "Session completed"
        }

        builder
            .setContentTitle(displayTitle)
            .setContentText("Great job! Your focus session has ended.")
            .setSmallIcon(getSmallIconResId(context))
            .setAutoCancel(true)
            .setOngoing(false)
            .setShowWhen(true)
            .setWhen(now)
            .setColor(COLOR_SURFACE_ACTIVE)
            .setContentIntent(openSessionIntent(context, sessionId, COMPLETED_NOTIFICATION_ID))

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setPriority(Notification.PRIORITY_HIGH)
        }

        val soundUri = getSoundUri(context, SOUND_COMPLETE)
        if (soundUri != null) {
            @Suppress("DEPRECATION")
            builder.setSound(soundUri)
        }
        @Suppress("DEPRECATION")
        builder.setVibrate(VIBRATION_SINGLE_PULSE)

        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(COMPLETED_NOTIFICATION_ID, builder.build())
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
        allowBreaks: Boolean = true,
        remainingBreakSeconds: Int = 0,
    ) {
        val now = System.currentTimeMillis()

        // Already due (or nearly so) — post right away instead of dropping it.
        if (fireAtMillis <= now + 1000) {
            post(
                context, id, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive,
                violationsText, allowBreaks = allowBreaks, remainingBreakSeconds = remainingBreakSeconds
            )
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
            putExtra("allowBreaks", allowBreaks)
            putExtra("remainingBreakSeconds", remainingBreakSeconds)
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
            try {
                val teardownIntent = Intent(context, SessionAlarmReceiver::class.java).apply {
                    action = "ACTION_SESSION_TEARDOWN"
                }
                val teardownPending = PendingIntent.getBroadcast(
                    context, 99999, teardownIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                alarmManager.cancel(teardownPending)
                teardownPending.cancel()
            } catch (_: Exception) {}
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        manager?.cancel(id)
    }
}
