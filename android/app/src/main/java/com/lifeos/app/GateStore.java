package com.lifeos.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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
 * The Gate's memory on the phone: what to show (a cached copy of the PC's GET /api/gate, so the Gate
 * never waits on the network), the current fun session, and a queue of things to send to the PC
 * (choices, notes, tasks). The queue is sent whenever the PC can be reached; nothing is lost offline.
 * The PC address and token come from the widget data the app saves when Today loads (WidgetStore).
 */
final class GateStore {

    private static final String PREFS = "lifeos_gate";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String now() {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date());
    }

    // ---------- what to show ----------

    /** The cached settings + book + game-time bank, with safe defaults before the first sync. */
    static JSONObject info(Context c) {
        try {
            return new JSONObject(prefs(c).getString("info", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static boolean phoneOn(Context c) {
        return info(c).optBoolean("phone", true);
    }

    static long graceMs(Context c) {
        return info(c).optInt("grace", 2) * 60_000L;
    }

    /** The fun kinds to offer: [{kind, label, app}]. */
    static JSONArray funKinds(Context c) {
        JSONArray fun = info(c).optJSONArray("fun");
        if (fun != null && fun.length() > 0) return fun;
        JSONArray d = new JSONArray();
        String[][] kinds = { { "comics", "Comics", "com.brave.browser" }, { "videos", "Videos", "com.google.android.youtube" }, { "chat", "Chat", "com.whatsapp" }, { "games", "Games", "" } };
        try {
            for (String[] k : kinds) d.put(new JSONObject().put("kind", k[0]).put("label", k[1]).put("app", k[2]));
        } catch (Exception ignored) {
            // JSONObject.put only throws for bad numbers
        }
        return d;
    }

    static int[] minutes(Context c) {
        JSONArray m = info(c).optJSONArray("minutes");
        if (m == null || m.length() == 0) return new int[] { 10, 20, 30 };
        int[] out = new int[m.length()];
        for (int i = 0; i < out.length; i++) out[i] = m.optInt(i, 10);
        return out;
    }

    /** Apps that bring the Gate back when opened without a fun session. */
    static boolean watched(Context c, String pkg) {
        if (dual(c, pkg)) return true;
        JSONArray w = info(c).optJSONArray("watch");
        if (w == null) return "com.google.android.youtube".equals(pkg) || "com.instagram.android".equals(pkg);
        for (int i = 0; i < w.length(); i++) if (pkg.equals(w.optString(i))) return true;
        return false;
    }

    /** Apps used for both work and fun (Brave: tasks and comics): Purpose lets them through for 10 minutes. */
    static boolean dual(Context c, String pkg) {
        JSONArray d = info(c).optJSONArray("dual");
        if (d == null) return "com.brave.browser".equals(pkg);
        for (int i = 0; i < d.length(); i++) if (pkg.equals(d.optString(i))) return true;
        return false;
    }

    // ---------- reading before leisure (cards and passages cached from the PC) ----------

    /** The next thing to read before leisure: a passage of your long read and a card take turns; things
     *  already read on the phone today are skipped (the cached list only refreshes when the PC answers). */
    static JSONObject nextReading(Context c, boolean cardOnly) {
        JSONObject k = info(c).optJSONObject("knowledge");
        if (k == null) return null;
        JSONArray done = doneToday(c);
        JSONObject card = null;
        JSONArray items = k.optJSONArray("items");
        for (int i = 0; items != null && i < items.length() && card == null; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && !has(done, it.optString("id"))) card = it;
        }
        JSONObject passage = k.optJSONObject("passage");
        if (cardOnly || (passage != null && has(done, passageId(passage)))) passage = null;
        boolean passageTurn = !"passage".equals(prefs(c).getString("read_last", ""));
        return passage != null && (passageTurn || card == null) ? passage : card;
    }

    static String passageId(JSONObject p) {
        return p.optString("book") + ":" + p.optInt("index");
    }

    /** Logs a reading event (read, knew, notyet, passage) for the PC and marks it done here. */
    static void readDone(Context c, String kind, String id, boolean passage) {
        try {
            enqueue(c, "knowledge/log", new JSONObject().put("kind", kind).put("id", id).put("at", now()));
            JSONArray done = doneToday(c).put(id);
            prefs(c).edit().putString("read_done", done.toString()).putString("read_day", WidgetStore.today()).putString("read_last", passage ? "passage" : "card").apply();
        } catch (Exception ignored) {
            // not logged
        }
    }

    private static JSONArray doneToday(Context c) {
        if (!WidgetStore.today().equals(prefs(c).getString("read_day", ""))) return new JSONArray();
        try {
            return new JSONArray(prefs(c).getString("read_done", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static boolean has(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
        return false;
    }

    // ---------- the fun session and the grace time ----------

    // ---------- night lock (gate.night { from, until }, scripts/lib/settings.mjs) ----------

    private static int minuteOfDay(String hhmm) {
        try {
            return Integer.parseInt(hhmm.substring(0, 2)) * 60 + Integer.parseInt(hhmm.substring(3, 5));
        } catch (Exception e) {
            return -1;
        }
    }

    private static int nowMinute() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        return cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);
    }

    /** When the night lock starts ("22:30"), or null when it is off. */
    static String nightFrom(Context c) {
        JSONObject n = info(c).optJSONObject("night");
        if (n == null) return null; // off until it is set in Settings
        String from = n.optString("from", "");
        return minuteOfDay(from) < 0 ? null : from;
    }

    static boolean isNight(Context c) {
        String from = nightFrom(c);
        if (from == null) return false;
        JSONObject n = info(c).optJSONObject("night");
        int f = minuteOfDay(from), u = minuteOfDay(n != null ? n.optString("until", "05:00") : "05:00"), now = nowMinute();
        if (u < 0) u = 5 * 60;
        return f < u ? now >= f && now < u : now >= f || now < u;
    }

    /** Minutes until the night lock starts (0 at night; a day's worth when it is off). */
    static int minutesToNight(Context c) {
        String from = nightFrom(c);
        if (from == null) return 24 * 60;
        if (isNight(c)) return 0;
        return ((minuteOfDay(from) - nowMinute()) % (24 * 60) + 24 * 60) % (24 * 60);
    }

    /** An urgent pass at night: the unlock Gate stays away for these minutes (leisure apps still meet it). */
    static void allowUrgent(Context c, int minutes) {
        prefs(c).edit().putLong("urgent_until", System.currentTimeMillis() + minutes * 60_000L).apply();
    }

    static boolean urgentActive(Context c) {
        return prefs(c).getLong("urgent_until", 0) > System.currentTimeMillis();
    }

    static void passed(Context c) {
        prefs(c).edit().putLong("passed", System.currentTimeMillis()).apply();
    }

    static boolean inGrace(Context c) {
        return System.currentTimeMillis() - prefs(c).getLong("passed", 0) < graceMs(c);
    }

    static void startFun(Context c, String kind, int minutes, boolean extension) {
        SharedPreferences p = prefs(c);
        p.edit()
            .putLong("fun_until", System.currentTimeMillis() + minutes * 60_000L)
            .putString("fun_kind", kind)
            .putInt("fun_minutes", extension ? p.getInt("fun_minutes", 0) + minutes : minutes)
            .putInt("fun_ext", extension ? p.getInt("fun_ext", 0) + 1 : 0)
            .putInt("fun_today", localLeisure(c) + minutes)
            .putString("fun_today_day", WidgetStore.today())
            .apply();
    }

    // ---------- the leisure cap: no waiting until a day's leisure passes gate.cap (default 3 h) ----------

    private static int localLeisure(Context c) {
        return WidgetStore.today().equals(prefs(c).getString("fun_today_day", "")) ? prefs(c).getInt("fun_today", 0) : 0;
    }

    /** Leisure minutes started today: this phone's own count, or the PC's (phone + PC) when it knows more. */
    static int leisureToday(Context c) {
        JSONObject info = info(c);
        JSONObject today = info.optJSONObject("today");
        int both = today != null && WidgetStore.today().equals(info.optString("date")) ? today.optInt("funMinutes", 0) : 0;
        return Math.max(localLeisure(c), both);
    }

    static int cap(Context c) {
        return info(c).optInt("cap", 180);
    }

    static boolean overCap(Context c) {
        return leisureToday(c) >= cap(c);
    }

    /** Each "more" at time's up is longer than the last (a better reward, not a longer wait): 10, 15, 20,
     *  then 30 min. Past the cap it stays 10. */
    static int moreMinutes(Context c) {
        if (overCap(c)) return 10;
        int[] steps = { 10, 15, 20, 30 };
        return steps[Math.min(3, prefs(c).getInt("fun_ext", 0))];
    }

    static void endFun(Context c) {
        prefs(c).edit().putLong("fun_until", 0).apply();
    }

    static long funUntil(Context c) {
        return prefs(c).getLong("fun_until", 0);
    }

    static boolean funActive(Context c) {
        return funUntil(c) > System.currentTimeMillis();
    }

    /** Seconds to wait before more fun: none until the cap; then 5 to start, 15, then 30 per extension. */
    static int pauseSeconds(Context c, boolean extension) {
        if (!overCap(c)) return 0;
        if (!extension) return 5;
        return prefs(c).getInt("fun_ext", 0) == 0 ? 15 : 30;
    }

    /** The pause before fun grows each time the same fun (app or kind) is started again today, like
     *  ScreenZen: 5 s, then 10, 20, 40 s at most. Only past the cap; before it there is no pause. */
    static int funPause(Context c, String key) {
        if (!overCap(c)) return 0;
        int n = funCounts(c).optInt(key, 0);
        return Math.min(40, 5 << Math.min(3, n));
    }

    static void countFun(Context c, String key) {
        JSONObject counts = funCounts(c);
        try {
            counts.put(key, counts.optInt(key, 0) + 1);
        } catch (Exception ignored) {
            // not counted
        }
        prefs(c).edit().putString("fun_counts", counts.toString()).putString("fun_counts_day", WidgetStore.today()).apply();
    }

    private static JSONObject funCounts(Context c) {
        if (!WidgetStore.today().equals(prefs(c).getString("fun_counts_day", ""))) return new JSONObject(); // a new day starts at 5 s
        try {
            return new JSONObject(prefs(c).getString("fun_counts", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    // ---------- context for the Gate: today's anchors (sent by the app from Settings, "Your day") ----------

    static void setAnchors(Context c, String date, JSONObject times) {
        prefs(c).edit().putString("anchors", times.toString()).putString("anchors_day", date).apply();
    }

    /** "Lunch in 25 min" when an anchor of your day is within the next hour, else null. */
    static String nextAnchor(Context c) {
        if (!WidgetStore.today().equals(prefs(c).getString("anchors_day", ""))) return null;
        try {
            JSONObject t = new JSONObject(prefs(c).getString("anchors", "{}"));
            java.util.Calendar now = java.util.Calendar.getInstance();
            int nowMin = now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE);
            String best = null;
            int bestAt = Integer.MAX_VALUE;
            java.util.Iterator<String> labels = t.keys();
            while (labels.hasNext()) {
                String label = labels.next();
                String hm = t.optString(label, "");
                if (!hm.matches("\\d{2}:\\d{2}")) continue;
                int at = Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(3));
                if (at >= nowMin && at - nowMin <= 60 && at < bestAt) {
                    bestAt = at;
                    best = at == nowMin ? label + " now" : label + " in " + (at - nowMin) + " min";
                }
            }
            return best;
        } catch (Exception ignored) {
            return null;
        }
    }

    // ---------- the queue ----------

    /** Logs one choice: {device:"phone", choice, kind?, minutes?, via?, at}. */
    static void log(Context c, String choice, String kind, int minutes, String via) {
        try {
            JSONObject e = new JSONObject().put("device", "phone").put("choice", choice).put("at", now());
            if (kind != null) e.put("kind", kind);
            if (minutes > 0) e.put("minutes", minutes);
            if (via != null) e.put("via", via);
            enqueue(c, "gate", e);
        } catch (Exception ignored) {
            // nothing to log
        }
    }

    static void note(Context c, String text) {
        try {
            enqueue(c, "capture", new JSONObject().put("kind", "inbox").put("text", text));
        } catch (Exception ignored) {
            // nothing saved
        }
    }

    static void task(Context c, String text) {
        try {
            enqueue(c, "task", new JSONObject().put("text", text).put("date", WidgetStore.today()));
        } catch (Exception ignored) {
            // nothing saved
        }
    }

    /** Ticks your one thing (POST /api/task/done, found by its text) and drops it from the cached list,
     *  so the Gate shows the next one at once. Sent with the Gate's own queue. */
    static synchronized void taskDone(Context c, JSONObject t) {
        try {
            enqueue(c, "task/done", new JSONObject().put("date", t.optString("date")).put("matchText", t.optString("text")));
            JSONObject info = info(c);
            JSONArray top = info.optJSONArray("topTasks");
            JSONArray rest = new JSONArray();
            for (int i = 1; top != null && i < top.length(); i++) rest.put(top.get(i));
            info.put("topTasks", rest);
            info.put("nextTask", rest.length() > 0 ? rest.getJSONObject(0).optString("text") : "");
            prefs(c).edit().putString("info", info.toString()).apply();
        } catch (Exception ignored) {
            // not ticked: it stays on the Gate
        }
        syncLater(c);
    }

    private static synchronized void enqueue(Context c, String path, JSONObject body) throws Exception {
        JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
        q.put(new JSONObject().put("path", path).put("body", body));
        prefs(c).edit().putString("queue", q.toString()).apply();
    }

    /** Hands the notes and tasks made on the Gate to the app, which sends them through its own outbox
     *  (all PC addresses, and they show in the app at once). Gate choices stay here. */
    static synchronized JSONArray takeNotesTasks(Context c) {
        JSONArray out = new JSONArray();
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                JSONObject item = q.getJSONObject(i);
                String path = item.optString("path");
                if ("capture".equals(path) || "task".equals(path)) out.put(item);
                else keep.put(item);
            }
            prefs(c).edit().putString("queue", keep.toString()).apply();
        } catch (Exception ignored) {
            // leave the queue as it was
        }
        return out;
    }

    /** Sends the queue in order (POST /api/<path>), keeps what failed, then refreshes the cached info. Off the main thread. */
    static synchronized void sync(Context c) {
        JSONObject w = WidgetStore.data(c);
        String url = w.optString("url", "");
        String token = w.optString("token", "");
        if (url.isEmpty()) return;
        try {
            JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
            JSONArray left = new JSONArray();
            boolean away = false;
            for (int i = 0; i < q.length(); i++) {
                JSONObject item = q.getJSONObject(i);
                int code = away ? -1 : request(url + "/api/" + item.getString("path"), token, item.getJSONObject("body"));
                if (code < 0 || code == 401) away = true; // PC not reachable or token wrong: keep the rest for later, in order
                // 2xx saved; other 4xx will never be accepted (bad data), so it is dropped; 5xx, 401 or no answer is kept
                if (code < 0 || code == 401 || code >= 500) left.put(item);
            }
            prefs(c).edit().putString("queue", left.toString()).apply();
            if (away) return;
            HttpURLConnection con = (HttpURLConnection) new URL(url + "/api/gate").openConnection();
            con.setConnectTimeout(3000);
            con.setReadTimeout(8000);
            if (!token.isEmpty()) con.setRequestProperty("Authorization", "Bearer " + token);
            if (con.getResponseCode() == 200) {
                try (InputStream in = con.getInputStream()) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] b = new byte[4096];
                    for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
                    String body = buf.toString("UTF-8");
                    new JSONObject(body); // only keep it if it is valid JSON
                    prefs(c).edit().putString("info", body).apply();
                }
            }
        } catch (Exception ignored) {
            // keep everything for next time
        }
    }

    static void syncLater(Context c) {
        Context app = c.getApplicationContext();
        new Thread(() -> sync(app)).start();
    }

    private static int request(String url, String token, JSONObject body) {
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setConnectTimeout(3000);
            con.setReadTimeout(8000);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            if (!token.isEmpty()) con.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream o = con.getOutputStream()) {
                o.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            return con.getResponseCode();
        } catch (Exception e) {
            return -1;
        }
    }

    private GateStore() {}
}
