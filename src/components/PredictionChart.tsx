// PredictionChart.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Props = { productName: string; branchFilter?: string | undefined };

export default function PredictionChart({ productName, branchFilter }: Props) {
  const { data = [] } = useQuery({
    queryKey: ["historical-sales", productName, branchFilter],
    queryFn: async () => {
      const q = supabase.from("historical_sales").select("*").eq("product_name", productName).order("date", { ascending: true });
      const res = await q;
      if ((res as any)?.error) throw (res as any).error;
      return (res as any).data ?? [];
    },
  });

  // Aggregate by date
  const aggregated = (data as any[]).reduce((acc:any, row:any) => {
    const d = row.date;
    acc[d] = (acc[d] || 0) + (row.quantity_sold || 0);
    return acc;
  }, {});

  const dates = Object.keys(aggregated).sort();
  const values = dates.map(d => aggregated[d]);

  if (dates.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No historical sales data to show prediction for {productName}.</div>;
  }

  const max = Math.max(...values, 1);
  const w = 600;
  const h = 120;
  const barW = Math.max(8, Math.floor(w / dates.length) - 4);

  return (
    <div className="overflow-auto">
      <svg width={Math.min(w, dates.length * (barW + 4))} height={h} viewBox={`0 0 ${Math.min(w, dates.length * (barW + 4))} ${h}`}>
        {values.map((v, i) => {
          const x = i * (barW + 4) + 8;
          const barH = (v / max) * (h - 30);
          const y = h - barH - 20;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx="3" />
              <text x={x + barW / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="#666">{dates[i]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
