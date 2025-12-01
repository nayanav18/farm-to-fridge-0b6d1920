// src/components/PredictionChart.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/**
 * PredictionChart
 * - Fetches historical_sales for product + branch and plots recent sales (simple visualization)
 * - If you later want to call your RF model endpoint, replace fetch logic with a call to that endpoint.
 */

type Props = { productName: string; branch?: string };

const PredictionChart: React.FC<Props> = ({ productName, branch }) => {
  const { data = [] } = useQuery({
    queryKey: ["prediction", branch, productName],
    queryFn: async () => {
      // try historical_sales
      const { data: hs } = await supabase
        .from("historical_sales")
        .select("date, quantity_sold")
        .eq("product_name", productName)
        .eq("supermarket_branch", branch ?? "")
        .order("date", { ascending: true })
        .limit(365);
      if (hs && hs.length > 0) {
        return hs.map((r: any) => ({ date: r.date, value: Number(r.quantity_sold) }));
      }

      // fallback: aggregate supermarket_stock changes (not ideal, but gives something)
      const { data: ss } = await supabase
        .from("supermarket_stock")
        .select("date, quantity")
        .like("product_name", `%${productName}%`)
        .order("date", { ascending: true })
        .limit(365);
      if (ss && ss.length > 0) {
        return ss.map((r: any) => ({ date: r.date ?? r.transfer_date ?? "", value: Number(r.quantity ?? 0) }));
      }

      return [];
    },
  });

  if (!data || data.length === 0) {
    return <div className="text-muted-foreground">No historical sales data available for "{productName}"</div>;
  }

  // prepare simple display data (limit to last 30)
  const display = data.slice(-30).map((d: any) => ({ date: d.date.slice(5), value: d.value ?? 0 }));

  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={display}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" interval={Math.max(0, Math.floor(display.length / 8))} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PredictionChart;
