package com.lifeos.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** A page to open, e.g. "/plan/" from the task widget's "+". */
    static final String EXTRA_PAGE = "lifeos_page";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // LifeOS's own plugin: site updates from the PC without reinstalling (LiveUpdatePlugin).
        registerPlugin(LiveUpdatePlugin.class);
        // Phone extras: screen time and the home-screen widget (DevicePlugin).
        registerPlugin(DevicePlugin.class);
        super.onCreate(savedInstanceState);

        // Android's Back button: go back through the pages you opened (and close an open sheet first,
        // which the page handles). With nothing to go back to, return to Today; on Today, put the app in
        // the background like Home does, instead of closing it.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                if (web.canGoBack()) {
                    web.goBack();
                    return;
                }
                String url = web.getUrl();
                if (url != null && !url.contains("/today")) web.evaluateJavascript("location.href = '/today/'", null);
                else moveTaskToBack(true);
            }
        });
        openPage(getIntent(), 1500); // cold start: let the first page load
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openPage(intent, 0);
    }

    private void openPage(Intent intent, long delay) {
        String page = intent != null ? intent.getStringExtra(EXTRA_PAGE) : null;
        if (page == null || !page.matches("^/[a-z]+/$")) return;
        intent.removeExtra(EXTRA_PAGE);
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) web.postDelayed(() -> web.evaluateJavascript("location.pathname === '" + page + "' || (location.href = '" + page + "')", null), delay);
    }
}
