package com.lifeos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The home-screen widget: today's due habits, one tap to tick one done (tap again to clear).
 * Tapping the title opens the app. Data comes from WidgetStore (written by the app).
 */
public class HabitWidget extends AppWidgetProvider {

    static final String ACTION_TOGGLE = "com.lifeos.app.WIDGET_TOGGLE";
    static final String EXTRA_ID = "habit_id";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            String habit = intent.getStringExtra(EXTRA_ID);
            if (habit == null) return;
            WidgetStore.toggle(context, habit);
            refresh(context);
            final PendingResult result = goAsync();
            new Thread(() -> {
                WidgetStore.sendPending(context);
                result.finish();
            }).start();
        }
    }

    /** Redraws every LifeOS widget (called by the app after it writes new data, and after a tick). */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HabitWidget.class));
        for (int id : ids) manager.updateAppWidget(id, views(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static RemoteViews views(Context context, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
        JSONObject d = WidgetStore.data(context);
        JSONArray habits = d.optJSONArray("habits");
        boolean fresh = WidgetStore.today().equals(d.optString("date"));
        int done = 0;
        int total = 0;
        if (habits != null && fresh) {
            for (int i = 0; i < habits.length(); i++) {
                JSONObject h = habits.optJSONObject(i);
                if (h == null) continue;
                total++;
                if (!h.isNull("state")) done++;
            }
        }
        v.setTextViewText(R.id.widget_title, "Today");
        v.setTextViewText(R.id.widget_count, fresh ? done + " of " + total + " logged" : "Open LifeOS");

        // The list of habits (one row each, filled by HabitWidgetService).
        Intent service = new Intent(context, HabitWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, service);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // A tap on a row toggles that habit.
        Intent toggle = new Intent(context, HabitWidget.class);
        toggle.setAction(ACTION_TOGGLE);
        PendingIntent template = PendingIntent.getBroadcast(context, 0, toggle, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        v.setPendingIntentTemplate(R.id.widget_list, template);

        // A tap on the title opens the app.
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent openApp = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_header, openApp);
        v.setOnClickPendingIntent(R.id.widget_empty, openApp);
        return v;
    }
}
