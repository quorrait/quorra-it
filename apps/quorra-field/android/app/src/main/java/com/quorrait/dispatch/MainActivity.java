package com.quorrait.dispatch;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * API 36 draws edge to edge and ignores the old opt-out. Pass the system-bar
 * insets into the CSS variables the app already uses, so the header and tab
 * bar stay clear of the status and navigation bars when the WebView reports
 * no safe-area inset of its own.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            applyInsets(webView, bars);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    @Override
    public void onResume() {
        super.onResume();
        WebView webView = getBridge().getWebView();
        ViewCompat.requestApplyInsets(webView);
    }

    private void applyInsets(WebView webView, Insets bars) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        int top = Math.round(bars.top / density);
        int right = Math.round(bars.right / density);
        int bottom = Math.round(bars.bottom / density);
        int left = Math.round(bars.left / density);
        String js = "document.documentElement.style.setProperty('--sat','" + top + "px');"
            + "document.documentElement.style.setProperty('--sar','" + right + "px');"
            + "document.documentElement.style.setProperty('--sab','" + bottom + "px');"
            + "document.documentElement.style.setProperty('--sal','" + left + "px');";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
