package com.jjmovies.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private FrameLayout fullscreenContainer;

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void closeCustomView() {
        if (customView == null) return;
        ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        if (fullscreenContainer != null) {
            decor.removeView(fullscreenContainer);
        }
        fullscreenContainer = null;
        customView = null;
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        hideSystemUi();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(lp);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        hideSystemUi();

        WebView wv = getBridge().getWebView();
        WebSettings ws = wv.getSettings();
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);

        wv.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void playVideo(String url, String title) {
                runOnUiThread(() -> {
                    Intent intent = new Intent(MainActivity.this, VlcPlayerActivity.class);
                    intent.putExtra(VlcPlayerActivity.EXTRA_VIDEO_URL, url);
                    intent.putExtra(VlcPlayerActivity.EXTRA_VIDEO_TITLE, title);
                    startActivity(intent);
                });
            }
        }, "AndroidVlc");

        wv.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;

                fullscreenContainer = new FrameLayout(MainActivity.this);
                fullscreenContainer.setBackgroundColor(Color.BLACK);
                fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

                ((ViewGroup) getWindow().getDecorView()).addView(
                    fullscreenContainer,
                    new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                hideSystemUi();
            }

            @Override
            public void onHideCustomView() {
                closeCustomView();
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            closeCustomView();
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemUi();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }
}
