package com.wetdreams.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UpiLauncherModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "UpiLauncher"

  @ReactMethod
  fun open(intentUri: String, promise: Promise) {
    if (!intentUri.startsWith("upi://pay?")) {
      promise.reject("INVALID_UPI_URI", "The payment provider returned an invalid UPI link.")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Kizo is not ready to open the UPI app.")
      return
    }

    activity.runOnUiThread {
      try {
        val paymentIntent = Intent(Intent.ACTION_VIEW, Uri.parse(intentUri))
        val chooser = Intent.createChooser(paymentIntent, "Pay with UPI")
        activity.startActivity(chooser)
        promise.resolve(null)
      } catch (_: ActivityNotFoundException) {
        promise.reject("NO_UPI_APP", "No UPI payment app is installed on this phone.")
      } catch (error: Exception) {
        promise.reject("UPI_LAUNCH_FAILED", error.message ?: "Could not open a UPI payment app.")
      }
    }
  }
}
