package com.lifeos.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Fills the widget's list: one row per habit due today, with its mark. */
public class HabitWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext());
    }

    static final class Rows implements RemoteViewsFactory {

        private final Context context;
        private JSONArray habits = new JSONArray();

        Rows(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject d = WidgetStore.data(context);
            JSONArray h = d.optJSONArray("habits");
            habits = h != null && WidgetStore.today().equals(d.optString("date")) ? h : new JSONArray();
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return habits.length();
        }

        private static String mark(String state) {
            switch (state) {
                case "done":
                    return "✓";
                case "half":
                    return "½";
                case "partial":
                    return "○";
                case "missed":
                    return "✕";
                case "na":
                    return "–";
                default:
                    return "";
            }
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_habit_row);
            JSONObject h = habits.optJSONObject(position);
            if (h == null) return row;
            String state = h.isNull("state") ? "" : h.optString("state");
            row.setTextViewText(R.id.row_label, h.optString("label"));
            row.setTextViewText(R.id.row_mark, mark(state));
            row.setInt(R.id.row_mark, "setBackgroundResource", "done".equals(state) ? R.drawable.widget_mark_on : R.drawable.widget_mark_off);
            Intent fill = new Intent();
            fill.putExtra(HabitWidget.EXTRA_ID, h.optString("id"));
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
