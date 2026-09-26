package com.chasmet.remixstudio;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONObject;

/** Captures the reaction microphone independently of WebView's video playback. */
final class NativeReactionMic {
    private static final int SAMPLE_RATE = 48000;
    private static final int CHUNK_BYTES = 4096; // 42.7 ms of signed mono PCM16.
    private final MainActivity activity;
    private final WebView webView;
    private volatile AudioRecord record;
    private volatile boolean running;

    NativeReactionMic(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    synchronized boolean start() {
        if (running) return true;
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false;
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) return false;
        AudioRecord next = null;
        try {
            next = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(minimum * 2, CHUNK_BYTES * 4));
            if (next.getState() != AudioRecord.STATE_INITIALIZED) {
                next.release();
                return false;
            }
            next.startRecording();
            if (next.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                next.release();
                return false;
            }
            record = next;
            running = true;
            AudioRecord capture = next;
            Thread thread = new Thread(() -> captureLoop(capture), "remix-reaction-mic");
            thread.setDaemon(true);
            thread.start();
            return true;
        } catch (Exception error) {
            if (next != null) {
                try { next.release(); } catch (Exception ignored) { }
            }
            return false;
        }
    }

    private void captureLoop(AudioRecord capture) {
        byte[] buffer = new byte[CHUNK_BYTES];
        try {
            while (running && record == capture) {
                int count = capture.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING);
                if (count <= 0) break;
                String encoded = Base64.encodeToString(buffer, 0, count - count % 2, Base64.NO_WRAP);
                activity.runOnUiThread(() -> {
                    if (running && record == capture) webView.evaluateJavascript(
                            "window.onNativeReactionAudio && window.onNativeReactionAudio("
                                    + JSONObject.quote(encoded) + "," + SAMPLE_RATE + ");", null);
                });
            }
        } finally {
            synchronized (this) {
                if (record == capture) {
                    record = null;
                    running = false;
                }
            }
            try { capture.stop(); } catch (Exception ignored) { }
            capture.release();
        }
    }

    synchronized void stop() {
        running = false;
        if (record != null) {
            try { record.stop(); } catch (Exception ignored) { }
        }
    }
}
