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
        JSONArray w = info(c).optJSONArray("watch");
        if (w == null) return "com.google.android.youtube".equals(pkg) || "com.instagram.android".equals(pkg);
        for (int i = 0; i < w.length(); i++) if (pkg.equals(w.optString(i))) return true;
        return false;
    }

    // ---------- the fun session and the grace time ----------

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
            .apply();
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

    /** Seconds to wait before more fun: 5 to start, then 15, then 30 for every later extension. */
    static int pauseSeconds(Context c, boolean extension) {
        if (!extension) return 5;
        return prefs(c).getInt("fun_ext", 0) == 0 ? 15 : 30;
    }

    /** The pause before fun grows each time the same fun (app or kind) is started again today, like
     *  ScreenZen: 5 s, then 10, 20, 40 s at most. */
    static int funPause(Context c, String key) {
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

    private static synchronized void enqueue(Context c, String path, JSONObject body) throws Exception {
        JSONArray q = new JSONArray(prefs(c).getString("queue", "[]"));
        q.put(new JSONObject().put("path", path).put("body", body));
        prefs(c).edit().putString("queue", q.toString()).apply();
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
