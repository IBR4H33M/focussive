package expo.modules.installedapps

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.content.pm.PackageManager
import android.os.Process
import android.provider.Settings
import android.util.Base64
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class InstalledAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstalledApps")

    AsyncFunction("getApps") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      val pm = context.packageManager

      val homePackages = getHomePackages(pm)
      val imePackages = getImePackages(context)

      val intent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }

      val resolveInfoList = pm.queryIntentActivities(intent, 0)

      val apps = resolveInfoList.mapNotNull { resolveInfo ->
        try {
          val activityInfo = resolveInfo.activityInfo
          val packageName = activityInfo.packageName
          val appName = resolveInfo.loadLabel(pm).toString()

          if (isIgnoredApp(packageName, appName, homePackages, imePackages, context.packageName)) {
            return@mapNotNull null
          }

          val icon = resolveInfo.loadIcon(pm)

          mapOf(
            "id" to packageName,
            "name" to appName,
            "icon" to drawableToBase64(icon)
          )
        } catch (e: Exception) {
          null
        }
      }.distinctBy { it["id"] }.sortedBy { it["name"] }

      return@AsyncFunction apps
    }

    AsyncFunction("getForegroundApp") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      
      if (!hasUsageStatsPermission(context)) {
        return@AsyncFunction null
      }

      val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction null

      val currentTime = System.currentTimeMillis()
      val stats = usageStatsManager.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        currentTime - 1000 * 10, // Last 10 seconds
        currentTime
      )

      val foregroundApp = stats
        ?.filter { it.lastTimeUsed > 0 }
        ?.maxByOrNull { it.lastTimeUsed }

      if (foregroundApp != null) {
        try {
          val pm = context.packageManager
          val appInfo = pm.getApplicationInfo(foregroundApp.packageName, 0)
          val appName = pm.getApplicationLabel(appInfo).toString()
          
          return@AsyncFunction mapOf(
            "packageName" to foregroundApp.packageName,
            "appName" to appName
          )
        } catch (e: Exception) {
          return@AsyncFunction null
        }
      }

      return@AsyncFunction null
    }

    AsyncFunction("getWeeklyUsageStats") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      
      if (!hasUsageStatsPermission(context)) {
        return@AsyncFunction emptyList<Map<String, Any>>()
      }

      val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return@AsyncFunction emptyList<Map<String, Any>>()

      val currentTime = System.currentTimeMillis()
      val oneWeekAgo = currentTime - 7L * 24 * 60 * 60 * 1000L

      val stats = usageStatsManager.queryUsageStats(
        UsageStatsManager.INTERVAL_WEEKLY,
        oneWeekAgo,
        currentTime
      ) ?: return@AsyncFunction emptyList<Map<String, Any>>()

      val pm = context.packageManager
      val homePackages = getHomePackages(pm)
      val imePackages = getImePackages(context)

      val usageMap = mutableMapOf<String, Long>()
      for (us in stats) {
        if (us.totalTimeInForeground > 0) {
          usageMap[us.packageName] = (usageMap[us.packageName] ?: 0L) + us.totalTimeInForeground
        }
      }

      val sorted = usageMap.entries
        .filter { it.key != context.packageName && it.value > 60000L }
        .sortedByDescending { it.value }

      val result = mutableListOf<Map<String, Any>>()
      for (entry in sorted) {
        if (result.size >= 10) break
        try {
          val packageName = entry.key
          val appInfo = pm.getApplicationInfo(packageName, 0)
          val appName = pm.getApplicationLabel(appInfo).toString()

          if (isIgnoredApp(packageName, appName, homePackages, imePackages, context.packageName)) {
            continue
          }

          val icon = pm.getApplicationIcon(appInfo)
          result.add(
            mapOf(
              "id" to packageName,
              "name" to appName,
              "totalTimeMillis" to entry.value,
              "icon" to drawableToBase64(icon)
            )
          )
        } catch (e: Exception) {
          // ignore uninstalled/hidden apps
        }
      }

      return@AsyncFunction result
    }

    AsyncFunction("hasUsageStatsPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      return@AsyncFunction hasUsageStatsPermission(context)
    }

    AsyncFunction("requestUsageStatsPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("killApp") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      
      try {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        activityManager.killBackgroundProcesses(packageName)
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }
  }

  private fun hasUsageStatsPermission(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun drawableToBase64(drawable: Drawable): String {
    val bitmap = if (drawable is BitmapDrawable) {
      drawable.bitmap
    } else {
      val bmp = Bitmap.createBitmap(
        drawable.intrinsicWidth.coerceAtLeast(1),
        drawable.intrinsicHeight.coerceAtLeast(1),
        Bitmap.Config.ARGB_8888
      )
      val canvas = Canvas(bmp)
      drawable.setBounds(0, 0, canvas.width, canvas.height)
      drawable.draw(canvas)
      bmp
    }

    val stream = ByteArrayOutputStream()
    // Scale down to 48x48 to keep bundle size small
    val scaled = Bitmap.createScaledBitmap(bitmap, 48, 48, true)
    scaled.compress(Bitmap.CompressFormat.PNG, 80, stream)
    val byteArray = stream.toByteArray()
    return "data:image/png;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP)
  }

  private fun getHomePackages(pm: PackageManager): Set<String> {
    return try {
      val homeIntent = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
      }
      pm.queryIntentActivities(homeIntent, 0)
        .mapNotNull { it.activityInfo?.packageName }
        .toSet()
    } catch (e: Exception) {
      emptySet()
    }
  }

  private fun getImePackages(context: Context): Set<String> {
    return try {
      val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      imm?.inputMethodList?.mapNotNull { it.packageName }?.toSet() ?: emptySet()
    } catch (e: Exception) {
      emptySet()
    }
  }

  private fun isIgnoredApp(
    packageName: String,
    appName: String,
    homePackages: Set<String>,
    imePackages: Set<String>,
    selfPackage: String
  ): Boolean {
    if (packageName == selfPackage) return true
    if (homePackages.contains(packageName) || imePackages.contains(packageName)) return true

    val lowerPkg = packageName.lowercase()
    val lowerName = appName.lowercase()

    val ignoredPkgPatterns = listOf(
      "launcher",
      "systemui",
      "android.settings",
      "inputmethod",
      "honeyboard",
      "sidebarservice",
      "cocktailbarservice",
      "quickstep",
      "wallpaper",
      "screensaver",
      "com.sec.android.app.launcher",
      "com.android.systemui",
      "com.google.android.apps.nexuslauncher",
      "com.google.android.googlequicksearchbox"
    )
    if (ignoredPkgPatterns.any { lowerPkg.contains(it) }) return true

    val ignoredNamePatterns = listOf(
      "one ui",
      "system ui",
      "launcher",
      "home screen",
      "quickstep",
      "gboard",
      "keyboard",
      "settings"
    )
    if (ignoredNamePatterns.any { lowerName.contains(it) }) return true

    if (lowerName == "home" || lowerName.endsWith(" home") || lowerName.startsWith("home ")) {
      return true
    }

    return false
  }
}
