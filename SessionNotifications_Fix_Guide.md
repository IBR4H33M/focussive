# SessionNotifications.kt — Bug Fix Guide
## File: `packages/app-blocker/android/src/main/java/expo/modules/appblocker/SessionNotifications.kt`

Read this entire document before touching any code.
There are 4 distinct issues to fix and 1 new file to create.
Fix them in the order listed. Do not change anything not mentioned here.

---

## Context

Focussive uses two locked, non-dismissible notifications:
- **Upcoming session reminder** — slate surface `#7C8CA6`, dark red countdown `#8B1E1E`
- **Running session** — deep navy surface `#1E2235`, light red countdown `#F87171`

Both are supposed to be impossible for the user to swipe away.
The bug: on Android 12+ (API 31+) and on manufacturer skins
(Samsung One UI, Xiaomi MIUI, OnePlus ColorOS), users can still
swipe the notification away even though `FLAG_NO_CLEAR` and
`FLAG_ONGOING_EVENT` are set.

There are 4 root causes. All must be fixed together.

---

## Issue 1 — Flags Set After `build()` Instead of During Build

### Location
`buildNotification()` function, lines 252–258.

### Current Code (lines 252–258)
```kotlin
val notification = builder.build()
// Lock notification so it cannot be dismissed or cleared for both running and upcoming reminder
if (isActive) {
    notification.flags = notification.flags or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
} else {
    notification.flags = notification.flags or Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT
}
return notification
```

### Why It's Wrong
Setting flags on `notification.flags` **after** `builder.build()` is
unreliable. On Android 12+ and manufacturer-skinned ROMs, the system
reads flags from the builder's internal state, not from the object
you mutate afterward. The post-build flag assignment is sometimes
ignored entirely.

### Fix
`setOngoing(true)` and `setAutoCancel(false)` must be called on the
builder **before** `.build()`. These are the builder-level equivalents
of `FLAG_ONGOING_EVENT` and `FLAG_NO_CLEAR`. They must be set during
the builder chain, not after.

These two calls are already present in the current builder chain
(lines 217–218), so this part is already correct — but the post-build
flag assignment below them must remain as a belt-and-suspenders fallback
for Android versions below 8. Do not remove the post-build flag lines.
They should stay exactly as they are.

**No code change needed for Issue 1 — it is already handled by
`setOngoing(true)` and `setAutoCancel(false)` on lines 217–218.
Keep them. The post-build flags stay too.**

---

## Issue 2 — Missing `FOREGROUND_SERVICE_IMMEDIATE` on Android 12+

### Location
`buildNotification()` function, inside the builder chain, after line 224.

### Why It's Wrong
Android 12 (API 31) introduced a 10-second delay before foreground
service notifications appear. During this delay window, the notification
may briefly appear without the ongoing flag fully applied, making it
dismissible in that window. `setForegroundServiceBehavior(FOREGROUND_SERVICE_IMMEDIATE)`
eliminates this delay and ensures the notification appears immediately
with all flags intact.

### Fix
Add the following block to the builder chain, after `.setContentIntent(...)`:

```kotlin
// Eliminate Android 12+ foreground notification appearance delay
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    builder.setForegroundServiceBehavior(
        Notification.FOREGROUND_SERVICE_IMMEDIATE
    )
}
```

### Exact Insertion Point
Insert after line 224 (after `.setContentIntent(openSessionIntent(context, sessionId, id))`),
before the `if (!isActive)` block that starts on line 227.

### Result After Fix
```kotlin
        builder
            .setContentTitle(title)
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

        // For upcoming reminder notifications, add a quick Skip action
        if (!isActive) {
```

---

## Issue 3 — No Recovery When Android 12+ Forces Dismissal

### Why It's Wrong
Android 12+ (API 31+) made a deliberate OS-level decision: foreground
service notifications CAN be dismissed by the user regardless of
`FLAG_ONGOING_EVENT`. This is a Google user-rights decision that cannot
be bypassed. Even with all flags set correctly, on Android 12+ the
system renders a dismiss affordance on the notification.

The fix is a **recovery loop**: detect the dismissal via a delete
intent, and immediately repost the notification. The notification
disappears for less than a second then reappears. This is the same
approach used by production apps like Forest and Alarmy.

### Fix — Part A: Add Delete Intent in `buildNotification()`

In `buildNotification()`, after the `if (!isActive)` skip button block
(after line 238, before the custom views block on line 241), add:

```kotlin
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
```

### Fix — Part B: Create `NotificationDismissReceiver.kt`

Create a **new file** at:
```
packages/app-blocker/android/src/main/java/expo/modules/appblocker/NotificationDismissReceiver.kt
```

Full file contents:

```kotlin
package expo.modules.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the delete intent fired when Android 12+ force-dismisses
 * the active session notification. Immediately reposts the notification
 * to maintain the persistent session indicator.
 *
 * This is necessary because Android 12+ (API 31+) allows users to dismiss
 * foreground service notifications regardless of FLAG_ONGOING_EVENT.
 * Google made this a deliberate platform decision; a recovery loop is the
 * only viable workaround.
 */
class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "ACTION_ACTIVE_NOTIFICATION_DISMISSED") return

        val sessionId = intent.getStringExtra("sessionId") ?: return

        // Only repost if a session is genuinely still running.
        // AppBlockerService.instance is null if the service has been stopped,
        // which means the session ended legitimately — do not repost in that case.
        val service = AppBlockerService.instance ?: return

        if (!service.isSessionActive()) return

        // Retrieve the last built notification and repost it as foreground.
        val notification = SessionNotifications.latestActiveNotification ?: return
        service.startForeground(SessionNotifications.ACTIVE_NOTIFICATION_ID, notification)
    }
}
```

