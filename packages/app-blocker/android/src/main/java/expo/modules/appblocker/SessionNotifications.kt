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
    private const val CHANNEL_REMINDER = "session-reminder-v4"
    private const val CHANNEL_ACTIVE = "session-active-v4"
    private const val CHANNEL_COMPLETE = "session-complete-v4"

    private const val SOUND_REMINDER = "focustone_1_session_reminder_warm_kalimba"
    private const val SOUND_ACTIVE = "focustone_1_session_reminder_warm_kalimba"
    private const val SOUND_COMPLETE = "focustone_1_session_reminder_warm_kalimba"

    // Reminder: 2 short pulses; Start & End: 1 short pulse
    private val VIBRATION_REMINDER = longArrayOf(0, 150, 100, 150)
    private val VIBRATION_SINGLE_PULSE = longArrayOf(0, 150)

    private val COLOR_REMINDER = Color.parseColor("#F87171") // Light red countdown matching active
    private val COLOR_ACTIVE = Color.parseColor("#2D2E46")   // Dark theme accent (Space Cadet Dark) for time passed

    /** Notification surface colors matching custom layouts */
    private val COLOR_SURFACE_ACTIVE = Color.parseColor("#258F44")
    private val COLOR_SURFACE_REMINDER = Color.parseColor("#FEF3C7")

    @Volatile
    var latestActiveNotification: Notification? = null

    @Volatile
    var latestReminderNotification: Notification? = null

    @Volatile
    var activeBreakFreezeTime: Long? = null

    @Volatile
    private var lastCompletedSessionId: String? = null
    @Volatile
    private var lastCompletedTimestamp: Long = 0L

    fun getSoundUri(context: Context, soundName: String): Uri {
        return Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/$soundName")
    }

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        // Delete legacy channels so new v4 channels with custom sound take effect
        try {
            manager.deleteNotificationChannel("session-reminder")
            manager.deleteNotificationChannel("session-active")
            manager.deleteNotificationChannel("session-reminder-v2")
            manager.deleteNotificationChannel("session-active-v2")
            manager.deleteNotificationChannel("session-complete-v2")
            manager.deleteNotificationChannel("session-reminder-v3")
            manager.deleteNotificationChannel("session-active-v3")
            manager.deleteNotificationChannel("session-complete-v3")
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
     * Wire up Chronometer widgets.
     * When [isActive] is true:
     * - Primary chronometer counts UP showing time passed from [startAtMillis].
     * - Secondary chronometer counts DOWN showing time remaining until [targetAtMillis].
     * When [isActive] is false (reminder):
     * - Primary chronometer counts DOWN to session start.
     */
    private fun bindChronometer(
        views: RemoteViews,
        targetAtMillis: Long,
        isActive: Boolean = false,
        isPaused: Boolean = false,
        startAtMillis: Long = 0L,
        isCollapsed: Boolean = false,
        breakStartedAtMillis: Long = 0L,
    ) {
        if (isActive) {
            val effectiveStart = if (startAtMillis > 0L) startAtMillis else (targetAtMillis - 25 * 60 * 1000L)
            val now = System.currentTimeMillis()

            val freezeTime = if (isPaused) {
                if (breakStartedAtMillis > 0L) {
                    breakStartedAtMillis
                } else {
                    activeBreakFreezeTime ?: now.also { activeBreakFreezeTime = it }
                }
            } else {
                activeBreakFreezeTime = null
                now
            }

            val elapsedMillis = (freezeTime - effectiveStart).coerceAtLeast(0L)
            val elapsedBase = SystemClock.elapsedRealtime() - elapsedMillis
            views.setChronometer(R.id.notif_chronometer, elapsedBase, null, !isPaused)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                views.setChronometerCountDown(R.id.notif_chronometer, false)
            }

            val diff = (targetAtMillis - now).coerceAtLeast(0L)
            val remainingBase = SystemClock.elapsedRealtime() + diff
            val remFormat = if (isCollapsed) "%s rem" else "%s remaining"
            try {
                views.setViewVisibility(R.id.notif_remaining_chronometer, android.view.View.VISIBLE)
                views.setChronometer(R.id.notif_remaining_chronometer, remainingBase, remFormat, !isPaused)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    views.setChronometerCountDown(R.id.notif_remaining_chronometer, true)
                }
            } catch (_: Exception) {}
        } else {
            val diff = (targetAtMillis - System.currentTimeMillis()).coerceAtLeast(0L)
            val base = SystemClock.elapsedRealtime() + diff
            views.setChronometer(R.id.notif_chronometer, base, null, !isPaused)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                views.setChronometerCountDown(R.id.notif_chronometer, true)
            }
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

    /** Build the large, card-like expanded layout with live time passed + remaining. */
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
        startAtMillis: Long = 0L,
        breakStartedAtMillis: Long = 0L,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_active else R.layout.notification_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, formatTitle(title))
        if (isActive) {
            views.setTextViewText(R.id.notif_label, if (isOnBreak) "Break ongoing (timer paused)" else "Time passed")
        }
        bindChronometer(views, targetAtMillis, isActive = isActive, isPaused = isOnBreak, startAtMillis = startAtMillis, isCollapsed = false, breakStartedAtMillis = breakStartedAtMillis)
        return views
    }

    /** Collapsed row */
    private fun buildCollapsedView(
        context: Context,
        title: String,
        targetAtMillis: Long,
        isActive: Boolean,
        isOnBreak: Boolean = false,
        startAtMillis: Long = 0L,
        breakStartedAtMillis: Long = 0L,
    ): RemoteViews {
        val layout = if (isActive) R.layout.notification_collapsed else R.layout.notification_collapsed_reminder
        val views = RemoteViews(context.packageName, layout)
        views.setTextViewText(R.id.notif_title, formatTitle(title))
        views.setTextColor(R.id.notif_chronometer, if (isActive) COLOR_ACTIVE else COLOR_REMINDER)
        bindChronometer(views, targetAtMillis, isActive = isActive, isPaused = isOnBreak, startAtMillis = startAtMillis, isCollapsed = true, breakStartedAtMillis = breakStartedAtMillis)
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
        startAtMillis: Long = 0L,
        breakStartedAtMillis: Long = 0L,
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
            .setContentTitle(formatTitle(title))
            .setContentText(body)
            .setSmallIcon(getSmallIconResId(context))
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setWhen(targetAtMillis)
            .setShowWhen(true)
            .setColor(Color.parseColor("#18B864"))
            .setContentIntent(openSessionIntent(context, sessionId, id))

        // Native system action buttons (matching Duolingo / Messenger system buttons)
        if (isActive) {
            val skipIntent = sessionActionIntent(context, sessionId, "skip", id + 100)
            builder.addAction(
                Notification.Action.Builder(0, "Skip session", skipIntent).build()
            )

            val hasBreakBalance = allowBreaks && remainingBreakSeconds > 0
            if (!isOnBreak && hasBreakBalance) {
                val breakIntent = sessionActionIntent(context, sessionId, "break", id + 200)
                builder.addAction(
                    Notification.Action.Builder(0, "Take a break", breakIntent).build()
                )
            }
        } else {
            val skipIntent = skipSessionPendingIntent(context, sessionId, id)
            builder.addAction(
                Notification.Action.Builder(0, "Skip this session", skipIntent).build()
            )
        }

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
            builder.setCustomContentView(buildCollapsedView(context, title, targetAtMillis, isActive, isOnBreak, startAtMillis, breakStartedAtMillis))
            builder.setCustomBigContentView(buildExpandedView(context, id, sessionId, title, targetAtMillis, isActive, violationsText, isOnBreak, remainingBreakSeconds, allowBreaks, startAtMillis, breakStartedAtMillis))
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
        startAtMillis: Long = 0L,
        breakStartedAtMillis: Long = 0L,
    ) {
        val service = AppBlockerService.instance
        val effectiveIsOnBreak = isOnBreak ?: (service?.isBreakActive() ?: false)
        val serviceBreakSec = service?.getRemainingBreakSeconds()
        val effectiveAllowBreaks = allowBreaks ?: (service?.getAllowBreaks() ?: true)
        val effectiveRemainingBreak = when {
            remainingBreakSeconds != null -> remainingBreakSeconds
            serviceBreakSec != null -> serviceBreakSec
            effectiveAllowBreaks -> 300
            else -> 0
        }

        val targetId = if (isActive) ACTIVE_NOTIFICATION_ID else id
        val notification = buildNotification(
            context, targetId, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive, violationsText,
            isOnBreak = effectiveIsOnBreak,
            remainingBreakSeconds = effectiveRemainingBreak,
            allowBreaks = effectiveAllowBreaks,
            startAtMillis = startAtMillis,
            breakStartedAtMillis = breakStartedAtMillis
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
                    allowBreaksParam = effectiveAllowBreaks,
                    breakStartedAt = breakStartedAtMillis
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
        activeBreakFreezeTime = null
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

        val cleanTitle = sessionTitle.replace(Regex(" is running$", RegexOption.IGNORE_CASE), "").trim()
        val displayTitle = if (cleanTitle.isNotBlank()) {
            formatTitle("<b>$cleanTitle</b> completed")
        } else {
            "Session completed"
        }

        val contentText = if (cleanTitle.isNotBlank()) {
            "Great job! your session $cleanTitle has ended."
        } else {
            "Great job! your session has ended."
        }

        builder
            .setContentTitle(displayTitle)
            .setContentText(contentText)
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
        startAtMillis: Long = 0L,
    ) {
        val now = System.currentTimeMillis()

        // Already due (or nearly so) — post right away instead of dropping it.
        if (fireAtMillis <= now + 1000) {
            post(
                context, id, sessionId, title, body, targetAtMillis, timeoutAtMillis, isActive,
                violationsText, allowBreaks = allowBreaks, remainingBreakSeconds = remainingBreakSeconds,
                startAtMillis = startAtMillis
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
            putExtra("startAtMillis", if (startAtMillis > 0L) startAtMillis else fireAtMillis)
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
            activeBreakFreezeTime = null
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
