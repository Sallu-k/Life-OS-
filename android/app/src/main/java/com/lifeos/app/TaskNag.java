package com.lifeos.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Task reminders that keep coming back until the task is done (like Tasks.org), sent by the app
 * (src/lib/phoneReminders.ts, DevicePlugin.setTaskNags) for each task with a rhythm:
 *   high priority  every 30 min, and it cannot be swiped away (only Done or Snooze clear it)
 *   medium         every 2 hours
 *   🔔 nag         every 15 min
 * from the task's time (or 09:00) until the night lock. Each task has ONE notification that rings again
 * and replaces itself, so they never pile up. Done ticks the task (through the Gate's queue to the PC);
 * Snooze waits an hour. Alarms are set one at a time (the next one when one rings) and again after a
 * restart (GateBoot). The task list is replaced every time the app rebuilds its reminders.
 */
public class TaskNag extends BroadcastReceiver {

    private static final String PREFS = "lifeos_nag";
    private static final String FIRE = "com.lifeos.app.NAG_FIRE", DONE = "com.lifeos.app.NAG_DONE", SNOOZE = "com.lifeos.app.NAG_SNOOZE";
    private static final String CH_HIGH = "tasks_high", CH_NORMAL = "tasks_rhythm";
    private static final long SNOOZE_MS = 60 * 60_000L;

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static int idOf(String key) {
        return 0x40000000 | (key.hashCode() & 0x0FFFFFFF); // far from the Gate's (1) and Capacitor's ids
    }

    // ---------- the list from the app ----------

    /** Replaces the list: [{ key, date, text, title, body, priority, first (ms), every (min), until (ms), sticky }].
     *  Tasks no longer on it (done, moved) lose their alarm and their notification. */
    static synchronized void set(Context c, JSONArray list) {
        JSONArray old = list(c);
        JSONArray done = new JSONArray();
        JSONArray wasDone = array(prefs(c).getString("done", "[]"));
        java.util.Set<String> keys = new java.util.HashSet<>();
        for (int i = 0; i < list.length(); i++) keys.add(list.optJSONObject(i).optString("key"));
        for (int i = 0; i < old.length(); i++) {
            String k = old.optJSONObject(i).optString("key");
            if (!keys.contains(k)) cancel(c, k);
        }
        // Done here but not yet seen by the PC: stays done (the app may still list it as open for a while).
        for (int i = 0; i < wasDone.length(); i++) if (keys.contains(wasDone.optString(i))) done.put(wasDone.optString(i));
        SharedPreferences.Editor e = prefs(c).edit().putString("list", list.toString()).putString("done", done.toString());
        for (String k : prefs(c).getAll().keySet()) {
            boolean perTask = k.startsWith("count_") || k.startsWith("snooze_");
            if (perTask && !keys.contains(k.substring(k.indexOf('_') + 1))) e.remove(k); // tasks gone from the list
        }
        e.apply();
        rearm(c);
    }

    /** Sets every task's next alarm (after a restart, or a new list). */
    static synchronized void rearm(Context c) {
        JSONArray list = list(c);
        for (int i = 0; i < list.length(); i++) arm(c, list.optJSONObject(i), 0);
    }

    private static JSONArray list(Context c) {
        return array(prefs(c).getString("list", "[]"));
    }

    private static JSONArray array(String s) {
        try {
            return new JSONArray(s);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONObject find(Context c, String key) {
        JSONArray list = list(c);
        for (int i = 0; i < list.length(); i++) if (key.equals(list.optJSONObject(i).optString("key"))) return list.optJSONObject(i);
        return null;
    }

    private static boolean isDone(Context c, String key) {
        JSONArray done = array(prefs(c).getString("done", "[]"));
        for (int i = 0; i < done.length(); i++) if (key.equals(done.optString(i))) return true;
        return false;
    }

    // ---------- alarms ----------

    /** The next ring: the first time, else the next step of the rhythm after now (or after a snooze). */
    private static void arm(Context c, JSONObject t, long after) {
        if (t == null) return;
        String key = t.optString("key");
        if (isDone(c, key)) return;
        long now = System.currentTimeMillis();
        long first = t.optLong("first"), every = Math.max(5, t.optInt("every", 30)) * 60_000L, until = t.optLong("until");
        long from = Math.max(now, after);
        long next = first >= from ? first : first + ((from - first) / every + 1) * every;
        long snoozed = prefs(c).getLong("snooze_" + key, 0);
        if (snoozed > next) next = snoozed;
        if (next > until) return; // the night lock: no more today
        alarm(c, key, next);
    }

    private static PendingIntent intent(Context c, String action, String key, int code) {
        Intent i = new Intent(c, TaskNag.class).setAction(action).putExtra("key", key);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void alarm(Context c, String key, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = intent(c, FIRE, key, idOf(key));
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); // without "Alarms & reminders": a few minutes late
    }

    private static void cancel(Context c, String key) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(intent(c, FIRE, key, idOf(key)));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(idOf(key));
    }

    // ---------- ringing and the buttons ----------

    @Override
    public void onReceive(Context c, Intent i) {
        String key = i.getStringExtra("key");
        if (key == null) return;
        String action = i.getAction();
        if (FIRE.equals(action)) fire(c, key);
        else if (DONE.equals(action)) done(c, key);
        else if (SNOOZE.equals(action)) snooze(c, key);
    }

    private static synchronized void fire(Context c, String key) {
        JSONObject t = find(c, key);
        if (t == null || isDone(c, key)) return;
        int count = prefs(c).getInt("count_" + key, 0) + 1;
        prefs(c).edit().putInt("count_" + key, count).remove("snooze_" + key).apply();
        notify(c, t, count);
        arm(c, t, System.currentTimeMillis() + 1000); // the next step of the rhythm
    }

    private static synchronized void done(Context c, String key) {
        JSONObject t = find(c, key);
        JSONArray d = array(prefs(c).getString("done", "[]"));
        // Every entry of the same task (an overdue one rings today and tomorrow) stops.
        JSONArray list = list(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject x = list.optJSONObject(i);
            boolean same = x.optString("key").equals(key) || (t != null && t.optString("date").equals(x.optString("date")) && t.optString("text").equals(x.optString("text")));
            if (!same) continue;
            cancel(c, x.optString("key"));
            d.put(x.optString("key"));
        }
        cancel(c, key);
        prefs(c).edit().putString("done", d.toString()).apply();
        if (t != null) GateStore.tickTask(c, t.optString("date"), t.optString("text"));
    }

    private static synchronized void snooze(Context c, String key) {
        long at = System.currentTimeMillis() + SNOOZE_MS;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(idOf(key));
        prefs(c).edit().putLong("snooze_" + key, at).apply();
        alarm(c, key, at);
    }

    private static void notify(Context c, JSONObject t, int count) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        boolean high = "high".equals(t.optString("priority")) || t.optInt("every", 30) <= 15;
        String channel = high ? CH_HIGH : CH_NORMAL;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channel) == null) {
            NotificationChannel ch = high
                ? new NotificationChannel(CH_HIGH, "Important tasks", NotificationManager.IMPORTANCE_HIGH)
                : new NotificationChannel(CH_NORMAL, "Task reminders", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(high ? "High-priority and 🔔 tasks: ring again until done" : "Medium-priority tasks: every 2 hours until done");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        String key = t.optString("key");
        int id = idOf(key);
        PendingIntent open = PendingIntent.getActivity(c, id, new Intent(c, MainActivity.class).putExtra(MainActivity.EXTRA_PAGE, "/today/").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        String body = t.optString("body") + (count > 1 ? " · reminder " + count : "");
        b.setSmallIcon(R.drawable.ic_stat_lifeos)
            .setContentTitle(t.optString("title"))
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setContentIntent(open)
            .setOngoing(t.optBoolean("sticky"))
            .setAutoCancel(!t.optBoolean("sticky"))
            .setOnlyAlertOnce(false) // every ring alerts again, on the same notification
            .setWhen(System.currentTimeMillis())
            .addAction(new Notification.Action.Builder(null, "Done", intent(c, DONE, key, id + 1)).build())
            .addAction(new Notification.Action.Builder(null, "Snooze 1 h", intent(c, SNOOZE, key, id + 2)).build());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(high ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT).setDefaults(Notification.DEFAULT_ALL);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // notifications are off for LifeOS
        }
    }
}