**Important:** `AppBlockerService` must expose an `isSessionActive()` method
that returns `true` when a focus session is currently running. If this method
does not already exist in `AppBlockerService.kt`, add it:

```kotlin
// Add to AppBlockerService.kt
fun isSessionActive(): Boolean {
    // Return true if a session is currently active.
    // Implement based on your existing session state tracking.
    // Example: return currentSessionId != null
    return currentSessionId != null
}
```

### Fix — Part C: Register Receiver in AndroidManifest.xml

In `packages/app-blocker/android/src/main/AndroidManifest.xml`,
inside the `<application>` tag, add:

```xml
<receiver
    android:name=".NotificationDismissReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="ACTION_ACTIVE_NOTIFICATION_DISMISSED"/>
    </intent-filter>
</receiver>
```

---

## Issue 4 — Notification Channels Missing Sound and Vibration Suppression

### Location
`ensureChannels()` function, lines 39–52.

### Current Code
```kotlin
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
```

### Why It's Wrong
Notification channels are created with default sound and vibration
settings. Every time the active session notification is silently updated
(e.g. when violations count changes), it plays a sound and vibrates.
This is disruptive during a focus session.

Additionally, missing `lockscreenVisibility` means the notification
may not render correctly on the lock screen, which is a key surface
for Focussive's session timer.

### Fix
Replace `ensureChannels()` entirely with:

```kotlin
private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return

    if (manager.getNotificationChannel(CHANNEL_REMINDER) == null) {
        val reminderChannel = NotificationChannel(
            CHANNEL_REMINDER,
            "Session Reminders",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(reminderChannel)
    }

    if (manager.getNotificationChannel(CHANNEL_ACTIVE) == null) {
        val activeChannel = NotificationChannel(
            CHANNEL_ACTIVE,
            "Session Running",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(activeChannel)
    }
}
```

### Important Note on Channel Updates
Android does NOT allow updating an existing notification channel's
sound or vibration settings after it has been created. If the app
has already been installed on a device with the old channels, the
user must clear app data or reinstall for the new channel settings
to take effect. This is an Android platform limitation — document
it in your release notes.

---

## Summary of All Changes

| # | What | Where | Type |
|---|---|---|---|
| 1 | `setOngoing(true)` + `setAutoCancel(false)` already in builder chain | Lines 217–218 | No change needed — verify they exist |
| 2 | Add `setForegroundServiceBehavior(IMMEDIATE)` for Android 12+ | After line 224 in `buildNotification()` | Add ~5 lines |
| 3a | Add delete intent in `buildNotification()` for active notifications | After line 238 in `buildNotification()` | Add ~15 lines |
| 3b | Create `NotificationDismissReceiver.kt` | New file in same package | New file ~35 lines |
| 3c | Register receiver in `AndroidManifest.xml` | Inside `<application>` tag | Add ~5 lines |
| 3d | Add `isSessionActive()` to `AppBlockerService` if missing | `AppBlockerService.kt` | Add if not present |
| 4 | Replace `ensureChannels()` with version that suppresses sound/vibration | Lines 39–52 | Replace function |

---

## What Not to Change

- Do not modify `bindChronometer()` — it is correct.
- Do not modify `scheduleTeardown()` — it is correct.
- Do not modify `cancelAllReminders()` — it is correct.
- Do not modify `post()`, `schedule()`, or `cancel()` — they are correct.
- Do not modify `buildExpandedView()` or `buildCollapsedView()` — they are correct.
- Do not remove the post-build flag assignment (lines 254–258) — keep it as
  a fallback for Android versions below 8 (Oreo).
- Do not change any color values, layout references, or chronometer logic.

---

## Honest Limitation to Document

On Android 12+ (API 31+), Google made a platform-level decision that
foreground service notifications CAN be dismissed by the user. No app
can fully override this. The recovery loop in Issue 3 minimizes the
dismissal window to under one second, which is the best achievable
result. Do not attempt to fight this further — deeper workarounds
(accessibility service tricks, overlay abuse) violate Play Store policy
and will cause rejection.

The reminder notification (isActive = false) is NOT a foreground service
notification and retains full lock behavior on all Android versions.
Only the running session notification (isActive = true) is subject to
the Android 12+ dismissal behavior.

---

## Testing Checklist After Changes

Test on a physical device. Emulators do not accurately simulate
notification behavior or foreground service interactions.

```
☐ Running session notification cannot be swiped on Android < 12
☐ Running session notification reappears within 1 second on Android 12+
   after user swipes it
☐ Reminder notification cannot be swiped on any Android version
☐ No sound or vibration when notification updates during session
☐ Notification visible on lock screen during active session
☐ Chronometer counts down correctly in both collapsed and expanded views
☐ Teardown fires correctly at session end — notification disappears
☐ Repost does NOT occur after session ends (service.isSessionActive() 
   returns false)
☐ Test on Samsung device (One UI) specifically — most aggressive 
   notification management
```
