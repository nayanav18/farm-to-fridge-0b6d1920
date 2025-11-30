// SupermarketDashboard.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertTriangle, Send, TrendingUp } from "lucide-react";
import PredictionChart from "@/components/PredictionChart";
import DemandAnalysis from "@/components/DemandAnalysis";

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const { data: supermarketStock, refetch } = useQuery({
    queryKey: ["supermarket-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supermarket_stock").select("*").order("expiry_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    return (supermarketStock || []).filter((s: any) => (s.company_name || "").toLowerCase() === selectedSupermarket.toLowerCase());
  }, [supermarketStock, selectedSupermarket]);

  const productList = useMemo(() => {
    const s = new Set<string>();
    filtered.forEach((i: any) => s.add(i.product_name));
    return Array.from(s);
  }, [filtered]);

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      // Accept just marks as accepted by setting transfer_date (or created_at) to now
      const { error } = await supabase.from("supermarket_stock").update({ transfer_date: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Accepted", description: "Item accepted into supermarket inventory" });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to accept", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supermarket_stock").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Incoming item rejected and removed" });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to reject", variant: "destructive" });
    },
  });

  const shipMutation = useMutation({
    mutationFn: async (id: string) => {
      const stock = (supermarketStock || []).find((s: any) => s.id === id);
      if (!stock) throw new Error("Stock not found");

      const payload = {
        product_id: stock.product_id,
        product_name: stock.product_name,
        category: stock.category,
        company_name: stock.company_name,
        is_perishable: stock.is_perishable,
        shelf_life_days: stock.shelf_life_days,
        storage_temperature: stock.storage_temperature,
        lot_id: stock.lot_id,
        quantity: stock.quantity,
        manufacturing_date: stock.manufacturing_date,
        expiry_date: stock.expiry_date,
        price_per_unit: Number(stock.price_per_unit) * 0.8,
        source_supermarket: stock.company_name,
        transfer_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase.from("localmarket_stock").insert([payload]);
      if (insertError) throw insertError;
      const { error: deleteError } = await supabase.from("supermarket_stock").delete().eq("id", id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      toast({ title: "Shipped", description: "Item shipped to local market" });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "Failed to ship", variant: "destructive" });
    },
  });

  const expiring = filtered.filter((item: any) => {
    if (!item.expiry_date) return false;
    const diff = (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Current supermarket:</h3>
        <Select value={selectedSupermarket} onValueChange={setSelectedSupermarket}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SUPERMARKETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DemandAnalysis />

          <Card>
            <CardHeader>
              <CardTitle>Incoming & Current Stock</CardTitle>
              <CardDescription>Items for {selectedSupermarket}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No items for this supermarket</p>
              ) : (
                filtered.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} units • ₹{item.price_per_unit}</p>
                      <p className="text-xs text-muted-foreground">Exp: {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "N/A"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => acceptMutation.mutate(item.id)}>Accept</Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(item.id)}>Reject</Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Demand Prediction</CardTitle>
              <CardDescription>Select product to forecast</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {productList.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>

              {selectedProduct && <PredictionChart productName={selectedProduct} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-danger/30">
            <CardHeader>
              <CardTitle className="text-danger flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Expiring Soon</CardTitle>
              <CardDescription>Items expiring within 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {expiring.map((item: any) => {
                const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={item.id} className="p-3 border border-danger/30 bg-danger/10 rounded-lg space-y-2">
                    <p className="font-medium text-sm">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} units • {daysLeft} days left</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => shipMutation.mutate(item.id)}><Send className="h-3 w-3 mr-2" />Ship to Local Market</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SupermarketDashboard;
