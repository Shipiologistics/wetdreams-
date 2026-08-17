package com.wetdreams.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotificationActionReceiver extends BroadcastReceiver {
    public static final String EXTRA_TARGET_URL = "target_url";
    public static final String EXTRA_NOTIFICATION_ID = "notification_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        if (notificationId != 0) {
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.cancel(notificationId);
            }
        }

        String targetUrl = intent.getStringExtra(EXTRA_TARGET_URL);
        if (targetUrl == null || !targetUrl.startsWith("https://wetdreams.vercel.app/")) {
            return;
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra(EXTRA_TARGET_URL, targetUrl);
        context.startActivity(launch);
    }
}
