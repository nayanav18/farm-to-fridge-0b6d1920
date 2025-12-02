// src/components/LocalMarketDashboard.tsx
import React, { useMemo, useState, useEffect } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import PredictionChart from "@/components/PredictionChart";
import UniversalPool from "@/components/UniversalPool";

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const CSV_MAP: Record<string, string> = {
  "Local Market A": "/data/localmarket_A.csv",
  "Local Market B": "/data/localmarket_B.csv",
};

export default function LocalMarketDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedLocalMarket, setSelectedLocalMarket] = useState<string>(LOCAL_MARKETS[0]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [saleItem, setSaleItem] = useState<any | null>(null);
  const [saleQty, setSaleQty] = useState("");

  // load CSV for selected local market
  useEffect(() => {
    const file = CSV_MAP[selectedLocalMarket];
    if (!file) {
      setCsvData([]);
      return;
    }
    Papa.parse(file, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res: any) => setCsvData(res.data ?? []),
      error: (err) => {
        console.warn("CSV parse error", err);
        setCsvData([]);
      },
    });
  }, [selectedLocalMarket]);

  // currently in demand (last 7 days)
  const demand7Days = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const grouped: Record<string, number> = {};
    csvData.forEach((r: any) => {
      const dRaw = r.Date ?? r.date;
      const name = r.Product_Name ?? r.product_name;
      if (!dRaw || !name) return;
      const d = new Date(dRaw);
      if (isNaN(d.getTime()) || d < cutoff) return;
      const qty = Number(r.Quantity_Sold ?? r.quantity_sold ?? 0);
      grouped[name] = (grouped[name] || 0) + (isNaN(qty) ? 0 : qty);
    });
    return Object.entries(grouped).map(([product_name, total]) => ({ product_name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [csvData]);

  // pending transfers (supabase)
  const { data: pendingData } = useQuery({
    queryKey: ["localmarket-pending", selectedLocalMarket],
    queryFn: async () => {
      try {
        const res: any = await (supabase as any)
          .from("localmarket_stock")
          .select("*")
          .eq("company_name", selectedLocalMarket)
          .is("accepted_at", null)
          .order("transfer_date", { ascending: false });
        if (res?.error) throw res.error;
        return res?.data ?? [];
      } catch (e) {
        console.warn("pending fetch failed", e);
        return [];
      }
    },
  });
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  useEffect(() => setPendingTransfers(pendingData ?? []), [pendingData]);

  // accepted stock
  const { data: acceptedData } = useQuery({
    queryKey: ["localmarket-accepted", selectedLocalMarket],
    queryFn: async () => {
      try {
        const res: any = await (supabase as any)
          .from("localmarket_stock")
          .select("*")
          .eq("company_name", selectedLocalMarket)
          .not("accepted_at", "is", null)
          .order("accepted_at", { ascending: false });
        if (res?.error) throw res.error;
        return res?.data ?? [];
      } catch (e) {
        console.warn("accepted fetch failed", e);
        return [];
      }
    },
  });
  const [acceptedStock, setAcceptedStock] = useState<any[]>([]);
  useEffect(() => setAcceptedStock(acceptedData ?? []), [acceptedData]);

  // accept transfer
  const handleAcceptTransfer = async (id: string, productName: string) => {
    try {
      await (supabase as any).from("localmarket_stock").update({ accepted_at: new Date().toISOString() }).eq("id", id);
      toast({ title: "Accepted", description: `${productName} added to inventory.` });
      qc.invalidateQueries({ queryKey: ["localmarket-pending", selectedLocalMarket] });
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" });
    }
  };

  // expiring soon (accepted only)
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return (acceptedStock || []).filter((i: any) => {
      const diff = (new Date(i.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    });
  }, [acceptedStock]);

  // trending (top 10) from csv
  const trending = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const grouped: Record<string, number> = {};
    csvData.forEach((r: any) => {
      const name = r.Product_Name ?? r.product_name;
      const qty = Number(r.Quantity_Sold ?? r.quantity_sold ?? 0);
      if (!name) return;
      grouped[name] = (grouped[name] || 0) + (isNaN(qty) ? 0 : qty);
    });
    return Object.entries(grouped).map(([product_name, total]) => ({ product_name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [csvData]);

  const productList = Array.from(new Set(csvData.map((r: any) => r.Product_Name ?? r.product_name).filter(Boolean)));

  // Sale logging
  const handleLogSale = async () => {
    if (!saleItem) return;
    const qty = Number(saleQty);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid", description: "Enter valid qty", variant: "destructive" });
      return;
    }
    try {
      // Update supabase row (decrement) — keep simple
      const remaining = saleItem.quantity - qty;
      if (remaining > 0) {
        await (supabase as any).from("localmarket_stock").update({ quantity: remaining }).eq("id", saleItem.id);
      } else {
        await (supabase as any).from("localmarket_stock").delete().eq("id", saleItem.id);
      }
      toast({ title: "Sale logged", description: `${qty} units sold` });
      setSaleItem(null);
      setSaleQty("");
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Local Market:</h3>
        <select value={selectedLocalMarket} onChange={(e) => setSelectedLocalMarket(e.target.value)} className="p-2 border rounded">
          {LOCAL_MARKETS.map((lm) => <option key={lm} value={lm}>{lm}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* CURRENTLY IN DEMAND */}
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 7 days)</CardTitle>
              <CardDescription>Recent high-demand items</CardDescription>
            </CardHeader>
            <CardContent>
              {demand7Days.length === 0 ? <p className="text-muted-foreground">No demand data</p> :
                <ol className="list-decimal pl-4">
                  {demand7Days.map((d, i) => <li key={i}>{d.product_name} — {d.total}</li>)}
                </ol>
              }
            </CardContent>
          </Card>

          {/* PENDING TRANSFERS */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingTransfers.length === 0 ? <p>No pending transfers</p> : pendingTransfers.map((p) => (
                <div key={p.id} className="flex justify-between p-3 bg-muted/20 rounded mb-2">
                  <div>
                    <div className="font-medium">{p.product_name}</div>
                    <div className="text-xs">{p.quantity} units</div>
                  </div>
                  <Button onClick={() => handleAcceptTransfer(p.id, p.product_name)} className="bg-green-600 text-white"><CheckCircle /> Accept</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* DEMAND PREDICTION */}
          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
              <CardDescription>Select product</CardDescription>
            </CardHeader>
            <CardContent>
              <select className="w-full p-2 border rounded mb-4" onChange={(e) => { /* left to UI only */ }}>
                <option value="">Select product</option>
                {productList.map((p, i) => <option key={i}>{p}</option>)}
              </select>
              {/* The chart below can be switched to actual selection — for now show first product (if exists) */}
              <PredictionChart csvData={csvData} productName={productList[0] ?? ""} />
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedLocalMarket} />
        </div>

        <div className="space-y-6">
          {/* EXPIRING */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? <p>No expiring items</p> : expiringSoon.map((it) => (
                <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2">
                  <div className="font-medium text-destructive">{it.product_name}</div>
                  <div className="text-xs">{it.quantity} units</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ACCEPTED */}
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptedStock.length === 0 ? <p>No stock</p> : acceptedStock.map((a: any) => (
                <div key={a.id} className="flex justify-between p-3 bg-muted/30 rounded mb-2">
                  <div>
                    <div className="font-medium">{a.product_name}</div>
                    <div className="text-xs">{a.quantity} units • ₹{a.price_per_unit}</div>
                  </div>
                  <div>
                    <Button variant="outline" onClick={() => setSaleItem(a)}>Log Sale</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* TRENDING */}
          <Card>
            <CardHeader>
              <CardTitle>Trending (Top 10)</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? <p>No trending data</p> : trending.map((t, i) => (
                <div key={i} className="flex justify-between py-1">
                  <span>{t.product_name}</span>
                  <span className="font-semibold">{t.total}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Log sale dialog */}
      <Dialog open={!!saleItem} onOpenChange={() => setSaleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Sale - {saleItem?.product_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Input type="number" placeholder="Quantity sold" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
            <Button className="w-full" onClick={handleLogSale}>Confirm Sale</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
