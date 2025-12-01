// src/components/LocalMarketDashboard.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ShoppingCart, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import PredictionChart from "@/components/PredictionChart";
import UniversalPool from "@/components/UniversalPool";

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];
const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];

export const LocalMarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedLocalMarket, setSelectedLocalMarket] = useState<string>(LOCAL_MARKETS[0]);
  const [saleItem, setSaleItem] = useState<any | null>(null);
  const [saleQty, setSaleQty] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const { data: pendingTransfers = [] } = useQuery({
    queryKey: ["localmarket-pending", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: acceptedStock = [], refetch: refetchAccepted } = useQuery({
    queryKey: ["localmarket-accepted", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleAcceptTransfer = async (id: string, productName: string) => {
    try {
      const { error } = await supabase.from("localmarket_stock").update({ accepted_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
      toast({ title: "Accepted", description: `${productName} added to inventory.` });
      qc.invalidateQueries({ queryKey: ["localmarket-pending", selectedLocalMarket] });
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleLogSale = async () => {
    if (!saleItem) return;
    const qty = Number(saleQty);
    if (qty <= 0 || qty > saleItem.quantity) {
      toast({ title: "Invalid qty", description: "Enter a valid quantity", variant: "destructive" });
      return;
    }
    try {
      const remaining = saleItem.quantity - qty;
      if (remaining > 0) {
        await supabase.from("localmarket_stock").update({ quantity: remaining }).eq("id", saleItem.id);
      } else {
        await supabase.from("localmarket_stock").delete().eq("id", saleItem.id);
      }
      toast({ title: "Sale logged", description: `${qty} units sold` });
      setSaleItem(null);
      setSaleQty("");
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return (acceptedStock || []).filter((i: any) => {
      if (!i?.expiry_date) return false;
      const diff = (new Date(i.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    });
  }, [acceptedStock]);

  const handleSendFromLocal = async (item: any) => {
    try {
      const choice = prompt(`Send "${item.product_name}" to:\nType as supermarket:<name> or local:<name>\nExamples:\nsupermarket:Supermarket A\nlocal:Local Market B`);
      if (!choice) return;
      const parts = choice.split(":");
      if (parts.length !== 2) return alert("Invalid selection format");
      const [t, name] = parts;
      if (t === "supermarket") {
        const payload = {
          product_id: item.product_id,
          product_name: item.product_name,
          category: item.category,
          company_name: name,
          is_perishable: item.is_perishable,
          shelf_life_days: item.shelf_life_days,
          storage_temperature: item.storage_temperature,
          lot_id: item.lot_id,
          quantity: item.quantity,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
          price_per_unit: Number(item.price_per_unit),
          source_supermarket: selectedLocalMarket,
          transfer_date: new Date().toISOString(),
        } as any;
        const { error } = await supabase.from("supermarket_stock").insert([payload]);
        if (error) throw error;
      } else if (t === "local") {
        const payload = {
          product_id: item.product_id,
          product_name: item.product_name,
          category: item.category,
          company_name: name,
          is_perishable: item.is_perishable,
          shelf_life_days: item.shelf_life_days,
          storage_temperature: item.storage_temperature,
          lot_id: item.lot_id,
          quantity: item.quantity,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
          price_per_unit: Number(item.price_per_unit),
          source_supermarket: selectedLocalMarket,
          transfer_date: new Date().toISOString(),
        } as any;
        const { error } = await supabase.from("localmarket_stock").insert([payload]);
        if (error) throw error;
      } else {
        alert("Invalid target type");
        return;
      }

      // delete original row
      await supabase.from("localmarket_stock").delete().eq("id", item.id);
      toast({ title: "Sent", description: `${item.product_name} sent` });
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", selectedLocalMarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  // trending top 10
  const { data: trending = [] } = useQuery({
    queryKey: ["local-trending", selectedLocalMarket],
    queryFn: async () => {
      const { data: hs } = await supabase
        .from("historical_sales")
        .select("product_name, quantity_sold")
        .eq("supermarket_branch", selectedLocalMarket);
      if (hs && hs.length > 0) {
        const grouped = Object.values(
          hs.reduce((acc: any, item: any) => {
            if (!acc[item.product_name]) acc[item.product_name] = { product_name: item.product_name, total: 0 };
            acc[item.product_name].total += item.quantity_sold;
            return acc;
          }, {})
        ).sort((a: any, b: any) => b.total - a.total).slice(0, 10);
        return grouped;
      }
      const { data: ss } = await supabase
        .from("localmarket_stock")
        .select("product_name, quantity")
        .eq("company_name", selectedLocalMarket)
        .order("quantity", { ascending: false })
        .limit(10);
      return ss ?? [];
    },
  });

  const productList = Array.from(new Set((acceptedStock || []).map((i: any) => i.product_name)));

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Local Market:</h3>
        <select value={selectedLocalMarket} onChange={(e) => setSelectedLocalMarket(e.target.value)} className="p-2 border rounded">
          {LOCAL_MARKETS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Transfers</CardTitle>
              <CardDescription>Accept transfers sent to {selectedLocalMarket}</CardDescription>
            </CardHeader>
            <CardContent>
              {(pendingTransfers || []).length === 0 ? (
                <div className="text-muted-foreground text-center py-6">No pending transfers</div>
              ) : (pendingTransfers || []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-primary/5 rounded mb-2">
                  <div>
                    <div className="font-medium">{p.product_name}</div>
                    <div className="text-xs text-muted-foreground">{p.quantity} units • ₹{p.price_per_unit}</div>
                    <div className="text-xs text-muted-foreground">From: {p.source_supermarket}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-primary text-primary-foreground" onClick={() => handleAcceptTransfer(p.id, p.product_name)}><CheckCircle /> Accept</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
              <CardDescription>Select product</CardDescription>
            </CardHeader>
            <CardContent>
              <select className="w-full p-2 border rounded mb-4" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                <option value="">Select product</option>
                {productList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {selectedProduct ? <PredictionChart productName={selectedProduct} branch={selectedLocalMarket} /> : <div className="text-muted-foreground">No product selected</div>}
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedLocalMarket} />
        </div>

        <div className="space-y-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
              <CardDescription>Items expiring in next 3 days</CardDescription>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? <div className="text-muted-foreground text-center">No expiring items</div> :
                expiringSoon.map((it) => (
                  <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2 flex justify-between">
                    <div>
                      <div className="font-medium text-destructive">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">{it.quantity} units</div>
                    </div>
                    <div>
                      <Button size="sm" onClick={() => handleSendFromLocal(it)}>Send</Button>
                    </div>
                  </div>
                ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
              <CardDescription>Manage stock for {selectedLocalMarket}</CardDescription>
            </CardHeader>
            <CardContent>
              {(acceptedStock || []).length === 0 ? <div className="text-muted-foreground text-center">No stock</div> :
                (acceptedStock || []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-muted/30 rounded mb-2">
                  <div>
                    <div className="font-medium">{a.product_name}</div>
                    <div className="text-xs text-muted-foreground">{a.quantity} units • ₹{a.price_per_unit}</div>
                  </div>
                  <div>
                    <Button variant="outline" onClick={() => { setSaleItem(a); }}>Log Sale</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trending (Top 10)</CardTitle>
            </CardHeader>
            <CardContent>
              {(trending || []).length === 0 ? <div className="text-muted-foreground">No trending data</div> :
                (trending || []).map((t: any, i: number) => (
                <div key={i} className="flex justify-between py-1">
                  <div>{t.product_name}</div>
                  <div className="font-medium">{t.total ?? t.quantity ?? 0}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

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
};

export default LocalMarketDashboard;
