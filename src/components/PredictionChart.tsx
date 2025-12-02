// src/components/PredictionChart.tsx
import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// Utility to format date
const formatDate = (d: Date) => d.toISOString().split("T")[0];
const addDays = (d: Date, n: number) => {
  const newD = new Date(d);
  newD.setDate(newD.getDate() + n);
  return newD;
};

export default function PredictionChart({
  csvData,
  productName,
}: {
  csvData: any[];
  productName: string;
}) {
  // -----------------------------
  // Parse & Normalize CSV Data
  // -----------------------------
  const cleaned = useMemo(() => {
    return csvData
      .filter((row) => {
        const name =
          row.Product_Name ||
          row.Item_Name ||
          "";
        return name === productName;
      })
      .map((row) => ({
        date: row.Date || row.Timestamp,
        sold: Number(row.Quantity_Sold || row.Units_Sold || 0),
      }))
      .filter((row) => row.date);
  }, [csvData, productName]);

  if (cleaned.length === 0 || !productName)
    return <div>Select product</div>;

  // -----------------------------
  // Actual historical points
  // -----------------------------
  const historical = cleaned.map((r) => ({
    date: formatDate(new Date(r.date)),
    value: r.sold,
  }));

  // -----------------------------
  // Forecast next 7 days
  // -----------------------------
  const lastDate = new Date(historical[historical.length - 1].date);
  const last7 = historical.slice(-7).map((h) => h.value);
  const movingAvg =
    last7.reduce((a, b) => a + b, 0) / Math.max(last7.length, 1);

  const forecast = [];
  for (let i = 1; i <= 7; i++) {
    forecast.push({
      date: formatDate(addDays(lastDate, i)),
      value: Math.round(movingAvg),
    });
  }

  // Full combined dataset
  const chartData = [...historical, ...forecast];

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <XAxis dataKey="date" hide={false} />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0077FF"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
