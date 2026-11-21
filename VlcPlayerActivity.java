package com.jjmovies.app;

import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

public class VlcPlayerActivity extends AppCompatActivity {

    public static final String EXTRA_VIDEO_URL = "video_url";
    public static final String EXTRA_VIDEO_TITLE = "video_title";

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private VLCVideoLayout videoLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
        setContentView(R.layout.activity_vlc_player);

        String videoUrl = getIntent().getStringExtra(EXTRA_VIDEO_URL);
        if (videoUrl == null || videoUrl.trim().isEmpty()) {
            Toast.makeText(this, "Invalid video URL", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        videoLayout = findViewById(R.id.vlc_video_layout);
        Button btnAudio = findViewById(R.id.btn_audio_tracks);
        Button btnSubs = findViewById(R.id.btn_sub_tracks);
        Button btnSeekBack = findViewById(R.id.btn_seek_back);
        Button btnPlayPause = findViewById(R.id.btn_play_pause);
        Button btnSeekFwd = findViewById(R.id.btn_seek_fwd);

        ArrayList<String> options = new ArrayList<>();
        options.add("--aout=opensles");
        options.add("--audio-time-stretch");
        options.add("--network-caching=2500");
        options.add("--file-caching=1500");
        options.add("--live-caching=2500");

        libVLC = new LibVLC(this, options);
        mediaPlayer = new MediaPlayer(libVLC);
        mediaPlayer.attachViews(videoLayout, null, false, false);

        Media media = new Media(libVLC, Uri.parse(videoUrl.trim()));
        media.setHWDecoderEnabled(true, false);
        media.addOption(":network-caching=2500");
        media.addOption(":http-reconnect");
        media.addOption(":audio-passthrough");
        mediaPlayer.setMedia(media);
        media.release();

        mediaPlayer.play();

        if (btnAudio != null) btnAudio.setOnClickListener(v -> showAudioTrackDialog());
        if (btnSubs != null) btnSubs.setOnClickListener(v -> showSubtitleTrackDialog());
        if (btnPlayPause != null) btnPlayPause.setOnClickListener(v -> togglePlayPause());
        if (btnSeekBack != null) btnSeekBack.setOnClickListener(v -> seekBy(-10000L));
        if (btnSeekFwd != null) btnSeekFwd.setOnClickListener(v -> seekBy(10000L));
    }

    private void togglePlayPause() {
        if (mediaPlayer == null) return;
        if (mediaPlayer.isPlaying()) mediaPlayer.pause();
        else mediaPlayer.play();
    }

    private void seekBy(long deltaMs) {
        if (mediaPlayer == null) return;
        long target = mediaPlayer.getTime() + deltaMs;
        mediaPlayer.setTime(Math.max(0L, target));
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
                .setTitle("Select Audio Language / Dolby")
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
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (mediaPlayer != null) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                togglePlayPause();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
                seekBy(10000L);
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                seekBy(-10000L);
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
