package com.wetdreams.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class WetDreamsFirebaseMessagingService extends FirebaseMessagingService {
    private static final String WEB_BASE_URL = "https://wetdreams.vercel.app";
    private static final String CALL_CHANNEL_ID = "incoming_calls";
    private static final String MESSAGE_CHANNEL_ID = "messages";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");

        if ("incoming_call".equals(type)) {
            showIncomingCallNotification(data);
            return;
        }

        if ("chat_message".equals(type) || "message".equals(type)) {
            showMessageNotification(data);
            return;
        }

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        if (!canShowNotifications()) {
            return;
        }

        createChannels();
        String callId = valueOr(data.get("callId"), "call");
        String roomId = valueOr(data.get("roomId"), "");
        if (roomId.isEmpty()) {
            return;
        }

        String callType = valueOr(data.get("callType"), "audio");
        String callerName = valueOr(data.get("callerName"), valueOr(data.get("body"), "WetDreams"));
        String title = valueOr(data.get("title"), "Incoming " + callType + " call");
        String body = valueOr(data.get("body"), callerName);
        int notificationId = notificationId("call:" + callId);
        String roomUrl = WEB_BASE_URL + "/chat/" + roomId;
        String acceptUrl = roomUrl + "?call=" + callId + "&action=accept";
        String declineUrl = roomUrl + "?call=" + callId + "&action=decline";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wetdreams)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(notificationIntent(roomUrl, notificationId, 1))
            .addAction(R.drawable.ic_stat_wetdreams, "Decline", notificationIntent(declineUrl, notificationId, 2))
            .addAction(R.drawable.ic_stat_wetdreams, "Accept", notificationIntent(acceptUrl, notificationId, 3));

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(notificationId, builder.build());
        }
    }

    private void showMessageNotification(Map<String, String> data) {
        if (!canShowNotifications()) {
            return;
        }

        createChannels();
        String roomId = valueOr(data.get("roomId"), "");
        if (roomId.isEmpty()) {
            return;
        }

        String messageId = valueOr(data.get("messageId"), roomId);
        String title = valueOr(data.get("title"), valueOr(data.get("senderName"), "New message"));
        String body = valueOr(data.get("body"), "New message");
        int notificationId = notificationId("message:" + messageId);
        String roomUrl = WEB_BASE_URL + "/chat/" + roomId;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_wetdreams)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(notificationIntent(roomUrl, notificationId, 4));

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(notificationId, builder.build());
        }
    }

    private PendingIntent notificationIntent(String targetUrl, int notificationId, int actionId) {
        Intent intent = new Intent(this, NotificationActionReceiver.class);
        intent.putExtra(NotificationActionReceiver.EXTRA_TARGET_URL, targetUrl);
        intent.putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, notificationId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(this, notificationId + actionId, intent, flags);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel callChannel = new NotificationChannel(
            CALL_CHANNEL_ID,
            "Incoming calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        callChannel.setDescription("WetDreams incoming call alerts");
        callChannel.enableVibration(true);

        NotificationChannel messageChannel = new NotificationChannel(
            MESSAGE_CHANNEL_ID,
            "Messages",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        messageChannel.setDescription("WetDreams chat message alerts");
        messageChannel.enableVibration(true);

        notificationManager.createNotificationChannel(callChannel);
        notificationManager.createNotificationChannel(messageChannel);
    }

    private boolean canShowNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }

        return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private String valueOr(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private int notificationId(String seed) {
        int hash = seed.hashCode();
        if (hash == Integer.MIN_VALUE) {
            return 1;
        }
        return Math.abs(hash);
    }
}
