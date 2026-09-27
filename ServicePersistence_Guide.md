# AppBlockerService Persistence Guide
## Keeping Focussive alive after the user swipes it from the recents tray

Read this entire document before touching any code.
There are 6 parts to implement, in order.
Do not change anything not mentioned here.

---

## The Problem

When the user swipes Focussive from the Android recents tray, the active
session notification disappears immediately and blocking stops. This should
not happen during an active session. VPN apps stay alive after being swiped
because they use `VpnService`, which gets system-level OS protection.
Focussive uses a regular foreground service, which does not get that
protection by default.

This guide fixes that using four mechanisms working together:
- `stopWithTask="false"` on the service declaration (most important)
- `START_STICKY` return value from `onStartCommand`
- `onTaskRemoved` + `AlarmManager` restart scheduling
- `SharedPreferences` session state persistence across process death

---

## Part 1 — Fix AndroidManifest.xml

### Location
`packages/app-blocker/android/src/main/AndroidManifest.xml`

### What to change

Find the `<service>` declaration for `AppBlockerService` and update it
to add `android:stopWithTask="false"`. Also add the two new receivers.

#### Service declaration — update existing entry:
```xml
<service
    android:name=".AppBlockerService"
    android:foregroundServiceType="specialUse"
    android:stopWithTask="false"
    android:exported="false"/>
```

The critical attribute is `android:stopWithTask="false"`. By default
this is `true`, meaning the service is stopped when the app task is
removed from recents. Setting it to `false` gives the service an
independent lifecycle from the UI — the same way VPN and media player
services are declared.

#### Add two new receivers inside `<application>` tag:
```xml
<!-- Restarts the blocker service after app is swiped from recents -->
<receiver
    android:name=".ServiceRestartReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="ACTION_RESTART_BLOCKER_SERVICE"/>
    </intent-filter>
</receiver>

<!-- Already exists from NotificationDismissReceiver guide — verify it is present -->
<receiver
    android:name=".NotificationDismissReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="ACTION_ACTIVE_NOTIFICATION_DISMISSED"/>
    </intent-filter>
</receiver>
```

---

## Part 2 — Create `ServiceRestartReceiver.kt`

### Location
Create a new file:
`packages/app-blocker/android/src/main/java/expo/modules/appblocker/ServiceRestartReceiver.kt`

### Full file contents — copy exactly:

```kotlin
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
```

---

## Part 3 — Update `AppBlockerService.kt`

### Location
`packages/app-blocker/android/src/main/java/expo/modules/appblocker/AppBlockerService.kt`

Make the following four additions to this file. Do not change anything
else. Each addition is described with its exact insertion point.

---

### Addition 3A — Return `START_STICKY` from `onStartCommand`

Find the `onStartCommand` method. It currently returns something —
change that return value to `START_STICKY` everywhere a return
statement exists in this method.

```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when {
        // Null intent = service restarted by Android after START_STICKY kill
        intent == null -> {
            restoreSessionStateIfNeeded()
        }

        intent.action == "START_ACTIVE" -> {
            val isRestart = intent.getBooleanExtra("IS_RESTART", false)
            val sessionId = intent.getStringExtra("SESSION_ID")
                ?: return START_STICKY
            val sessionName = intent.getStringExtra("SESSION_NAME")
                ?: return START_STICKY
            val endAtMillis = intent.getLongExtra("END_AT_MILLIS", 0L)

            // Save state immediately so it survives future kills
            saveSessionState(sessionId, sessionName, endAtMillis)

            // Call your existing session start logic here
            // (whatever your current START_ACTIVE handler does — keep it,
            //  just make sure saveSessionState is called at the top)
        }

        intent.action == "STOP" -> {
            clearSavedSession()
            stopSession()   // your existing stop logic
            stopSelf()
        }

        // Keep all other existing action handlers unchanged
    }

    return START_STICKY  // ← always return START_STICKY
}
```

**Important:** Do not remove any existing action handlers. Only add
`restoreSessionStateIfNeeded()` for the null-intent case and
`saveSessionState(...)` at the top of the START_ACTIVE case.
Keep all other existing logic exactly as it is.

---

### Addition 3B — Add `onTaskRemoved` override

Add this method to `AppBlockerService`. If `onTaskRemoved` already
exists in the file, replace it entirely with this version. If it does
not exist, add it after `onStartCommand`:

```kotlin
override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)

    // Only schedule restart if a session is genuinely active
    // isSessionActive() must return true only when a session is running
    if (!isSessionActive()) return

    val sessionId = currentSessionId ?: return
    val sessionName = currentSessionName ?: return
    val endAtMillis = currentSessionEndMillis

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
```

