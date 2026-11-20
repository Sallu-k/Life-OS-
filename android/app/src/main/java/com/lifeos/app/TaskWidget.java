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
 * The second home-screen widget: overdue, today's and this week's tasks; one tap ticks one done (tap
 * again to undo). "+" opens the Plan page; the title opens the app. Data comes from WidgetStore.
 */
public class TaskWidget extends AppWidgetProvider {

    static final String ACTION_TOGGLE = "com.lifeos.app.TASK_WIDGET_TOGGLE";
    static final String EXTRA_INDEX = "task_index";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            int index = intent.getIntExtra(EXTRA_INDEX, -1);
            if (index < 0) return;
            WidgetStore.toggleTask(context, index);
            refresh(context);
            final PendingResult result = goAsync();
            new Thread(() -> {
                WidgetStore.sendPendingTasks(context);
                result.finish();
            }).start();
        }
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TaskWidget.class));
        for (int id : ids) manager.updateAppWidget(id, views(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static RemoteViews views(Context context, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_tasks);
        JSONObject d = WidgetStore.taskData(context);
        JSONArray tasks = d.optJSONArray("tasks");
        boolean fresh = WidgetStore.today().equals(d.optString("date"));
        int open = 0;
        if (tasks != null && fresh) for (int i = 0; i < tasks.length(); i++) if (!tasks.optJSONObject(i).optBoolean("done")) open++;
        v.setTextViewText(R.id.widget_title, "Tasks");
        v.setTextViewText(R.id.widget_count, fresh ? open + " open" : "Open LifeOS");

        Intent service = new Intent(context, TaskWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, service);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent toggle = new Intent(context, TaskWidget.class);
        toggle.setAction(ACTION_TOGGLE);
        PendingIntent template = PendingIntent.getBroadcast(context, 2, toggle, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        v.setPendingIntentTemplate(R.id.widget_list, template);

        Intent open1 = new Intent(context, MainActivity.class);
        open1.putExtra(MainActivity.EXTRA_PAGE, "/today/");
        v.setOnClickPendingIntent(R.id.widget_header, PendingIntent.getActivity(context, 3, open1, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.widget_empty, PendingIntent.getActivity(context, 3, open1, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent plan = new Intent(context, MainActivity.class);
        plan.putExtra(MainActivity.EXTRA_PAGE, "/plan/");
        v.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getActivity(context, 4, plan, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
