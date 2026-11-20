package com.lifeos.app;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone-only extras: screen time from Android's own usage record (needs "Usage access", granted
 * once in Android settings), and the home-screen widget's data (today's habits) and its ticks.
 */
@CapacitorPlugin(name = "LifeOSDevice")
public class DevicePlugin extends Plugin {

    // ---------- screen time ----------

    private boolean hasUsageAccess() {
        AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void usageAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasUsageAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Hours the screen was on (interactive) on a date "YYYY-MM-DD", up to now. */
    @PluginMethod
    public void screenTime(PluginCall call) {
        if (!hasUsageAccess()) {
            call.reject("Usage access not allowed");
            return;
        }
        try {
            Calendar day = Calendar.getInstance();
            day.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(call.getString("date")));
            long start = day.getTimeInMillis();
            day.add(Calendar.DAY_OF_MONTH, 1);
            long end = Math.min(day.getTimeInMillis(), System.currentTimeMillis());
            UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            UsageEvents events = usm.queryEvents(start, end);
            UsageEvents.Event e = new UsageEvents.Event();
            long on = -1;
            long total = 0;
            boolean first = true;
            while (events.hasNextEvent()) {
                events.getNextEvent(e);
                int type = e.getEventType();
                if (type == UsageEvents.Event.SCREEN_INTERACTIVE) {
                    on = e.getTimeStamp();
                    first = false;
                } else if (type == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                    // The screen was already on when the day started.
                    if (on < 0 && first) on = start;
                    if (on >= 0) total += e.getTimeStamp() - on;
                    on = -1;
                    first = false;
                }
            }
            if (on >= 0) total += end - on; // still on
            JSObject ret = new JSObject();
            ret.put("hours", Math.round(total / 360000.0) / 10.0);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject(ex.getMessage());
        }
    }

    /**
     * The screen's on/off moments for last night (18:00 the evening before `date` until noon, or now):
     * { events: [{ t: millis, on: true|false }] }. The app works out bedtime and wake time from them
     * (src/lib/sleep.ts), so the rule can be tested and changed without a new APK.
     */
    @PluginMethod
    public void screenEvents(PluginCall call) {
        if (!hasUsageAccess()) {
            call.reject("Usage access not allowed");
            return;
        }
        try {
            Calendar day = Calendar.getInstance();
            day.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(call.getString("date")));
            long from = day.getTimeInMillis() - 6 * 3600_000L;
            long end = Math.min(day.getTimeInMillis() + 12 * 3600_000L, System.currentTimeMillis());
            UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            UsageEvents events = usm.queryEvents(from, end);
            UsageEvents.Event e = new UsageEvents.Event();
            JSArray list = new JSArray();
            while (events.hasNextEvent()) {
                events.getNextEvent(e);
                int type = e.getEventType();
                if (type != UsageEvents.Event.SCREEN_INTERACTIVE && type != UsageEvents.Event.SCREEN_NON_INTERACTIVE) continue;
                JSObject x = new JSObject();
                x.put("t", e.getTimeStamp());
                x.put("on", type == UsageEvents.Event.SCREEN_INTERACTIVE);
                list.put(x);
            }
            JSObject ret = new JSObject();
            ret.put("events", list);
            ret.put("end", end);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject(ex.getMessage());
        }
    }

    // ---------- widget ----------

    /** Today's habits for the widget, and where to send ticks. */
    @PluginMethod
    public void setWidgetData(PluginCall call) {
        try {
            JSONObject data = new JSONObject();
            data.put("date", call.getString("date"));
            data.put("url", call.getString("url", ""));
            data.put("token", call.getString("token", ""));
            JSONArray habits = call.getArray("habits", new JSArray());
            data.put("habits", habits);
            WidgetStore.setData(getContext(), data);
            HabitWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getMessage());
        }
    }

    /** Asks the launcher to add a LifeOS widget ("tasks", or the habits one) to the home screen. */
    @PluginMethod
    public void pinWidget(PluginCall call) {
        android.appwidget.AppWidgetManager manager = android.appwidget.AppWidgetManager.getInstance(getContext());
        Class<?> which = "tasks".equals(call.getString("kind", "")) ? TaskWidget.class : HabitWidget.class;
        JSObject ret = new JSObject();
        boolean ok = manager.isRequestPinAppWidgetSupported()
            && manager.requestPinAppWidget(new android.content.ComponentName(getContext(), which), null, null);
        ret.put("asked", ok);
        call.resolve(ret);
    }

    /** The task widget's rows: [{ date, text, meta, done }] (plus today's date). */
    @PluginMethod
    public void setTaskWidget(PluginCall call) {
        try {
            JSONObject data = new JSONObject();
            data.put("date", call.getString("date"));
            data.put("tasks", call.getArray("tasks", new JSArray()));
            WidgetStore.setTaskData(getContext(), data);
            TaskWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getMessage());
        }
    }

    /** Task ticks made on the widget that have not reached the PC yet; the app sends them itself. */
    @PluginMethod
    public void takeTaskTicks(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray ticks = new JSArray();
        JSONArray pending = WidgetStore.takeTaskPending(getContext());
        for (int i = 0; i < pending.length(); i++) ticks.put(pending.optJSONObject(i));
        ret.put("ticks", ticks);
        call.resolve(ret);
    }

    /** Back to the home screen (after a reminder's Done/Snooze button opened the app just for that). */
    @PluginMethod
    public void toBack(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }

    /** Ticks made on the widget that have not reached the PC yet; the app sends them itself. */
    @PluginMethod
    public void takeWidgetTicks(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray ticks = new JSArray();
        JSONArray pending = WidgetStore.takePending(getContext());
        for (int i = 0; i < pending.length(); i++) ticks.put(pending.optJSONObject(i));
        ret.put("ticks", ticks);
        call.resolve(ret);
    }
}
