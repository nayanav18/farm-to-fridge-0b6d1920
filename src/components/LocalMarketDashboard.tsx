// src/components/LocalMarketDashboard.tsx
import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";

import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  ShoppingCart,
  AlertTriangle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import PredictionChart from "@/components/PredictionChart";
import UniversalPool from "@/components/UniversalPool";

// ----------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const getCSVForLocalMarket = (market: string) => {
  if (market.includes("A")) return "/data/localmarket_A.csv";
  if (market.includes("B")) return "/data/localmarket_B.csv";
  return "/data/localmarket_A.csv";
};

export default function LocalMarketDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedLocalMarket, setSelectedLocalMarket] = useState(LOCAL_MARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [saleItem, setSaleItem] = useState<any | null>(null);
  const [saleQty, setSaleQty] = useState("");

  // ------------------------------------------------------------
  // LOAD LOCAL MARKET CSV
  // ------------------------------------------------------------
  const [csvData, setCsvData] = useState<any[]>([]);

  useEffect(() => {
    const file = getCSVForLocalMarket(selectedLocalMarket);

    const load = async () => {
      const res = await fetch(file);
      const text = await res.text();

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => setCsvData(results.data),
      });
    };

    load();
  }, [selectedLocalMarket]);

  // ------------------------------------------------------------
  // CSV-BASED TRENDING (TOP 10 by Quantity_Sold)
  // ------------------------------------------------------------
  const trending = useMemo(() => {
    if (!csvData.length) return [];

    const grouped = Object.values(
      csvData.reduce((acc: any, row: any) => {
        const name = row.Product_Name;
        const sold = Number(row.Quantity_Sold || 0);

        if (!acc[name]) acc[name] = { product_name: name, total: 0 };
        acc[name].total += sold;
        return acc;
      }, {})
    ).sort((a: any, b: any) => b.total - a.total);

    return grouped.slice(0, 10);
  }, [csvData]);

  // ------------------------------------------------------------
  // CSV-BASED DEMAND PREDICTION PRODUCTS LIST
  // ------------------------------------------------------------
  const productList = Array.from(new Set(csvData.map((r) => r.Product_Name)));

  // ------------------------------------------------------------
  // SUPABASE: PENDING TRANSFERS
  // ------------------------------------------------------------
  const { data: pendingData } = useQuery({
    queryKey: ["localmarket-pending", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .is("accepted_at", null);

      if (error) throw error;
      return data ?? [];
    },
  });

  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  useEffect(() => setPendingTransfers(pendingData ?? []), [pendingData]);

  // ------------------------------------------------------------
  // SUPABASE: ACCEPTED STOCK
  // ------------------------------------------------------------
  const { data: acceptedData } = useQuery({
    queryKey: ["localmarket-accepted", selectedLocalMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .eq("company_name", selectedLocalMarket)
        .not("accepted_at", "is", null);

      if (error) throw error;
      return data ?? [];
    },
  });

  const [acceptedStock, setAcceptedStock] = useState<any[]>([]);
  useEffect(() => setAcceptedStock(acceptedData ?? []), [acceptedData]);

  // ------------------------------------------------------------
  // ACCEPT TRANSFER
  // ------------------------------------------------------------
  const handleAcceptTransfer = async (id: string) => {
    await supabase
      .from("localmarket_stock")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", id);

    setPendingTransfers((prev) => prev.filter((p) => p.id !== id));
    qc.invalidateQueries();
  };

  // ------------------------------------------------------------
  // EXPIRING SOON: NEXT 3 DAYS
  // ------------------------------------------------------------
  const expiringSoon = useMemo(() => {
    const now = Date.now();

    return acceptedStock.filter((row: any) => {
      const diff =
        (new Date(row.expiry_date).getTime() - now) /
        (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    });
  }, [acceptedStock]);

  // ------------------------------------------------------------
  // LOG SALE
  // ------------------------------------------------------------
  const handleLogSale = async () => {
    if (!saleItem) return;

    const qty = Number(saleQty);
    if (qty <= 0 || qty > saleItem.quantity) {
      toast({
        title: "Invalid quantity",
        variant: "destructive",
      });
      return;
    }

    const remaining = saleItem.quantity - qty;

    if (remaining > 0) {
      await supabase
        .from("localmarket_stock")
        .update({ quantity: remaining })
        .eq("id", saleItem.id);
    } else {
      await supabase
        .from("localmarket_stock")
        .delete()
        .eq("id", saleItem.id);
    }

    qc.invalidateQueries();
    setSaleItem(null);
    setSaleQty("");
  };

  // ------------------------------------------------------------
  // SEND FROM LOCAL -> ANOTHER PLACE
  // ------------------------------------------------------------
  const handleSendFromLocal = async (item: any) => {
    const target = prompt(
      "Send to:\nlocal:Local Market B\nsupermarket:Supermarket A"
    );

    if (!target) return;

    const [type, name] = target.split(":");
    if (!type || !name) return alert("Invalid format.");

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
      price_per_unit: item.price_per_unit,
      source_supermarket: selectedLocalMarket,
      transfer_date: new Date().toISOString(),
    };

    if (type === "local") {
      await supabase.from("localmarket_stock").insert([payload]);
    } else {
      await supabase.from("supermarket_stock").insert([payload]);
    }

    await supabase.from("localmarket_stock").delete().eq("id", item.id);
    qc.invalidateQueries();
  };

  // ------------------------------------------------------------
  // RENDER UI
  // ------------------------------------------------------------
  return (
    <div className="space-y-6 p-4">

      {/* SELECT LOCAL MARKET */}
      <div className="flex gap-4 items-center">
        <h3>Select Local Market:</h3>
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
        
        {/* LEFT SIDE */}
        <div className="lg:col-span-2 space-y-6">

          {/* PENDING TRANSFERS */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingTransfers.length === 0 ? (
                <p>No pending transfers.</p>
              ) : (
                pendingTransfers.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between p-3 bg-muted rounded mb-2"
                  >
                    <div>
                      <p className="font-semibold">{p.product_name}</p>
                      <p className="text-xs">{p.quantity} units</p>
                    </div>

                    <Button onClick={() => handleAcceptTransfer(p.id)}>
                      <CheckCircle />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* DEMAND PREDICTION */}
          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="">Select product</option>
                {productList.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>

              <PredictionChart csvData={csvData} productName={selectedProduct} />
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedLocalMarket} />
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-6">

          {/* EXPIRING SOON */}
          <Card>
            <CardHeader>
              <CardTitle>Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p>No expiring items</p>
              ) : (
                expiringSoon.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-red-100 flex justify-between rounded mb-2"
                  >
                    <div>
                      <p className="text-red-600 font-bold">
                        {item.product_name}
                      </p>
                      <p className="text-xs">{item.quantity} units</p>
                    </div>
                    <Button size="sm" onClick={() => handleSendFromLocal(item)}>
                      Send
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* INVENTORY */}
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptedStock.length === 0 ? (
                <p>No stock</p>
              ) : (
                acceptedStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between p-3 bg-muted rounded mb-2"
                  >
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units</p>
                    </div>
                    <Button variant="outline" onClick={() => setSaleItem(item)}>
                      Log Sale
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* TRENDING FROM CSV */}
          <Card>
            <CardHeader>
              <CardTitle>Trending Products (CSV)</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? (
                <p>No data</p>
              ) : (
                trending.map((t: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>{t.product_name}</span>
                    <span className="font-bold">{t.total}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* SALE DIALOG */}
      <Dialog open={!!saleItem} onOpenChange={() => setSaleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Log Sale – {saleItem?.product_name}
            </DialogTitle>
          </DialogHeader>

          <Input
            type="number"
            placeholder="Quantity"
            value={saleQty}
            onChange={(e) => setSaleQty(e.target.value)}
            className="mb-4"
          />

          <Button className="w-full" onClick={handleLogSale}>
            Confirm Sale
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
