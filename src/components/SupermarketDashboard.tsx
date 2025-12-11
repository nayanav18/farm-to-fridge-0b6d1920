// src/components/SupermarketDashboard.tsx
import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

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

/**
 * Simple supermarket dashboard.
 * - Incoming = transfer_date exists && date is null (pending verification)
 * - Accepting sets `date` (acceptance timestamp) and moves the item into accepted inventory state
 * - ExpiringSoon computed only from accepted inventory
 */

// adjust names to match your app
const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const getCSVForMarket = (market: string) => {
  if (market.includes("A")) return "/data/supermarket_A.csv";
  if (market.includes("B")) return "/data/supermarket_B.csv";
  if (market.includes("C")) return "/data/supermarket_C.csv";
  return "/data/supermarket_A.csv";
};

const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // CSV analytics
  const [csvData, setCsvData] = useState<any[]>([]);
  useEffect(() => {
    const file = getCSVForMarket(selectedSupermarket);
    const load = async () => {
      try {
        const res = await fetch(file);
        const txt = await res.text();
        Papa.parse(txt, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => setCsvData(r.data as any[]),
        });
      } catch (err) {
        setCsvData([]);
        console.warn("Failed to load CSV", err);
      }
    };
    load();
  }, [selectedSupermarket]);

  // TRENDING from CSV fallback
  const trending = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];

    const grouped = Object.values(
      csvData.reduce((acc: any, row: any) => {
        const name = row.Product_Name || row.Product_Name || row.product_name || row.Product_Name;
        const sold = Number(row.Quantity_Sold || row.Quantity_Sold || row.quantity_sold || 0);
        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {} as any)
    ).sort((a: any, b: any) => b.total - a.total);

    return grouped.slice(0, 10);
  }, [csvData, selectedSupermarket]);

  // CURRENTLY IN DEMAND (last 7 days) from CSV
  const recentDemand = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const filtered = csvData.filter((row: any) => {
      if (!row.Date) return false;
      const d = new Date(row.Date);
      return d >= cutoff && (row.Shop_Name?.includes(selectedSupermarket) || (row.Supermarket && row.Supermarket.includes(selectedSupermarket)) || true);
      // above: fallback; adjust if your CSV has specific branch column
    });

    const grouped = Object.values(
      filtered.reduce((acc: any, row: any) => {
        const name = row.Product_Name || row.product_name || row.Product_Name;
        const sold = Number(row.Quantity_Sold || row.Quantity_Sold || row.quantity_sold || 0);
        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {} as any)
    ).sort((a: any, b: any) => b.total - a.total);

    return grouped.slice(0, 10);
  }, [csvData, selectedSupermarket]);

  // ---------------------------
  // Supabase: Incoming (pending verification)
  // ---------------------------
  const { data: incomingData } = useQuery({
    queryKey: ["supermarket-incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .is("date", null) // not accepted yet
        .not("transfer_date", "is", null)
        .order("transfer_date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [incoming, setIncoming] = useState<any[]>([]);
  useEffect(() => setIncoming(incomingData ?? []), [incomingData]);

  // ---------------------------
  // Supabase: Accepted inventory (date IS NOT NULL)
  // ---------------------------
  const { data: inventoryData } = useQuery({
    queryKey: ["supermarket-accepted", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("date", "is", null)
        .order("date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [inventory, setInventory] = useState<any[]>([]);
  useEffect(() => setInventory(inventoryData ?? []), [inventoryData]);

  // ---------------------------
  // Accept item: move from incoming -> accepted inventory
  // ---------------------------
  const handleAccept = async (id: string) => {
    try {
      // update DB (set date to now)
      const acceptTimestamp = new Date().toISOString();
      const { error } = await supabase
        .from("supermarket_stock")
        .update({ date: acceptTimestamp })
        .eq("id", id);

      if (error) throw error;

      // Update local UI state immediately:
      // remove from incoming
      const acceptedItem = incoming.find((i) => i.id === id) ?? null;
      setIncoming((prev) => prev.filter((p) => p.id !== id));

      // add to inventory state with date set
      if (acceptedItem) {
        const newItem = { ...acceptedItem, date: acceptTimestamp };
        setInventory((prev) => [newItem, ...prev]);
      } else {
        // fallback: if we didn't have the item in incoming state (rare),
        // invalidate and let queries refresh
        qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
        qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
      }

      toast({ title: "Accepted", description: "Item added to accepted inventory." });
      // ensure background refresh for consistency
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
    } catch (err: any) {
      toast({ title: "Error", variant: "destructive", description: err?.message || "Failed to accept item" });
    }
  };

  // ---------------------------
  // Reject (delete) incoming item
  // ---------------------------
  const handleReject = async (id: string) => {
    try {
      const { error } = await supabase.from("supermarket_stock").delete().eq("id", id);
      if (error) throw error;
      setIncoming((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Rejected", description: "Incoming item deleted." });
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
    } catch (err: any) {
      toast({ title: "Error", variant: "destructive", description: err?.message || "Failed to reject" });
    }
  };

  // ---------------------------
  // Ship to local market (move record)
  // ---------------------------
  const handleShipToLocal = async (item: any) => {
    try {
      const choice = prompt(`Send "${item.product_name}" to:`, LOCAL_MARKETS[0]);
      if (!choice || !LOCAL_MARKETS.includes(choice)) return;

      const payload = {
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        company_name: choice,
        is_perishable: item.is_perishable,
        shelf_life_days: item.shelf_life_days,
        storage_temperature: item.storage_temperature,
        lot_id: item.lot_id,
        quantity: item.quantity,
        manufacturing_date: item.manufacturing_date,
        expiry_date: item.expiry_date,
        price_per_unit: item.price_per_unit,
        source_supermarket: item.company_name,
        transfer_date: new Date().toISOString(),
      } as any;

      const { error: insErr } = await supabase.from("localmarket_stock").insert([payload]);
      if (insErr) throw insErr;
      const { error: delErr } = await supabase.from("supermarket_stock").delete().eq("id", item.id);
      if (delErr) throw delErr;

      // reflect in UI: remove from inventory if present
      setInventory((prev) => prev.filter((p) => p.id !== item.id));
      setIncoming((prev) => prev.filter((p) => p.id !== item.id));

      toast({ title: "Shipped", description: `Sent ${item.product_name} → ${choice}` });
      qc.invalidateQueries();
    } catch (err: any) {
      toast({ title: "Error", variant: "destructive", description: err?.message || "Failed to ship" });
    }
  };

  // ---------------------------
  // Expiring soon uses accepted inventory only
  // ---------------------------
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return inventory
      .filter((it: any) => {
        if (!it.expiry_date) return false;
        const diff = (new Date(it.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      })
      .slice(0, 10);
  }, [inventory]);

  const productList = Array.from(new Set(inventory.map((i: any) => i.product_name).concat(csvData.map((r: any) => r.Product_Name || r.Product_Name))));

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Supermarket:</h3>
        <select
          value={selectedSupermarket}
          onChange={(e) => setSelectedSupermarket(e.target.value)}
          className="p-2 border rounded"
        >
          {SUPERMARKETS.map((s) => (
            <option key={s}>{s}</option>
          ))}
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
                incoming.map((it: any) => (
                  <div key={it.id} className="flex justify-between p-3 bg-muted/40 rounded mb-2">
                    <div>
                      <p>{it.product_name}</p>
                      <p className="text-xs">{it.quantity} units • {it.category}</p>
                      <p className="text-xs text-muted-foreground">From producer / transfer</p>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => handleAccept(it.id)}>
                        <Check /> Accept
                      </Button>
                      <Button variant="destructive" onClick={() => handleReject(it.id)}>
                        <X /> Reject
                      </Button>
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
                {productList.map((p: any) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {selectedProduct ? (
                <PredictionChart csvData={csvData} productName={selectedProduct} />
              ) : (
                <p>Select a product to see forecast</p>
              )}
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
                inventory.map((item: any) => (
                  <div key={item.id} className="flex justify-between p-3 bg-muted/30 rounded mb-2">
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units • {item.category}</p>
                    </div>
                    <Button variant="outline" onClick={() => handleShipToLocal(item)}>
                      <Send /> Ship
                    </Button>
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
