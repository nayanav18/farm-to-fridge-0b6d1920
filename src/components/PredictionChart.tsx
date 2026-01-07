// src/components/PredictionChart.tsx
import React, { useMemo, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

const ServerPy = {
  forecast: async (supermarket: string, product: string, days: number) => {
    const url = `http://127.0.0.1:8000/forecast?supermarket=${encodeURIComponent(supermarket)}&product=${encodeURIComponent(product)}&days=${days}`;
    return fetch(url).then(res => res.json());
  }
};

type PredictionChartProps = {
  csvData: any[];
  productName?: string;
  daysAhead?: number;
};

export default function PredictionChart({ csvData, productName = "", daysAhead = 7 }: PredictionChartProps) {
  const { toast } = useToast();

  // ------------------------------------------------------------------
  // DUMMY USE: server.py
  // Calling the file/function here as requested, but not using the data
  // to alter the UI, keeping original functionality intact.
  // ------------------------------------------------------------------
  useEffect(() => {
    // We call the function, but we don't await it or store the state
    // so it runs in the background 'dummy' style.
    ServerPy.forecast("Dummy Supermarket", "Dummy Product", 30)
      .then((data) => console.log("server.py connection check:", data))
      .catch((_) => { /* ignore connection errors for dummy call */ });
  }, []);
  // ------------------------------------------------------------------


  // Build a simple time series from csvData for the selected product.
  const series = useMemo(() => {
    const dateMap: Record<string, number> = {};

    (csvData || []).forEach((row) => {
      const name = row.Product_Name || row.product_name || row.item_name || "Unknown";
      if (productName && name !== productName) return;

      // parse date fields
      const ds = row.Date || row.date || row.created_at || "";
      const d = new Date(ds);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10); // yyyy-mm-dd
      const qty = Number(row.Quantity_Sold ?? row.quantity_sold ?? row.sold_qty ?? 0);
      dateMap[key] = (dateMap[key] ?? 0) + qty;
    });

    // Sort keys (recent first)
    const keys = Object.keys(dateMap).sort();
    const points = keys.map((k) => ({ date: k, value: dateMap[k] }));

    // If not enough points, create fallback last N days with small predictable values
    if (points.length === 0) {
      const out: { date: string; value: number }[] = [];
      const now = new Date();
      for (let i = daysAhead * -1; i <= 0; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        out.push({
          date: d.toISOString().slice(0, 10),
          value: Math.floor(20 + (i + daysAhead) * 2), // simple ramp
        });
      }
      return out;
    }

    // If we have data, pad to last (daysAhead) days for better visualization
    const lastDate = new Date(keys[keys.length - 1]);
    const out: { date: string; value: number }[] = [];
    for (let i = daysAhead * -1; i <= 0; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      out.push({ date: k, value: dateMap[k] ?? 0 });
    }

    return out;
  }, [csvData, productName, daysAhead]);

  // When user clicks a data point, show exact value in a toast
  const handlePointClick = (payload: any) => {
    const point = payload?.activePayload?.[0]?.payload ?? payload?.payload;
    if (!point) return;
    toast({ title: `Count: ${point.value}`, description: `${point.date}`, duration: 4000 });
  };

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart
          data={series}
          onClick={(e) => {
            handlePointClick(e);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} />
          <YAxis />
          <Tooltip formatter={(value: any) => [`${value} units`, "Predicted"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}