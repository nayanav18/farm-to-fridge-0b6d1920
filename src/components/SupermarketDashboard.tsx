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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { Send, Check, X, Loader2 } from "lucide-react";
import PredictionChart from "@/components/PredictionChart";

// Constants
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

  // --- State ---
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // --- Shipping Modal State ---
  const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
  const [itemToShip, setItemToShip] = useState<any | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [isShipping, setIsShipping] = useState(false);

  // ---------------------------
  // CSV Analytics Logic
  // ---------------------------
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

  const trending = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const grouped = Object.values(
      csvData.reduce((acc: any, row: any) => {
        const name = row.Product_Name || row.product_name || row.Product_Name;
        const sold = Number(row.Quantity_Sold || row.Quantity_Sold || row.quantity_sold || 0);
        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {} as any)
    ).sort((a: any, b: any) => b.total - a.total);
    return grouped.slice(0, 10);
  }, [csvData, selectedSupermarket]);

  const recentDemand = useMemo(() => {
    if (!csvData || csvData.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const filtered = csvData.filter((row: any) => {
      if (!row.Date) return false;
      const d = new Date(row.Date);
      return d >= cutoff && (row.Shop_Name?.includes(selectedSupermarket) || (row.Supermarket && row.Supermarket.includes(selectedSupermarket)) || true);
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
  // Supabase: Incoming & Inventory
  // ---------------------------
  const { data: incomingData } = useQuery({
    queryKey: ["supermarket-incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .is("date", null) // Checks for null date (pending items)
        .not("transfer_date", "is", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [incoming, setIncoming] = useState<any[]>([]);
  useEffect(() => setIncoming(incomingData ?? []), [incomingData]);

  const { data: inventoryData } = useQuery({
    queryKey: ["supermarket-accepted", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("date", "is", null) // Checks for existing date (accepted items)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [inventory, setInventory] = useState<any[]>([]);
  useEffect(() => setInventory(inventoryData ?? []), [inventoryData]);

  // ---------------------------
  // Actions: Accept / Reject (Incoming)
  // ---------------------------
  const handleAccept = async (id: string) => {
    try {
      const acceptTimestamp = new Date().toISOString();
      // Set the 'date' field to now, moving it from Incoming -> Inventory
      const { error } = await supabase
        .from("supermarket_stock")
        .update({ date: acceptTimestamp }) 
        .eq("id", id);

      if (error) throw error;

      // Optimistic UI update
      const acceptedItem = incoming.find((i) => i.id === id) ?? null;
      setIncoming((prev) => prev.filter((p) => p.id !== id));
      if (acceptedItem) {
        setInventory((prev) => [{ ...acceptedItem, date: acceptTimestamp }, ...prev]);
      } else {
        qc.invalidateQueries();
      }
      toast({ title: "Accepted", description: "Item added to inventory." });
    } catch (err: any) {
      toast({ title: "Error", variant: "destructive", description: err?.message });
    }
  };

  const handleReject = async (id: string) => {
    try {
      const { error } = await supabase.from("supermarket_stock").delete().eq("id", id);
      if (error) throw error;
      setIncoming((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Rejected", description: "Item removed." });
    } catch (err: any) {
      toast({ title: "Error", variant: "destructive", description: err?.message });
    }
  };

  // ---------------------------
  // Shipping Logic (Transfer)
  // ---------------------------
  
  // 1. Open Modal
  const openShipModal = (item: any) => {
    setItemToShip(item);
    setSelectedDestination(""); 
    setIsShipDialogOpen(true);
  };

  // 2. Destinations List
  const availableDestinations = useMemo(() => {
    return [
      ...LOCAL_MARKETS,
      ...SUPERMARKETS.filter((s) => s !== selectedSupermarket),
    ];
  }, [selectedSupermarket]);

  // 3. Confirm Transfer
  const handleTransferConfirm = async () => {
    if (!itemToShip || !selectedDestination) return;
    setIsShipping(true);

    try {
      const isTargetSupermarket = SUPERMARKETS.includes(selectedDestination);
      const targetTable = isTargetSupermarket ? "supermarket_stock" : "localmarket_stock";

      // Prepare Payload
      const finalPayload: any = {
        product_id: itemToShip.product_id,
        product_name: itemToShip.product_name,
        category: itemToShip.category,
        company_name: selectedDestination, // New Owner
        is_perishable: itemToShip.is_perishable,
        shelf_life_days: itemToShip.shelf_life_days,
        storage_temperature: itemToShip.storage_temperature,
        lot_id: itemToShip.lot_id,
        quantity: itemToShip.quantity,
        manufacturing_date: itemToShip.manufacturing_date,
        expiry_date: itemToShip.expiry_date,
        price_per_unit: itemToShip.price_per_unit,
        transfer_date: new Date().toISOString(),
        // IMPORTANT: We set 'date' to now() to satisfy the NOT NULL constraint.
        // This means the transfer is immediate (no pending state on receiver side).
        date: new Date().toISOString(),
      };

      if (isTargetSupermarket) {
        // Supermarket -> Supermarket
        // Preserve original producer if available
        finalPayload.source_producer = itemToShip.source_producer; 
      } else {
        // Supermarket -> Local Market
        // Mark current supermarket as the source
        finalPayload.source_supermarket = selectedSupermarket;
      }

      // A. Insert into destination table
      const { error: insErr } = await supabase.from(targetTable).insert([finalPayload]);
      if (insErr) throw insErr;

      // B. Delete from source table (current supermarket)
      const { error: delErr } = await supabase.from("supermarket_stock").delete().eq("id", itemToShip.id);
      if (delErr) throw delErr;

      // C. Update UI
      setInventory((prev) => prev.filter((p) => p.id !== itemToShip.id));
      setIncoming((prev) => prev.filter((p) => p.id !== itemToShip.id)); 
      
      toast({ 
        title: "Transfer Successful", 
        description: `${itemToShip.product_name} transferred to ${selectedDestination}` 
      });
      
      setIsShipDialogOpen(false);
      setItemToShip(null);
      qc.invalidateQueries(); 

    } catch (err: any) {
      console.error("Transfer Error:", err);
      toast({ 
        title: "Transfer Failed", 
        variant: "destructive", 
        description: err.message || "Could not complete transfer." 
      });
    } finally {
      setIsShipping(false);
    }
  };


  // ---------------------------
  // Render Helpers
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

  return (
    <div className="space-y-6 p-4">
      
      {/* --- SHIPPING DIALOG --- */}
      <Dialog open={isShipDialogOpen} onOpenChange={setIsShipDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Ship Product</DialogTitle>
            <DialogDescription>
              Transferring <strong>{itemToShip?.product_name}</strong> ({itemToShip?.quantity} units).
              Select a destination below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="destination">Destination</Label>
              <Select 
                value={selectedDestination} 
                onValueChange={setSelectedDestination}
              >
                <SelectTrigger id="destination">
                  <SelectValue placeholder="Select Market or Supermarket" />
                </SelectTrigger>
                <SelectContent>
                  {availableDestinations.map((dest) => (
                    <SelectItem key={dest} value={dest}>
                      {dest}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShipDialogOpen(false)} disabled={isShipping}>
              Cancel
            </Button>
            <Button onClick={handleTransferConfirm} disabled={!selectedDestination || isShipping}>
              {isShipping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* --- MAIN DASHBOARD --- */}
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
              <CardTitle>Currently in Demand</CardTitle>
              <CardDescription>Last 7 days based on sales data</CardDescription>
            </CardHeader>
            <CardContent>
              {recentDemand.length === 0 ? <p>No data</p> : (
                <ol className="list-decimal ml-5">
                  {recentDemand.map((i: any, idx: number) => (
                    <li key={idx}>{i.product_name} — {i.total}</li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Incoming Stock</CardTitle>
              <CardDescription>Pending verification from Transfers</CardDescription>
            </CardHeader>
            <CardContent>
              {incoming.length === 0 ? <p>No incoming stock</p> : incoming.map((it: any) => (
                <div key={it.id} className="flex justify-between p-3 bg-muted/40 rounded mb-2">
                  <div>
                    <p className="font-medium">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} units • {it.category}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAccept(it.id)}>
                      <Check className="w-4 h-4 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(it.id)}>
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Demand Prediction</CardTitle></CardHeader>
            <CardContent>
              <select
                className="w-full p-2 border rounded mb-3"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product to forecast</option>
                {productList.map((p: any) => <option key={p} value={p}>{p}</option>)}
              </select>
              {selectedProduct && <PredictionChart csvData={csvData} productName={selectedProduct} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
              <CardDescription>Manage stock for {selectedSupermarket}</CardDescription>
            </CardHeader>
            <CardContent>
              {inventory.length === 0 ? <p>No inventory</p> : inventory.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-3 bg-muted/30 rounded mb-2">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs">{item.quantity} units</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openShipModal(item)}>
                    <Send className="w-4 h-4 mr-1" /> Ship
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? <p>No expiring items</p> : expiringSoon.map((it) => (
                <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-destructive">{it.product_name}</p>
                    <p className="text-xs">{it.quantity} units</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openShipModal(it)}>
                    Send
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Trending Products</CardTitle></CardHeader>
            <CardContent>
              {trending.map((t: any, i: number) => (
                <div className="flex justify-between py-1" key={i}>
                  <span>{t.product_name}</span>
                  <span className="font-semibold">{t.total}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SupermarketDashboard;