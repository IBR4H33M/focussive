package expo.modules.appblocker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager

class AppBlockerService : Service() {
    companion object {
        @Volatile
        var instance: AppBlockerService? = null
    }

    private var blockedPackages: List<String> = emptyList()
    /** package → allow-until timestamp in ms */
    private val temporarilyAllowed = mutableMapOf<String, Long>()
    /** True while a break is active — skip all violation detection */
    private var breakActive = false
    private var breakEndsAtMillis: Long = 0L
    private var breakEndHandler: Handler? = null
    private var breakEndRunnable: Runnable? = null

    private val handler = Handler(Looper.getMainLooper())
    private var isMonitoring = false
    private lateinit var usageStatsManager: UsageStatsManager

    // Break / session info passed by JS via startMonitoring
    private var allowBreaks = false
    private var remainingBreakSeconds = 0
    private var currentSessionId: String? = null
    private var currentSessionName: String? = null
    private var currentTargetMillis: Long = 0L

    fun isBreakActive(): Boolean = breakActive
    fun getRemainingBreakSeconds(): Int = remainingBreakSeconds
    fun getAllowBreaks(): Boolean = allowBreaks

    /**
     * Synchronize break status and target end time from active session updates
     * (e.g. breaks started from the browser extension or mobile UI).
     */
    fun syncBreakState(
        isOnBreak: Boolean,
        newTargetAtMillis: Long? = null,
        remainingBreakSec: Int? = null,
        allowBreaksParam: Boolean? = null
    ) {
        this.breakActive = isOnBreak
        if (newTargetAtMillis != null && newTargetAtMillis > 0L) {
            this.currentTargetMillis = newTargetAtMillis
            getSharedPreferences("focussive_session", Context.MODE_PRIVATE)
                .edit()
                .putLong("active_session_end", newTargetAtMillis)
                .apply()
        }
        if (remainingBreakSec != null && remainingBreakSec >= 0) {
            this.remainingBreakSeconds = remainingBreakSec
        }
        if (allowBreaksParam != null) {
            this.allowBreaks = allowBreaksParam
        }
        updateActiveNotification()
    }

    fun updateActiveNotification() {
        val rawName = currentSessionName ?: "Focus"
        val titleText = if (rawName.endsWith(" is running")) rawName else "$rawName is running"
        val sessionId = currentSessionId ?: ""
        val targetMillis = if (currentTargetMillis > System.currentTimeMillis()) {
            currentTargetMillis
        } else {
            val savedEnd = getSharedPreferences("focussive_session", Context.MODE_PRIVATE).getLong("active_session_end", 0L)
            if (savedEnd > System.currentTimeMillis()) {
                savedEnd
            } else {
                System.currentTimeMillis() + 25 * 60 * 1000L
            }
        }

        val notif = SessionNotifications.buildNotification(
            context = this,
            id = SessionNotifications.ACTIVE_NOTIFICATION_ID,
            sessionId = sessionId,
            title = titleText,
            body = if (breakActive) "On break" else "In progress",
            targetAtMillis = targetMillis,
            timeoutAtMillis = targetMillis,
            isActive = true,
            violationsText = if (breakActive) "Break active" else "Monitoring active",
            isOnBreak = breakActive,
            remainingBreakSeconds = remainingBreakSeconds,
            allowBreaks = allowBreaks
        )
        SessionNotifications.latestActiveNotification = notif
        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(SessionNotifications.ACTIVE_NOTIFICATION_ID, notif)
    }

