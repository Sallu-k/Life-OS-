package com.lifeos.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The Gate: "Why now?" drawn by GateService straight on top of everything (a "Display over other apps"
 * window), not as a separate screen: OnePlus blocks apps from opening screens from the background, but not
 * this. It appears at once after an unlock, and Home cannot skip it (Unlock is always one slide away).
 * Purpose is one slide with no questions. Leisure first asks you to read a little (a card, a recall
 * question or the next passage of your long read), then offers your book, then asks what kind and for how
 * long; the session runs out and asks again. Note and Task save straight to the PC (queued when it is
 * away). The screen going off while it is open logs "skip". Every choice is logged (choice and numbers only).
 */
final class GateOverlay {

    static final String MODE_UNLOCK = "unlock", MODE_APP = "app", MODE_TIMEUP = "timeup", MODE_STILL = "still";

    private final Context ctx;
    private final WindowManager wm;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private String mode = MODE_UNLOCK;
    private String pkg; // the fun app that brought the Gate (app mode)
    private boolean answered;
    private boolean onDial;

    GateOverlay(Context ctx) {
        this.ctx = ctx;
        this.wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
    }

    boolean showing() {
        return root != null;
    }

    /** Shows the Gate (or switches it to another mode if it is already up). */
    void show(String newMode, String newPkg) {
        mode = newMode;
        pkg = newPkg;
        answered = false;
        if (root == null) {
            root = new FrameLayout(ctx) {
                @Override
                public boolean dispatchKeyEvent(KeyEvent e) {
                    // Back from a step returns to the choices; on the choices it does nothing (choose one).
                    if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                        if (e.getAction() == KeyEvent.ACTION_UP && !onDial) start();
                        return true;
                    }
                    return super.dispatchKeyEvent(e);
                }
            };
            // Frosted glass: the screen behind shows through, blurred (Android 12+, when the phone allows
            // blur); a dark wallpaper-tinted veil keeps the text readable either way.
            root.setBackground(new ColorDrawable((ctx.getColor(R.color.gate_bg) & 0x00FFFFFF) | 0xD2000000));
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
            lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
            // The whole screen, behind the status bar, the camera cut-out and the navigation bar too.
            lp.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                lp.setFitInsetsTypes(0);
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                lp.flags |= WindowManager.LayoutParams.FLAG_BLUR_BEHIND;
                lp.setBlurBehindRadius(dp(70));
            }
            lp.windowAnimations = 0;
            // Soft entrance: fades in while settling from slightly larger (like a system sheet), 260 ms.
            root.setAlpha(0f);
            root.setScaleX(1.04f);
            root.setScaleY(1.04f);
            wm.addView(root, lp);
            root.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).setInterpolator(new android.view.animation.DecelerateInterpolator(2f)).start();
        }
        start();
    }

    /** The screen went off with the Gate open: counted honestly as a skip, and the Gate goes away. */
    void screenOff() {
        if (root == null) return;
        if (!answered) {
            GateStore.log(ctx, "skip", null, 0, via());
            if (MODE_TIMEUP.equals(mode)) GateStore.endFun(ctx);
            GateStore.passed(ctx);
            GateStore.syncLater(ctx);
            answered = true;
        }
        close();
    }

    /** Fades away (160 ms) instead of vanishing; the screen-off case closes at once. */
    private void close() {
        handler.removeCallbacksAndMessages(null);
        if (root == null) return;
        View gone = root;
        root = null;
        Runnable remove = () -> {
            try {
                wm.removeView(gone);
            } catch (Exception ignored) {
                // already gone
            }
        };
        gone.animate().cancel();
        gone.animate().alpha(0f).scaleX(0.98f).scaleY(0.98f).setDuration(160).withEndAction(remove).start();
    }

    private String via() {
        return MODE_APP.equals(mode) || MODE_STILL.equals(mode) ? "app" : MODE_UNLOCK.equals(mode) ? "unlock" : null;
    }

    private void start() {
        handler.removeCallbacksAndMessages(null);
        if (MODE_TIMEUP.equals(mode)) timeUp();
        else if (MODE_STILL.equals(mode)) still();
        else dial();
    }

    // ---------- step 1: the choices ----------

    private void dial() {
        LinearLayout col = column();
        col.addView(title(MODE_APP.equals(mode) ? "Opening a leisure app" : "Why now?"));
        String context = contextLine();
        if (context != null) col.addView(text(context));
        JSONObject today = GateStore.info(ctx).optJSONObject("today");
        if (today != null) col.addView(small("Today: " + today.optInt("gates") + " unlocks, " + today.optInt("fun") + " for fun"));
        // Note and Task: two buttons side by side; the slider below stays where the thumb is.
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button note = button("Note", () -> write(true));
        Button task = button("Task", () -> write(false));
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(52), 1);
        half.setMarginEnd(dp(6));
        note.setLayoutParams(half);
        LinearLayout.LayoutParams half2 = new LinearLayout.LayoutParams(0, dp(52), 1);
        half2.setMarginStart(dp(6));
        task.setLayoutParams(half2);
        row.addView(note);
        row.addView(task);
        col.addView(row);
        boolean dual = MODE_APP.equals(mode) && pkg != null && GateStore.dual(ctx, pkg);
        col.addView(small(dual ? "Right for a task (10 min), left for Leisure" : "Slide right for Purpose, left for Leisure"));
        // The dial fills the rest of the screen; its circle sits over the fingerprint sensor (GateDial).
        GateDial d = new GateDial(ctx, this::picked);
        col.addView(d, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        col.setPadding(col.getPaddingLeft(), col.getPaddingTop(), col.getPaddingRight(), dp(8));
        show(col, true);
    }

    /** One useful line: the next anchor of your day within the hour, else your next task, else pages left in your book. */
    private String contextLine() {
        String anchor = GateStore.nextAnchor(ctx);
        if (anchor != null) return anchor;
        JSONObject info = GateStore.info(ctx);
        String task = info.optString("nextTask", "");
        if (!task.isEmpty()) return "Next: " + task;
        JSONObject book = info.optJSONObject("book");
        if (book != null && book.optInt("pages", 0) > 0) return (book.optInt("pages") - book.optInt("progress")) + " pages left in " + book.optString("title");
        return null;
    }

    private void picked(int choice) {
        // The log keeps its words ("unlock" for Purpose, "fun" for Leisure), so history and Insights still match.
        if (choice == GateDial.PURPOSE) {
            GateService.allowUnder();
            finishWith("unlock", null, 0);
        } else readFirst(false);
    }

    /** A task pass in a work-and-fun app (Brave) ran out with the app still open. */
    private void still() {
        LinearLayout col = column();
        col.addView(title("Still for the task?"));
        col.addView(small("10 minutes are up."));
        col.addView(button("Yes, 10 more min", () -> {
            GateService.allowUnder();
            finishWith("unlock", null, 0);
        }));
        col.addView(button("Task done", () -> turnedBack("done", "Good work.")));
        col.addView(button("It's leisure now", () -> readFirst(false)));
        show(col, false);
    }

    // ---------- Leisure: read a little first ----------

    /** One thing to read: the next passage of your long read, or a card (a recall question when it is due).
     *  "Done" opens after a few seconds per line, so it is read, not skipped. Nothing cached: straight on. */
    private void readFirst(boolean cardOnly) {
        JSONObject it = GateStore.nextReading(ctx, cardOnly);
        if (it == null) {
            suggest();
            return;
        }
        String type = it.optString("type");
        if ("passage".equals(type)) passage(it);
        else if ("recall".equals(type) && !it.optString("q").isEmpty()) recall(it);
        else card(it, true);
    }

    private void passage(JSONObject p) {
        LinearLayout col = column();
        col.addView(title("Read first"));
        col.addView(small(p.optString("title") + " · part " + (p.optInt("index") + 1) + " of " + p.optInt("total")));
        col.addView(reading(p.optString("text")), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        Button done = button("Done reading", () -> {
            GateStore.readDone(ctx, "passage", GateStore.passageId(p), true);
            suggest();
        });
        col.addView(done);
        col.addView(button("Something else", () -> readFirst(true)));
        show(col, false);
        holdUntilRead(done, p.optString("text"));
    }

    private void card(JSONObject c, boolean log) {
        LinearLayout col = column();
        col.addView(title(c.optString("title")));
        col.addView(reading(c.optString("text")), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        if (!c.optString("source").isEmpty()) col.addView(small(c.optString("source")));
        Button done = button("Done", () -> {
            if (log) GateStore.readDone(ctx, "read", c.optString("id"), false);
            suggest();
        });
        col.addView(done);
        show(col, false);
        holdUntilRead(done, c.optString("text"));
    }

    /** Recall beats re-reading: the question first, then the answer, then how it went. */
    private void recall(JSONObject c) {
        LinearLayout col = column();
        col.addView(small("Do you remember?"));
        col.addView(title(c.optString("q")));
        TextView answer = text(c.optString("a"));
        answer.setVisibility(View.INVISIBLE);
        col.addView(answer);
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setVisibility(View.GONE);
        Button knew = button("Knew it", () -> {
            GateStore.readDone(ctx, "knew", c.optString("id"), false);
            suggest();
        });
        Button notYet = button("Not yet", () -> {
            GateStore.readDone(ctx, "notyet", c.optString("id"), false);
            card(c, false); // read it once more before moving on (already logged)
        });
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(0, dp(56), 1);
        l.setMarginEnd(dp(6));
        knew.setLayoutParams(l);
        LinearLayout.LayoutParams r = new LinearLayout.LayoutParams(0, dp(56), 1);
        r.setMarginStart(dp(6));
        notYet.setLayoutParams(r);
        row.addView(knew);
        row.addView(notYet);
        Button reveal = button("Show answer", null);
        reveal.setOnClickListener(v -> {
            answer.setVisibility(View.VISIBLE);
            reveal.setVisibility(View.GONE);
            row.setVisibility(View.VISIBLE);
        });
        col.addView(reveal);
        col.addView(row);
        show(col, false);
    }

    /** A scrolling block of text, left-aligned and a little larger, for reading. */
    private ScrollView reading(String s) {
        TextView t = text(s);
        t.setGravity(Gravity.START);
        t.setLineSpacing(dp(4), 1f);
        ScrollView sv = new ScrollView(ctx);
        sv.addView(t);
        return sv;
    }

    /** Keeps "Done" dim and off for about 3 seconds a line (60 characters), at most 30 seconds. */
    private void holdUntilRead(Button done, String s) {
        int seconds = Math.min(30, Math.max(3, 3 * (s.length() / 60 + 1)));
        done.setEnabled(false);
        done.animate().cancel(); // the step's entrance would fade it up to full
        done.setTranslationY(0f);
        done.setAlpha(0.4f);
        handler.postDelayed(() -> {
            done.setEnabled(true);
            done.animate().alpha(1f).setDuration(200).start();
        }, seconds * 1000L);
    }

    // ---------- Note / Task ----------

    private void write(boolean note) {
        LinearLayout col = column();
        col.addView(title(note ? "Quick note" : "New task for today"));
        EditText input = new EditText(ctx);
        input.setTextColor(ctx.getColor(R.color.widget_ink));
        input.setHintTextColor(ctx.getColor(R.color.widget_dim));
        input.setHint(note ? "Goes to your Inbox" : "What needs doing?");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | (note ? InputType.TYPE_TEXT_FLAG_MULTI_LINE : 0));
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        col.addView(input);
        Runnable save = () -> {
            String text = input.getText().toString().trim();
            if (text.isEmpty()) return;
            if (note) GateStore.note(ctx, text);
            else GateStore.task(ctx, text);
            Toast.makeText(ctx, note ? "Note saved" : "Task saved", Toast.LENGTH_SHORT).show();
            finishWith(note ? "note" : "task", null, 0);
            home(); // back to the home screen, not into whatever app was open
        };
        input.setOnEditorActionListener((v, action, e) -> {
            save.run();
            return true;
        });
        col.addView(button("Save", save));
        col.addView(button("Back", this::start));
        show(col, false);
        input.requestFocus();
        input.postDelayed(() -> ((InputMethodManager) ctx.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(input, 0), 150);
    }

    // ---------- Fun: a better offer first, then what and how long ----------

    private void suggest() {
        JSONObject info = GateStore.info(ctx);
        JSONObject book = info.optJSONObject("book");
        LinearLayout col = column();
        col.addView(title("Read instead?"));
        if (book != null) {
            int pages = book.optInt("pages", 0);
            col.addView(text(book.optString("title") + (pages > 0 ? "\npage " + book.optInt("progress") + " of " + pages : "")));
        } else col.addView(text("10 pages of any book, or just sit with being bored for a minute."));
        if (info.has("bank")) col.addView(small("Game time banked: " + info.optInt("bank") + " min. Reading earns more."));
        col.addView(button("Read 10 pages", () -> turnedBack("read", "Enjoy the book.\nThose minutes are yours again.")));
        col.addView(button("Still fun", this::kinds));
        show(col, false);
    }

    private void kinds() {
        LinearLayout col = column();
        col.addView(title("What kind of fun?"));
        JSONArray kinds = GateStore.funKinds(ctx);
        for (int i = 0; i < kinds.length(); i++) {
            JSONObject k = kinds.optJSONObject(i);
            if (k != null) col.addView(button(k.optString("label"), () -> length(k)));
        }
        col.addView(button("Back", this::start));
        show(col, false);
    }

    private void length(JSONObject kind) {
        LinearLayout col = column();
        col.addView(title("For how long?"));
        col.addView(small("When it runs out, the Gate asks again."));
        String key = MODE_APP.equals(mode) && pkg != null ? pkg : kind.optString("kind");
        for (int m : GateStore.minutes(ctx)) col.addView(button(m + " min", () -> pause(GateStore.funPause(ctx, key), false, () -> {
            GateStore.countFun(ctx, key);
            beginFun(kind, m);
        })));
        col.addView(button("Back", this::kinds));
        show(col, false);
    }

    private void beginFun(JSONObject kind, int minutes) {
        GateStore.startFun(ctx, kind.optString("kind"), minutes, false);
        GateService.scheduleTimeUp();
        String app = kind.optString("app", "");
        boolean fromApp = MODE_APP.equals(mode);
        finishWith("fun", kind.optString("kind"), minutes);
        // From an unlock, open the app for that kind; from a fun app, just go back to it.
        Intent launch = !fromApp && !app.isEmpty() ? ctx.getPackageManager().getLaunchIntentForPackage(app) : null;
        if (launch != null) open(launch);
    }

    // ---------- time's up ----------

    private void timeUp() {
        LinearLayout col = column();
        int minutes = GateStore.prefs(ctx).getInt("fun_minutes", 0);
        col.addView(title("Time's up"));
        col.addView(text(minutes + " min of " + GateStore.prefs(ctx).getString("fun_kind", "fun") + "."));
        col.addView(button("Done", () -> {
            GateStore.endFun(ctx);
            turnedBack("done", "Good stop.");
        }));
        col.addView(button("10 more", () -> pause(GateStore.pauseSeconds(ctx, true), true, () -> {
            GateStore.startFun(ctx, GateStore.prefs(ctx).getString("fun_kind", "fun"), 10, true);
            GateService.scheduleTimeUp();
            finishWith("more", null, 10);
        })));
        show(col, true);
    }

    /** A breathing pause before fun (like one sec): it grows with each repeat of the same fun today
     *  (5, 10, 20, 40 s) and for each extension (15 s, then 30 s). Turning back is always one tap. */
    private void pause(int seconds, boolean extension, Runnable then) {
        int[] left = { seconds };
        LinearLayout col = column();
        TextView phase = title("Breathe in");
        col.addView(phase);
        col.addView(new GateBreath(ctx, in -> phase.setText(in ? "Breathe in" : "Breathe out")), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        TextView count = small("");
        col.addView(count);
        col.addView(button("Never mind", () -> {
            if (extension) {
                GateStore.endFun(ctx);
                turnedBack("done", "Good stop.");
            } else turnedBack("back", "You turned back.\nThat time stays yours.");
        }));
        show(col, false);
        Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (left[0] <= 0) {
                    then.run();
                    return;
                }
                count.setText((extension ? "More fun in " : "Fun in ") + left[0] + " s");
                left[0]--;
                handler.postDelayed(this, 1000);
            }
        };
        tick.run();
    }

    /** Chose not to (read instead, turned back, stopped): a short warm moment, then the home screen. */
    private void turnedBack(String choice, String message) {
        if (answered) return;
        answered = true;
        GateStore.log(ctx, choice, null, 0, "done".equals(choice) ? null : via());
        GateStore.passed(ctx);
        GateStore.syncLater(ctx);
        LinearLayout col = column();
        col.setGravity(Gravity.CENTER);
        TextView t = title(message);
        t.setTextColor(ctx.getColor(R.color.widget_brass));
        col.addView(t);
        show(col, false);
        handler.postDelayed(() -> {
            home();
            close();
        }, 1400);
    }

    // ---------- finishing ----------

    private void finishWith(String choice, String kind, int minutes) {
        if (answered) return;
        answered = true;
        GateStore.log(ctx, choice, kind, minutes, "more".equals(choice) || "done".equals(choice) ? null : via());
        GateStore.passed(ctx);
        GateStore.syncLater(ctx);
        close();
    }

    private void home() {
        open(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));
    }

    /** Opens an app right after a tap on the Gate; if the phone does not allow it, you simply stay where you are. */
    private void open(Intent intent) {
        try {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
            // blocked: nothing else to do
        }
    }

    // ---------- small view helpers (colours from res/values/widget.xml) ----------

    /** Shows a step; its parts rise and fade in one after another (a soft, quick entrance). */
    private void show(LinearLayout v, boolean dial) {
        onDial = dial;
        if (root == null) return;
        root.removeAllViews();
        root.addView(v, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.requestFocus();
        for (int i = 0; i < v.getChildCount(); i++) {
            View child = v.getChildAt(i);
            child.setAlpha(0f);
            child.setTranslationY(dp(14));
            child.animate().alpha(1f).translationY(0f).setStartDelay(i * 35L).setDuration(320)
                .setInterpolator(new android.view.animation.DecelerateInterpolator(2f)).start();
        }
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics());
    }

    private LinearLayout column() {
        LinearLayout col = new LinearLayout(ctx);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(28), dp(64), dp(28), dp(40));
        return col;
    }

    private TextView title(String s) {
        TextView t = text(s);
        t.setTextSize(28);
        t.setPadding(0, 0, 0, dp(12));
        return t;
    }

    private TextView text(String s) {
        TextView t = new TextView(ctx);
        t.setText(s);
        t.setTextColor(ctx.getColor(R.color.widget_ink));
        t.setTextSize(18);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(4), 0, dp(12));
        return t;
    }

    private TextView small(String s) {
        TextView t = text(s);
        t.setTextSize(14);
        t.setTextColor(ctx.getColor(R.color.widget_dim));
        return t;
    }

    private Button button(String label, Runnable onClick) {
        Button b = new Button(ctx);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(18);
        b.setTextColor(ctx.getColor(R.color.widget_ink));
        b.setBackgroundResource(R.drawable.gate_button);
        if (onClick != null) b.setOnClickListener(v -> onClick.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }
}
