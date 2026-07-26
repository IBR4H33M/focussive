package expo.modules.appblocker

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.Typeface
import android.widget.*

/**
 * BlockOverlayActivity — shown over a blocked app.
 *
 * Three screens:
 *   IDLE        → "Exit App" | "Take a break" (only if available) | "Allow anyway"
 *   BREAK_PICK  → up/down minute picker, capped to remaining break time
 *   ALLOW_PICK  → WARNING! screen + up/down picker, capped to 5 minutes
 */
class BlockOverlayActivity : Activity() {

    private enum class Screen { IDLE, BREAK_PICK, ALLOW_PICK }

    private var screen = Screen.IDLE
    private var breakMinutes = 1
    private var allowMinutes = 1
    private var breakAvailable = false
    private var breakMaxMinutes = 0
    private var blockedPackage: String? = null

    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        )
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        blockedPackage = intent.getStringExtra("BLOCKED_PACKAGE")
        val remainingBreakSeconds = intent.getIntExtra("REMAINING_BREAK_SECONDS", 0)
        val allowBreaks = intent.getBooleanExtra("ALLOW_BREAKS", false)

        breakAvailable = allowBreaks && remainingBreakSeconds > 0
        breakMaxMinutes = (remainingBreakSeconds / 60).coerceAtLeast(1)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            // Deep semi-transparent dark-red — gives solid "danger" feel
            setBackgroundColor(Color.parseColor("#D0200A14"))
            layoutParams = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            )
        }

        setContentView(root)
        renderScreen()
    }

    // ── Rendering ─────────────────────────────────────────────

    private fun renderScreen() {
        root.removeAllViews()
        when (screen) {
            Screen.IDLE       -> renderIdle()
            Screen.BREAK_PICK -> renderPicker(isBreak = true)
            Screen.ALLOW_PICK -> renderPicker(isBreak = false)
        }
    }

    private fun renderIdle() {
        val container = verticalLayout(Gravity.CENTER, padDp = 32)

        // Title
        container.addView(styledText("Distraction Detected", 24f, Color.WHITE, bold = true, bottomPadDp = 8))
        container.addView(styledText(
            "You opened a blocked app\nduring your focus session.",
            14f, 0xCCFFFFFF.toInt(), bold = false, bottomPadDp = 36
        ))

        // Exit — solid dark button
        container.addView(solidButton(
            label = "Exit app",
            textColor = Color.WHITE,
            bgColor = Color.parseColor("#1A1A1A"),
            borderColor = 0x40FFFFFF.toInt()
        ) {
            exitToHome()
        })

        container.addView(spacer(10))

        // Take a break — only show if break time actually available
        if (breakAvailable) {
            container.addView(solidButton(
                label = "Take a break  (${breakMaxMinutes} min left)",
                textColor = Color.parseColor("#90EE90"),
                bgColor = Color.parseColor("#1A3A1A"),
                borderColor = Color.parseColor("#90EE90")
            ) {
                breakMinutes = 1
                screen = Screen.BREAK_PICK
                renderScreen()
            })
            container.addView(spacer(10))
        }

        // Allow anyway — solid dark-red tint
        container.addView(solidButton(
            label = "Allow anyway",
            textColor = Color.parseColor("#FFAAAA"),
            bgColor = Color.parseColor("#3A0A0A"),
            borderColor = Color.parseColor("#CC4444")
        ) {
            allowMinutes = 1
            screen = Screen.ALLOW_PICK
            renderScreen()
        })

        root.addView(container)
    }

    private fun renderPicker(isBreak: Boolean) {
        val max = if (isBreak) breakMaxMinutes else 5
        val current = if (isBreak) breakMinutes else allowMinutes

        val title = if (isBreak) "Take a break" else "WARNING!"
        val subtitle = if (isBreak)
            "Breaks don't count as distracted time"
        else
            "You are getting distracted\nwithin a focus session!"
        val titleColor = if (isBreak) Color.parseColor("#90EE90") else Color.parseColor("#FF6B6B")
        val subtitleColor = if (isBreak) 0xCCFFFFFF.toInt() else Color.parseColor("#FFAAAA")

        val container = verticalLayout(Gravity.CENTER, padDp = 32)

        container.addView(styledText(title, 26f, titleColor, bold = true, bottomPadDp = 8))
        container.addView(styledText(subtitle, 14f, subtitleColor, bold = false, bottomPadDp = 24))

        // ▲ Up
        container.addView(arrowButton("▲") {
            val v = if (isBreak) breakMinutes else allowMinutes
            val next = (v + 1).coerceAtMost(max)
            if (isBreak) breakMinutes = next else allowMinutes = next
            renderScreen()
        })

        // Minute number
        container.addView(styledText("$current", 72f, Color.WHITE, bold = false, bottomPadDp = 0))
        container.addView(styledText("min", 15f, 0x99FFFFFF.toInt(), bold = false, bottomPadDp = 0))

        // ▼ Down
        container.addView(arrowButton("▼") {
            val v = if (isBreak) breakMinutes else allowMinutes
            val next = (v - 1).coerceAtLeast(1)
            if (isBreak) breakMinutes = next else allowMinutes = next
            renderScreen()
        })

        container.addView(spacer(28))

        // Confirm
        val confirmLabel = if (isBreak) "Start $current min break" else "Allow $current min"
        val confirmBg = if (isBreak) Color.parseColor("#1A3A1A") else Color.parseColor("#3A0A0A")
        val confirmBorder = if (isBreak) Color.parseColor("#90EE90") else Color.parseColor("#FF6B6B")
        val confirmText = if (isBreak) Color.parseColor("#90EE90") else Color.parseColor("#FF6B6B")

        container.addView(solidButton(confirmLabel, confirmText, confirmBg, confirmBorder) {
            if (isBreak) confirmBreak() else confirmAllow()
        })

        container.addView(spacer(8))

        // Back
        val backBtn = Button(this).apply {
            text = "Back"
            setTextColor(0x66FFFFFF.toInt())
            setBackgroundColor(Color.TRANSPARENT)
            textSize = 14f
            setOnClickListener { screen = Screen.IDLE; renderScreen() }
        }
        container.addView(backBtn)

        root.addView(container)
    }

    // ── Actions ──────────────────────────────────────────────

    private fun confirmBreak() {
        blockedPackage?.let { pkg ->
            val intent = Intent(this, AppBlockerService::class.java).apply {
                action = "TAKE_BREAK"
                putExtra("PACKAGE_NAME", pkg)
                putExtra("BREAK_MINUTES", breakMinutes)
            }
            startService(intent)
        }
        exitToHome()
    }

    private fun confirmAllow() {
        blockedPackage?.let { pkg ->
            val intent = Intent(this, AppBlockerService::class.java).apply {
                action = "ALLOW_APP"
                putExtra("PACKAGE_NAME", pkg)
                putExtra("ALLOW_MINUTES", allowMinutes)
            }
            startService(intent)

            // Re-launch the blocked app so the user lands back inside it
            val launchIntent = packageManager.getLaunchIntentForPackage(pkg)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(launchIntent)
            }
        }
        finish()
    }

    private fun exitToHome() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
        finish()
    }

    override fun onBackPressed() {
        exitToHome()
    }

    // ── View helpers ─────────────────────────────────────────

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun verticalLayout(grav: Int, padDp: Int): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = grav
            setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
    }

    private fun styledText(text: String, sizeSp: Float, color: Int, bold: Boolean, bottomPadDp: Int): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(color)
            gravity = Gravity.CENTER
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, 0, 0, dp(bottomPadDp))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
    }

    private fun arrowButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 22f
            setTextColor(0xCCFFFFFF.toInt())
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { onClick() }
            setPadding(dp(32), dp(6), dp(32), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { gravity = Gravity.CENTER_HORIZONTAL }
        }
    }

    /** Solid button with rounded corners, full opaque background */
    private fun solidButton(label: String, textColor: Int, bgColor: Int, borderColor: Int, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setTextColor(textColor)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(bgColor)
                setStroke(dp(2), borderColor)
            }
            textSize = 15f
            setPadding(dp(24), dp(14), dp(24), dp(14))
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
    }

    private fun spacer(heightDp: Int): View {
        return View(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(heightDp)
            )
        }
    }
}
