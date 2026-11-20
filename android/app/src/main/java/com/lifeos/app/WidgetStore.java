package com.lifeos.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the home-screen widget shows and the ticks made on it.
 * The app writes today's habits here (plus the PC address and token) every time Today loads.
 * A tick on the widget changes the stored state at once, is kept in a "pending" list, and is sent
 * to the PC right away when possible; the app also picks pending ticks up the next time it opens.
 */
final class WidgetStore {

    private static final String PREFS = "lifeos_widget";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject data(Context c) {
        try {
            return new JSONObject(prefs(c).getString("data", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void setData(Context c, JSONObject data) {
        prefs(c).edit().putString("data", data.toString()).apply();
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static String stamp() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).format(new Date());
    }

    /** Toggle a habit between done and not marked; returns the new state ("done" or null). */
    static synchronized String toggle(Context c, String id) {
        JSONObject d = data(c);
        JSONArray habits = d.optJSONArray("habits");
        if (habits == null || !today().equals(d.optString("date"))) return null;
        String next = null;
        try {
            for (int i = 0; i < habits.length(); i++) {
                JSONObject h = habits.getJSONObject(i);
                if (id.equals(h.optString("id"))) {
                    next = "done".equals(h.optString("state")) ? null : "done";
                    h.put("state", next == null ? JSONObject.NULL : next);
                }
            }
            setData(c, d);
            JSONArray pending = new JSONArray(prefs(c).getString("pending", "[]"));
            JSONObject tick = new JSONObject();
            tick.put("date", d.optString("date"));
            tick.put("id", id);
            tick.put("state", next == null ? JSONObject.NULL : next);
            tick.put("at", stamp());
            pending.put(tick);
            prefs(c).edit().putString("pending", pending.toString()).apply();
        } catch (Exception ignored) {
            // Leave the widget as it was.
        }
        return next;
    }

    /** Sends pending ticks to the PC in order; keeps the ones that could not be sent. Runs off the main thread. */
    static synchronized void sendPending(Context c) {
        JSONObject d = data(c);
        String url = d.optString("url", "");
        String token = d.optString("token", "");
        if (url.isEmpty()) return;
        try {
            JSONArray pending = new JSONArray(prefs(c).getString("pending", "[]"));
            JSONArray left = new JSONArray();
            for (int i = 0; i < pending.length(); i++) {
                JSONObject t = pending.getJSONObject(i);
                boolean sent = false;
                try {
                    HttpURLConnection con = (HttpURLConnection) new URL(url + "/api/day/" + t.getString("date")).openConnection();
                    con.setConnectTimeout(3000);
                    con.setReadTimeout(8000);
                    con.setRequestMethod("PUT");
                    con.setDoOutput(true);
                    con.setRequestProperty("Content-Type", "application/json");
                    if (!token.isEmpty()) con.setRequestProperty("Authorization", "Bearer " + token);
                    JSONObject habits = new JSONObject();
                    habits.put(t.getString("id"), t.isNull("state") ? JSONObject.NULL : t.getString("state"));
                    JSONObject body = new JSONObject();
                    body.put("habits", habits);
                    body.put("at", t.getString("at"));
                    try (OutputStream o = con.getOutputStream()) {
                        o.write(body.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    int code = con.getResponseCode();
                    // 2xx: saved. 4xx: the PC refused it (e.g. the day is locked) and never will take it: drop it.
                    sent = code < 500;
                } catch (Exception e) {
                    sent = false; // PC not reachable: try again later
                }
                if (!sent) left.put(t);
            }
            prefs(c).edit().putString("pending", left.toString()).putString("sent_hint", stamp()).apply();
        } catch (Exception ignored) {
            // Keep everything for next time.
        }
    }

    /** Hands the pending ticks to the app (which sends them through its own outbox) and clears them. */
    static synchronized JSONArray takePending(Context c) {
        try {
            JSONArray pending = new JSONArray(prefs(c).getString("pending", "[]"));
            prefs(c).edit().putString("pending", "[]").apply();
            return pending;
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    // ---------- the task widget ----------

    static JSONObject taskData(Context c) {
        try {
            return new JSONObject(prefs(c).getString("tasks", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void setTaskData(Context c, JSONObject data) {
        prefs(c).edit().putString("tasks", data.toString()).apply();
    }

    /** Ticks (or unticks) the task in row `index` and keeps the change to send. */
    static synchronized void toggleTask(Context c, int index) {
        JSONObject d = taskData(c);
        JSONArray tasks = d.optJSONArray("tasks");
        if (tasks == null || index >= tasks.length() || !today().equals(d.optString("date"))) return;
        try {
            JSONObject t = tasks.getJSONObject(index);
            boolean done = !t.optBoolean("done");
            t.put("done", done);
            setTaskData(c, d);
            JSONArray pending = new JSONArray(prefs(c).getString("task_pending", "[]"));
            JSONObject tick = new JSONObject();
            tick.put("date", t.getString("date"));
            tick.put("text", t.getString("text"));
            tick.put("done", done);
            pending.put(tick);
            prefs(c).edit().putString("task_pending", pending.toString()).apply();
        } catch (Exception ignored) {
            // Leave the widget as it was.
        }
    }

    /** Sends task ticks to the PC (PUT /api/task, found by text); keeps the ones that could not be sent. */
    static synchronized void sendPendingTasks(Context c) {
        JSONObject d = data(c);
        String url = d.optString("url", "");
        String token = d.optString("token", "");
        if (url.isEmpty()) return;
        try {
            JSONArray pending = new JSONArray(prefs(c).getString("task_pending", "[]"));
            JSONArray left = new JSONArray();
            for (int i = 0; i < pending.length(); i++) {
                JSONObject t = pending.getJSONObject(i);
                boolean sent;
                try {
                    HttpURLConnection con = (HttpURLConnection) new URL(url + "/api/task").openConnection();
                    con.setConnectTimeout(3000);
                    con.setReadTimeout(8000);
                    con.setRequestMethod("PUT");
                    con.setDoOutput(true);
                    con.setRequestProperty("Content-Type", "application/json");
                    if (!token.isEmpty()) con.setRequestProperty("Authorization", "Bearer " + token);
                    JSONObject body = new JSONObject();
                    body.put("date", t.getString("date"));
                    body.put("matchText", t.getString("text"));
                    body.put("done", t.getBoolean("done"));
                    try (OutputStream o = con.getOutputStream()) {
                        o.write(body.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    sent = con.getResponseCode() < 500; // a 4xx (task gone) will never succeed: drop it
                } catch (Exception e) {
                    sent = false;
                }
                if (!sent) left.put(t);
            }
            prefs(c).edit().putString("task_pending", left.toString()).apply();
        } catch (Exception ignored) {
            // Keep everything for next time.
        }
    }

    static synchronized JSONArray takeTaskPending(Context c) {
        try {
            JSONArray pending = new JSONArray(prefs(c).getString("task_pending", "[]"));
            prefs(c).edit().putString("task_pending", "[]").apply();
            return pending;
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private WidgetStore() {}
}
