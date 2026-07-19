package com.chasmet.remixstudio;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 2001;
    private static final int MEDIA_PERMISSION_REQUEST = 2002;
    private static final int STORAGE_PERMISSION_REQUEST = 2003;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 11, 19));
        getWindow().setNavigationBarColor(Color.rgb(7, 11, 19));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(webView);

        configureWebView();
        requestLegacyStoragePermissionIfNeeded();
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " RemixStudioAndroid/1.0");

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
                return response != null ? response : super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("video/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) {
                    pendingWebPermission = null;
                }
            }
        });

        webView.addJavascriptInterface(new AndroidBridge(this), "Android");
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        boolean cameraNeeded = false;
        boolean audioNeeded = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) cameraNeeded = true;
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audioNeeded = true;
        }

        boolean cameraGranted = !cameraNeeded || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        boolean audioGranted = !audioNeeded || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

        if (cameraGranted && audioGranted) {
            request.grant(request.getResources());
            return;
        }

        pendingWebPermission = request;
        requestPermissions(
                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                MEDIA_PERMISSION_REQUEST
        );
    }

    private void requestLegacyStoragePermissionIfNeeded() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    STORAGE_PERMISSION_REQUEST
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MEDIA_PERMISSION_REQUEST && pendingWebPermission != null) {
            boolean granted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    granted = false;
                    break;
                }
            }
            if (granted) pendingWebPermission.grant(pendingWebPermission.getResources());
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(
                        uri,
                        data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                );
            } catch (Exception ignored) {
                // Certains fournisseurs ne proposent pas de permission persistante.
            }
            result = new Uri[]{uri};
        }
        fileChooserCallback.onReceiveValue(result);
        fileChooserCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    public static final class AndroidBridge {
        private final MainActivity activity;
        private final Map<String, DownloadSession> sessions = new ConcurrentHashMap<>();

        AndroidBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public String beginDownload(String requestedName, String requestedMime) {
            try {
                String fileName = sanitizeFileName(requestedName);
                String mimeType = requestedMime == null || requestedMime.isBlank()
                        ? "application/octet-stream"
                        : requestedMime;
                String id = UUID.randomUUID().toString();
                ContentResolver resolver = activity.getContentResolver();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RemixStudio");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Impossible de créer le fichier de sortie.");
                    OutputStream stream = resolver.openOutputStream(uri, "w");
                    if (stream == null) throw new IllegalStateException("Impossible d’ouvrir le fichier de sortie.");
                    sessions.put(id, new DownloadSession(uri, stream, true));
                } else {
                    File directory = new File(
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                            "RemixStudio"
                    );
                    if (!directory.exists() && !directory.mkdirs()) {
                        throw new IllegalStateException("Impossible de créer le dossier Téléchargements.");
                    }
                    File file = uniqueFile(directory, fileName);
                    sessions.put(id, new DownloadSession(Uri.fromFile(file), new FileOutputStream(file), false));
                }
                return id;
            } catch (Exception error) {
                showToast("Erreur de préparation du téléchargement");
                return "";
            }
        }

        @JavascriptInterface
        public boolean appendDownloadChunk(String id, String base64Chunk) {
            DownloadSession session = sessions.get(id);
            if (session == null) return false;
            try {
                byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                session.stream.write(bytes);
                return true;
            } catch (Exception error) {
                cancelDownload(id);
                return false;
            }
        }

        @JavascriptInterface
        public boolean finishDownload(String id) {
            DownloadSession session = sessions.remove(id);
            if (session == null) return false;
            try {
                session.stream.flush();
                session.stream.close();
                if (session.pendingMediaStore && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    activity.getContentResolver().update(session.uri, values, null, null);
                }
                showToast("Vidéo enregistrée dans Téléchargements/RemixStudio");
                return true;
            } catch (Exception error) {
                return false;
            }
        }

        @JavascriptInterface
        public void cancelDownload(String id) {
            DownloadSession session = sessions.remove(id);
            if (session == null) return;
            try {
                session.stream.close();
            } catch (Exception ignored) {
            }
            try {
                activity.getContentResolver().delete(session.uri, null, null);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        private void showToast(String message) {
            activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show());
        }

        private static String sanitizeFileName(String name) {
            String safe = name == null || name.isBlank() ? "remix-studio-video.mp4" : name;
            return safe.replaceAll("[\\\\/:*?\"<>|]", "_");
        }

        private static File uniqueFile(File directory, String fileName) {
            File candidate = new File(directory, fileName);
            if (!candidate.exists()) return candidate;

            int dot = fileName.lastIndexOf('.');
            String base = dot > 0 ? fileName.substring(0, dot) : fileName;
            String extension = dot > 0 ? fileName.substring(dot) : "";
            int index = 2;
            while (candidate.exists()) {
                candidate = new File(directory, base + "-" + index + extension);
                index += 1;
            }
            return candidate;
        }
    }

    private static final class DownloadSession {
        final Uri uri;
        final OutputStream stream;
        final boolean pendingMediaStore;

        DownloadSession(Uri uri, OutputStream stream, boolean pendingMediaStore) {
            this.uri = uri;
            this.stream = stream;
            this.pendingMediaStore = pendingMediaStore;
        }
    }
}
