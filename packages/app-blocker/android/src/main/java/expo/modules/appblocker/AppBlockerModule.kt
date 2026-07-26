package expo.modules.appblocker

import android.app.AlarmManager
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppBlockerModule : Module() {
  private var violationReceiver: android.content.BroadcastReceiver? = null
  private var breakStartedReceiver: android.content.BroadcastReceiver? = null
  private var breakEndedReceiver: android.content.BroadcastReceiver? = null

  private fun registerReceivers(context: Context) {
    // Violation receiver
    if (violationReceiver == null) {
      violationReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action == "com.focussive.app.VIOLATION") {
            val packageName = intent.getStringExtra("PACKAGE_NAME")
            if (packageName != null) {
              sendEvent("onAppViolation", mapOf(
                "packageName" to packageName,
                "allowMinutes" to intent.getIntExtra("ALLOW_MINUTES", 5),
              ))
            }
          }
        }
      }
      LocalBroadcastManager.getInstance(context).registerReceiver(
        violationReceiver!!,
        android.content.IntentFilter("com.focussive.app.VIOLATION")
      )
    }

    // Break started receiver
    if (breakStartedReceiver == null) {
      breakStartedReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action == "com.focussive.app.BREAK_STARTED") {
            sendEvent("onBreakStarted", mapOf(
              "breakMinutes" to intent.getIntExtra("BREAK_MINUTES", 1),
              "packageName" to (intent.getStringExtra("PACKAGE_NAME") ?: ""),
            ))
          }
        }
      }
      LocalBroadcastManager.getInstance(context).registerReceiver(
        breakStartedReceiver!!,
        android.content.IntentFilter("com.focussive.app.BREAK_STARTED")
      )
    }

    // Break ended receiver
    if (breakEndedReceiver == null) {
      breakEndedReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action == "com.focussive.app.BREAK_ENDED") {
            sendEvent("onBreakEnded", mapOf<String, Any>())
          }
        }
      }
      LocalBroadcastManager.getInstance(context).registerReceiver(
        breakEndedReceiver!!,
        android.content.IntentFilter("com.focussive.app.BREAK_ENDED")
      )
    }
  }

  private fun unregisterReceivers(context: Context) {
    listOf(violationReceiver, breakStartedReceiver, breakEndedReceiver).forEach { receiver ->
      receiver?.let {
        try { LocalBroadcastManager.getInstance(context).unregisterReceiver(it) } catch (_: Exception) {}
      }
    }
    violationReceiver = null
    breakStartedReceiver = null
    breakEndedReceiver = null
  }

  override fun definition() = ModuleDefinition {
    Name("AppBlocker")

    Events("onAppViolation", "onBreakStarted", "onBreakEnded")

    /**
     * Start monitoring.
     * @param blockedPackages   List of package name strings to block.
     * @param allowBreaks       Whether the current session allows breaks.
     * @param remainingBreakSec Remaining break seconds (passed to overlay).
     */
    Function("startMonitoring") { blockedPackages: List<String>, allowBreaks: Boolean?, remainingBreakSec: Int? ->
      val context = appContext.reactContext ?: return@Function null

      registerReceivers(context)

      val intent = Intent(context, AppBlockerService::class.java).apply {
        putStringArrayListExtra("BLOCKED_PACKAGES", ArrayList(blockedPackages))
        putExtra("ALLOW_BREAKS", allowBreaks ?: false)
        putExtra("REMAINING_BREAK_SECONDS", remainingBreakSec ?: 0)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      return@Function null
    }

    Function("stopMonitoring") {
      val context = appContext.reactContext ?: return@Function null
      unregisterReceivers(context)
      val intent = Intent(context, AppBlockerService::class.java)
      context.stopService(intent)
      return@Function null
    }

    Function("updateBlockedApps") { blockedPackages: List<String> ->
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(context, AppBlockerService::class.java).apply {
        putStringArrayListExtra("BLOCKED_PACKAGES", ArrayList(blockedPackages))
        action = "UPDATE_PACKAGES"
      }
      context.startService(intent)
      return@Function null
    }

    Function("requestUsageStatsPermission") {
      val context = appContext.reactContext ?: return@Function null
      try {
        val intent = Intent(
          Settings.ACTION_USAGE_ACCESS_SETTINGS,
          android.net.Uri.parse("package:" + context.packageName)
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
      } catch (_: Exception) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
      return@Function null
    }

    Function("requestOverlayPermission") {
      val context = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        try {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:" + context.packageName)
          ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
          context.startActivity(intent)
        } catch (_: Exception) {
          val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
        }
      }
      return@Function null
    }

    AsyncFunction("hasUsageStatsPermission") { ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      return@AsyncFunction hasUsageStatsPermission(context)
    }

    AsyncFunction("hasOverlayPermission") { ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      return@AsyncFunction if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
    }

    AsyncFunction("hasRequiredPermissions") { ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val hasUsageStats = hasUsageStatsPermission(context)
      val hasOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
      return@AsyncFunction hasUsageStats && hasOverlay
    }

    // ── Live session notifications (reminder + running countdown) ──────────

    /**
     * Schedule a grey, non-dismissible "session starts soon" notification with
     * a native chronometer counting down to `targetAtMillis`. Fires via
     * AlarmManager at `fireAtMillis` — works even if the app has been killed.
     * Calling again with the same `id` idempotently replaces the pending alarm.
     */
    Function("scheduleReminderNotification") {
        id: Int, sessionId: String, title: String, body: String,
        targetAtMillis: Double, timeoutAtMillis: Double, fireAtMillis: Double ->
      val context = appContext.reactContext ?: return@Function null
      SessionNotifications.schedule(
        context, id, sessionId, title, body,
        targetAtMillis.toLong(), timeoutAtMillis.toLong(), fireAtMillis.toLong(), isActive = false,
      )
      return@Function null
    }

    /**
     * Schedule a green, non-dismissible "session running" notification with a
     * native chronometer counting down to `targetAtMillis` (the session end).
     */
    Function("scheduleActiveNotification") {
        id: Int, sessionId: String, title: String, body: String,
        targetAtMillis: Double, timeoutAtMillis: Double, fireAtMillis: Double, violationsText: String? ->
      val context = appContext.reactContext ?: return@Function null
      SessionNotifications.schedule(
        context, id, sessionId, title, body,
        targetAtMillis.toLong(), timeoutAtMillis.toLong(), fireAtMillis.toLong(), isActive = true,
        violationsText = violationsText,
      )
      return@Function null
    }

    /** Silently refresh an already-posted running notification (e.g. new violation count). */
    Function("updateActiveNotification") {
        id: Int, sessionId: String, title: String, body: String,
        targetAtMillis: Double, timeoutAtMillis: Double, violationsText: String? ->
      val context = appContext.reactContext ?: return@Function null
      SessionNotifications.post(
        context, id, sessionId, title, body,
        targetAtMillis.toLong(), timeoutAtMillis.toLong(), isActive = true,
        violationsText = violationsText,
      )
      return@Function null
    }

    /** Cancel a pending alarm and/or dismiss a live session notification by id. */
    Function("cancelSessionNotification") { id: Int ->
      val context = appContext.reactContext ?: return@Function null
      SessionNotifications.cancel(context, id)
      return@Function null
    }

    AsyncFunction("hasExactAlarmPermission") { ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return@AsyncFunction alarmManager.canScheduleExactAlarms()
      }
      return@AsyncFunction true
    }

    Function("requestExactAlarmPermission") {
      val context = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try {
          val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
            data = android.net.Uri.parse("package:" + context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
        } catch (_: Exception) {
          // Some OEMs/emulators lack this settings screen — ignore.
        }
      }
      return@Function null
    }
  }

  private fun hasUsageStatsPermission(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
