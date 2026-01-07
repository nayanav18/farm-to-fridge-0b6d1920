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
import { Badge } from "@/components/ui/badge";

import { Send, Loader2, Store, Package } from "lucide-react";
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
  // Supabase: Inventory
  // ---------------------------
  const { data: inventoryData } = useQuery({
    queryKey: ["supermarket-inventory", selectedSupermarket],
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

  // WORKAROUND: Use 'lot_id' suffix to detect display status since we have no DB access
  const displayInventory = useMemo(() => 
    inventory.filter((i) => i.lot_id && i.lot_id.endsWith('_DSP')), 
  [inventory]);

  const storageInventory = useMemo(() => 
    inventory.filter((i) => !i.lot_id || !i.lot_id.endsWith('_DSP')), 
  [inventory]);

  // ---------------------------
  // Shipping / Transfer Logic
  // ---------------------------
  
  const openShipModal = (item: any) => {
    setItemToShip(item);
    setSelectedDestination(""); 
    setIsShipDialogOpen(true);
  };

  const availableDestinations = useMemo(() => {
    return [
      ...LOCAL_MARKETS,
      ...SUPERMARKETS, 
    ];
  }, []);

  const handleTransferConfirm = async () => {
    if (!itemToShip || !selectedDestination) return;
    setIsShipping(true);

    try {
      const isTargetSupermarket = SUPERMARKETS.includes(selectedDestination);
      const isSelfTransfer = selectedDestination === selectedSupermarket;
      
      const targetTable = isTargetSupermarket ? "supermarket_stock" : "localmarket_stock";

      // WORKAROUND: Modify lot_id instead of using 'status' column
      let newLotId = itemToShip.lot_id || "BATCH001";
      if (isSelfTransfer) {
        // Only append if not already there
        if (!newLotId.endsWith('_DSP')) newLotId = newLotId + "_DSP";
      } else {
        // Clean up the tag if shipping out
        newLotId = newLotId.replace('_DSP', '');
      }

      // Prepare Payload (NO 'status' field here)
      const finalPayload: any = {
        product_id: itemToShip.product_id,
        product_name: itemToShip.product_name,
        category: itemToShip.category,
        company_name: selectedDestination,
        is_perishable: itemToShip.is_perishable,
        shelf_life_days: itemToShip.shelf_life_days,
        storage_temperature: itemToShip.storage_temperature,
        lot_id: newLotId, // <--- MODIFIED LOT ID
        quantity: itemToShip.quantity,
        manufacturing_date: itemToShip.manufacturing_date,
        expiry_date: itemToShip.expiry_date,
        price_per_unit: itemToShip.price_per_unit,
        transfer_date: new Date().toISOString(),
        date: new Date().toISOString(),
      };

      if (isTargetSupermarket) {
        finalPayload.source_producer = itemToShip.source_producer; 
      } else {
        finalPayload.source_supermarket = selectedSupermarket;
      }

      // 1. Insert into destination
      const { error: insErr } = await supabase.from(targetTable).insert([finalPayload]);
      if (insErr) throw insErr;

      // 2. Delete from source (current row)
      const { error: delErr } = await supabase.from("supermarket_stock").delete().eq("id", itemToShip.id);
      if (delErr) throw delErr;

      // 3. UI Updates
      setInventory((prev) => prev.filter((p) => p.id !== itemToShip.id));
      
      const actionType = isSelfTransfer ? "Moved to Display" : "Transferred";
      toast({ 
        title: "Success", 
        description: `${itemToShip.product_name} ${actionType} -> ${selectedDestination}` 
      });
      
      setIsShipDialogOpen(false);
      setItemToShip(null);
      qc.invalidateQueries(); 

    } catch (err: any) {
      console.error("Transfer Error:", err);
      toast({ 
        title: "Transfer Failed", 
        variant: "destructive", 
        description: err.message 
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
      
      {/* --- SHIPPING/MOVING DIALOG --- */}
      <Dialog open={isShipDialogOpen} onOpenChange={setIsShipDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Move / Ship Product</DialogTitle>
            <DialogDescription>
              Select an external market to ship to, or select <strong>{selectedSupermarket}</strong> to move this item to the <strong>Display Floor</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="destination">Destination / Location</Label>
              <Select 
                value={selectedDestination} 
                onValueChange={setSelectedDestination}
              >
                <SelectTrigger id="destination">
                  <SelectValue placeholder="Select Destination" />
                </SelectTrigger>
                <SelectContent>
                  {availableDestinations.map((dest) => (
                    <SelectItem key={dest} value={dest}>
                      {dest === selectedSupermarket ? `${dest} (Move to Display)` : dest}
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
              {selectedDestination === selectedSupermarket ? "Move to Display" : "Confirm Ship"}
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
        {/* LEFT COLUMN */}
        <div className="col-span-2 space-y-6">
          
          {/* 1. STORE DISPLAY SHOWCASE */}
          

          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-blue-900">Accepted Stock</CardTitle>
              </div>
              <CardDescription>Items currently on the floor for sale ({selectedSupermarket})</CardDescription>
            </CardHeader>
            <CardContent>
              {displayInventory.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground bg-white/50 rounded border border-dashed">
                  No items on display. Move items from storage here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {displayInventory.map((item: any) => (
                      <div key={item.id} className="flex flex-col p-3 bg-white rounded shadow-sm border border-blue-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-blue-800">{item.product_name}</span>
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-0">On Shelf</Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Quantity: <span className="font-medium">{item.quantity}</span></p>
                          <p>Price: Rs.{item.price_per_unit}</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="mt-3 text-xs w-full border border-dashed hover:bg-blue-50"
                          onClick={() => openShipModal(item)}
                        >
                          Relocate
                        </Button>
                      </div>
                   ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. DEMAND & TRENDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Currently in Demand</CardTitle>
                <CardDescription>Last 7 days sales</CardDescription>
              </CardHeader>
              <CardContent>
                {recentDemand.length === 0 ? <p>No data</p> : (
                  <ol className="list-decimal ml-5 space-y-1">
                    {recentDemand.map((i: any, idx: number) => (
                      <li key={idx} className="text-sm">{i.product_name} — <strong>{i.total}</strong></li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Trending Products</CardTitle></CardHeader>
              <CardContent>
                {trending.map((t: any, i: number) => (
                  <div className="flex justify-between py-1 text-sm" key={i}>
                    <span>{t.product_name}</span>
                    <span className="font-semibold">{t.total}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* 3. PREDICTION */}
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

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          
          {/* STORAGE INVENTORY (Was Accepted Inventory) */}
          


          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                <CardTitle>Incoming Stock</CardTitle>
              </div>
              <CardDescription>Inventory available for shipping or display</CardDescription>
            </CardHeader>
            <CardContent>
              {storageInventory.length === 0 ? <p className="text-muted-foreground text-sm">No items in storage.</p> : storageInventory.map((item: any) => (
                <div key={item.id} className="flex flex-col p-3 bg-muted/30 rounded mb-2 border">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} units • {item.category}</p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="mt-2 h-8" 
                    onClick={() => openShipModal(item)}
                  >
                    <Send className="w-3 h-3 mr-2" /> Move / Ship
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? <p className="text-sm">No expiring items</p> : expiringSoon.map((it) => (
                <div key={it.id} className="p-3 bg-destructive/5 rounded mb-2 flex justify-between items-center border border-destructive/20">
                  <div>
                    <p className="font-medium text-destructive text-sm">{it.product_name}</p>
                    <p className="text-xs">{it.quantity} units</p>
                  </div>
                  <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => openShipModal(it)}>
                    Action
                  </Button>
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