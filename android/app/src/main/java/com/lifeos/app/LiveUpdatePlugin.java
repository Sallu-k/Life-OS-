package com.lifeos.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Live updates from the PC, so the phone app does not need reinstalling for site changes.
 *
 * check({ url, token }): asks the PC for its file list (/api/app/manifest), downloads only the files
 * that differ from what the app is showing (/api/app/files, one zip), builds the new version in its own
 * folder (unchanged files are copied from the current one), and remembers it for the next start.
 * Nothing changes on screen until apply() or the next launch. A failed download leaves everything as it
 * was. Installing a newer APK makes Capacitor go back to the APK's own files automatically.
 */
@CapacitorPlugin(name = "LiveUpdate")
public class LiveUpdatePlugin extends Plugin {

    private static final String MANIFEST = "app-manifest.json";
    // Files only the app has (PC details, Capacitor's own): carried over to each update.
    private static final String[] KEEP = { "lifeos-pc.json", "cordova.js", "cordova_plugins.js" };
    private String ready = null; // folder of a downloaded update not yet shown

    private File sitesDir() {
        return new File(getContext().getFilesDir(), "lifeos-site");
    }

    // The folder the app is showing now, or null when it shows the files inside the APK.
    private File currentDir() {
        String base = bridge.getServerBasePath();
        if (base == null || !base.startsWith("/")) return null;
        File dir = new File(base);
        return dir.exists() ? dir : null;
    }

