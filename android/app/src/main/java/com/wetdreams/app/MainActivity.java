package com.wetdreams.app;

import android.Manifest;
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
}
