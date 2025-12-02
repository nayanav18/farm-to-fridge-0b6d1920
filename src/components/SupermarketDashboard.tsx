// src/components/SupermarketDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
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
import { Send, Check, X } from "lucide-react";

import PredictionChart from "@/components/PredictionChart";

/** Row interfaces matching your provided DB schema */
type SupermarketStockRow = {
  id: string;
  product_id: number;
  product_name: string;
  category: string;
  company_name: string;
  quantity: number;
  transfer_date: string | null;
  date: string | null; // acceptance timestamp
  expiry_date: string | null;
  lot_id?: string | null;
  [k: string]: any;
};

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const csvForMarket = (m: string) => {
  if (m.includes("A")) return "/data/supermarket_A.csv";
  if (m.includes("B")) return "/data/supermarket_B.csv";
  if (m.includes("C")) return "/data/supermarket_C.csv";
  return "/data/supermarket_A.csv";
};

export const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // CSV analytics data
  const [csvData, setCsvData] = useState<any[]>([]);
  useEffect(() => {
    const file = csvForMarket(selectedSupermarket);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(file);
        const text = await res.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results: any) => {
            if (!cancelled) setCsvData(results.data || []);
          },
        });
      } catch (err) {
        console.warn("failed to load csv", err);
        if (!cancelled) setCsvData([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSupermarket]);

  // trending from CSV (top 10 by quantity sold)
  const trending = useMemo(() => {
    if (!csvData?.length) return [];
    const grouped = Object.values(
      csvData.reduce((acc: any, row: any) => {
        const name = row.Product_Name ?? row.product_name ?? "Unknown";
        const sold = Number(row.Quantity_Sold ?? row.quantity_sold ?? 0);
        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {} as Record<string, { product_name: string; total: number }>)
    ).sort((a: any, b: any) => b.total - a.total);
    return grouped.slice(0, 10);
  }, [csvData]);

  // currently in demand last 7 days (via CSV)
  const recentDemand = useMemo(() => {
    if (!csvData?.length) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const filtered = csvData.filter((r: any) => {
      const d = new Date(r.Date || r.date || "");
      return !isNaN(d.getTime()) && d >= cutoff;
    });

    const grouped = Object.values(
      filtered.reduce((acc: any, row: any) => {
        const name = row.Product_Name ?? row.product_name ?? "Unknown";
        const sold = Number(row.Quantity_Sold ?? row.quantity_sold ?? 0);
        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {} as Record<string, { product_name: string; total: number }>)
    ).sort((a: any, b: any) => b.total - a.total);

    return grouped.slice(0, 10);
  }, [csvData]);

  // ---------- Supabase queries ----------
  // incoming: transfer_date exists AND date is null
  const { data: incomingData } = useQuery<SupermarketStockRow[]>({
    queryKey: ["supermarket-incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .is("date", null)
        .not("transfer_date", "is", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return (data as SupermarketStockRow[]) ?? [];
    },
  });

  const [incoming, setIncoming] = useState<SupermarketStockRow[]>([]);
  useEffect(() => setIncoming(incomingData ?? []), [incomingData]);

  // accepted inventory: date IS NOT NULL
  const { data: inventoryData } = useQuery<SupermarketStockRow[]>({
    queryKey: ["supermarket-accepted", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("date", "is", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data as SupermarketStockRow[]) ?? [];
    },
  });

  const [inventory, setInventory] = useState<SupermarketStockRow[]>([]);
  useEffect(() => setInventory(inventoryData ?? []), [inventoryData]);

  // accept (set date to now)
  const handleAccept = async (id: string, pName?: string) => {
    try {
      const { error } = await supabase
        .from("supermarket_stock")
        .update({ date: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setIncoming((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Accepted", description: `${pName ?? "Item"} added to inventory.` });
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await supabase.from("supermarket_stock").delete().eq("id", id);
      setIncoming((prev) => prev.filter((i) => i.id !== id));
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
      toast({ title: "Rejected", description: "Removed incoming stock" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleShipToLocal = async (item: SupermarketStockRow) => {
    const choice = prompt(`Send "${item.product_name}" to:`, LOCAL_MARKETS[0]);
    if (!choice || !LOCAL_MARKETS.includes(choice)) return;

    const payload = {
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      company_name: choice,
      is_perishable: item.is_perishable ?? false,
      shelf_life_days: item.shelf_life_days ?? 7,
      storage_temperature: item.storage_temperature ?? "Ambient",
      lot_id: item.lot_id ?? `LOT-${Date.now().toString(36).slice(-6)}`,
      quantity: item.quantity,
      manufacturing_date: item.manufacturing_date ?? new Date().toISOString(),
      expiry_date: item.expiry_date ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      price_per_unit: item.price_per_unit ?? 0,
      source_supermarket: item.company_name,
      transfer_date: new Date().toISOString(),
    } as any;

    try {
      const { error: insErr } = await supabase.from("localmarket_stock").insert([payload]);
      if (insErr) throw insErr;
      await supabase.from("supermarket_stock").delete().eq("id", item.id);
      setInventory((prev) => prev.filter((p) => p.id !== item.id));
      toast({ title: "Shipped", description: `${item.product_name} sent to ${choice}` });
      qc.invalidateQueries();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  // expiring soon
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return inventory
      .filter((it) => {
        try {
          const diff = (new Date(it.expiry_date ?? "").getTime() - now) / (1000 * 60 * 60 * 24);
          return diff >= 0 && diff <= 7;
        } catch {
          return false;
        }
      })
      .slice(0, 10);
  }, [inventory]);

  const productList = Array.from(new Set(csvData.map((r: any) => r.Product_Name ?? r.product_name))).filter(Boolean);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Supermarket:</h3>
        <select
          value={selectedSupermarket}
          onChange={(e) => setSelectedSupermarket(e.target.value)}
          className="p-2 border rounded"
        >
          {SUPERMARKETS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 7 days)</CardTitle>
              <CardDescription>Recent high-demand items</CardDescription>
            </CardHeader>
            <CardContent>
              {recentDemand.length === 0 ? (
                <p>No data</p>
              ) : (
                <ol className="list-decimal ml-5">
                  {recentDemand.map((i: any, idx: number) => (
                    <li key={idx}>
                      {i.product_name} — {i.total}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Incoming Stock</CardTitle>
              <CardDescription>Pending verification</CardDescription>
            </CardHeader>
            <CardContent>
              {incoming.length === 0 ? (
                <p>No incoming stock</p>
              ) : (
                incoming.map((it) => (
                  <div key={it.id} className="flex justify-between p-3 bg-muted/40 rounded mb-2">
                    <div>
                      <p>{it.product_name}</p>
                      <p className="text-xs">{it.quantity} units • {it.category}</p>
                      <p className="text-xs text-muted-foreground">From producer</p>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => handleAccept(it.id, it.product_name)}><Check /> Accept</Button>
                      <Button variant="destructive" onClick={() => handleReject(it.id)}><X /> Reject</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full p-2 border rounded mb-3"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product</option>
                {productList.map((p) => <option key={p}>{p}</option>)}
              </select>

              <PredictionChart csvData={csvData} productName={selectedProduct} daysAhead={7} />
            </CardContent>
          </Card>

        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
              <CardDescription>Manage accepted stock for {selectedSupermarket}</CardDescription>
            </CardHeader>
            <CardContent>
              {inventory.length === 0 ? (
                <p>No inventory</p>
              ) : (
                inventory.map((item) => (
                  <div key={item.id} className="flex justify-between p-3 bg-muted/30 rounded mb-2">
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units • {item.category}</p>
                    </div>
                    <Button variant="outline" onClick={() => handleShipToLocal(item)}><Send /> Ship</Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p>No expiring items</p>
              ) : (
                expiringSoon.map((it) => (
                  <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2 flex justify-between">
                    <div>
                      <p className="font-medium text-destructive">{it.product_name}</p>
                      <p className="text-xs">{it.quantity} units</p>
                    </div>
                    <Button size="sm" onClick={() => handleShipToLocal(it)}>Send</Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trending Products</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? (
                <p>No trending data</p>
              ) : (
                trending.map((t: any, i: number) => (
                  <div className="flex justify-between py-1" key={i}>
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
};

export default SupermarketDashboard;
