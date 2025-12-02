// src/components/LocalMarketDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import PredictionChart from "@/components/PredictionChart";
import UniversalPool from "@/components/UniversalPool";

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];
const LOCAL_CSV_MAP: Record<string, string> = {
  "Local Market A": "/data/localmarket_A.csv",
  "Local Market B": "/data/localmarket_B.csv",
};

type LocalMarketStockRow = {
  id: string;
  product_id: number;
  product_name: string;
  company_name: string;
  quantity: number;
  accepted_at: string | null;
  transfer_date: string | null;
  expiry_date?: string | null;
  [k: string]: any;
};

export default function LocalMarketDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedLocalMarket, setSelectedLocalMarket] = useState(LOCAL_MARKETS[0]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  useEffect(() => {
    const file = LOCAL_CSV_MAP[selectedLocalMarket];
    if (!file) return;
    let cancelled = false;
    Papa.parse(file, {
      download: true,
      header: true,
      complete: (res: any) => {
        if (!cancelled) setCsvData(res.data || []);
      },
    });
    return () => { cancelled = true; };
  }, [selectedLocalMarket]);

  // demand last 7 days
  const demand7Days = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const grouped: Record<string, number> = {};
    csvData.forEach((row) => {
      const d = new Date(row.Date || row.date || "");
      if (isNaN(d.getTime()) || d < cutoff) return;
      const qty = Number(row.Quantity_Sold ?? row.quantity_sold ?? 0);
      const name = row.Product_Name ?? row.product_name ?? "Unknown";
      grouped[name] = (grouped[name] ?? 0) + qty;
    });
    return Object.entries(grouped)
      .map(([product_name, total]) => ({ product_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [csvData]);

  // pending transfers (localmarket_stock where accepted_at is null)
  const { data: pendingData } = useQuery<LocalMarketStockRow[]>({
    queryKey: ["localmarket-pending", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return (data as LocalMarketStockRow[]) ?? [];
    },
  });

  const [pendingTransfers, setPendingTransfers] = useState<LocalMarketStockRow[]>([]);
  useEffect(() => setPendingTransfers(pendingData ?? []), [pendingData]);

  // accepted local stock
  const { data: acceptedData } = useQuery<LocalMarketStockRow[]>({
    queryKey: ["localmarket-accepted", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return (data as LocalMarketStockRow[]) ?? [];
    },
  });

  const [acceptedStock, setAcceptedStock] = useState<LocalMarketStockRow[]>([]);
  useEffect(() => setAcceptedStock(acceptedData ?? []), [acceptedData]);

  const handleAcceptTransfer = async (id: string, productName: string) => {
    try {
      const { error } = await supabase
        .from("localmarket_stock")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Accepted", description: `${productName} added to inventory.` });
      qc.invalidateQueries({ queryKey: ["localmarket-pending", selectedLocalMarket] });
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return acceptedStock.filter((i) => {
      try {
        const diff = (new Date(i.expiry_date ?? "").getTime() - now) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 3;
      } catch {
        return false;
      }
    });
  }, [acceptedStock]);

  const trending = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const grouped: Record<string, number> = {};
    csvData.forEach((row) => {
      const qty = Number(row.Quantity_Sold ?? row.quantity_sold ?? 0);
      const name = row.Product_Name ?? row.product_name ?? "Unknown";
      grouped[name] = (grouped[name] ?? 0) + qty;
    });
    return Object.entries(grouped)
      .map(([product_name, total]) => ({ product_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [csvData]);

  const productList = Array.from(new Set(csvData.map((r) => r.Product_Name ?? r.product_name))).filter(Boolean);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Local Market:</h3>
        <select
          value={selectedLocalMarket}
          onChange={(e) => setSelectedLocalMarket(e.target.value)}
          className="p-2 border rounded"
        >
          {LOCAL_MARKETS.map((lm) => <option key={lm}>{lm}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 7 days)</CardTitle>
              <CardDescription>Recent high-demand items</CardDescription>
            </CardHeader>
            <CardContent>
              {demand7Days.length === 0 ? (
                <p className="text-muted-foreground">No demand data</p>
              ) : (
                <ol className="list-decimal pl-4">
                  {demand7Days.map((d, i) => <li key={i}>{d.product_name} — {d.total}</li>)}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingTransfers.length === 0 ? (
                <p>No pending transfers</p>
              ) : (
                pendingTransfers.map((p) => (
                  <div key={p.id} className="flex justify-between p-3 bg-muted/20 rounded mb-2">
                    <div>
                      <p>{p.product_name}</p>
                      <p className="text-xs">{p.quantity} units</p>
                    </div>
                    <Button onClick={() => handleAcceptTransfer(p.id, p.product_name)} className="bg-green-600 text-white"><CheckCircle /> Accept</Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
              <CardDescription>Select product</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="w-full p-2 border rounded mb-4"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product</option>
                {productList.map((p, i) => <option key={i}>{p}</option>)}
              </select>
              <PredictionChart csvData={csvData} productName={selectedProduct} daysAhead={7} />
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedLocalMarket} />
        </div>

        <div className="space-y-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p>No expiring items</p>
              ) : (
                expiringSoon.map((it) => (
                  <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2">
                    <p>{it.product_name}</p>
                    <p className="text-xs">{it.quantity} units</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trending (Top 10)</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? (
                <p>No trending data</p>
              ) : (
                trending.map((t, i) => (
                  <div key={i} className="flex justify-between py-1">
                    <span>{t.product_name}</span>
                    <span className="font-semibold">{t.total}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
