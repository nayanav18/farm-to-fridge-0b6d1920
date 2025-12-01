// src/components/PredictionChart.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

/**
 * PredictionChart (frontend placeholder)
 *
 * - Fetches historical_sales rows for the given supermarket/localMarket and product.
 * - Renders last N days actual demand and a simple forecast line.
 *
 * NOTE:
 * Replace this with a backend endpoint that runs your Python RandomForest model and returns a forecast.
 * I built this component so charts appear in the UI immediately and you can plug the actual model easily.
 */

type Props = {
  supermarket?: string;
  localMarket?: string;
  productName: string;
};

const PredictionChart: React.FC<Props> = ({ supermarket, localMarket, productName }) => {
  // determine branch filter (supermarket takes precedence)
  const branch = supermarket ?? localMarket ?? "";

  const { data: rows = [] } = useQuery({
    queryKey: ["historical_sales_for", branch, productName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historical_sales")
        .select("date, quantity_sold, product_name, supermarket_branch")
        .eq("product_name", productName)
        .eq("supermarket_branch", branch);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // aggregate per date and build sorted list
  const grouped: Record<string, number> = {};
  (rows || []).forEach((r: any) => {
    const d = r.date?.slice(0, 10) ?? (new Date(r.date).toISOString().slice(0, 10));
    grouped[d] = (grouped[d] || 0) + (r.quantity_sold ?? 0);
  });

  const dates = Object.keys(grouped).sort();
  // show last 30 days if available
  const shownDates = dates.slice(-30);
  const data = shownDates.map((d) => ({ date: d, actual: grouped[d] || 0 }));

  // simple forecast: rolling average of last 7 days
  const avg = data.slice(-7).reduce((s, it) => s + (it.actual || 0), 0) / Math.max(1, data.slice(-7).length);
  // forecast next 7 days (same avg)
  const forecastPoints = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(shownDates[shownDates.length - 1] ?? new Date().toISOString());
    date.setDate(date.getDate() + i + 1);
    return { date: date.toISOString().slice(0, 10), forecast: Math.round(avg) };
  });

  const combined = [
    ...data.map((d) => ({ date: d.date, actual: d.actual })),
    ...forecastPoints.map((f) => ({ date: f.date, actual: null, forecast: f.forecast })),
  ];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={combined}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="actual" stroke="#06b6d4" name="Actual" dot={false} />
          <Line type="monotone" dataKey="forecast" stroke="#fb923c" name="Forecast" strokeDasharray="4 4" dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PredictionChart;
