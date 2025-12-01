// src/components/PredictionChart.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import 'chartjs-adapter-luxon';
import { DateTime } from "luxon";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type Props = {
  productName: string;
  branch?: string; // supermarket branch or local market name
  // If you have an API endpoint for your RF model, pass it here via env and call it instead.
};

export default function PredictionChart({ productName, branch }: Props) {
  const [historical, setHistorical] = useState<{ date: string; demand: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productName) return;
    setLoading(true);

    // Try to fetch historical_sales for this product + branch
    (async () => {
      try {
        const { data, error } = await supabase
          .from("historical_sales")
          .select("date, quantity_sold")
          .eq("product_name", productName)
          .maybeSingle(); // sometimes aggregated table shape differs

        // If the `historical_sales` holds aggregated daily rows, query them properly:
        // We'll also try another query for multiple rows:
        const { data: rows, error: rowsErr } = await supabase
          .from("historical_sales")
          .select("date, quantity_sold")
          .eq("product_name", productName)
          .order("date", { ascending: true })
          .limit(365);

        if (rowsErr) {
          console.warn("historical_sales query error:", rowsErr);
        }

        if (rows && rows.length > 0) {
          setHistorical(rows.map((r: any) => ({ date: r.date, demand: Number(r.quantity_sold || 0) })));
        } else if (data && (data as any).quantity_sold) {
          // single aggregated row — fallback
          setHistorical([{ date: (data as any).date || new Date().toISOString(), demand: Number((data as any).quantity_sold || 0) }]);
        } else {
          // fallback: no historical data; attempt to build from supermarket_stock quantities (not ideal)
          const { data: stockRows } = await supabase
            .from("supermarket_stock")
            .select("transfer_date as date, quantity as quantity_sold")
            .eq("product_name", productName)
            .order("transfer_date", { ascending: true })
            .limit(365);

          if (stockRows && stockRows.length > 0) {
            setHistorical(stockRows.map((r: any) => ({ date: r.date || r.transfer_date, demand: Number(r.quantity_sold || r.quantity || 0) })));
          } else {
            setHistorical([]);
          }
        }
      } catch (err) {
        console.error(err);
        setHistorical([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [productName, branch]);

  // Create chart data (simple moving window)
  const data = useMemo(() => {
    const labels = historical.map((h) => new Date(h.date));
    const values = historical.map((h) => h.demand);
    return {
      labels,
      datasets: [
        {
          label: "Historical Demand",
          data: values,
          tension: 0.2,
          fill: false,
        },
        // If you have a forecast series returned from an API, append it here as another dataset
      ],
    };
  }, [historical]);

  if (!productName) {
    return <div className="text-muted-foreground">Choose a product to see forecast</div>;
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading data...</div>;
  }

  if (historical.length === 0) {
    return <div className="text-muted-foreground">No historical data available for {productName}</div>;
  }

  return (
    <div>
      <Line
        data={data}
        options={{
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'day'
              },
            },
            y: { beginAtZero: true },
          },
        }}
      />
    </div>
  );
}
