package com.wetdreams.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int WETDREAMS_PERMISSION_REQUEST = 2401;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestAppPermissions();
        openTargetUrl(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openTargetUrl(intent);
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this,
                new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.POST_NOTIFICATIONS
                },
                WETDREAMS_PERMISSION_REQUEST
            );
            return;
        }

        ActivityCompat.requestPermissions(
            this,
            new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO
            },
            WETDREAMS_PERMISSION_REQUEST
        );
    }

    private void openTargetUrl(Intent intent) {
        if (intent == null || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        String targetUrl = intent.getStringExtra("target_url");
        if (targetUrl == null) {
            targetUrl = intent.getDataString();
        }
        if (targetUrl == null) {
            String relativeUrl = intent.getStringExtra("url");
            if (relativeUrl != null && relativeUrl.startsWith("/")) {
                targetUrl = "https://wetdreams.vercel.app" + relativeUrl;
            }
        }
        if (targetUrl == null) {
            String roomId = intent.getStringExtra("roomId");
            if (roomId != null && !roomId.isEmpty()) {
                targetUrl = "https://wetdreams.vercel.app/chat/" + roomId;
            }
        }
        if (targetUrl == null || !targetUrl.startsWith("https://wetdreams.vercel.app/")) {
            return;
        }

        final String url = targetUrl;
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }
}
