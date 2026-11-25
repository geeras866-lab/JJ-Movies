package com.jjmovies.app;

import android.app.AlertDialog;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.GestureDetector;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
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

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private VLCVideoLayout videoLayout;
    private RelativeLayout controlsOverlay;
    private ProgressBar loadingSpinner;
    private SeekBar seekBar;
    private TextView tvCurrentTime, tvTotalTime, tvTitle;
    private ImageButton btnPlayPause, btnUnlock;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isUserSeeking = false;
    private boolean controlsVisible = true;
    private boolean isLocked = false;
    private boolean isLandscape = true;
    private int aspectMode = 0;

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

    private void toggleRotation() {
        if (isLandscape) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            isLandscape = false;
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            isLandscape = true;
        }
        scheduleHideControls();
    }

    private void cycleAspectRatio() {
        if (mediaPlayer == null) return;
        aspectMode = (aspectMode + 1) % scaleTypes.length;
        mediaPlayer.setVideoScale(scaleTypes[aspectMode]);
        Toast.makeText(this, scaleNames[aspectMode], Toast.LENGTH_SHORT).show();
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
        if (hours > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, mins, secs);
        }
        return String.format(Locale.US, "%d:%02d", mins, secs);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        setContentView(R.layout.activity_vlc_player);

        String videoUrl = getIntent().getStringExtra(EXTRA_VIDEO_URL);
        String videoTitle = getIntent().getStringExtra(EXTRA_VIDEO_TITLE);
        if (videoUrl == null || videoUrl.trim().isEmpty()) {
            Toast.makeText(this, "Invalid video URL", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        RelativeLayout root = findViewById(R.id.vlc_root);
        videoLayout = findViewById(R.id.vlc_video_layout);
        controlsOverlay = findViewById(R.id.controls_overlay);
        loadingSpinner = findViewById(R.id.vlc_loading);
        seekBar = findViewById(R.id.vlc_seekbar);
        tvCurrentTime = findViewById(R.id.tv_current_time);
        tvTotalTime = findViewById(R.id.tv_total_time);
        tvTitle = findViewById(R.id.tv_video_title);
        btnPlayPause = findViewById(R.id.btn_play_pause);
        btnUnlock = findViewById(R.id.btn_unlock);

        ImageButton btnBack = findViewById(R.id.btn_back);
        ImageButton btnTracks = findViewById(R.id.btn_tracks);
        ImageButton btnRotate = findViewById(R.id.btn_rotate);
        ImageButton btnAspect = findViewById(R.id.btn_aspect);
        ImageButton btnLock = findViewById(R.id.btn_lock);

        if (tvTitle != null && videoTitle != null && !videoTitle.trim().isEmpty()) {
            tvTitle.setText(videoTitle.trim());
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
                    Toast.makeText(VlcPlayerActivity.this, "-10s", Toast.LENGTH_SHORT).show();
                } else {
                    seekBy(10000L);
                    Toast.makeText(VlcPlayerActivity.this, "+10s", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        View.OnTouchListener touchListener = (v, event) -> {
            gestureDetector.onTouchEvent(event);
            return true;
        };
        root.setOnTouchListener(touchListener);
        controlsOverlay.setOnTouchListener(touchListener);

        ArrayList<String> options = new ArrayList<>();
        options.add("--audio-time-stretch");
        options.add("--network-caching=3000");
        options.add("--file-caching=1500");
        options.add("--live-caching=3000");
        options.add("--http-reconnect");

        libVLC = new LibVLC(this, options);
        mediaPlayer = new MediaPlayer(libVLC);
        mediaPlayer.attachViews(videoLayout, null, false, false);

        mediaPlayer.setEventListener(event -> runOnUiThread(() -> {
            if (event.type == MediaPlayer.Event.Playing) {
                loadingSpinner.setVisibility(View.GONE);
                btnPlayPause.setImageResource(R.drawable.ic_vlc_pause);
                scheduleHideControls();
            } else if (event.type == MediaPlayer.Event.Paused) {
                btnPlayPause.setImageResource(R.drawable.ic_vlc_play);
                showControls();
            } else if (event.type == MediaPlayer.Event.Buffering) {
                loadingSpinner.setVisibility(event.getBuffering() >= 100f ? View.GONE : View.VISIBLE);
            } else if (event.type == MediaPlayer.Event.EncounteredError) {
                loadingSpinner.setVisibility(View.GONE);
                Toast.makeText(this, "Playback error. Try another server.", Toast.LENGTH_LONG).show();
            }
        }));

        String safeUrl = videoUrl.trim()
                .replace(" ", "%20")
                .replace("(", "%28")
                .replace(")", "%29");

        Media media = new Media(libVLC, Uri.parse(safeUrl));
        media.setHWDecoderEnabled(true, true);
        media.addOption(":network-caching=3000");
        media.addOption(":http-reconnect");
        media.addOption(":http-user-agent=Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
        mediaPlayer.setMedia(media);
        media.release();

        mediaPlayer.play();
        handler.post(progressUpdater);
        scheduleHideControls();

        if (btnBack != null) btnBack.setOnClickListener(v -> finish());
        if (btnTracks != null) btnTracks.setOnClickListener(v -> { showControls(); showTracksMenu(); });
        if (btnRotate != null) btnRotate.setOnClickListener(v -> toggleRotation());
        if (btnPlayPause != null) btnPlayPause.setOnClickListener(v -> { togglePlayPause(); scheduleHideControls(); });
        if (btnAspect != null) btnAspect.setOnClickListener(v -> cycleAspectRatio());
        if (btnLock != null) btnLock.setOnClickListener(v -> lockScreen());
        if (btnUnlock != null) btnUnlock.setOnClickListener(v -> unlockScreen());

        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                if (fromUser) tvCurrentTime.setText(formatTime(progress));
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

    private void showTracksMenu() {
        String[] opts = { "Audio Track (Language / Dolby)", "Subtitles" };
        new AlertDialog.Builder(this)
                .setTitle("Audio & Subtitles")
                .setItems(opts, (d, which) -> {
                    if (which == 0) showAudioTrackDialog();
                    else showSubtitleTrackDialog();
                })
                .show();
    }

    private void showAudioTrackDialog() {
        if (mediaPlayer == null) return;
        MediaPlayer.TrackDescription[] tracks = mediaPlayer.getAudioTracks();
        if (tracks == null || tracks.length == 0) {
            Toast.makeText(this, "Audio tracks not loaded yet", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[tracks.length];
        int currentId = mediaPlayer.getAudioTrack();
        int checkedIndex = 0;
        for (int i = 0; i < tracks.length; i++) {
            names[i] = tracks[i].name != null ? tracks[i].name : ("Audio Track " + i);
            if (tracks[i].id == currentId) checkedIndex = i;
        }
        new AlertDialog.Builder(this)
                .setTitle("Select Audio Track")
                .setSingleChoiceItems(names, checkedIndex, (dialog, which) -> {
                    mediaPlayer.setAudioTrack(tracks[which].id);
                    Toast.makeText(this, "Audio: " + names[which], Toast.LENGTH_SHORT).show();
                    dialog.dismiss();
                })
                .show();
    }

    private void showSubtitleTrackDialog() {
        if (mediaPlayer == null) return;
        MediaPlayer.TrackDescription[] tracks = mediaPlayer.getSpuTracks();
        if (tracks == null || tracks.length == 0) {
            Toast.makeText(this, "No subtitles available", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[tracks.length];
        int currentId = mediaPlayer.getSpuTrack();
        int checkedIndex = 0;
        for (int i = 0; i < tracks.length; i++) {
            names[i] = tracks[i].name != null ? tracks[i].name : ("Subtitle " + i);
            if (tracks[i].id == currentId) checkedIndex = i;
        }
        new AlertDialog.Builder(this)
                .setTitle("Select Subtitles")
                .setSingleChoiceItems(names, checkedIndex, (dialog, which) -> {
                    mediaPlayer.setSpuTrack(tracks[which].id);
                    Toast.makeText(this, "Subtitle: " + names[which], Toast.LENGTH_SHORT).show();
                    dialog.dismiss();
                })
                .show();
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
                showControls();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                seekBy(-10000L);
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
