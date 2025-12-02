// src/components/PredictionChart.tsx
import React, { useMemo } from "react";

type CsvRow = {
  Date?: string;
  Product_Name?: string;
  Quantity_Sold?: string | number;
};

type Props = {
  csvData: CsvRow[];
  productName: string;
  daysAhead?: number;
};

/**
 * Simple forecasting: average of last 7 days sold (per product) used as flat forecast.
 * Renders an SVG line chart (no external deps) showing historical (last N days available)
 * and future predicted days (daysAhead).
 */
export default function PredictionChart({ csvData, productName, daysAhead = 7 }: Props) {
  // parse and group by date
  const { labels, historyValues, forecastValues } = useMemo(() => {
    const parsed = csvData
      .map((r) => ({
        date: r.Date ? new Date(r.Date) : null,
        qty: Number(r.Quantity_Sold ?? 0),
        product: r.Product_Name ?? "",
      }))
      .filter((r) => r.product === productName && r.date && !isNaN(r.date.getTime()))
      .sort((a, b) => a.date!.getTime() - b.date!.getTime());

    // build daily totals (map by yyyy-mm-dd)
    const dailyMap = new Map<string, number>();
    parsed.forEach((p) => {
      const key = p.date!.toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + p.qty);
    });

    const dayKeys = Array.from(dailyMap.keys()).sort();
    const historyVals = dayKeys.map((k) => dailyMap.get(k) ?? 0);

    // compute average of last 7 days available for forecast (fallback 0)
    const lastN = historyVals.slice(-7);
    const avg = lastN.length > 0 ? Math.round(lastN.reduce((s, x) => s + x, 0) / lastN.length) : 0;

    // produce labels: last available days (up to 14) then future dates
    const labelsArr: string[] = [];
    const historyLabels: string[] = [];

    const takeHist = Math.min(14, dayKeys.length);
    const startIdx = Math.max(0, dayKeys.length - takeHist);
    for (let i = startIdx; i < dayKeys.length; i++) {
      const k = dayKeys[i];
      historyLabels.push(k);
      labelsArr.push(k);
    }

    // future labels
    const lastDateStr = dayKeys.length > 0 ? dayKeys[dayKeys.length - 1] : new Date().toISOString().slice(0, 10);
    const lastDate = new Date(lastDateStr + "T00:00:00Z");
    const futures: number[] = [];
    for (let d = 1; d <= daysAhead; d++) {
      const nd = new Date(lastDate);
      nd.setDate(nd.getDate() + d);
      const lab = nd.toISOString().slice(0, 10);
      labelsArr.push(lab);
      futures.push(avg);
    }

    return {
      labels: labelsArr,
      historyValues: historyVals.slice(-takeHist),
      forecastValues: futures,
    };
  }, [csvData, productName, daysAhead]);

  // combine for plotting
  const combined = [...historyValues, ...forecastValues];
  const maxVal = Math.max(...combined, 1);
  const width = 720;
  const height = 240;
  const padding = 32;

  const points = combined.map((v, i) => {
    const x = padding + (i / Math.max(1, combined.length - 1)) * (width - padding * 2);
    const y = height - padding - (v / maxVal) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = points.length > 0 ? `M ${points.join(" L ")}` : "";

  return (
    <div className="w-full overflow-x-auto">
      <div className="mb-2 text-sm text-muted-foreground">{productName ? `Forecast (${daysAhead} days)` : "Select product"}</div>
      {productName ? (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="240" preserveAspectRatio="xMidYMid meet">
          {/* grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = padding + t * (height - 2 * padding);
            return (
              <line key={i} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e6eef0" strokeWidth={1} />
            );
          })}

          {/* path */}
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* points */}
          {combined.map((v, i) => {
            const [xStr, yStr] = points[i].split(",");
            const x = Number(xStr);
            const y = Number(yStr);
            // differentiate forecast points
            const isForecast = i >= historyValues.length;
            return (
              <circle key={i} cx={x} cy={y} r={isForecast ? 3.5 : 4.5} fill={isForecast ? "#10b981" : "#3b82f6"} stroke="#fff" strokeWidth={1} />
            );
          })}

          {/* x labels (sparse) */}
          {labels.slice(0, combined.length).map((lab, i) => {
            // show only a few labels to avoid crowding
            const showEvery = Math.ceil(labels.length / 8);
            if (i % showEvery !== 0 && i !== labels.length - 1) return null;
            const x = padding + (i / Math.max(1, combined.length - 1)) * (width - padding * 2);
            const y = height - 8;
            return (
              <text key={i} x={x} y={y} fontSize={10} textAnchor="middle" fill="#475569">
                {lab.slice(5)}
              </text>
            );
          })}
        </svg>
      ) : (
        <div className="text-muted-foreground">Select a product to show forecast</div>
      )}
    </div>
  );
}
