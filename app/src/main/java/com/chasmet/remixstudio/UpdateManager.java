package com.chasmet.remixstudio;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Checks the latest signed GitHub release without touching project storage. */
final class UpdateManager {
    private static final String API = "https://api.github.com/repos/Chasmet/Montage-vid-o-/releases/latest";
    private static final long MAX_APK_BYTES = 150L * 1024L * 1024L;
    private final MainActivity activity;
    private final WebView webView;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final SharedPreferences preferences;
    private volatile String apkUrl;
    private volatile String hashUrl;
    private volatile File downloaded;
    private volatile boolean busy;
    private volatile boolean pendingInstall;

    UpdateManager(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        preferences = activity.getSharedPreferences("remix_updates", 0);
    }

    boolean isAutoEnabled() { return preferences.getBoolean("enabled", true); }
    void setAutoEnabled(boolean enabled) { preferences.edit().putBoolean("enabled", enabled).apply(); }

    private void emit(String state, String message, String version) {
        activity.runOnUiThread(() -> {
            String js = "window.onRemixUpdate && window.onRemixUpdate("
                    + JSONObject.quote(state) + "," + JSONObject.quote(message) + ","
                    + JSONObject.quote(version == null ? "" : version) + ");";
            webView.evaluateJavascript(js, null);
        });
    }

    void check() {
        if (busy) return;
        busy = true;
        emit("checking", "Recherche d’une nouvelle version…", "");
        worker.execute(() -> {
            try {
                JSONObject release = new JSONObject(new String(fetch(API, 1024 * 1024), StandardCharsets.UTF_8));
                String version = release.getString("tag_name").replaceFirst("^[vV]", "");
                if (compare(version, BuildConfig.VERSION_NAME) <= 0) {
                    apkUrl = null;
                    emit("current", "L’application est à jour.", version);
                    return;
                }
                JSONArray assets = release.getJSONArray("assets");
                String apk = null, hash = null;
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject item = assets.getJSONObject(i);
                    if ("RemixStudio.apk".equals(item.optString("name"))) apk = item.getString("browser_download_url");
                    if ("RemixStudio.apk.sha256".equals(item.optString("name"))) hash = item.getString("browser_download_url");
                }
                if (apk == null || hash == null) throw new IllegalStateException("APK signé ou empreinte absente de la Release.");
                apkUrl = apk;
                hashUrl = hash;
                emit("available", "Version " + version + " disponible. Installer la mise à jour ?", version);
            } catch (Exception error) {
                emit("error", "Vérification impossible : " + error.getMessage(), "");
            } finally { busy = false; }
        });
    }

    void downloadAndInstall() {
        if (busy || apkUrl == null || hashUrl == null) return;
        busy = true;
        worker.execute(() -> {
            File target = null;
            try {
                emit("downloading", "Téléchargement de la mise à jour…", "");
                String expected = new String(fetch(hashUrl, 1024), StandardCharsets.UTF_8).trim().split("\\s+")[0];
                if (!expected.matches("(?i)[0-9a-f]{64}")) throw new IllegalStateException("Empreinte SHA-256 invalide.");
                File dir = new File(activity.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Stockage indisponible.");
                target = new File(dir, "RemixStudio.apk");
                byte[] apk = fetch(apkUrl, MAX_APK_BYTES);
                try (FileOutputStream output = new FileOutputStream(target)) { output.write(apk); }
                String actual = toHex(MessageDigest.getInstance("SHA-256").digest(apk));
                if (!expected.equalsIgnoreCase(actual)) throw new IllegalStateException("Le fichier téléchargé ne correspond pas à la Release.");
                validatePackage(target);
                downloaded = target;
                emit("installing", "APK vérifié. Android va demander l’autorisation d’installation.", "");
                activity.runOnUiThread(this::openInstaller);
            } catch (Exception error) {
                if (target != null) target.delete();
                emit("error", "Installation impossible : " + error.getMessage(), "");
            } finally { busy = false; }
        });
    }

    private void validatePackage(File file) throws Exception {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), flags);
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName))
            throw new IllegalStateException("Ce fichier n’appartient pas à Remix Studio.");
        long next = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        long current = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (next <= current) throw new IllegalStateException("La version téléchargée n’est pas plus récente.");
        android.content.pm.Signature[] oldSignatures = Build.VERSION.SDK_INT >= 28
                ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        android.content.pm.Signature[] newSignatures = Build.VERSION.SDK_INT >= 28
                ? candidate.signingInfo.getApkContentsSigners() : candidate.signatures;
        if (oldSignatures == null || newSignatures == null || oldSignatures.length != newSignatures.length
                || !Arrays.asList(oldSignatures).containsAll(Arrays.asList(newSignatures)))
            throw new IllegalStateException("Signature différente de l’application installée : mise à jour sans perte de données impossible.");
    }

    private void openInstaller() {
        if (downloaded == null || !downloaded.isFile()) return;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            pendingInstall = true;
            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(permission);
            return;
        }
        pendingInstall = false;
        Uri content = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", downloaded);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(content, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(install);
    }

    void onResume() {
        if (pendingInstall && (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()))
            activity.runOnUiThread(this::openInstaller);
    }

    private static int compare(String a, String b) {
        if (!a.matches("\\d+(\\.\\d+){1,3}") || !b.matches("\\d+(\\.\\d+){1,3}"))
            throw new IllegalArgumentException("Numéro de version non reconnu.");
        String[] left = a.split("\\."), right = b.split("\\.");
        for (int i = 0; i < Math.max(left.length, right.length); i++) {
            int x = i < left.length ? Integer.parseInt(left[i]) : 0;
            int y = i < right.length ? Integer.parseInt(right[i]) : 0;
            if (x != y) return Integer.compare(x, y);
        }
        return 0;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return result.toString();
    }

    private static byte[] fetch(String address, long limit) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol())) throw new IllegalArgumentException("Adresse de mise à jour non sécurisée.");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "RemixStudio-Android");
        try {
            if (connection.getResponseCode() != 200 || !"https".equals(connection.getURL().getProtocol()))
                throw new IllegalStateException("Serveur indisponible (" + connection.getResponseCode() + ").");
            try (InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > limit) throw new IllegalStateException("Fichier trop volumineux.");
                    output.write(buffer, 0, count);
                }
                return output.toByteArray();
            }
        } finally { connection.disconnect(); }
    }
}