**Note on field names:** `currentSessionId`, `currentSessionName`, and
`currentSessionEndMillis` should match whatever fields you already use
in your service to track the active session. Rename them to match your
actual field names — do not introduce new fields just for this.

---

### Addition 3C — Add session state persistence methods

Add these three private methods to `AppBlockerService`. Place them
near the bottom of the class, before the closing brace:

```kotlin
/**
 * Saves active session info to SharedPreferences so it survives
 * process death and can be restored when the service restarts.
 * Call this at the start of every active session.
 */
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
        .apply()
}

/**
 * Clears the persisted session state.
 * Call this when a session ends normally (teardown, stop, or expiry).
 */
private fun clearSavedSession(
    prefs: android.content.SharedPreferences? = null
) {
    (prefs ?: getSharedPreferences("focussive_session", Context.MODE_PRIVATE))
        .edit()
        .remove("active_session_id")
        .remove("active_session_name")
        .remove("active_session_end")
        .apply()
}

/**
 * Called when the service is restarted by START_STICKY after a kill
 * (onStartCommand receives a null intent in this case).
 * Reads the last known session from SharedPreferences and resumes it
 * if it has not yet expired.
 */
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

    // Re-post the active notification and resume blocking
    // This mirrors what your START_ACTIVE handler does
    val restoreIntent = Intent(this, AppBlockerService::class.java).apply {
        action = "START_ACTIVE"
        putExtra("SESSION_ID", sessionId)
        putExtra("SESSION_NAME", sessionName)
        putExtra("END_AT_MILLIS", endAtMillis)
        putExtra("IS_RESTART", true)
    }
    onStartCommand(restoreIntent, 0, 0)
}
```

---

### Addition 3D — Expose `isSessionActive()`

If `isSessionActive()` does not already exist in `AppBlockerService`,
add it. If it does exist, verify it returns `true` only when a session
is currently running and `false` at all other times:

```kotlin
/**
 * Returns true if a focus session is currently active.
 * Used by NotificationDismissReceiver and onTaskRemoved to decide
 * whether to repost the notification or schedule a restart.
 */
fun isSessionActive(): Boolean {
    return currentSessionId != null
    // Replace currentSessionId with whatever field you actually use
    // to track whether a session is running. The logic should be:
    // return true  → session is running
    // return false → no session, service is idle
}
```

---

### Addition 3E — Call `clearSavedSession()` on teardown

Find wherever your service handles session end — the teardown flow,
the STOP action, and the `scheduleTeardown` expiry path. In every
place that ends a session, add a call to `clearSavedSession()` so
stale session data does not cause a ghost restart after a legitimate
session end.

Look for your existing teardown/stop handling and add one line:

```kotlin
// Add this wherever a session ends:
clearSavedSession()
```

The three places to check:
1. The `"STOP"` action branch in `onStartCommand`
2. Whatever method handles the `ACTION_SESSION_TEARDOWN` alarm from
   `SessionAlarmReceiver` (which calls `SessionNotifications.cancel`
   and stops the service)
3. Any session-complete or session-expired handler you have

---

## Part 4 — Battery Optimization Prompt (Onboarding)

Add a battery optimization permission check to your onboarding flow.
This is necessary because Samsung, Xiaomi, Oppo, and Vivo have
aggressive battery layers that can override all of the above mechanisms.

### Where to add this

This is a React Native / Expo side change. Add it to your onboarding
permission request sequence alongside your existing overlay permission
and usage stats access requests.

### Native method to add to your existing permissions module

In whichever native module currently handles permission checks
(likely in your `app-blocker` or `installed-apps` package),
add these two methods:

```kotlin
/**
 * Returns true if Focussive is already excluded from battery optimization.
 * If false, the user should be prompted to grant unrestricted battery access.
 */
@ReactMethod
fun isIgnoringBatteryOptimization(promise: Promise) {
    val pm = reactContext.getSystemService(Context.POWER_SERVICE)
        as android.os.PowerManager
    promise.resolve(
        pm.isIgnoringBatteryOptimizations(reactContext.packageName)
    )
}

/**
 * Opens the system dialog asking the user to exclude this app
 * from battery optimization. Required for persistent background operation
 * on Samsung, Xiaomi, and other manufacturer-skinned devices.
 */
@ReactMethod
fun requestIgnoreBatteryOptimization(promise: Promise) {
    try {
        val intent = Intent(
            android.provider.Settings
                .ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
        ).apply {
            data = android.net.Uri.parse(
                "package:${reactContext.packageName}"
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.resolve(true)
    } catch (e: Exception) {
        promise.resolve(false)
    }
}
```

### Add to AndroidManifest.xml permissions section:
```xml
<uses-permission
    android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
```

