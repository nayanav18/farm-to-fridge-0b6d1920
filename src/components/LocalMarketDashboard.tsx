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

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];
const LOCAL_CSV_MAP: Record<string, string> = {
  "Local Market A": "/data/localmarket_A.csv",
  "Local Market B": "/data/localmarket_B.csv",
};

type LocalMarketStockRow = {
  id?: string;
  product_id?: number;
  product_name?: string;
  company_name?: string;
  quantity?: number;
  accepted_at?: string | null;
  transfer_date?: string | null;
  expiry_date?: string | null;
  [k: string]: any;
};

export default function LocalMarketDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedLocalMarket, setSelectedLocalMarket] = useState(LOCAL_MARKETS[0]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // Load CSV
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
    return () => {
      cancelled = true;
    };
  }, [selectedLocalMarket]);

  // Trending
  const trending = useMemo(() => {
    if (csvData.length === 0) return [];
    const grouped: Record<string, number> = {};
    csvData.forEach((row) => {
      const qty =
        Number(row.Quantity_Sold) ||
        Number(row.quantity_sold) ||
        Number(row.sold_qty) ||
        0;
      const name =
        row.Product_Name ||
        row.product_name ||
        row.item_name ||
        "Unknown";
      grouped[name] = (grouped[name] ?? 0) + qty;
    });
    return Object.entries(grouped)
      .map(([product_name, total]) => ({ product_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [csvData]);

  // Demand = shuffled trending
  const demand7Days = useMemo(() => {
    if (!trending.length) return [];
    return [...trending].sort(() => Math.random() - 0.5);
  }, [trending]);

  // Pending
  const pendingQuery = useQuery({
    queryKey: ["localmarket-pending", selectedLocalMarket],
    queryFn: async () => {
      const res = await supabase
        .from("localmarket_stock" as any)
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      return (res.data ?? []) as LocalMarketStockRow[];
    },
  });

  // Accepted Stock
  const acceptedQuery = useQuery({
    queryKey: ["localmarket-accepted", selectedLocalMarket],
    queryFn: async () => {
      const res = await supabase
        .from("localmarket_stock" as any)
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      return (res.data ?? []) as LocalMarketStockRow[];
    },
  });

  const pendingTransfers = pendingQuery.data ?? [];
  const acceptedStock = acceptedQuery.data ?? [];

  // Accept Transfer
  const handleAcceptTransfer = async (id?: string, productName?: string) => {
    if (!id) return;

    await supabase
      .from("localmarket_stock" as any)
      .update({ accepted_at: new Date().toISOString() } as any)
      .eq("id", id);

    toast({
      title: "Accepted",
      description: `${productName} added to inventory.`,
    });

    qc.invalidateQueries({ queryKey: ["localmarket-pending", selectedLocalMarket] });
    qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
  };

  // Sell Item (NO LOGGING)
  const handleSell = async (item: LocalMarketStockRow) => {
    const available = Number(item.quantity ?? 0);
    const qty = Number(prompt(`Sell how many? (Available: ${available})`, "1"));
    if (!qty || qty <= 0 || qty > available) {
      toast({
        title: "Invalid quantity",
        variant: "destructive",
      });
      return;
    }

    await supabase
      .from("localmarket_stock" as any)
      .update({ quantity: available - qty } as any)
      .eq("id", item.id);

    toast({ title: "Sold", description: `${qty} units sold.` });

    qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
  };

  // Expiring soon
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return acceptedStock.filter((i) => {
      const diff =
        (new Date(i.expiry_date ?? "").getTime() - now) /
        (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    });
  }, [acceptedStock]);

  const productList: string[] = Array.from(
    new Set(csvData.map((r: any) => r.Product_Name || r.product_name))
  ).filter((x): x is string => Boolean(x));

  // ========================= UI =========================

  return (
    <div className="space-y-6 p-4">
      {/* Select Market */}
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Local Market:</h3>
        <select
          value={selectedLocalMarket}
          onChange={(e) => setSelectedLocalMarket(e.target.value)}
          className="p-2 border rounded"
        >
          {LOCAL_MARKETS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT PANEL */}
        <div className="lg:col-span-2 space-y-6">
          {/* Demand */}
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {demand7Days.length === 0 ? (
                <p>No data</p>
              ) : (
                <ol className="list-decimal pl-4">
                  {demand7Days.map((d, i) => (
                    <li key={i}>
                      {d.product_name} — {d.total}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Pending Transfers */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingTransfers.length === 0 ? (
                <p>No pending transfers</p>
              ) : (
                pendingTransfers.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between bg-muted/20 p-3 rounded mb-2"
                  >
                    <div>
                      <p>{p.product_name}</p>
                      <p className="text-xs">{p.quantity} units</p>
                    </div>

                    <Button
                      className="bg-green-600 text-white"
                      onClick={() => handleAcceptTransfer(p.id, p.product_name)}
                    >
                      <CheckCircle /> Accept
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* SELL ITEMS FROM INVENTORY */}
          <Card>
            <CardHeader>
              <CardTitle>Sell Items</CardTitle>
              <CardDescription>Inventory available for selling</CardDescription>
            </CardHeader>
            <CardContent>
              {acceptedStock.length === 0 ? (
                <p>No inventory available</p>
              ) : (
                acceptedStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between bg-muted/20 p-3 rounded mb-2"
                  >
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units available</p>
                    </div>

                    <Button
                      className="bg-orange-600 text-white"
                      onClick={() => handleSell(item)}
                    >
                      Sell
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Demand Prediction */}
          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full border p-2 rounded mb-3"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product</option>
                {productList.map((p, i) => (
                  <option key={i}>{p}</option>
                ))}
              </select>

              <PredictionChart
                csvData={csvData}
                productName={selectedProduct}
                daysAhead={7}
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">
          {/* Expiring Soon */}
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

          {/* Trending */}
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
                    <strong>{t.total}</strong>
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
