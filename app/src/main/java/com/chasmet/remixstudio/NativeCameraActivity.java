package com.chasmet.remixstudio;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutionException;

public class NativeCameraActivity extends ComponentActivity {
    public static final String EXTRA_ORIENTATION = "orientation";
    public static final String EXTRA_REFERENCE_URI = "reference_uri";
    public static final String EXTRA_REFERENCE_START_SECONDS = "reference_start_seconds";
    public static final String RESULT_FILE_NAME = "recording_file_name";
    public static final String RESULT_ERROR = "recording_error";

    private PreviewView previewView;
    private VideoCapture<Recorder> videoCapture;
    private ProcessCameraProvider cameraProvider;
    private Recording activeRecording;
    private CameraSelector cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA;
    private Button recordButton;
    private Button switchButton;
    private TextView timerText;
    private File currentOutputFile;
    private boolean finishingFromResult = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String orientation = getIntent().getStringExtra(EXTRA_ORIENTATION);
        setRequestedOrientation("horizontal".equals(orientation)
                ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            finishWithError("Les permissions caméra et microphone ne sont pas accordées.");
            return;
        }

        buildInterface();
        startCamera();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable roundedBackground(int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private Button makeButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setBackground(roundedBackground(0x99000000, 18, 0x55FFFFFF, 1));
        button.setPadding(dp(14), dp(8), dp(14), dp(8));
        return button;
    }

    private void buildInterface() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(previewView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        Button closeButton = makeButton("Fermer");
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dp(96), dp(52));
        closeParams.gravity = Gravity.TOP | Gravity.START;
        closeParams.setMargins(dp(14), dp(18), 0, 0);
        root.addView(closeButton, closeParams);
        closeButton.setOnClickListener(v -> cancelAndFinish());

        switchButton = makeButton("Retourner");
        FrameLayout.LayoutParams switchParams = new FrameLayout.LayoutParams(dp(110), dp(52));
        switchParams.gravity = Gravity.TOP | Gravity.END;
        switchParams.setMargins(0, dp(18), dp(14), 0);
        root.addView(switchButton, switchParams);
        switchButton.setOnClickListener(v -> switchCamera());