### React Native side — add to your onboarding permission flow:

```typescript
// In your onboarding permissions screen
// (alongside your existing overlay + usage stats checks)

const checkBatteryOptimization = async () => {
  const isIgnoring = await AppBlocker.isIgnoringBatteryOptimization()

  if (!isIgnoring) {
    // Show explanation to user before opening settings
    Alert.alert(
      'One more step',
      'To keep your sessions running when you close the app, ' +
      'Focussive needs unrestricted battery access.\n\n' +
      'On the next screen, select "Unrestricted" or ' +
      '"Don\'t optimize" for Focussive.',
      [
        {
          text: 'Open Settings',
          onPress: () => AppBlocker.requestIgnoreBatteryOptimization()
        },
        {
          text: 'Skip for now',
          style: 'cancel'
        }
      ]
    )
  }
}
```

---

## Summary — All Files Changed or Created

| File | Action | What Changed |
|---|---|---|
| `AndroidManifest.xml` | Edit | `stopWithTask="false"` on service + 2 receivers registered |
| `ServiceRestartReceiver.kt` | **New file** | Restarts service from AlarmManager after process kill |
| `AppBlockerService.kt` | Edit | `START_STICKY` return, `onTaskRemoved`, 3 state methods, `isSessionActive()`, `clearSavedSession()` on teardown |
| Your permissions native module | Edit | `isIgnoringBatteryOptimization` + `requestIgnoreBatteryOptimization` methods |
| Your onboarding screen (RN) | Edit | Battery optimization prompt added to permission flow |

---

## What Not to Change

- Do not modify `SessionNotifications.kt` — it is not involved here.
- Do not modify `SessionAlarmReceiver.kt` — it is not involved here.
- Do not modify `NotificationDismissReceiver.kt` — it is not involved here.
- Do not change any session logic, blocklist logic, or UI components.
- Do not remove any existing action handlers from `onStartCommand`.
- Do not add new session state fields — reuse whatever fields already
  track the active session ID, name, and end time.

---

## How It Works After This Fix

```
User swipes Focussive from recents tray
        ↓
onTaskRemoved() fires before process is killed
        ↓
AlarmManager alarm scheduled for 500ms from now
(AlarmManager survives process death)
        ↓
OS kills the app process
Notification disappears briefly (~500ms)
        ↓
AlarmManager wakes ServiceRestartReceiver
        ↓
ServiceRestartReceiver starts AppBlockerService
with IS_RESTART = true
        ↓
AppBlockerService reads session state from
SharedPreferences (survives process death)
        ↓
Service calls startForeground() with notification
Blocking resumes
        ↓
Notification reappears
User sees uninterrupted session
```

Additionally, if `stopWithTask="false"` works as expected on the
device (it does on stock Android and most Pixels), the service may
not die at all when the app is swiped — making the ~500ms gap
disappear entirely on those devices.

---

## Testing Checklist

Test on a physical device. Do not use an emulator.
Test on at least two devices if possible — a Pixel (stock Android)
and a Samsung (One UI) to cover both ends of the manufacturer spectrum.

```
☐ Start a session, then swipe app from recents tray
  → Notification should reappear within 1 second
  → Blocking should resume immediately

☐ Start a session, swipe from recents, then open a blocked app
  → Block overlay should appear even after swipe

☐ Let a session end normally (timer runs out)
  → Notification should disappear
  → No ghost restart should occur

☐ End a session via the Stop button
  → Notification should disappear
  → No ghost restart should occur

☐ Kill the app repeatedly (stress test)
  → Service should restart each time during an active session
  → Service should NOT restart when no session is running

☐ Test battery optimization prompt in onboarding
  → Shows on Samsung/Xiaomi devices where optimization is active
  → Does not show on devices already excluded

☐ Test on Samsung One UI specifically
  → Most aggressive battery management — if it works here it
    works everywhere
```

---

## Honest Limitation

This implementation gets Focussive as close to VPN-level persistence
as is possible without using `VpnService` or `AccessibilityService`.
The brief ~500ms notification gap on swipe is unavoidable on devices
where `stopWithTask="false"` does not fully protect the service
(primarily on aggressive manufacturer ROMs). On stock Android and
Pixel devices, the gap may not appear at all.

Do not attempt to use `VpnService` just for persistence — it requires
a system-level permission prompt that tells users "this app can
intercept your network traffic," which is alarming and misleading for
a focus app. Do not attempt `AccessibilityService` for this purpose
either — Google Play Store policy explicitly prohibits using
accessibility services for non-accessibility purposes and will reject
or remove the app.

The approach in this guide is the correct production solution used by
apps like Forest, Alarmy, and other persistence-requiring Android apps.
