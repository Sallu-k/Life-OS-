package com.lifeos.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Paint;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Fills the task widget's list: one row per task, with a tick box. */
public class TaskWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext());
    }

    static final class Rows implements RemoteViewsFactory {

        private final Context context;
        private JSONArray tasks = new JSONArray();

        Rows(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject d = WidgetStore.taskData(context);
            JSONArray t = d.optJSONArray("tasks");
            tasks = t != null && WidgetStore.today().equals(d.optString("date")) ? t : new JSONArray();
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return tasks.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_task_row);
            JSONObject t = tasks.optJSONObject(position);
            if (t == null) return row;
            boolean done = t.optBoolean("done");
            row.setTextViewText(R.id.row_label, t.optString("text"));
            row.setTextViewText(R.id.row_meta, t.optString("meta"));
            row.setInt(R.id.row_label, "setPaintFlags", done ? Paint.STRIKE_THRU_TEXT_FLAG | Paint.ANTI_ALIAS_FLAG : Paint.ANTI_ALIAS_FLAG);
            row.setTextViewText(R.id.row_mark, done ? "✓" : "");
            row.setInt(R.id.row_mark, "setBackgroundResource", done ? R.drawable.widget_mark_on : R.drawable.widget_mark_off);
            Intent fill = new Intent();
            fill.putExtra(TaskWidget.EXTRA_INDEX, position);
            row.setOnClickFillInIntent(R.id.row, fill);
            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
