package com.lifeos.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;

/**
 * The Gate's breathing pause (like one sec): a soft circle that grows while you breathe in (4 s) and
 * shrinks while you breathe out (4 s). onPhase tells the screen which half it is in.
 */
final class GateBreath extends View {

    interface OnPhase {
        void phase(boolean in);
    }

    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint core = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ValueAnimator anim = ValueAnimator.ofFloat(0f, 1f);
    private float t; // 0 = smallest, 1 = largest

    GateBreath(Context c, OnPhase onPhase) {
        super(c);
        glow.setColor(c.getColor(R.color.widget_brass));
        core.setColor(c.getColor(R.color.widget_brass));
        anim.setDuration(4000);
        anim.setRepeatMode(ValueAnimator.REVERSE);
        anim.setRepeatCount(ValueAnimator.INFINITE);
        anim.setInterpolator(new AccelerateDecelerateInterpolator());
        anim.addUpdateListener(a -> {
            t = (float) a.getAnimatedValue();
            invalidate();
        });
        final boolean[] growing = { true };
        anim.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationRepeat(android.animation.Animator a) {
                growing[0] = !growing[0];
                onPhase.phase(growing[0]);
            }
        });
        onPhase.phase(true);
        setContentDescription("Breathing circle");
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        anim.start();
    }

    @Override
    protected void onDetachedFromWindow() {
        anim.cancel();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas c) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float max = Math.min(getWidth(), getHeight()) * 0.42f;
        float r = max * (0.45f + 0.55f * t);
        glow.setAlpha((int) (35 + 45 * t));
        c.drawCircle(cx, cy, r * 1.25f, glow);
        core.setAlpha(200);
        c.drawCircle(cx, cy, r * 0.8f, core);
    }
}
