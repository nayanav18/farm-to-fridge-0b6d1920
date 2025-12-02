// src/components/SupermarketDashboard.tsx
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
import { Check, Send, X } from "lucide-react";

import PredictionChart from "@/components/PredictionChart";
import UniversalPool from "@/components/UniversalPool";

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];

const CSV_MAP: Record<string, string> = {
  "Supermarket A": "/data/supermarket_A.csv",
  "Supermarket B": "/data/supermarket_B.csv",
  "Supermarket C": "/data/supermarket_C.csv",
};

export default function SupermarketDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSupermarket, setSelectedSupermarket] = useState("Supermarket A");
  const [selectedProduct, setSelectedProduct] = useState("");

  // ------------------------
  // LOAD CSV (TRENDING + DEMAND)
  // ------------------------
  const [csvData, setCsvData] = useState<any[]>([]);

  useEffect(() => {
    const file = CSV_MAP[selectedSupermarket];
    if (!file) return;

    Papa.parse(file, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => setCsvData(res.data),
    });
  }, [selectedSupermarket]);

  // -------------------------
  // CURRENTLY IN DEMAND (7 DAYS)
  // -------------------------
  const demand7Days = useMemo(() => {
    if (csvData.length === 0) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const grouped: Record<string, number> = {};

    csvData.forEach((row) => {
      const d = new Date(row.Date);
      if (d < cutoff) return;

      const qty = Number(row.Quantity_Sold || 0);
      if (!grouped[row.Product_Name]) grouped[row.Product_Name] = 0;
      grouped[row.Product_Name] += qty;
    });

    return Object.entries(grouped)
      .map(([product_name, total]) => ({ product_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [csvData]);

  // -------------------------
  // TRENDING PRODUCTS (CSV)
  // -------------------------
  const trending = useMemo(() => {
    if (csvData.length === 0) return [];

    const grouped: Record<string, number> = {};

    csvData.forEach((row) => {
      const qty = Number(row.Quantity_Sold || 0);
      if (!grouped[row.Product_Name]) grouped[row.Product_Name] = 0;
      grouped[row.Product_Name] += qty;
    });

    return Object.entries(grouped)
      .map(([product_name, total]) => ({ product_name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [csvData]);

  // -------------------------
  // SUPABASE: INCOMING
  // -------------------------
  const { data: incomingData } = useQuery({
    queryKey: ["incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("transfer_date", "is", null)
        .is("date", null); // ❗ MUST BE NULL, else accepted

      if (error) throw error;
      return data ?? [];
    },
  });

  const incoming = incomingData || [];

  // -------------------------
  // SUPABASE: ACCEPTED INVENTORY
  // -------------------------
  const { data: acceptedData } = useQuery({
    queryKey: ["inventory", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("date", "is", null);

      if (error) throw error;
      return data ?? [];
    },
  });

  const acceptedStock = acceptedData || [];

  // -------------------------
  // ACCEPT BUTTON
  // -------------------------
  const handleAccept = async (id: string) => {
    await supabase
      .from("supermarket_stock")
      .update({
        date: new Date().toISOString(), // accepted timestamp
      })
      .eq("id", id);

    qc.invalidateQueries();
    toast({ title: "Accepted", description: "Item added to inventory." });
  };

  // -------------------------
  // REJECT BUTTON
  // -------------------------
  const handleReject = async (id: string) => {
    await supabase.from("supermarket_stock").delete().eq("id", id);
    qc.invalidateQueries();
  };

  // -------------------------
  // EXPIRING SOON
  // -------------------------
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return acceptedStock.filter((it: any) => {
      const diff =
        (new Date(it.expiry_date).getTime() - now) /
        (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 5;
    });
  }, [acceptedStock]);

  // -------------------------
  // SHIP TO LOCAL MARKET
  // -------------------------
  const handleShipToLocal = async (item: any) => {
    const choice = prompt("Send to which Local Market?", "Local Market A");
    if (!choice) return;

    await supabase.from("localmarket_stock").insert([
      {
        ...item,
        company_name: choice,
        transfer_date: new Date().toISOString(),
        accepted_at: null,
      },
    ]);

    await supabase.from("supermarket_stock").delete().eq("id", item.id);
    qc.invalidateQueries();
  };

  // -------------------------
  // RENDER UI
  // -------------------------
  return (
    <div className="space-y-6 p-4">
      {/* SELECT SUPERMARKET */}
      <div className="flex items-center gap-4">
        <h3>Select Supermarket:</h3>
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
        {/* LEFT SECTION */}
        <div className="lg:col-span-2 space-y-6">
          {/* CURRENTLY IN DEMAND */}
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {demand7Days.length === 0 ? (
                <p>No data</p>
              ) : (
                <ol className="list-decimal pl-5">
                  {demand7Days.map((d, i) => (
                    <li key={i}>
                      {d.product_name} — {d.total}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* INCOMING STOCK */}
          <Card>
            <CardHeader>
              <CardTitle>Incoming Stock</CardTitle>
            </CardHeader>
            <CardContent>
              {incoming.length === 0 ? (
                <p>No incoming stock</p>
              ) : (
                incoming.map((item: any) => (
                  <div key={item.id} className="flex justify-between p-3 bg-muted rounded mb-2">
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleAccept(item.id)}>
                        <Check /> Accept
                      </Button>
                      <Button variant="destructive" onClick={() => handleReject(item.id)}>
                        <X /> Reject
                      </Button>
                    </div>
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
                className="w-full p-2 border rounded mb-4"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product</option>
                {[...new Set(csvData.map((r) => r.Product_Name))].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>

              <PredictionChart csvData={csvData} productName={selectedProduct} />
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedSupermarket} />
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-6">
          {/* ACCEPTED INVENTORY */}
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {acceptedStock.length === 0 ? (
                <p>No inventory</p>
              ) : (
                acceptedStock.map((item) => (
                  <div key={item.id} className="flex justify-between p-3 bg-muted rounded mb-2">
                    <div>
                      <p>{item.product_name}</p>
                      <p className="text-xs">{item.quantity} units</p>
                    </div>
                    <Button variant="outline" onClick={() => handleShipToLocal(item)}>
                      <Send />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* EXPIRING SOON */}
          <Card className="border-red-400">
            <CardHeader>
              <CardTitle className="text-red-600">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p>No expiring items</p>
              ) : (
                expiringSoon.map((it: any) => (
                  <div key={it.id} className="p-3 bg-red-100 rounded mb-2 flex justify-between">
                    <div>
                      <p className="font-semibold">{it.product_name}</p>
                      <p className="text-xs">{it.quantity} units</p>
                    </div>
                    <Button size="sm" onClick={() => handleShipToLocal(it)}>
                      Send
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* TRENDING */}
          <Card>
            <CardHeader>
              <CardTitle>Trending Products</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? (
                <p>No data</p>
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