    private InputStream openCurrent(File dir, String path) throws IOException {
        if (dir != null) return new FileInputStream(new File(dir, path));
        AssetManager assets = getContext().getAssets();
        return assets.open("public/" + path);
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        copy(in, out);
        return out.toString("UTF-8");
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        try (InputStream i = in) {
            while ((n = i.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    /** The update list was signed by this owner's PC: the public key comes from the APK itself (lifeos-pc.json,
     *  never from an update), and Ed25519 needs Android 13+ (older phones get updates by APK only). */
    private boolean signedByPc(String text, String sig) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
            String key = new JSONObject(readAll(getContext().getAssets().open("public/lifeos-pc.json"))).optString("updateKey", "");
            if (key.isEmpty()) return false;
            PublicKey pub = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.decode(key, Base64.DEFAULT)));
            Signature s = Signature.getInstance("Ed25519");
            s.initVerify(pub);
            s.update(text.getBytes(StandardCharsets.UTF_8));
            return s.verify(Base64.decode(sig, Base64.DEFAULT));
        } catch (Exception e) {
            return false;
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static HttpURLConnection open(String url, String token, int timeout) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(4000);
        c.setReadTimeout(timeout);
        if (token != null && !token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
        return c;
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            JSONObject m = new JSONObject(readAll(openCurrent(currentDir(), MANIFEST)));
            ret.put("version", m.optString("version"));
            ret.put("built", m.optString("built"));
        } catch (Exception e) {
            ret.put("version", "");
        }
        ret.put("fromApk", currentDir() == null);
        ret.put("ready", ready != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void check(PluginCall call) {
        final String url = call.getString("url");
        final String token = call.getString("token");
        if (url == null) {
            call.reject("No PC address");
            return;
        }
        new Thread(() -> {
            try {
                call.resolve(update(url, token));
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }).start();
    }

    private JSObject update(String url, String token) throws Exception {
        JSObject ret = new JSObject();
        // 1. What the PC has.
        HttpURLConnection mc = open(url + "/api/app/manifest", token, 15000);
        if (mc.getResponseCode() != 200) throw new IOException("PC answered " + mc.getResponseCode());
        // Signed by the PC (scripts/lib/updateKey.mjs): anything else on the network is refused.
        JSONObject wrapped = new JSONObject(readAll(mc.getInputStream()));
        String manifestText = wrapped.getString("signed");
        if (!signedByPc(manifestText, wrapped.getString("sig"))) throw new IOException("Update refused: not signed by your PC");
        JSONObject next = new JSONObject(manifestText);
        JSONObject nextFiles = next.getJSONObject("files");
        String version = next.getString("version");
        if (!version.matches("[0-9a-f]{6,64}")) throw new IOException("Update refused: bad version");
        Iterator<String> names = nextFiles.keys();
        while (names.hasNext()) {
            String path = names.next();
            if (!path.matches("[A-Za-z0-9._~@()+,\\-/\\[\\]]+") || path.contains("..") || path.startsWith("/")) throw new IOException("Update refused: bad file name");
        }

        // 2. What the app shows now.
        File current = currentDir();
        JSONObject nowFiles = new JSONObject();
        String nowVersion = "";
        long nowBuiltAt = 0;
        try {
            JSONObject now = new JSONObject(readAll(openCurrent(current, MANIFEST)));
            nowFiles = now.getJSONObject("files");
            nowVersion = now.optString("version");
            nowBuiltAt = now.optLong("builtAt", 0);
        } catch (Exception ignored) {
            // No manifest: everything counts as changed.
        }
        File target = new File(sitesDir(), version);
        // Only ever move to a newer build (a fresh APK can be newer than the PC's current site).
        boolean older = next.optLong("builtAt", 0) <= nowBuiltAt && nowBuiltAt > 0;
        if (older || version.equals(nowVersion) || (ready != null && ready.equals(target.getAbsolutePath()))) {
            ret.put("updated", false);
            ret.put("version", version);
            return ret;
        }

        // 3. Download only what changed.
        List<String> changed = new ArrayList<>();
        Iterator<String> keys = nextFiles.keys();
        while (keys.hasNext()) {
            String path = keys.next();
            if (!nextFiles.getString(path).equals(nowFiles.optString(path, ""))) changed.add(path);
        }
        File tmp = new File(sitesDir(), version + ".tmp");
        deleteTree(tmp);
        if (!tmp.mkdirs()) throw new IOException("Cannot write the update");
        Set<String> got = new HashSet<>();
        if (!changed.isEmpty()) {
            HttpURLConnection fc = open(url + "/api/app/files", token, 120000);
            fc.setRequestMethod("POST");
            fc.setDoOutput(true);
            fc.setRequestProperty("Content-Type", "application/json");
            JSONObject body = new JSONObject();
            body.put("paths", new JSONArray(changed));
            try (OutputStream o = fc.getOutputStream()) {
                o.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (fc.getResponseCode() != 200) throw new IOException("Download failed (" + fc.getResponseCode() + ")");
            String root = tmp.getCanonicalPath() + File.separator;
            try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(fc.getInputStream()))) {
                ZipEntry e;
                while ((e = zip.getNextEntry()) != null) {
                    File out = new File(tmp, e.getName());
                    if (!out.getCanonicalPath().startsWith(root) || !nextFiles.has(e.getName())) throw new IOException("Bad file name in update");
                    out.getParentFile().mkdirs();
                    MessageDigest sha = MessageDigest.getInstance("SHA-256");
                    try (FileOutputStream fo = new FileOutputStream(out)) {
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = zip.read(buf)) > 0) {
                            fo.write(buf, 0, n);
                            sha.update(buf, 0, n);
                        }
                    }
                    // Every file must be exactly the one the signed list names (its SHA-256 fingerprint).
                    if (!hex(sha.digest()).startsWith(nextFiles.getString(e.getName())) || nextFiles.getString(e.getName()).length() < 32) {
                        throw new IOException("Update refused: " + e.getName() + " does not match");
                    }
                    got.add(e.getName());
                }
            }
            for (String p : changed) if (!got.contains(p)) throw new IOException("Update incomplete: " + p);
        }

        // 4. Unchanged files come from what the app shows now (the APK or the last update).
        keys = nextFiles.keys();
        while (keys.hasNext()) {
            String path = keys.next();
            if (got.contains(path)) continue;
            File out = new File(tmp, path);
            if (!out.getCanonicalPath().startsWith(tmp.getCanonicalPath() + File.separator)) throw new IOException("Bad file name in update");
            out.getParentFile().mkdirs();
            try (FileOutputStream fo = new FileOutputStream(out)) {
                copy(openCurrent(current, path), fo);
            }
        }
        for (String keep : KEEP) {
            try {
                InputStream in = openCurrent(current, keep);
                try (FileOutputStream fo = new FileOutputStream(new File(tmp, keep))) {
                    copy(in, fo);
                }
            } catch (IOException ignored) {
                // Not in this build (e.g. no PC details): the saved address is used.
            }
        }
        try (FileOutputStream fo = new FileOutputStream(new File(tmp, MANIFEST))) {
            fo.write(manifestText.getBytes(StandardCharsets.UTF_8));
        }
        if (!new File(tmp, "index.html").exists()) throw new IOException("Update has no start page");

        // 5. Swap in: rename, remember for the next start, and clear old versions.
        deleteTree(target);
        if (!tmp.renameTo(target)) throw new IOException("Cannot finish the update");
        SharedPreferences prefs = getContext().getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
        prefs.edit().putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, target.getAbsolutePath()).apply();
        ready = target.getAbsolutePath();
        File[] old = sitesDir().listFiles();
        if (old != null) {
            for (File f : old) {
                boolean keep = f.equals(target) || (current != null && f.equals(current));
                if (!keep) deleteTree(f);
            }
        }
        ret.put("updated", true);
        ret.put("version", version);
        ret.put("downloaded", changed.size());
        return ret;
    }

    // Shows the downloaded update now (reloads the app on Today's page).
    @PluginMethod
    public void apply(PluginCall call) {
        if (ready == null) {
            call.resolve();
            return;
        }
        String path = ready;
        ready = null;
        call.resolve();
        getActivity().runOnUiThread(() -> bridge.setServerBasePath(path));
    }
}
