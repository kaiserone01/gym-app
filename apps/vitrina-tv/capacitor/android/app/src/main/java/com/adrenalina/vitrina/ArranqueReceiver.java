package com.adrenalina.vitrina;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Abre la vitrina cuando el TV termina de arrancar. Android 10+ restringe abrir actividades desde segundo
// plano: hace falta el permiso "Mostrar sobre otras aplicaciones" (ver apps/vitrina-tv/README.md).
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context contexto, Intent intento) {
        String accion = intento.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(accion) || "android.intent.action.QUICKBOOT_POWERON".equals(accion)) {
            Intent abrir = new Intent(contexto, MainActivity.class);
            abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            contexto.startActivity(abrir);
        }
    }
}
