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
 * Purpose is one slide with no questions, except for a watched app (YouTube, Brave...):
 * one fact for 5 s (none repeats within 10), then 10 minutes. Urgent at night: reading (15 s, then 30 s, then a minute each night;
 * your book or a fact), then no Gate until the phone has been away 5 minutes. Leisure first asks you to read a little (a card, a recall
 * question or the next passage of your long read), then offers your book, then asks what kind and for how
 * long; the session runs out and asks again, with one more thing to learn and a longer "more" each time.
 * No waiting until the day's leisure passes gate.cap (3 h); then the growing breaths return. Note and Task save straight to the PC (queued when it is
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
        close(false);
    }

    private void close() {
        close(true);
    }

    /** Fades away (160 ms) instead of vanishing; the screen-off case closes at once (with the screen off the
     *  fade never runs, and a Gate left behind hides the lock screen wallpaper as a black screen). */
    private void close(boolean fade) {
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
        if (fade) gone.animate().alpha(0f).scaleX(0.98f).scaleY(0.98f).setDuration(160).withEndAction(remove).start();
        else remove.run();
    }

    private String via() {
        return MODE_APP.equals(mode) || MODE_STILL.equals(mode) ? "app" : MODE_UNLOCK.equals(mode) ? "unlock" : null;
    }

    private void start() {
        handler.removeCallbacksAndMessages(null);
        if (GateStore.isNight(ctx)) {
            if (MODE_TIMEUP.equals(mode)) GateStore.endFun(ctx);
            night();
        } else if (MODE_TIMEUP.equals(mode)) timeUp();
        else if (MODE_STILL.equals(mode)) still();
        else dial();
    }

    // ---------- night lock: sleep comes first ----------

    /** After the night lock starts: no Purpose, no Leisure. Sleep, a note for tomorrow, or Urgent. */
    private void night() {
        LinearLayout col = column();
        col.addView(title("Time to sleep"));
        col.addView(text("After " + GateStore.nightFrom(ctx) + " sleep comes first.\nTomorrow starts tonight."));
        col.addView(button("Sleep", () -> turnedBack("back", "Good night.\nSleep well.")));
        col.addView(button("Note for tomorrow", () -> write(true)));
        col.addView(button("Urgent", this::urgent));
        show(col, false);
    }

    /** Urgent at night: say what (a few words), wait a minute, then 15 minutes without the Gate. */
    private void urgent() {
        LinearLayout col = column();
        col.addView(title("What is urgent?"));
        col.addView(small("A few words. Then a little reading (longer each time tonight), then open until the phone is away for 5 minutes."));
        EditText input = new EditText(ctx);
        input.setTextColor(ctx.getColor(R.color.widget_ink));
        input.setHintTextColor(ctx.getColor(R.color.widget_dim));
        input.setHint("e.g. reply to the class group about tomorrow");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        col.addView(input);
        Button go = button("Continue", () -> readPause(GateStore.urgentSeconds(ctx), "A little reading first", readingFor(), () -> {
            GateStore.allowUrgent(ctx);
            finishWith("unlock", "urgent", 0);
        }, this::night));
        go.setEnabled(false);
        go.setAlpha(0.4f);
        input.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(android.text.Editable s) {
                boolean ok = s.toString().trim().length() >= 12; // the reason is never saved: it is for you
                go.setEnabled(ok);
                go.setAlpha(ok ? 1f : 0.4f);
            }
        });
        col.addView(go);
        col.addView(button("Back", this::night));
        show(col, false);
        input.requestFocus();
        input.postDelayed(() -> ((InputMethodManager) ctx.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(input, 0), 150);
    }

    // ---------- step 1: the choices ----------

    private void dial() {
        LinearLayout col = column();
        col.addView(title(MODE_APP.equals(mode) ? "Opening a leisure app" : "Why now?"));
        String context = contextLine();
        if (context != null) col.addView(text(context));
        JSONObject one = oneThing();
        if (one != null) oneThingRow(col, one);
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
        boolean watchedApp = purposeApp() != null;
        col.addView(small(watchedApp ? "Right for a task (a short read, then 10 min), left for Leisure" : one != null ? "Slide right to do it, left for Leisure" : "Slide right for Purpose, left for Leisure"));
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
        if (oneThing() != null) return null; // the task has its own row
        String task = info.optString("nextTask", "");
        if (!task.isEmpty()) return "Next: " + task;
        JSONObject book = info.optJSONObject("book");
        if (book != null && book.optInt("pages", 0) > 0) return (book.optInt("pages") - book.optInt("progress")) + " pages left in " + book.optString("title");
        return null;
    }

    /** Your one thing: the most important open task (the server ranks them: priority, overdue, time). */
    private JSONObject oneThing() {
        JSONArray top = GateStore.info(ctx).optJSONArray("topTasks");
        return top != null && top.length() > 0 ? top.optJSONObject(0) : null;
    }

    /** "Your one thing · why", then the task with Done beside it (Done ticks it and shows the next one). */
    private void oneThingRow(LinearLayout col, JSONObject t) {
        String why = t.optBoolean("overdue") ? "overdue" : t.optBoolean("deadline") ? "has a deadline"
            : "high".equals(t.optString("priority")) ? "high priority" : !t.optString("time").isEmpty() && !"null".equals(t.optString("time")) ? "at " + t.optString("time") : "today";
        col.addView(small("Your one thing · " + why));
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView task = text(t.optString("text"));
        task.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        task.setMaxLines(2);
        task.setEllipsize(android.text.TextUtils.TruncateAt.END);
        task.setPadding(0, 0, dp(10), 0);
        row.addView(task, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        Button done = button("Done", () -> {
            GateStore.taskDone(ctx, t);
            dial(); // the next one takes its place
        });
        row.addView(done, new LinearLayout.LayoutParams(dp(96), dp(48)));
        col.addView(row);
    }

    private void picked(int choice) {
        // The log keeps its words ("unlock" for Purpose, "fun" for Leisure), so history and Insights still match.
        if (choice != GateDial.PURPOSE) readFirst();
        else if (purposeApp() != null) purposeRead();
        else {
            GateService.allowUnder();
            finishWith("unlock", null, 0);
        }
    }

    /** A task pass in a work-and-fun app (Brave) ran out with the app still open. */
    private void still() {
        LinearLayout col = column();
        col.addView(title("Still for the task?"));
        col.addView(small("10 minutes are up."));
        col.addView(button("Yes, 10 more min", this::purposeRead));
        col.addView(button("Task done", () -> turnedBack("done", "Good work.")));
        col.addView(button("It's leisure now", () -> readFirst()));
        show(col, false);
    }

    // ---------- Purpose in a watched app: a short read, then 10 minutes ----------

    /** The watched app this Purpose is for (YouTube, Brave...), or null when it needs no read: the app that
     *  brought the Gate, or the app under the unlock Gate. */
    private String purposeApp() {
        if ((MODE_APP.equals(mode) || MODE_STILL.equals(mode)) && pkg != null) return pkg;
        return MODE_UNLOCK.equals(mode) ? GateService.watchedUnder() : null;
    }

    /** One fact for 5 s (never one of the last 10 shown), then 10 minutes in the app. */
    private void purposeRead() {
        readPause(5, "For the task: one fact first", GateStore.nextFact(ctx), () -> {
            GateService.allowUnder();
            finishWith("unlock", null, 0);
        }, this::start);
    }

    // ---------- a moment of reading instead of waiting (Urgent, Purpose) ----------

    /** `it` to read while the time runs (Urgent: readingFor(); Purpose: a fact). "Continue" opens when the
     *  time is up (a bar fills meanwhile). Nothing cached: the breathing pause instead. */
    private void readPause(int seconds, String label, JSONObject it, Runnable then, Runnable back) {
        if (it == null) {
            pause(seconds, false, then, "Continue in ");
            return;
        }
        boolean passage = "passage".equals(it.optString("type"));
        LinearLayout col = column();
        col.setPadding(col.getPaddingLeft(), dp(48), col.getPaddingRight(), col.getPaddingBottom());
        col.addView(small(label));
        String head = passage ? it.optString("title") + chapterOf(it) : it.optString("title");
        TextView t = title(head);
        t.setTextSize(24);
        col.addView(t);
        col.addView(reading(it.optString("text")), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        View bar = new View(ctx);
        bar.setBackgroundColor(ctx.getColor(R.color.widget_brass));
        bar.setPivotX(0f);
        bar.setScaleX(0f);
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(3));
        barLp.topMargin = dp(10);
        col.addView(bar, barLp);
        Button go = button("Continue in " + seconds + " s", () -> {
            if (passage) GateStore.readDone(ctx, "passage", GateStore.passageId(it), true);
            else {
                GateStore.readDone(ctx, "read", it.optString("id"), false);
                GateStore.factShown(ctx, it.optString("id"));
            }
            then.run();
        });
        go.setEnabled(false);
        col.addView(go);
        col.addView(button("Back", back));
        show(col, false);
        go.animate().cancel(); // the step's entrance would fade it up to full
        go.setAlpha(0.45f);
        go.setTranslationY(0f);
        bar.animate().scaleX(1f).setDuration(seconds * 1000L).setInterpolator(new android.view.animation.LinearInterpolator()).start();
        int[] left = { seconds };
        Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (left[0] <= 0) {
                    go.setText("Continue");
                    go.setEnabled(true);
                    go.animate().alpha(1f).setDuration(220).start();
                    return;
                }
                go.setText("Continue in " + left[0] + " s");
                left[0]--;
                handler.postDelayed(this, 1000);
            }
        };
        tick.run();
    }

    /** Urgent's reading: the book, else a fact. */
    private JSONObject readingFor() {
        JSONObject p = book();
        if (p != null && !p.optString("text").isEmpty()) return p;
        return GateStore.nextFact(ctx);
    }

    private static String chapterOf(JSONObject p) {
        String c = p.optString("chapter", "");
        return c.isEmpty() || "null".equals(c) ? "" : " · " + c;
    }

    // ---------- Leisure: read a little first ----------

    /** A fact first (a recall question when one is due); "Done" opens after a few seconds per line, so it
     *  is read, not skipped. Under it, "Continue my book" opens the book reader in LifeOS instead.
     *  Nothing cached: the book alone, or straight on. */
    private void readFirst() {
        JSONObject it = GateStore.nextReading(ctx, true);
        if (it == null) {
            if (!bookOnly()) suggest();
            return;
        }
        if ("recall".equals(it.optString("type")) && !it.optString("q").isEmpty()) recall(it);
        else card(it, true);
    }

    /** The book being read (the next part the server offers), or null. */
    private JSONObject book() {
        JSONObject k = GateStore.info(ctx).optJSONObject("knowledge");
        return k != null ? k.optJSONObject("passage") : null;
    }

    /** "Continue my book": counts as taking the reading suggestion, and LifeOS opens at the reader. */
    private void bookButton(LinearLayout col) {
        JSONObject p = book();
        if (p == null) return;
        String where = p.optString("chapter", "");
        col.addView(small(p.optString("title") + (where.isEmpty() || "null".equals(where) ? "" : " · " + where)));
        col.addView(button("Continue my book", () -> {
            finishWith("read", null, 0);
            open(new Intent(ctx, MainActivity.class).putExtra(MainActivity.EXTRA_PAGE, "/read/"));
        }));
    }

    /** No fact cached, but a book: offer it, or move on. */
    private boolean bookOnly() {
        if (book() == null) return false;
        LinearLayout col = column();
        col.addView(title("Read first?"));
        bookButton(col);
        col.addView(button("Not now", this::suggest));
        show(col, false);
        return true;
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
        bookButton(col);
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
        bookButton(col);
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

    /** Keeps "Done" dim and off: 5 s (never easier than Purpose), past the leisure cap about 3 s a line
     *  (60 characters), at most 30 s. */
    private void holdUntilRead(Button done, String s) {
        int seconds = GateStore.overCap(ctx) ? Math.min(30, Math.max(5, 3 * (s.length() / 60 + 1))) : 5;
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
        // Leisure ends when the night lock starts: only lengths that fit (or what is left, if at least 5 min).
        int left = GateStore.minutesToNight(ctx);
        java.util.List<Integer> fits = new java.util.ArrayList<>();
        for (int m : GateStore.minutes(ctx)) if (m <= left) fits.add(m);
        if (fits.isEmpty() && left >= 5) fits.add(left);
        if (fits.isEmpty()) {
            night();
            return;
        }
        if (left < 60) col.addView(small("Night lock at " + GateStore.nightFrom(ctx) + ": " + left + " min left."));
        if (GateStore.overCap(ctx)) col.addView(small("Over " + hours(GateStore.cap(ctx)) + " of leisure today: a breath first again."));
        for (int m : fits) col.addView(button(m + " min", () -> pause(GateStore.funPause(ctx, key), false, () -> {
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
        // One thing to learn while you choose ; no waiting before the cap.
        JSONObject bit = GateStore.nextReading(ctx, true);
        if (bit != null) {
            col.addView(small(bit.optString("title")));
            col.addView(reading(bit.optString("text")), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        }
        Runnable seen = () -> {
            if (bit != null) GateStore.readDone(ctx, "read", bit.optString("id"), false);
        };
        if (GateStore.overCap(ctx)) col.addView(small("Over " + hours(GateStore.cap(ctx)) + " of leisure today: the pauses are back."));
        col.addView(button("Done", () -> {
            seen.run();
            GateStore.endFun(ctx);
            turnedBack("done", "Good stop.");
        }));
        int more = Math.min(GateStore.moreMinutes(ctx), GateStore.minutesToNight(ctx)); // never past the night lock
        if (more >= 5) col.addView(button(more + " more", () -> pause(GateStore.pauseSeconds(ctx, true), true, () -> {
            seen.run();
            GateStore.startFun(ctx, GateStore.prefs(ctx).getString("fun_kind", "fun"), more, true);
            GateService.scheduleTimeUp();
            finishWith("more", null, more);
        })));
        show(col, true);
    }

    /** 180 -> "3 h", 150 -> "2 h 30 min". */
    private static String hours(int minutes) {
        return minutes / 60 + " h" + (minutes % 60 > 0 ? " " + minutes % 60 + " min" : "");
    }

    /** Past the leisure cap, a breathing pause before fun (like one sec): it grows with each repeat of the same fun today
     *  (5, 10, 20, 40 s) and for each extension (15 s, then 30 s). Turning back is always one tap. */
    private void pause(int seconds, boolean extension, Runnable then) {
        pause(seconds, extension, then, extension ? "More fun in " : "Fun in ");
    }

    private void pause(int seconds, boolean extension, Runnable then, String label) {
        if (seconds <= 0) { // under the day's leisure cap: no waiting
            then.run();
            return;
        }
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
                count.setText(label + left[0] + " s");
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

    /** Shows a step: the last one fades up and away while the new one's parts rise and fade in one after
     *  another (a soft, quick hand-over instead of a jump). */
    private void show(LinearLayout v, boolean dial) {
        onDial = dial;
        if (root == null) return;
        FrameLayout r = root;
        while (r.getChildCount() > 1) r.removeViewAt(0); // a hand-over still running: finish it now
        View old = r.getChildCount() > 0 ? r.getChildAt(0) : null;
        r.addView(v, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (old != null) {
            old.setEnabled(false);
            old.animate().cancel();
            old.animate().alpha(0f).translationY(-dp(10)).setDuration(140).setStartDelay(0)
                .withEndAction(() -> r.removeView(old)).start();
        }
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
        // Pressing sinks it a little; letting go springs it back (feels like a real button).
        b.setOnTouchListener((v, e) -> {
            int a = e.getActionMasked();
            if (a == android.view.MotionEvent.ACTION_DOWN && v.isEnabled()) v.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start();
            else if (a == android.view.MotionEvent.ACTION_UP || a == android.view.MotionEvent.ACTION_CANCEL)
                v.animate().scaleX(1f).scaleY(1f).setDuration(160).setInterpolator(new android.view.animation.OvershootInterpolator(2f)).start();
            return false;
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }
}
