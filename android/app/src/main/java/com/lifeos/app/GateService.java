package com.lifeos.app;

import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import java.util.HashMap;
import java.util.Map;

/**
 * The Gate's watcher: a small always-on service (with a quiet notification), NOT an Accessibility service,
 * so payment apps (Google Pay, UPI and bank apps) keep working and Play Protect does not block the app.
 *  - Unlock (fingerprint, PIN...): shows the Gate, unless you passed it within the grace time, a call is
 *    on, an alarm/clock/phone app is in front, or a fun session is running.
 *  - Opening a watched app (e.g. YouTube) without a fun session: shows the Gate for that app. Which app is
 *    in front comes from Android's usage record (Usage access), checked every second while the screen is on.
 *  - A fun session that runs out while the screen is on: shows "Time's up".
 *  - An app for both work and fun (Brave): Purpose lets it through for 10 minutes; still in front after
 *    that, the Gate asks "Still for the task?".
 * The Gate is drawn on top of everything (GateOverlay). Needs "Display over other apps" and Usage access; turned on from
 * Settings in the app (DevicePlugin.gateEnable), and started again after a restart (GateBoot).
 */
public class GateService extends Service {

    private static final String CHANNEL = "gate";
    private static GateService running;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Long> allowed = new HashMap<>(); // app -> let through until (ms); the screen going off clears it
    private String front = "";
    private String lastApp = ""; // the last real app in front (not LifeOS, not the launcher's lock screen)
    private long lastCheck = 0;
    private GateOverlay overlay;

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            String a = i.getAction();
            if (Intent.ACTION_USER_PRESENT.equals(a)) {
                watchApps();
                onUnlock();
            } else if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                allowed.clear();
                if (overlay != null) overlay.screenOff();
                handler.removeCallbacks(poll);
            } else if (Intent.ACTION_SCREEN_ON.equals(a)) watchApps();
        }
    };

    private final Runnable timeUp = this::onTimeUp;
    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            checkFront();
            handler.postDelayed(this, 1000);
        }
    };

    // ---------- turning it on and off ----------

    /** All the permissions the Gate needs are given. */
    static boolean ready(Context c) {
        return Settings.canDrawOverlays(c) && usageAccess(c);
    }

    static boolean usageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static boolean enabled(Context c) {
        return GateStore.prefs(c).getBoolean("enabled", false);
    }

    /** Starts the service when the Gate is switched on and allowed; stops it otherwise. */
    static void apply(Context c) {
        Intent i = new Intent(c, GateService.class);
        if (enabled(c) && ready(c)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
            else c.startService(i);
        } else c.stopService(i);
    }

    static boolean isRunning() {
        return running != null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        startForeground(1, notification(), Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_USER_PRESENT);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screen, f);
        GateStore.prefs(this).edit().putBoolean("was_on", true).apply();
        watchApps();
        scheduleTimeUp();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY; // Android starts it again if it has to stop it
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running = null;
        if (overlay != null) overlay.screenOff();
        handler.removeCallbacksAndMessages(null);
        try {
            unregisterReceiver(screen);
        } catch (Exception ignored) {
            // already gone
        }
        super.onDestroy();
    }

    /** A quiet notification (Android requires one for an always-on service); tapping it opens LifeOS. */
    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "The Gate", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Keeps the Gate ready after every unlock. You can hide this notification here.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent open = PendingIntent.getActivity(this, 5, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_stat_lifeos).setContentTitle("The Gate is on").setContentText("Why now? after every unlock").setContentIntent(open).build(); // not "ongoing": it can be swiped away (Android 14+)
    }

    // ---------- watching ----------

    private void watchApps() {
        handler.removeCallbacks(poll);
        handler.post(poll);
    }

    /** The app now in front, from the usage record (the last app moved to the front in the last seconds). */
    private void checkFront() {
        long now = System.currentTimeMillis();
        UsageStatsManager usm = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
        UsageEvents events = usm.queryEvents(lastCheck > 0 ? lastCheck - 1000 : now - 10_000, now);
        lastCheck = now;
        UsageEvents.Event e = new UsageEvents.Event();
        String pkg = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) pkg = e.getPackageName();
        }
        if (pkg == null || pkg.equals(front)) {
            Long until = allowed.get(front);
            // A task pass ran out while the app is still in front.
            if (until != null && until < now && (overlay == null || !overlay.showing())) gateFor(front);
            return;
        }
        front = pkg;
        if (pkg.equals(getPackageName()) || pkg.equals("com.android.systemui")) return;
        lastApp = pkg;
        gateFor(pkg);
    }

    private void gateFor(String pkg) {
        if (!GateStore.phoneOn(this) || !GateStore.watched(this, pkg) || GateStore.funActive(this)) return;
        Long until = allowed.get(pkg);
        if (until != null && until > System.currentTimeMillis()) return;
        allowed.remove(pkg);
        show(until != null ? GateOverlay.MODE_STILL : GateOverlay.MODE_APP, pkg);
    }

    private void onUnlock() {
        if (!GateStore.phoneOn(this) || GateStore.inGrace(this) || GateStore.funActive(this) || busy()) return;
        if (GateStore.isNight(this) && GateStore.urgentActive(this)) return; // an urgent pass at night
        show(GateOverlay.MODE_UNLOCK, null);
    }

    /** A call is on, or the phone/alarm app is in front (stopping an alarm must never meet the Gate). */
    private boolean busy() {
        AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        int mode = audio != null ? audio.getMode() : AudioManager.MODE_NORMAL;
        if (mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE) return true;
        String f = front.toLowerCase();
        return f.contains("clock") || f.contains("alarm") || f.contains("dialer") || f.contains("incallui") || f.contains("telecom");
    }

    private void onTimeUp() {
        long left = GateStore.funUntil(this) - System.currentTimeMillis();
        if (left > 1000) {
            scheduleTimeUp(); // the session was extended meanwhile
            return;
        }
        if (GateStore.funUntil(this) == 0) return; // stopped already
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        // Screen off when time ran out: the next unlock shows the normal Gate instead.
        if (power != null && power.isInteractive()) show(GateOverlay.MODE_TIMEUP, null);
        else GateStore.endFun(this);
    }

    /** Draws the Gate on top of everything ("Display over other apps"): OnePlus blocks opening a screen from
     *  the background, but not this. */
    private void show(String mode, String pkg) {
        if (!Settings.canDrawOverlays(this)) return;
        if (overlay == null) overlay = new GateOverlay(this);
        overlay.show(mode, pkg);
    }

    // ---------- used by the Gate screen ----------

    /** Called when a fun session starts or is extended. */
    static void scheduleTimeUp() {
        GateService s = running;
        if (s == null) return;
        s.handler.removeCallbacks(s.timeUp);
        long left = GateStore.funUntil(s) - System.currentTimeMillis();
        if (left > 0) s.handler.postDelayed(s.timeUp, left);
    }

    /** Purpose: let the app under the Gate through until the screen goes off (an app for both work and
     *  fun only for 10 minutes, then the Gate asks again). */
    static void allowUnder() {
        GateService s = running;
        if (s == null || s.lastApp.isEmpty()) return;
        boolean dual = GateStore.dual(s, s.lastApp);
        s.allowed.put(s.lastApp, dual ? System.currentTimeMillis() + 10 * 60_000L : Long.MAX_VALUE);
    }
}
