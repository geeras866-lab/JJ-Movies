package com.jjmovies.app;

          import android.app.AlertDialog;
          import android.content.Context;
          import android.content.SharedPreferences;
          import android.content.pm.ActivityInfo;
          import android.content.res.ColorStateList;
          import android.content.res.Configuration;
          import android.graphics.Color;
          import android.graphics.Typeface;
          import android.graphics.drawable.GradientDrawable;
          import android.media.AudioManager;
          import android.net.Uri;
          import android.os.Bundle;
          import android.os.Handler;
          import android.os.Looper;
          import android.provider.Settings;
          import android.view.GestureDetector;
          import android.view.Gravity;
          import android.view.KeyEvent;
          import android.view.MotionEvent;
          import android.view.View;
          import android.view.ViewGroup;
          import android.view.WindowManager;
          import android.widget.ImageButton;
          import android.widget.LinearLayout;
          import android.widget.RelativeLayout;
          import android.widget.ScrollView;
          import android.widget.SeekBar;
          import android.widget.TextView;
          import android.widget.Toast;

          import androidx.appcompat.app.AppCompatActivity;

          import org.videolan.libvlc.LibVLC;
          import org.videolan.libvlc.Media;
          import org.videolan.libvlc.MediaPlayer;
          import org.videolan.libvlc.util.VLCVideoLayout;

          import java.util.ArrayList;
          import java.util.Locale;

          public class VlcPlayerActivity extends AppCompatActivity {

              public static final String EXTRA_VIDEO_URL = "video_url";
              public static final String EXTRA_VIDEO_TITLE = "video_title";

              private static final String PREFS_NAME = "jj_vlc_prefs";
              private static final String KEY_SUB_SIZE = "sub_rel_fontsize";

              private static final int[] SUB_SIZE_VALUES = { 22, 16, 13, 10 };
              private static final String[] SUB_SIZE_LABELS = { "Small", "Normal", "Large", "XL" };

              private LibVLC libVLC;
              private MediaPlayer mediaPlayer;
              private VLCVideoLayout videoLayout;
              private RelativeLayout controlsOverlay;
              private LinearLayout loadingBrandContainer;
              private TextView tvLoadingSub, tvGestureHud;
              private SeekBar seekBar;
              private TextView tvCurrentTime, tvTotalTime, tvTitle;
              private ImageButton btnPlayPause, btnUnlock, btnRotate;
              private AudioManager audioManager;

              private final Handler handler = new Handler(Looper.getMainLooper());
              private String safeVideoUrl = "";
              private String movieDisplayTitle = "JJ Movies";
              private int currentSubFontSize = 16;
              private boolean isUserSeeking = false;
              private boolean controlsVisible = true;
              private boolean isLocked = false;
              private boolean isOrientationLocked = false;
              private int aspectMode = 0;

              private float touchStartX = 0f;
              private float touchStartY = 0f;
              private int gestureMode = 0;
              private float startBrightness = 0.5f;
              private int startVolume = 0;
              private int maxVolume = 15;

              private final MediaPlayer.ScaleType[] scaleTypes = {
                  MediaPlayer.ScaleType.SURFACE_BEST_FIT,
                  MediaPlayer.ScaleType.SURFACE_FILL,
                  MediaPlayer.ScaleType.SURFACE_FIT_SCREEN,
                  MediaPlayer.ScaleType.SURFACE_16_9
              };
              private final String[] scaleNames = { "Best Fit", "Fill Screen", "Zoom / Crop", "16:9" };

              private final Runnable hideControlsRunnable = () -> {
                  if (controlsOverlay != null && mediaPlayer != null && mediaPlayer.isPlaying()) {
                      controlsOverlay.setVisibility(View.GONE);
                      controlsVisible = false;
                      hideSystemUi();
                  }
              };

              private final Runnable hideUnlockRunnable = () -> {
                  if (btnUnlock != null) {
                      btnUnlock.setVisibility(View.GONE);
                      hideSystemUi();
                  }
              };

              private final Runnable hideHudRunnable = () -> {
                  if (tvGestureHud != null) tvGestureHud.setVisibility(View.GONE);
              };

              private final Runnable hideBrandAfterSeekRunnable = () -> {
                  if (loadingBrandContainer != null && mediaPlayer != null && mediaPlayer.isPlaying()) {
                      loadingBrandContainer.setVisibility(View.GONE);
                  }
              };

              private final Runnable progressUpdater = new Runnable() {
                  @Override
                  public void run() {
                      if (mediaPlayer != null && !isUserSeeking) {
                          long total = mediaPlayer.getLength();
                          long current = mediaPlayer.getTime();
                          if (total > 0) {
                              seekBar.setMax((int) total);
                              seekBar.setProgress((int) Math.max(0, current));
                              tvCurrentTime.setText(formatTime(current));
                              tvTotalTime.setText(formatTime(total));
                          }
                      }
                      handler.postDelayed(this, 500);
                  }
              };

              private String cleanRipperTags(String raw) {
                  if (raw == null) return "";
                  String s = raw.trim();
                  s = s.replaceAll("(?i)\\b(team\\s*movies|1tamilmv|tamilmv|tamilrockers|movierulz|bolly4u|katmoviehd|vegamovies|uhdmovies|olamovies|filmyzilla|desiremovies|hdhub4u|mkvcinemas|ssrmovies|worldfree4u|telly|hon3y|psa|yify|rarbg|flux|ntb|cmrg|qxr|utr|tigole)\\b", " ");
                  s = s.replaceAll("(?i)(www\\.[a-z0-9.-]+|@[a-z0-9_]+|t\\.me/\\S+)", " ");
                  s = s.replaceAll("(?i)^track\\s*\\d+\\s*[-:|]?\\s*", "");
                  s = s.replaceAll("\\[\\s*\\]", "").replaceAll("\\(\\s*\\)", "");
                  s = s.replaceAll("\\s*-\\s*-\\s*", " - ");
                  s = s.replaceAll("^[\\s\\-:|]+|[\\s\\-:|]+$", "");
                  s = s.replaceAll("\\s+", " ").trim();
                  return s;
              }

              private String formatTrackLabel(MediaPlayer.TrackDescription tr, boolean isAudio, int fallbackNum) {
                  if (tr.id == -1) return "Disable track";
                  String cleaned = cleanRipperTags(tr.name);
                  cleaned = cleaned.replaceAll("(?i)^jj\\s*[-:|]?\\s*", "").trim();
                  String safeMovie = movieDisplayTitle != null ? movieDisplayTitle.trim() : "Movie";
                  if (!safeMovie.isEmpty() && cleaned.toLowerCase(Locale.US).startsWith(safeMovie.toLowerCase(Locale.US))) {
                      cleaned = cleaned.substring(safeMovie.length()).replaceAll("^[\\s\\-:|]+", "").trim();
                  }
                  if (cleaned.isEmpty()) {
                      return isAudio
                              ? ("JJ - " + safeMovie + " - Audio " + fallbackNum)
                              : ("JJ - " + safeMovie + " - Subtitle " + fallbackNum);
                  }
                  return "JJ - " + safeMovie + " - " + cleaned;
              }

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

              private void showBrandOverlay(String subText, boolean autoHide) {
                  if (loadingBrandContainer == null) return;
                  if (tvLoadingSub != null && subText != null) tvLoadingSub.setText(subText);
                  loadingBrandContainer.setVisibility(View.VISIBLE);
                  handler.removeCallbacks(hideBrandAfterSeekRunnable);
                  if (autoHide) handler.postDelayed(hideBrandAfterSeekRunnable, 1200);
              }

              private void hideBrandOverlay() {
                  if (loadingBrandContainer != null) loadingBrandContainer.setVisibility(View.GONE);
              }

              private void showGestureHud(String text) {
                  if (tvGestureHud == null) return;
                  tvGestureHud.setText(text);
                  tvGestureHud.setVisibility(View.VISIBLE);
                  handler.removeCallbacks(hideHudRunnable);
                  handler.postDelayed(hideHudRunnable, 1000);
              }

              private void showControls() {
                  if (isLocked) return;
                  if (controlsOverlay != null) {
                      controlsOverlay.setVisibility(View.VISIBLE);
                      controlsVisible = true;
                  }
                  scheduleHideControls();
              }

              private void toggleControls() {
                  if (isLocked) {
                      if (btnUnlock != null) {
                          btnUnlock.setVisibility(View.VISIBLE);
                          handler.removeCallbacks(hideUnlockRunnable);
                          handler.postDelayed(hideUnlockRunnable, 3000);
                      }
                      return;
                  }
                  if (controlsVisible) {
                      handler.removeCallbacks(hideControlsRunnable);
                      controlsOverlay.setVisibility(View.GONE);
                      controlsVisible = false;
                      hideSystemUi();
                  } else {
                      showControls();
                  }
              }

              private void lockScreen() {
                  isLocked = true;
                  handler.removeCallbacks(hideControlsRunnable);
                  if (controlsOverlay != null) {
                      controlsOverlay.setVisibility(View.GONE);
                      controlsVisible = false;
                  }
                  if (btnUnlock != null) {
                      btnUnlock.setVisibility(View.VISIBLE);
                      handler.removeCallbacks(hideUnlockRunnable);
                      handler.postDelayed(hideUnlockRunnable, 3000);
                  }
                  hideSystemUi();
                  Toast.makeText(this, "Screen Locked", Toast.LENGTH_SHORT).show();
              }

              private void unlockScreen() {
                  isLocked = false;
                  handler.removeCallbacks(hideUnlockRunnable);
                  if (btnUnlock != null) btnUnlock.setVisibility(View.GONE);
                  showControls();
                  Toast.makeText(this, "Screen Unlocked", Toast.LENGTH_SHORT).show();
              }

              private void toggleOrientationLock() {
                  if (!isOrientationLocked) {
                      isOrientationLocked = true;
                      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LOCKED);
                      if (btnRotate != null) btnRotate.setImageResource(R.drawable.ic_vlc_orient_lock);
                      showGestureHud("Orientation Locked");
                  } else {
                      isOrientationLocked = false;
                      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
                      if (btnRotate != null) btnRotate.setImageResource(R.drawable.ic_vlc_rotate);
                      showGestureHud("Auto-Rotate");
                  }
                  scheduleHideControls();
              }

              private void manualFlipOrientation() {
                  int current = getResources().getConfiguration().orientation;
                  isOrientationLocked = true;
                  if (current == Configuration.ORIENTATION_LANDSCAPE) {
                      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                      showGestureHud("Portrait Locked");
                  } else {
                      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                      showGestureHud("Landscape Locked");
                  }
                  if (btnRotate != null) btnRotate.setImageResource(R.drawable.ic_vlc_orient_lock);
                  scheduleHideControls();
              }

              private void cycleAspectRatio() {
                  if (mediaPlayer == null) return;
                  aspectMode = (aspectMode + 1) % scaleTypes.length;
                  mediaPlayer.setVideoScale(scaleTypes[aspectMode]);
                  showGestureHud(scaleNames[aspectMode]);
                  scheduleHideControls();
              }

              private void scheduleHideControls() {
                  handler.removeCallbacks(hideControlsRunnable);
                  handler.postDelayed(hideControlsRunnable, 4000);
              }

              private String formatTime(long ms) {
                  if (ms <= 0) return "0:00";
                  long totalSec = ms / 1000;
                  long hours = totalSec / 3600;
                  long mins = (totalSec % 3600) / 60;
                  long secs = totalSec % 60;
                  if (hours > 0) return String.format(Locale.US, "%d:%02d:%02d", hours, mins, secs);
                  return String.format(Locale.US, "%d:%02d", mins, secs);
              }

              private float getCurrentBrightness() {
                  float b = getWindow().getAttributes().screenBrightness;
                  if (b >= 0f) return b;
                  try {
                      int sys = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
                      return Math.max(0.05f, Math.min(1f, sys / 255f));
                  } catch (Exception e) {
                      return 0.5f;
                  }
              }

              private int getCurrentSubSizeIndex() {
                  for (int i = 0; i < SUB_SIZE_VALUES.length; i++) {
                      if (SUB_SIZE_VALUES[i] == currentSubFontSize) return i;
                  }
                  return 1;
              }

              private void initVlcPlayer(long resumePositionMs, int restoreAudioId, int restoreSpuId) {
                  if (mediaPlayer != null) {
                      mediaPlayer.stop();
                      mediaPlayer.detachViews();
                      mediaPlayer.release();
                      mediaPlayer = null;
                  }
                  if (libVLC != null) {
                      libVLC.release();
                      libVLC = null;
                  }

                  ArrayList<String> options = new ArrayList<>();
                  options.add("--audio-time-stretch");
                  options.add("--network-caching=3000");
                  options.add("--file-caching=1500");
                  options.add("--live-caching=3000");
                  options.add("--http-reconnect");
                  options.add("--freetype-rel-fontsize=" + currentSubFontSize);
                  options.add("--sub-margin=45");

                  libVLC = new LibVLC(this, options);
                  mediaPlayer = new MediaPlayer(libVLC);
                  mediaPlayer.attachViews(videoLayout, null, false, false);

                  final boolean[] restored = { false };

                  mediaPlayer.setEventListener(event -> runOnUiThread(() -> {
                      if (event.type == MediaPlayer.Event.Playing) {
                          hideBrandOverlay();
                          btnPlayPause.setImageResource(R.drawable.ic_vlc_pause);
                          if (!restored[0]) {
                              restored[0] = true;
                              if (resumePositionMs > 0) mediaPlayer.setTime(resumePositionMs);
                              handler.postDelayed(() -> {
                                  if (mediaPlayer != null) {
                                      if (restoreAudioId != Integer.MIN_VALUE) mediaPlayer.setAudioTrack(restoreAudioId);
                                      if (restoreSpuId != Integer.MIN_VALUE) mediaPlayer.setSpuTrack(restoreSpuId);
                                  }
                              }, 600);
                          }
                          scheduleHideControls();
                      } else if (event.type == MediaPlayer.Event.Paused) {
                          btnPlayPause.setImageResource(R.drawable.ic_vlc_play);
                          showControls();
                      } else if (event.type == MediaPlayer.Event.Buffering) {
                          float pct = event.getBuffering();
                          if (pct >= 100f) hideBrandOverlay();
                          else showBrandOverlay("Buffering " + Math.round(pct) + "%", false);
                      } else if (event.type == MediaPlayer.Event.EncounteredError) {
                          hideBrandOverlay();
                          Toast.makeText(this, "Playback error. Try another server.", Toast.LENGTH_LONG).show();
                      }
                  }));

                  Media media = new Media(libVLC, Uri.parse(safeVideoUrl));
                  media.setHWDecoderEnabled(true, true);
                  media.addOption(":network-caching=3000");
                  media.addOption(":http-reconnect");
                  media.addOption(":freetype-rel-fontsize=" + currentSubFontSize);
                  media.addOption(":http-user-agent=Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
                  mediaPlayer.setMedia(media);
                  media.release();

                  showBrandOverlay("Loading...", false);
                  mediaPlayer.play();
              }

              @Override
              protected void onCreate(Bundle savedInstanceState) {
                  super.onCreate(savedInstanceState);
                  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                  setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
                  hideSystemUi();
                  setContentView(R.layout.activity_vlc_player);

                  String videoUrl = getIntent().getStringExtra(EXTRA_VIDEO_URL);
                  String videoTitle = getIntent().getStringExtra(EXTRA_VIDEO_TITLE);
                  if (videoUrl == null || videoUrl.trim().isEmpty()) {
                      Toast.makeText(this, "Invalid video URL", Toast.LENGTH_SHORT).show();
                      finish();
                      return;
                  }
                  if (videoTitle != null && !videoTitle.trim().isEmpty()) {
                      movieDisplayTitle = videoTitle.trim();
                  }

                  safeVideoUrl = videoUrl.trim()
                          .replace(" ", "%20")
                          .replace("(", "%28")
                          .replace(")", "%29");

                  SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                  currentSubFontSize = prefs.getInt(KEY_SUB_SIZE, 16);

                  audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                  if (audioManager != null) {
                      maxVolume = Math.max(1, audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
                  }

                  RelativeLayout root = findViewById(R.id.vlc_root);
                  videoLayout = findViewById(R.id.vlc_video_layout);
                  controlsOverlay = findViewById(R.id.controls_overlay);
                  loadingBrandContainer = findViewById(R.id.loading_brand_container);
                  tvLoadingSub = findViewById(R.id.tv_loading_sub);
                  tvGestureHud = findViewById(R.id.tv_gesture_hud);
                  seekBar = findViewById(R.id.vlc_seekbar);
                  tvCurrentTime = findViewById(R.id.tv_current_time);
                  tvTotalTime = findViewById(R.id.tv_total_time);
                  tvTitle = findViewById(R.id.tv_video_title);
                  btnPlayPause = findViewById(R.id.btn_play_pause);
                  btnUnlock = findViewById(R.id.btn_unlock);
                  btnRotate = findViewById(R.id.btn_rotate);

                  ImageButton btnBack = findViewById(R.id.btn_back);
                  ImageButton btnTracks = findViewById(R.id.btn_tracks);
                  ImageButton btnAspect = findViewById(R.id.btn_aspect);
                  ImageButton btnLock = findViewById(R.id.btn_lock);

                  if (tvTitle != null) {
                      tvTitle.setText(movieDisplayTitle);
                  }

                  GestureDetector gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
                      @Override
                      public boolean onSingleTapConfirmed(MotionEvent e) {
                          toggleControls();
                          return true;
                      }
                      @Override
                      public boolean onDoubleTap(MotionEvent e) {
                          if (isLocked) return true;
                          int width = root.getWidth();
                          if (e.getX() < width / 2f) {
                              seekBy(-10000L);
                              showBrandOverlay("⏪ -10s", true);
                          } else {
                              seekBy(10000L);
                              showBrandOverlay("⏩ +10s", true);
                          }
                          return true;
                      }
                  });

                  float swipeThreshold = 24f * getResources().getDisplayMetrics().density;

                  View.OnTouchListener touchListener = (v, event) -> {
                      gestureDetector.onTouchEvent(event);
                      if (isLocked) return true;

                      int action = event.getActionMasked();
                      if (action == MotionEvent.ACTION_DOWN) {
                          touchStartX = event.getX();
                          touchStartY = event.getY();
                          gestureMode = 0;
                          startBrightness = getCurrentBrightness();
                          if (audioManager != null) {
                              startVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                          }
                      } else if (action == MotionEvent.ACTION_MOVE) {
                          float dx = event.getX() - touchStartX;
                          float dy = touchStartY - event.getY();
                          if (gestureMode == 0 && Math.abs(dy) > swipeThreshold && Math.abs(dy) > Math.abs(dx)) {
                              int w = Math.max(1, root.getWidth());
                              gestureMode = (touchStartX < w / 2f) ? 1 : 2;
                          }
                          int h = Math.max(1, root.getHeight());
                          if (gestureMode == 1) {
                              float delta = dy / (h * 0.65f);
                              float newB = Math.max(0.02f, Math.min(1.0f, startBrightness + delta));
                              WindowManager.LayoutParams lp = getWindow().getAttributes();
                              lp.screenBrightness = newB;
                              getWindow().setAttributes(lp);
                              showGestureHud("☀ Brightness: " + Math.round(newB * 100) + "%");
                          } else if (gestureMode == 2 && audioManager != null) {
                              float delta = dy / (h * 0.65f);
                              int newVol = Math.max(0, Math.min(maxVolume, Math.round(startVolume + delta * maxVolume)));
                              audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, newVol, 0);
                              int pct = Math.round((newVol * 100f) / maxVolume);
                              showGestureHud("🔊 Volume: " + pct + "%");
                          }
                      } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                          gestureMode = 0;
                      }
                      return true;
                  };

                  root.setOnTouchListener(touchListener);
                  controlsOverlay.setOnTouchListener(touchListener);

                  initVlcPlayer(0L, Integer.MIN_VALUE, Integer.MIN_VALUE);

                  handler.post(progressUpdater);
                  scheduleHideControls();

                  if (btnBack != null) btnBack.setOnClickListener(v -> finish());
                  if (btnTracks != null) btnTracks.setOnClickListener(v -> { showControls(); showSideBySideTracksDialog(); });
                  if (btnRotate != null) {
                      btnRotate.setImageResource(R.drawable.ic_vlc_rotate);
                      btnRotate.setOnClickListener(v -> toggleOrientationLock());
                      btnRotate.setOnLongClickListener(v -> { manualFlipOrientation(); return true; });
                  }
                  if (btnPlayPause != null) btnPlayPause.setOnClickListener(v -> { togglePlayPause(); scheduleHideControls(); });
                  if (btnAspect != null) btnAspect.setOnClickListener(v -> cycleAspectRatio());
                  if (btnLock != null) btnLock.setOnClickListener(v -> lockScreen());
                  if (btnUnlock != null) btnUnlock.setOnClickListener(v -> unlockScreen());

                  seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                      @Override
                      public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                          if (fromUser) {
                              String t = formatTime(progress);
                              tvCurrentTime.setText(t);
                              showBrandOverlay("Seeking " + t, false);
                          }
                      }
                      @Override
                      public void onStartTrackingTouch(SeekBar sb) {
                          isUserSeeking = true;
                          handler.removeCallbacks(hideControlsRunnable);
                      }
                      @Override
                      public void onStopTrackingTouch(SeekBar sb) {
                          isUserSeeking = false;
                          if (mediaPlayer != null) mediaPlayer.setTime(sb.getProgress());
                          showBrandOverlay("Seeking " + formatTime(sb.getProgress()), true);
                          scheduleHideControls();
                      }
                  });
              }

              private void togglePlayPause() {
                  if (mediaPlayer == null) return;
                  if (mediaPlayer.isPlaying()) {
                      mediaPlayer.pause();
                      btnPlayPause.setImageResource(R.drawable.ic_vlc_play);
                  } else {
                      mediaPlayer.play();
                      btnPlayPause.setImageResource(R.drawable.ic_vlc_pause);
                  }
              }

              private void seekBy(long deltaMs) {
                  if (mediaPlayer == null) return;
                  long target = mediaPlayer.getTime() + deltaMs;
                  mediaPlayer.setTime(Math.max(0L, target));
              }

              private void showSideBySideTracksDialog() {
                  if (mediaPlayer == null) return;
                  handler.removeCallbacks(hideControlsRunnable);

                  MediaPlayer.TrackDescription[] audioTracks = mediaPlayer.getAudioTracks();
                  MediaPlayer.TrackDescription[] spuTracks = mediaPlayer.getSpuTracks();

                  float density = getResources().getDisplayMetrics().density;
                  int pad = Math.round(14 * density);
                  int itemPadV = Math.round(9 * density);
                  int itemPadH = Math.round(10 * density);

                  GradientDrawable dialogBg = new GradientDrawable();
                  dialogBg.setColor(Color.parseColor("#E60D0F14"));
                  dialogBg.setCornerRadius(14 * density);
                  dialogBg.setStroke(Math.round(1 * density), Color.parseColor("#2A2F3D"));

                  LinearLayout container = new LinearLayout(this);
                  container.setOrientation(LinearLayout.HORIZONTAL);
                  container.setBackground(dialogBg);
                  container.setPadding(pad, pad, pad, pad);

                  LinearLayout leftCol = new LinearLayout(this);
                  leftCol.setOrientation(LinearLayout.VERTICAL);
                  leftCol.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
                  leftCol.setPadding(0, 0, Math.round(8 * density), 0);

                  TextView audioHeader = new TextView(this);
                  audioHeader.setText("Audio");
                  audioHeader.setTextColor(Color.WHITE);
                  audioHeader.setTextSize(15f);
                  audioHeader.setTypeface(null, Typeface.BOLD);
                  audioHeader.setPadding(itemPadH, Math.round(4 * density), itemPadH, Math.round(8 * density));
                  leftCol.addView(audioHeader);

                  ScrollView audioScroll = new ScrollView(this);
                  LinearLayout audioList = new LinearLayout(this);
                  audioList.setOrientation(LinearLayout.VERTICAL);

                  int currentAudioId = mediaPlayer.getAudioTrack();
                  if (audioTracks != null && audioTracks.length > 0) {
                      int aNum = 1;
                      for (int i = 0; i < audioTracks.length; i++) {
                          MediaPlayer.TrackDescription tr = audioTracks[i];
                          String label = formatTrackLabel(tr, true, tr.id == -1 ? 0 : aNum++);
                          audioList.addView(buildTrackRow(label, tr.id == currentAudioId, itemPadH, itemPadV));
                      }
                  } else {
                      TextView emptyAudio = new TextView(this);
                      emptyAudio.setText("No audio tracks");
                      emptyAudio.setTextColor(Color.parseColor("#8E95A5"));
                      emptyAudio.setTextSize(13f);
                      emptyAudio.setPadding(itemPadH, itemPadV, itemPadH, itemPadV);
                      audioList.addView(emptyAudio);
                  }
                  audioScroll.addView(audioList);
                  leftCol.addView(audioScroll);

                  View divider = new View(this);
                  divider.setLayoutParams(new LinearLayout.LayoutParams(Math.round(1 * density), ViewGroup.LayoutParams.MATCH_PARENT));
                  divider.setBackgroundColor(Color.parseColor("#2A2F3D"));

                  LinearLayout rightCol = new LinearLayout(this);
                  rightCol.setOrientation(LinearLayout.VERTICAL);
                  rightCol.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
                  rightCol.setPadding(Math.round(8 * density), 0, 0, 0);

                  TextView subHeader = new TextView(this);
                  subHeader.setText("Subtitles");
                  subHeader.setTextColor(Color.WHITE);
                  subHeader.setTextSize(15f);
                  subHeader.setTypeface(null, Typeface.BOLD);
                  subHeader.setPadding(itemPadH, Math.round(4 * density), itemPadH, Math.round(8 * density));
                  rightCol.addView(subHeader);

                  ScrollView subScroll = new ScrollView(this);
                  LinearLayout subList = new LinearLayout(this);
                  subList.setOrientation(LinearLayout.VERTICAL);

                  int currentSpuId = mediaPlayer.getSpuTrack();
                  if (spuTracks != null && spuTracks.length > 0) {
                      int sNum = 1;
                      for (int i = 0; i < spuTracks.length; i++) {
                          MediaPlayer.TrackDescription tr = spuTracks[i];
                          String label = formatTrackLabel(tr, false, tr.id == -1 ? 0 : sNum++);
                          subList.addView(buildTrackRow(label, tr.id == currentSpuId, itemPadH, itemPadV));
                      }
                  } else {
                      TextView emptySub = new TextView(this);
                      emptySub.setText("Disable track");
                      emptySub.setTextColor(Color.parseColor("#8E95A5"));
                      emptySub.setTextSize(13f);
                      emptySub.setPadding(itemPadH, itemPadV, itemPadH, itemPadV);
                      subList.addView(emptySub);
                  }
                  subScroll.addView(subList);
                  rightCol.addView(subScroll);

                  int initIdx = getCurrentSubSizeIndex();

                  LinearLayout sizeHeaderRow = new LinearLayout(this);
                  sizeHeaderRow.setOrientation(LinearLayout.HORIZONTAL);
                  sizeHeaderRow.setPadding(itemPadH, Math.round(12 * density), itemPadH, Math.round(2 * density));

                  TextView sizeTitle = new TextView(this);
                  sizeTitle.setText("Subtitle Size");
                  sizeTitle.setTextColor(Color.parseColor("#94A3B8"));
                  sizeTitle.setTextSize(12f);
                  sizeTitle.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

                  TextView sizeValueTv = new TextView(this);
                  sizeValueTv.setText(SUB_SIZE_LABELS[initIdx]);
                  sizeValueTv.setTextColor(Color.parseColor("#FF6B00"));
                  sizeValueTv.setTextSize(12f);
                  sizeValueTv.setTypeface(null, Typeface.BOLD);

                  sizeHeaderRow.addView(sizeTitle);
                  sizeHeaderRow.addView(sizeValueTv);
                  rightCol.addView(sizeHeaderRow);

                  SeekBar sizeSlider = new SeekBar(this);
                  sizeSlider.setMax(SUB_SIZE_VALUES.length - 1);
                  sizeSlider.setProgress(initIdx);
                  sizeSlider.setProgressTintList(ColorStateList.valueOf(Color.parseColor("#FF6B00")));
                  sizeSlider.setThumbTintList(ColorStateList.valueOf(Color.parseColor("#FF6B00")));
                  sizeSlider.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#55FFFFFF")));
                  sizeSlider.setPadding(itemPadH, Math.round(4 * density), itemPadH, Math.round(4 * density));
                  rightCol.addView(sizeSlider);

                  container.addView(leftCol);
                  container.addView(divider);
                  container.addView(rightCol);

                  AlertDialog dialog = new AlertDialog.Builder(this)
                          .setView(container)
                          .setOnDismissListener(d -> {
                              hideSystemUi();
                              scheduleHideControls();
                          })
                          .create();

                  bindDismissOnSelect(audioList, audioTracks, true, dialog);
                  bindDismissOnSelect(subList, spuTracks, false, dialog);

                  sizeSlider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                      @Override
                      public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                          if (progress >= 0 && progress < SUB_SIZE_LABELS.length) {
                              sizeValueTv.setText(SUB_SIZE_LABELS[progress]);
                          }
                      }
                      @Override
                      public void onStartTrackingTouch(SeekBar sb) {}
                      @Override
                      public void onStopTrackingTouch(SeekBar sb) {
                          int idx = sb.getProgress();
                          int newSize = SUB_SIZE_VALUES[idx];
                          if (currentSubFontSize != newSize) {
                              currentSubFontSize = newSize;
                              getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putInt(KEY_SUB_SIZE, newSize).apply();
                              long pos = mediaPlayer != null ? mediaPlayer.getTime() : 0L;
                              int aId = mediaPlayer != null ? mediaPlayer.getAudioTrack() : Integer.MIN_VALUE;
                              int sId = mediaPlayer != null ? mediaPlayer.getSpuTrack() : Integer.MIN_VALUE;
                              Toast.makeText(VlcPlayerActivity.this, "Subtitle Size: " + SUB_SIZE_LABELS[idx], Toast.LENGTH_SHORT).show();
                              dialog.dismiss();
                              initVlcPlayer(pos, aId, sId);
                          }
                      }
                  });

                  dialog.show();
                  if (dialog.getWindow() != null) {
                      dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
                  }
              }

              private void bindDismissOnSelect(
                      LinearLayout listView,
                      MediaPlayer.TrackDescription[] tracks,
                      boolean isAudio,
                      AlertDialog dialog
              ) {
                  if (tracks == null) return;
                  int count = Math.min(listView.getChildCount(), tracks.length);
                  int num = 1;
                  for (int i = 0; i < count; i++) {
                      final int idx = i;
                      MediaPlayer.TrackDescription tr = tracks[idx];
                      final String label = formatTrackLabel(tr, isAudio, tr.id == -1 ? 0 : num++);
                      listView.getChildAt(i).setOnClickListener(v -> {
                          if (isAudio) {
                              mediaPlayer.setAudioTrack(tr.id);
                              Toast.makeText(this, "Audio: " + label, Toast.LENGTH_SHORT).show();
                          } else {
                              mediaPlayer.setSpuTrack(tr.id);
                              Toast.makeText(this, "Subtitle: " + label, Toast.LENGTH_SHORT).show();
                          }
                          dialog.dismiss();
                      });
                  }
              }

              private TextView buildTrackRow(String label, boolean selected, int padH, int padV) {
                  TextView tv = new TextView(this);
                  tv.setLayoutParams(new LinearLayout.LayoutParams(
                          ViewGroup.LayoutParams.MATCH_PARENT,
                          ViewGroup.LayoutParams.WRAP_CONTENT
                  ));
                  tv.setGravity(Gravity.CENTER_VERTICAL);
                  tv.setText((selected ? "✓  " : "    ") + label);
                  tv.setTextSize(13.5f);
                  tv.setTextColor(selected ? Color.WHITE : Color.parseColor("#B5BCCB"));
                  tv.setTypeface(null, selected ? Typeface.BOLD : Typeface.NORMAL);
                  tv.setPadding(padH, padV, padH, padV);
                  return tv;
              }

              @Override
              public void onBackPressed() {
                  if (isLocked) {
                      toggleControls();
                      return;
                  }
                  super.onBackPressed();
              }

              @Override
              public boolean onKeyDown(int keyCode, KeyEvent event) {
                  if (mediaPlayer != null && !isLocked) {
                      if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                          togglePlayPause();
                          showControls();
                          return true;
                      }
                      if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
                          seekBy(10000L);
                          showBrandOverlay("⏩ +10s", true);
                          showControls();
                          return true;
                      }
                      if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                          seekBy(-10000L);
                          showBrandOverlay("⏪ -10s", true);
                          showControls();
                          return true;
                      }
                  }
                  return super.onKeyDown(keyCode, event);
              }

              @Override
              protected void onStop() {
                  super.onStop();
                  if (mediaPlayer != null) mediaPlayer.stop();
              }

              @Override
              protected void onDestroy() {
                  super.onDestroy();
                  handler.removeCallbacksAndMessages(null);
                  if (mediaPlayer != null) {
                      mediaPlayer.detachViews();
                      mediaPlayer.release();
                      mediaPlayer = null;
                  }
                  if (libVLC != null) {
                      libVLC.release();
                      libVLC = null;
                  }
              }
          }
