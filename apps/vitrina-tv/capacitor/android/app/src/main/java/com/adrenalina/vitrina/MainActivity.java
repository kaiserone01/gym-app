package com.adrenalina.vitrina;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Los videos con sonido arrancan solos: sin esto la WebView exige un toque del usuario para reproducir con audio.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        // La vitrina no debe apagar la pantalla ni mostrar barras del sistema.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ocultarBarras();
        pedirPermisoDeArranque();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            ocultarBarras();
        }
    }

    // Para abrirse sola al encender el TV (Android 10+) la app necesita "Mostrar sobre otras aplicaciones". Como se instala
    // por enlace y no por adb, se pide aquí, una sola vez por arranque de proceso: abre la pantalla del sistema si existe
    // en este TV; si no existe, solo avisa del estado con un mensaje breve.
    private void pedirPermisoDeArranque() {
        if (Settings.canDrawOverlays(this)) {
            return;
        }
        Toast.makeText(this, "Vitrina AX: falta el permiso \"Mostrar sobre otras aplicaciones\" para abrirse sola al encender", Toast.LENGTH_LONG).show();
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (ActivityNotFoundException e) {
            // Algunos Android TV no traen esa pantalla: el arranque automático se resuelve con el ajuste del fabricante.
        }
    }

    private void ocultarBarras() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }
}