        addReferenceVideoIfAvailable(root);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(16), dp(12), dp(16), dp(18));
        controls.setBackground(roundedBackground(0xB8000000, 24, 0x33FFFFFF, 1));

        timerText = new TextView(this);
        timerText.setText("Caméra native • micro du téléphone");
        timerText.setTextColor(Color.WHITE);
        timerText.setTextSize(15);
        timerText.setGravity(Gravity.CENTER);
        controls.addView(timerText, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(36)
        ));

        recordButton = makeButton("● Enregistrer");
        recordButton.setTextSize(18);
        recordButton.setBackground(roundedBackground(0xFFE53935, 28, Color.WHITE, 2));
        LinearLayout.LayoutParams recordParams = new LinearLayout.LayoutParams(dp(210), dp(64));
        recordParams.topMargin = dp(8);
        controls.addView(recordButton, recordParams);
        recordButton.setOnClickListener(v -> toggleRecording());

        FrameLayout.LayoutParams controlsParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        controlsParams.gravity = Gravity.BOTTOM;
        controlsParams.setMargins(dp(12), 0, dp(12), dp(12));
        root.addView(controls, controlsParams);

        setContentView(root);
    }

    private void addReferenceVideoIfAvailable(FrameLayout root) {
        String referenceUri = getIntent().getStringExtra(EXTRA_REFERENCE_URI);
        if (referenceUri == null || referenceUri.isBlank()) return;

        VideoView referenceView = new VideoView(this);
        referenceView.setBackground(roundedBackground(Color.BLACK, 14, Color.WHITE, 2));
        referenceView.setPadding(dp(3), dp(3), dp(3), dp(3));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(130), dp(210));
        params.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        params.setMargins(0, 0, dp(14), dp(52));
        root.addView(referenceView, params);

        double startSeconds = getIntent().getDoubleExtra(EXTRA_REFERENCE_START_SECONDS, 0.0);
        referenceView.setVideoURI(Uri.parse(referenceUri));
        referenceView.setOnPreparedListener(player -> {
            player.setVolume(0f, 0f);
            referenceView.seekTo((int) Math.round(startSeconds * 1000));
            referenceView.start();
        });
        referenceView.setOnCompletionListener(player -> referenceView.seekTo((int) Math.round(startSeconds * 1000)));
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindCameraUseCases();
            } catch (ExecutionException error) {
                finishWithError("Impossible d’ouvrir la caméra native du téléphone.");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                finishWithError("L’ouverture de la caméra a été interrompue.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindCameraUseCases() {
        if (cameraProvider == null) return;
        cameraProvider.unbindAll();

        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        QualitySelector qualitySelector = QualitySelector.fromOrderedList(
                Arrays.asList(Quality.FHD, Quality.HD, Quality.SD),
                FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
        );
        Recorder recorder = new Recorder.Builder()
                .setQualitySelector(qualitySelector)
                .build();
        videoCapture = VideoCapture.withOutput(recorder);

        try {
            cameraProvider.bindToLifecycle(this, cameraSelector, preview, videoCapture);
        } catch (Exception error) {
            if (cameraSelector == CameraSelector.DEFAULT_FRONT_CAMERA) {
                cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA;
                bindCameraUseCases();
            } else {
                finishWithError("Aucune caméra compatible n’a été trouvée.");
            }
        }
    }

    private void switchCamera() {
        if (activeRecording != null) return;
        cameraSelector = cameraSelector == CameraSelector.DEFAULT_FRONT_CAMERA
                ? CameraSelector.DEFAULT_BACK_CAMERA
                : CameraSelector.DEFAULT_FRONT_CAMERA;
        bindCameraUseCases();
    }

    private File outputDirectory() {
        File root = getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        File directory = new File(root != null ? root : getFilesDir(), "RemixStudioNative");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private void toggleRecording() {
        if (activeRecording != null) {
            activeRecording.stop();
            recordButton.setEnabled(false);
            return;
        }
        if (videoCapture == null) {
            Toast.makeText(this, "La caméra se prépare encore.", Toast.LENGTH_SHORT).show();
            return;
        }

        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
        currentOutputFile = new File(outputDirectory(), "native_camera_" + stamp + ".mp4");
        FileOutputOptions options = new FileOutputOptions.Builder(currentOutputFile).build();
        PendingRecording pending = videoCapture.getOutput().prepareRecording(this, options);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            pending = pending.withAudioEnabled();
        }

        activeRecording = pending.start(ContextCompat.getMainExecutor(this), event -> {
            if (event instanceof VideoRecordEvent.Start) {
                recordButton.setText("■ Arrêter et garder");
                recordButton.setBackground(roundedBackground(0xFF111827, 28, Color.WHITE, 2));
                switchButton.setEnabled(false);
                timerText.setText("Enregistrement avec le micro du téléphone");
            } else if (event instanceof VideoRecordEvent.Status) {
                long nanos = event.getRecordingStats().getRecordedDurationNanos();
                long totalSeconds = nanos / 1_000_000_000L;
                timerText.setText(String.format(Locale.FRANCE, "Enregistrement %02d:%02d", totalSeconds / 60, totalSeconds % 60));
            } else if (event instanceof VideoRecordEvent.Finalize) {
                VideoRecordEvent.Finalize finalizeEvent = (VideoRecordEvent.Finalize) event;
                activeRecording = null;
                if (finalizeEvent.hasError()) {
                    if (currentOutputFile != null) currentOutputFile.delete();
                    resetRecordButton();
                    Toast.makeText(this, "L’enregistrement natif a échoué.", Toast.LENGTH_LONG).show();
                } else {
                    finishingFromResult = true;
                    Intent result = new Intent();
                    result.putExtra(RESULT_FILE_NAME, currentOutputFile.getName());
                    setResult(RESULT_OK, result);
                    finish();
                }
            }
        });
    }

    private void resetRecordButton() {
        recordButton.setEnabled(true);
        recordButton.setText("● Enregistrer");
        recordButton.setBackground(roundedBackground(0xFFE53935, 28, Color.WHITE, 2));
        switchButton.setEnabled(true);
        timerText.setText("Caméra native • micro du téléphone");
    }

    private void cancelAndFinish() {
        if (activeRecording != null) {
            activeRecording.stop();
            activeRecording = null;
        }
        if (currentOutputFile != null) currentOutputFile.delete();
        setResult(RESULT_CANCELED);
        finish();
    }

    private void finishWithError(String message) {
        Intent result = new Intent();
        result.putExtra(RESULT_ERROR, message);
        setResult(RESULT_CANCELED, result);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finish();
    }

    @Override
    public void onBackPressed() {
        cancelAndFinish();
    }

    @Override
    protected void onDestroy() {
        if (!finishingFromResult && activeRecording != null) {
            activeRecording.close();
            activeRecording = null;
        }
        if (cameraProvider != null) cameraProvider.unbindAll();
        super.onDestroy();
    }
}
