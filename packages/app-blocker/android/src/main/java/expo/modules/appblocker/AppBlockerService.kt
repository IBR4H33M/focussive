package expo.modules.appblocker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
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

    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!isMonitoring) return
            // If session time elapsed, stop foreground service and clear ongoing notification
            if (currentTargetMillis > 0L && System.currentTimeMillis() >= currentTargetMillis) {
                Log.d("AppBlocker", "Session time elapsed; dismissing active notification and stopping service")
                isMonitoring = false
                stopForeground(true)
                SessionNotifications.cancel(this@AppBlockerService, SessionNotifications.ACTIVE_NOTIFICATION_ID)
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
        when (intent?.action) {
            "UPDATE_PACKAGES" -> {
                val pkgs = intent.getStringArrayListExtra("BLOCKED_PACKAGES")
                if (pkgs != null) blockedPackages = pkgs
                allowBreaks = intent.getBooleanExtra("ALLOW_BREAKS", false)
                remainingBreakSeconds = intent.getIntExtra("REMAINING_BREAK_SECONDS", 0)
                return START_NOT_STICKY
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
                return START_NOT_STICKY
            }

            "TAKE_BREAK" -> {
                val packageName = intent.getStringExtra("PACKAGE_NAME")
                val breakMinutes = intent.getIntExtra("BREAK_MINUTES", 1).coerceAtLeast(1)
                Log.d("AppBlocker", "Break started: $breakMinutes min (requested by $packageName)")

                // Deduct break time from remaining budget
                remainingBreakSeconds = (remainingBreakSeconds - breakMinutes * 60).coerceAtLeast(0)
                breakActive = true

                // Cancel any previous break timer
                breakEndRunnable?.let { breakEndHandler?.removeCallbacks(it) }

                val runnable = Runnable {
                    breakActive = false
                    Log.d("AppBlocker", "Break ended")

                    // Broadcast break-ended to JS
                    val broadcast = Intent("com.focussive.app.BREAK_ENDED")
                    LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast)
                }
                breakEndRunnable = runnable
                breakEndHandler?.postDelayed(runnable, breakMinutes * 60 * 1000L)

                // Broadcast break-started to JS (JS will call the API endpoint)
                val broadcast = Intent("com.focussive.app.BREAK_STARTED").apply {
                    putExtra("BREAK_MINUTES", breakMinutes)
                    putExtra("PACKAGE_NAME", packageName)
                }
                LocalBroadcastManager.getInstance(this).sendBroadcast(broadcast)

                return START_NOT_STICKY
            }

            "STOP" -> {
                isMonitoring = false
                handler.removeCallbacks(monitorRunnable)
                stopForeground(true)
                SessionNotifications.cancel(this, SessionNotifications.ACTIVE_NOTIFICATION_ID)
                stopSelf()
                return START_NOT_STICKY
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
                        "", currentTargetMillis, 0L, false
                    )
                startForeground(notifId, notification)
                // In reminder state, app blocker does NOT block apps yet
                isMonitoring = false
                return START_NOT_STICKY
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

                val notification = getForegroundNotification()
                startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)

                if (!isMonitoring) {
                    isMonitoring = true
                    handler.post(monitorRunnable)
                }
                return START_NOT_STICKY
            }

            null, "" -> { /* fall through to start/update */ }
        }

        // Normal start — update blocked packages if provided
        val newBlockedPackages = intent?.getStringArrayListExtra("BLOCKED_PACKAGES")
        if (newBlockedPackages != null) {
            blockedPackages = newBlockedPackages
        }
        allowBreaks = intent?.getBooleanExtra("ALLOW_BREAKS", false) ?: allowBreaks
        remainingBreakSeconds = intent?.getIntExtra("REMAINING_BREAK_SECONDS", 0) ?: remainingBreakSeconds

        val sId = intent?.getStringExtra("SESSION_ID")
        if (sId != null) currentSessionId = sId
        val sName = intent?.getStringExtra("SESSION_NAME")
        if (sName != null) currentSessionName = sName
        val endMs = intent?.getLongExtra("END_AT_MILLIS", 0L) ?: 0L
        if (endMs > 0L) currentTargetMillis = endMs

        val notification = getForegroundNotification()
        startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)

        if (!isMonitoring) {
            isMonitoring = true
            handler.post(monitorRunnable)
        }

        return START_NOT_STICKY
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
        val cached = SessionNotifications.latestActiveNotification
        if (cached != null) return cached

        val sessionName = currentSessionName ?: "Focus Session"
        val sessionId = currentSessionId ?: ""
        val targetMillis = if (currentTargetMillis > System.currentTimeMillis()) {
            currentTargetMillis
        } else {
            System.currentTimeMillis() + 25 * 60 * 1000L
        }

        return SessionNotifications.buildNotification(
            context = this,
            id = SessionNotifications.ACTIVE_NOTIFICATION_ID,
            sessionId = sessionId,
            title = "Session $sessionName is running",
            body = "In progress",
            targetAtMillis = targetMillis,
            timeoutAtMillis = targetMillis,
            isActive = true,
            violationsText = "Monitoring active"
        )
    }

    fun isSessionActive(): Boolean {
        return isMonitoring && currentSessionId != null
    }
}
