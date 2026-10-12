package com.flowlist.app;

/* ============================================================
   Flowlist — the Android app

   The whole board is one HTML file. This is the window it lives in:
   a WebView filling the screen, and almost nothing else. What it buys
   over the same file opened in a browser is exactly three things, and
   they are the three things a browser cannot give:

     · The screen, with no announcement. A browser is required to tell
       you when a page takes the screen — "drag from the top to exit" —
       and no page can turn that off. An app is not a page asking for
       anything: it is simply drawn edge to edge, and Android says
       nothing at all.

     · No load, ever. The file is inside the app. There is no server, no
       round trip, and no signal needed.

     · A real origin. See the loader below — this matters more than it
       looks, because the board is encrypted and encryption needs one.

   WHAT IS DELIBERATELY NOT HERE

   No analytics, no crash reporting, no ad id, no libraries at all — the
   app depends on nothing beyond the Android platform itself. Backup is
   off in the manifest too, so the board is never copied to Google Drive
   on the owner's behalf. The only address this app ever contacts is the
   sync database, and only when sync has been set up.
   ============================================================ */

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {

  /* The board is served to itself over this name rather than loaded as a
     file, and the reason is not tidiness.

     A file:// page has an opaque origin. Two things break on one: the
     browser's storage, which is where the whole board lives, has no
     stable owner to belong to; and window.crypto.subtle — the thing that
     encrypts the board before it is ever sent anywhere — is only handed
     to a secure context. Serving the same bytes over https, from a host
     that is answered inside this process and never leaves the phone,
     gives both. Nothing is on a network; shouldInterceptRequest below
     answers every request out of the app's own assets.

     The name is Google's reserved one for exactly this, guaranteed never
     to resolve to a real address. */
  private static final String HOST = "appassets.androidplatform.net";
  private static final String HOME = "https://" + HOST + "/assets/index.html";

  private WebView web;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    /* The window keeps clear of the navigation bar rather than drawing
       under it. That bar is staying — see goFull() — and a board whose
       bottom row of buttons sits beneath the gesture pill is a board with
       a row of buttons you cannot press. CSS could be taught to leave
       room, but a web view does not report the navigation bar to
       env(safe-area-inset-bottom) in the first place, so it would be
       guesswork. Letting Android do the arithmetic is exact. */

    web = new WebView(this);
    setContentView(web);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);          // the board itself lives here
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setSupportZoom(false);               // the board has its own pinch
    s.setBuiltInZoomControls(false);
    s.setDisplayZoomControls(false);
    s.setTextZoom(100);                    // the phone's font scale must not reflow the board
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    s.setAllowFileAccess(false);           // nothing is loaded as a file, so nothing needs to be
    s.setAllowContentAccess(false);

    /* Tell the board it is inside the app.
    
       It has two things in it that make sense in a browser and no sense
       here: a service worker, whose whole job is to keep a copy of a page
       that is already on the device, and a fullscreen request, for a
       screen the window is already filling. Both would be quiet failures
       rather than loud ones, but a quiet failure repeated on every launch
       is still wrong.

       A word on the end of the user agent is how a web view has always
       said this. It is one string in one direction; the alternative —
       addJavascriptInterface — opens a way in from the page to this
       class, which is far too much to spend on a yes or no. */
    s.setUserAgentString(s.getUserAgentString() + " FlowlistApp/1");

    /* No cookies are used by anything here. */
    CookieManager.getInstance().setAcceptCookie(false);

    web.setWebViewClient(new Loader());
    web.setBackgroundColor(0xFF0D1424);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);

    if (state != null) web.restoreState(state);
    else web.loadUrl(HOME);

    /* On a debug build, let a desktop Chrome attach to it. Never on a
       release build: it would open the board to anything with USB. */
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true);
    }

    goFull();
  }

  /* ---------- the screen ----------

     Edge to edge, with the status bar hidden — and hidden in the one way
     Android does not announce.

     What is announced, and why. Hiding the NAVIGATION bar is what makes
     the system put up a card of its own: "Viewing full screen — to exit,
     swipe down from the top." That is not vanity on Android's part. Take
     away the way out of an app and it has to say how to get it back, or
     somebody is stuck. Every arrangement that hides the navigation bar
     summons it, whatever the behaviour flag says; that was tried, and it
     is written down here so it is not tried again.

     So the navigation bar stays, and the status bar goes. On a phone
     using gesture navigation the bar that stays is the thin line at the
     bottom, drawn over the board rather than beside it, because the
     window is laid out under it and painted transparent. The clock,
     the battery and the carrier go, nothing else is lost, and Android
     says nothing at all. */

  private void goFull() {
    if (Build.VERSION.SDK_INT >= 30) {
      WindowInsetsController c = getWindow().getInsetsController();
      if (c != null) {
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_DEFAULT);
        c.hide(WindowInsets.Type.statusBars());
      }
    } else {
      web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN);
    }
  }

  @Override
  public void onWindowFocusChanged(boolean has) {
    super.onWindowFocusChanged(has);
    if (has) goFull();
  }

  /* ---------- the back button ----------

     Back means back through the board's own history if there is any, and
     otherwise it leaves the app. It must never reload the page. */
  @Override
  public boolean onKeyDown(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
      web.goBack();
      return true;
    }
    return super.onKeyDown(code, e);
  }

  /* A note half-typed must survive the phone being turned. */
  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    if (web != null) web.saveState(out);
  }

  @Override
  protected void onPause() { super.onPause(); if (web != null) web.onPause(); }

  @Override
  protected void onResume() { super.onResume(); if (web != null) web.onResume(); }

  /* ---------- serving the app to itself ---------- */

  private class Loader extends WebViewClient {

    /**
     * Everything under the reserved host is answered here, out of the
     * app's own assets, without a byte leaving the phone. Anything else
     * — which in practice means the sync database and nothing else —
     * is returned as null, and goes out over the network as normal.
     */
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
      Uri u = req.getUrl();
      if (u == null || !HOST.equals(u.getHost())) return null;

      String path = u.getPath();
      if (path == null) return null;
      if (path.startsWith("/assets/")) path = path.substring("/assets/".length());
      else if (path.startsWith("/")) path = path.substring(1);
      if (path.isEmpty()) path = "index.html";

      /* A path that climbs out of the assets folder is refused rather
         than resolved. Nothing here should ever ask for one. */
      if (path.contains("..")) return null;

      try {
        InputStream in = getAssets().open(path);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(mimeOf(path), "utf-8", 200, "OK", headers, in);
      } catch (IOException e) {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
            new HashMap<String, String>(), null);
      }
    }

    /**
     * A link to somewhere else on the web opens in the phone's browser.
     * The app is the board, not a browser, and a tap on a link should
     * not strand somebody inside it with no address bar to get out by.
     */
    @Override
    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
      Uri u = req.getUrl();
      if (u == null) return false;
      if (HOST.equals(u.getHost())) return false;      // our own pages: load them
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, u));
      } catch (Exception e) { /* nothing can open it: better than crashing */ }
      return true;
    }
  }

  private static String mimeOf(String path) {
    String p = path.toLowerCase();
    if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
    if (p.endsWith(".js"))    return "text/javascript";
    if (p.endsWith(".css"))   return "text/css";
    if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
    if (p.endsWith(".png"))   return "image/png";
    if (p.endsWith(".svg"))   return "image/svg+xml";
    if (p.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  }
}
