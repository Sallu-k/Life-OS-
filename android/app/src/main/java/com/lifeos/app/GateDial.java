package com.lifeos.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;

/**
 * The Gate's slider: a circle with a choice on each side. Drag the circle toward a choice (or tap the
 * choice's word) to pick it. Right = Purpose, left = Leisure.
 */
final class GateDial extends View {

    interface OnPick {
        void pick(int choice);
    }

    // Two directions: right for Purpose (something needs doing), left for Leisure (fun). Note and Task are
    // buttons on the Gate itself (GateOverlay).
    static final int PURPOSE = 0, LEISURE = 1;
    private static final String[] LABELS = { "Purpose", "Leisure" };
    private static final float[][] DIR = { { 1, 0 }, { -1, 0 } };

    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint knob = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final OnPick onPick;
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private float dx, dy; // how far the circle is dragged from the middle
    private float downX, downY;
    private int downLabel = -1; // the word the finger went down on, if any
    private final float slop = android.view.ViewConfiguration.get(getContext()).getScaledTouchSlop();
    private boolean dragging;
    private int lastLean = -1; // for a light tick each time the circle leans toward another choice
    private android.animation.ValueAnimator back; // the spring back to the middle

    GateDial(Context c, OnPick onPick) {
        super(c);
        this.onPick = onPick;
        float dp = getResources().getDisplayMetrics().density;
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(2 * dp);
        ring.setColor(c.getColor(R.color.widget_line_strong));
        knob.setColor(c.getColor(R.color.widget_brass));
        text.setColor(c.getColor(R.color.widget_ink));
        text.setTextSize(20 * dp);
        text.setTextAlign(Paint.Align.CENTER);
        hot.set(text);
        hot.setColor(c.getColor(R.color.widget_brass));
        hot.setFakeBoldText(true);
        hot.setTextSize(23 * dp);
        glow.setColor(c.getColor(R.color.widget_brass));
        setContentDescription("Choose: slide right for Purpose, left for Leisure. Or tap a word.");
    }

    private float reach() {
        return getWidth() * 0.23f; // leaves room for a word on each side
    }

    /** Where the fingerprint sensor is, as a share of the screen height (many phones have it in the display, low down). */
    private static final float FINGER = 0.80f;

    /** The circle sits where the thumb already is after unlocking (over the fingerprint sensor), but never
     *  so low that "Task" below it would be cut off. */
    private float centerY() {
        int[] loc = new int[2];
        getLocationOnScreen(loc);
        float want = getRootView().getHeight() * FINGER - loc[1];
        float room = reach() + text.getTextSize() * 2.2f;
        return Math.max(room, Math.min(getHeight() - room, want));
    }

    private int leaning() {
        float dist = (float) Math.hypot(dx, dy);
        if (dist < reach() * 0.25f) return -1;
        if (Math.abs(dy) > Math.abs(dx)) return -1; // up or down means nothing
        return dx > 0 ? PURPOSE : LEISURE;
    }

    @Override
    protected void onDraw(Canvas c) {
        float cx = getWidth() / 2f, cy = centerY(), r = reach();
        c.drawCircle(cx, cy, r, ring);
        int lean = leaning();
        float pull = Math.min(1f, (float) Math.hypot(dx, dy) / r); // 0 in the middle, 1 at the edge
        text.setAlpha(lean >= 0 ? 110 : 255); // the other choices step back while one is chosen
        for (int i = 0; i < LABELS.length; i++) {
            float x = cx + DIR[i][0] * labelOffset(i);
            float y = cy + text.getTextSize() / 3;
            c.drawText(LABELS[i], x, y, i == lean ? hot : text);
        }
        // A soft halo that grows as the circle is pulled, then the circle itself (a little larger while held).
        glow.setAlpha((int) (40 + 60 * pull));
        c.drawCircle(cx + dx, cy + dy, r * (0.36f + 0.12f * pull), glow);
        c.drawCircle(cx + dx, cy + dy, r * (dragging ? 0.30f : 0.28f), knob);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        float cx = getWidth() / 2f, cy = centerY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (back != null) back.cancel();
                dragging = Math.hypot(e.getX() - cx, e.getY() - cy) < reach() * 0.5f;
                if (dragging) invalidate();
                // A tap on a word is decided when the finger lifts (see ACTION_UP), so empty space,
                // edge swipes (Back) and a finger that slides never pick anything.
                downX = e.getX();
                downY = e.getY();
                downLabel = dragging ? -1 : tappedLabel(e.getX() - cx, e.getY() - cy);
                return true;
            case MotionEvent.ACTION_MOVE:
                if (!dragging) return true;
                dx = e.getX() - cx;
                dy = e.getY() - cy;
                float dist = (float) Math.hypot(dx, dy);
                if (dist > reach()) {
                    dx *= reach() / dist;
                    dy *= reach() / dist;
                }
                int lean = leaning();
                if (lean != lastLean && lean >= 0) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
                lastLean = lean;
                if (Math.hypot(dx, dy) >= reach() * 0.85f && lean >= 0) done(lean);
                invalidate();
                return true;
            case MotionEvent.ACTION_UP:
                if (!dragging && downLabel >= 0 && Math.hypot(e.getX() - downX, e.getY() - downY) < slop
                    && tappedLabel(e.getX() - cx, e.getY() - cy) == downLabel) {
                    done(downLabel);
                    return true;
                }
                dragging = false;
                springBack();
                return true;
            case MotionEvent.ACTION_CANCEL:
                dragging = false;
                springBack();
                return true;
            default:
                return true;
        }
    }

    /** Let go early: the circle springs back to the middle with a small overshoot. */
    private void springBack() {
        lastLean = -1;
        float fromX = dx, fromY = dy;
        back = android.animation.ValueAnimator.ofFloat(1f, 0f);
        back.setDuration(420);
        back.setInterpolator(new android.view.animation.OvershootInterpolator(2.2f));
        back.addUpdateListener(a -> {
            float f = (float) a.getAnimatedValue();
            dx = fromX * f;
            dy = fromY * f;
            invalidate();
        });
        back.start();
    }

    /** A tap outside the circle picks the choice on that side. */
    /** The word under the finger (x, y from the circle's middle), or -1: only close to a word counts. */
    private int tappedLabel(float x, float y) {
        float ts = text.getTextSize();
        for (int i = 0; i < LABELS.length; i++) {
            float lx = DIR[i][0] * labelOffset(i);
            if (Math.abs(x - lx) < hot.measureText(LABELS[i]) / 2 + ts && Math.abs(y) < ts * 1.5f) return i;
        }
        return -1;
    }

    /** How far a word's middle is from the circle's middle: just outside the ring, never off the screen. */
    private float labelOffset(int i) {
        float half = hot.measureText(LABELS[i]) / 2;
        return Math.min(reach() + text.getTextSize() * 0.6f + half, getWidth() / 2f - half - 4);
    }

    private void done(int choice) {
        dragging = false;
        dx = dy = 0;
        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        invalidate();
        onPick.pick(choice);
    }
}