    private fun endBreakInternal() {
        if (!breakActive && breakEndsAtMillis == 0L) return
        breakActive = false
        breakEndsAtMillis = 0L
        breakEndRunnable?.let { breakEndHandler?.removeCallbacks(it) }
        breakEndRunnable = null
        Log.d("AppBlocker", "Break ended; re-enforcing blocking immediately")

        // Update notification: unpause timer & re-evaluate break button
        updateActiveNotification()

        // Check foreground app immediately! If user is in a blocked app, overlay appears instantly!
        checkForegroundApp()

        // Broadcast break-ended to JS
        val broadcast = Intent("com.focussive.app.BREAK_ENDED")
        LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast)
    }

    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!isMonitoring) return
            val now = System.currentTimeMillis()

            // If a break is active, check if its time has expired!
            if (breakActive && breakEndsAtMillis > 0L && now >= breakEndsAtMillis) {
                endBreakInternal()
            }

            // If session time elapsed, stop foreground service, post completed, and clear ongoing notification
            if (currentTargetMillis > 0L && now >= currentTargetMillis) {
                Log.d("AppBlocker", "Session time elapsed; dismissing active notification and stopping service")
                val sId = currentSessionId ?: ""
                val sName = currentSessionName ?: ""
                clearSavedSession()
                isMonitoring = false
                stopForeground(true)
                SessionNotifications.cancel(this@AppBlockerService, SessionNotifications.ACTIVE_NOTIFICATION_ID)
                SessionNotifications.postCompleted(this@AppBlockerService, sId, sName)
                stopSelf()
                return
            }
            if (!breakActive) {
                checkForegroundApp()
            }
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        // Remove old legacy notification channel if present
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.deleteNotificationChannel("AppBlockerService")
        }
        breakEndHandler = Handler(Looper.getMainLooper())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            restoreSessionStateIfNeeded()
            return START_STICKY
        }

        when (intent.action) {
            "UPDATE_PACKAGES" -> {
                val pkgs = intent.getStringArrayListExtra("BLOCKED_PACKAGES")
                if (pkgs != null) blockedPackages = pkgs
                allowBreaks = intent.getBooleanExtra("ALLOW_BREAKS", false)
                remainingBreakSeconds = intent.getIntExtra("REMAINING_BREAK_SECONDS", 0)
                updateActiveNotification()
                return START_STICKY
            }

            "ALLOW_APP" -> {
                val packageName = intent.getStringExtra("PACKAGE_NAME")
                val allowMinutes = intent.getIntExtra("ALLOW_MINUTES", 5).coerceIn(1, 5)
                if (packageName != null) {
                    temporarilyAllowed[packageName] = System.currentTimeMillis() + allowMinutes * 60 * 1000L
                    Log.d("AppBlocker", "Temporarily allowed: $packageName for $allowMinutes min")

                    // Broadcast violation to JS
                    val broadcast = Intent("com.focussive.app.VIOLATION").apply {
                        putExtra("PACKAGE_NAME", packageName)
                        putExtra("ALLOW_MINUTES", allowMinutes)
                    }
                    LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast)
                }
                return START_STICKY
            }

            "TAKE_BREAK" -> {
                val packageName = intent.getStringExtra("PACKAGE_NAME")
                val breakMinutes = intent.getIntExtra("BREAK_MINUTES", 1).coerceAtLeast(1)
                val breakMs = breakMinutes * 60 * 1000L
                Log.d("AppBlocker", "Break started: $breakMinutes min (requested by $packageName)")

                // Deduct break time from remaining budget
                remainingBreakSeconds = (remainingBreakSeconds - breakMinutes * 60).coerceAtLeast(0)
                breakActive = true
                breakEndsAtMillis = System.currentTimeMillis() + breakMs
                if (currentTargetMillis > 0L) {
                    currentTargetMillis += breakMs
                }

                // Update notification immediately: pause timer & grey out break button
                updateActiveNotification()

                // Cancel any previous break timer
                breakEndRunnable?.let { breakEndHandler?.removeCallbacks(it) }

                val runnable = Runnable {
                    endBreakInternal()
                }
                breakEndRunnable = runnable
                breakEndHandler?.postDelayed(runnable, breakMs)

                // Broadcast break-started to JS (JS will call the API endpoint)
                val broadcast = Intent("com.focussive.app.BREAK_STARTED").apply {
                    putExtra("BREAK_MINUTES", breakMinutes)
                    putExtra("PACKAGE_NAME", packageName ?: "")
                }
                LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast)

                return START_STICKY
            }

            "STOP" -> {
                clearSavedSession()
                isMonitoring = false
                breakActive = false
                breakEndsAtMillis = 0L
                handler.removeCallbacks(monitorRunnable)
                breakEndRunnable?.let { breakEndHandler?.removeCallbacks(it) }
                stopForeground(true)
                SessionNotifications.cancel(this, SessionNotifications.ACTIVE_NOTIFICATION_ID)
                stopSelf()
                return START_STICKY
            }

            "STOP_REMINDER" -> {
                if (!isMonitoring) {
                    stopForeground(true)
                    SessionNotifications.cancelAllReminders(this)
                    stopSelf()
                }
                return START_STICKY
            }

            "START_REMINDER" -> {
                val notifId = intent.getIntExtra("NOTIF_ID", 2001)
                val sId = intent.getStringExtra("SESSION_ID")
                if (sId != null) currentSessionId = sId
                val sName = intent.getStringExtra("SESSION_NAME")
                if (sName != null) currentSessionName = sName
                val endMs = intent.getLongExtra("END_AT_MILLIS", 0L)
                if (endMs > 0L) currentTargetMillis = endMs

                val notification = SessionNotifications.latestReminderNotification
                    ?: SessionNotifications.buildNotification(
                        this, notifId, currentSessionId ?: "", currentSessionName ?: "Upcoming Session",
                        "", currentTargetMillis, currentTargetMillis, false
                    )
                startForeground(notifId, notification)
                // In reminder state, app blocker does NOT block apps yet
                isMonitoring = false

                // Safety: Automatically teardown reminder if session start time passes
                val delayMs = currentTargetMillis - System.currentTimeMillis()
                if (delayMs > 0) {
                    handler.postDelayed({
                        if (!isMonitoring) {
                            Log.d("AppBlocker", "Reminder time elapsed; dismissing reminder notification")
                            SessionNotifications.cancel(this, notifId)
                            SessionNotifications.cancelAllReminders(this)
                            stopForeground(true)
                            stopSelf()
                        }
                    }, delayMs)
                }
                return START_STICKY
            }

            "START_ACTIVE" -> {
                // Cancel any previous reminder notification
                SessionNotifications.cancelAllReminders(this)
                val sId = intent.getStringExtra("SESSION_ID")
                if (sId != null) currentSessionId = sId
                val sName = intent.getStringExtra("SESSION_NAME")
                if (sName != null) currentSessionName = sName
                val endMs = intent.getLongExtra("END_AT_MILLIS", 0L)
                if (endMs > 0L) currentTargetMillis = endMs
                allowBreaks = intent.getBooleanExtra("ALLOW_BREAKS", true)
                val intentBreakSec = intent.getIntExtra("REMAINING_BREAK_SECONDS", -1)
                remainingBreakSeconds = if (intentBreakSec >= 0) {
                    intentBreakSec
                } else if (allowBreaks) {
                    300
                } else {
                    0
                }

                if (sId != null && sName != null) {
                    saveSessionState(sId, sName, currentTargetMillis)
                }

                val notification = getForegroundNotification()
                startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)

                if (!isMonitoring) {
                    isMonitoring = true
                    handler.post(monitorRunnable)
                }
                return START_STICKY
            }

            null, "" -> { /* fall through to start/update */ }
        }

        // Normal start — update blocked packages if provided
        val newBlockedPackages = intent.getStringArrayListExtra("BLOCKED_PACKAGES")
        if (newBlockedPackages != null) {
            blockedPackages = newBlockedPackages
        }
        allowBreaks = intent.getBooleanExtra("ALLOW_BREAKS", false)
        val defaultStartBreakSec = intent.getIntExtra("REMAINING_BREAK_SECONDS", -1)
        remainingBreakSeconds = if (defaultStartBreakSec >= 0) {
            defaultStartBreakSec
        } else if (allowBreaks) {
            300
        } else {
            0
        }

        val sId = intent.getStringExtra("SESSION_ID")
        if (sId != null) currentSessionId = sId
        val sName = intent.getStringExtra("SESSION_NAME")
        if (sName != null) currentSessionName = sName
        val endMs = intent.getLongExtra("END_AT_MILLIS", 0L)
        if (endMs > 0L) currentTargetMillis = endMs

        if (currentSessionId != null && currentSessionName != null) {
            saveSessionState(currentSessionId!!, currentSessionName!!, currentTargetMillis)
        }

        val notification = getForegroundNotification()
        startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)

        if (!isMonitoring) {
            isMonitoring = true
            handler.post(monitorRunnable)
        }

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)

        // Only schedule restart if a session is genuinely active
        if (!isSessionActive()) return

        val sessionId = currentSessionId ?: return
        val sessionName = currentSessionName ?: return
        val endAtMillis = currentTargetMillis

        val restartIntent = Intent(this, ServiceRestartReceiver::class.java).apply {
            action = "ACTION_RESTART_BLOCKER_SERVICE"
            putExtra("SESSION_ID", sessionId)
            putExtra("SESSION_NAME", sessionName)
            putExtra("END_AT_MILLIS", endAtMillis)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            this,
            99998,
            restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Fire 500ms after kill — fast enough to be nearly imperceptible
        val restartAt = System.currentTimeMillis() + 500

        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                restartAt,
                pendingIntent
            )
        } catch (e: SecurityException) {
            // Exact alarm permission not granted — fall back to inexact
            alarmManager.set(AlarmManager.RTC_WAKEUP, restartAt, pendingIntent)
        }
    }

    override fun onDestroy() {
        instance = null
        isMonitoring = false
        handler.removeCallbacks(monitorRunnable)
        breakEndRunnable?.let { breakEndHandler?.removeCallbacks(it) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun checkForegroundApp() {
        val time = System.currentTimeMillis()
        val events = usageStatsManager.queryEvents(time - 10_000, time)
        val event = UsageEvents.Event()
        var currentPackage: String? = null

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                currentPackage = event.packageName
            }
        }

        if (currentPackage != null && blockedPackages.contains(currentPackage)) {
            val allowedUntil = temporarilyAllowed[currentPackage]
            val now = System.currentTimeMillis()
            if (allowedUntil != null && now < allowedUntil) {
                return // Still in allow window
            }
            if (allowedUntil != null && now >= allowedUntil) {
                temporarilyAllowed.remove(currentPackage)
            }
            Log.d("AppBlocker", "Blocked app detected: $currentPackage")
            showBlockOverlay(currentPackage)
        }
    }

    private fun showBlockOverlay(packageName: String) {
        val intent = Intent(this, BlockOverlayActivity::class.java).apply {
            // FLAG_ACTIVITY_NEW_TASK required to start activity from a Service.
            // Do NOT use CLEAR_TOP — it would clear the blocked app from the stack
            // causing it to close when the overlay finishes.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("BLOCKED_PACKAGE", packageName)
            putExtra("ALLOW_BREAKS", allowBreaks)
            putExtra("REMAINING_BREAK_SECONDS", remainingBreakSeconds)
        }
        startActivity(intent)
    }

    private fun getForegroundNotification(): Notification {
        val rawName = currentSessionName ?: "Focus"
        val titleText = if (rawName.endsWith(" is running")) rawName else "$rawName is running"
        val sessionId = currentSessionId ?: ""
        val targetMillis = if (currentTargetMillis > System.currentTimeMillis()) {
            currentTargetMillis
        } else {
            val savedEnd = getSharedPreferences("focussive_session", Context.MODE_PRIVATE).getLong("active_session_end", 0L)
            if (savedEnd > System.currentTimeMillis()) {
                savedEnd
            } else {
                System.currentTimeMillis() + 25 * 60 * 1000L
            }
        }

        return SessionNotifications.buildNotification(
            context = this,
            id = SessionNotifications.ACTIVE_NOTIFICATION_ID,
            sessionId = sessionId,
            title = titleText,
            body = if (breakActive) "On break" else "In progress",
            targetAtMillis = targetMillis,
            timeoutAtMillis = targetMillis,
            isActive = true,
            violationsText = if (breakActive) "Break active" else "Monitoring active",
            isOnBreak = breakActive,
            remainingBreakSeconds = remainingBreakSeconds,
            allowBreaks = allowBreaks
        )
    }

    private fun saveSessionState(
        sessionId: String,
        sessionName: String,
        endAtMillis: Long
    ) {
        getSharedPreferences("focussive_session", Context.MODE_PRIVATE)
            .edit()
            .putString("active_session_id", sessionId)
            .putString("active_session_name", sessionName)
            .putLong("active_session_end", endAtMillis)
            .putStringSet("blocked_packages", blockedPackages.toSet())
            .putBoolean("allow_breaks", allowBreaks)
            .putInt("remaining_break_seconds", remainingBreakSeconds)
            .apply()
    }

    private fun clearSavedSession(
        prefs: android.content.SharedPreferences? = null
    ) {
        (prefs ?: getSharedPreferences("focussive_session", Context.MODE_PRIVATE))
            .edit()
            .remove("active_session_id")
            .remove("active_session_name")
            .remove("active_session_end")
            .remove("blocked_packages")
            .remove("allow_breaks")
            .remove("remaining_break_seconds")
            .apply()
    }

    private fun restoreSessionStateIfNeeded() {
        val prefs = getSharedPreferences("focussive_session", Context.MODE_PRIVATE)
        val sessionId = prefs.getString("active_session_id", null) ?: return
        val sessionName = prefs.getString("active_session_name", null) ?: return
        val endAtMillis = prefs.getLong("active_session_end", 0L)

        // Do not restore if the session has already expired
        if (endAtMillis > 0 && System.currentTimeMillis() >= endAtMillis) {
            clearSavedSession(prefs)
            return
        }

        // Restore blocked packages from SharedPreferences
        val savedPackages = prefs.getStringSet("blocked_packages", emptySet()) ?: emptySet()
        if (savedPackages.isNotEmpty()) {
            blockedPackages = savedPackages.toList()
        }
        allowBreaks = prefs.getBoolean("allow_breaks", false)
        remainingBreakSeconds = prefs.getInt("remaining_break_seconds", 0)

        // Re-post the active notification and resume blocking
        val restoreIntent = Intent(this, AppBlockerService::class.java).apply {
            action = "START_ACTIVE"
            putExtra("SESSION_ID", sessionId)
            putExtra("SESSION_NAME", sessionName)
            putExtra("END_AT_MILLIS", endAtMillis)
            putExtra("IS_RESTART", true)
            putStringArrayListExtra("BLOCKED_PACKAGES", ArrayList(savedPackages))
            putExtra("ALLOW_BREAKS", allowBreaks)
            putExtra("REMAINING_BREAK_SECONDS", remainingBreakSeconds)
        }
        onStartCommand(restoreIntent, 0, 0)
    }

    fun isSessionActive(): Boolean {
        val hasSession = currentSessionId != null
        val notExpired = currentTargetMillis == 0L || System.currentTimeMillis() < currentTargetMillis
        return hasSession && notExpired
    }
}
