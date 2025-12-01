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
import UniversalPool from "@/components/UniversalPool";

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

// MAP SUPERMARKET TO CSV FILE
const getCSVForMarket = (market: string) => {
  if (market.includes("A")) return "/data/supermarket_A.csv";
  if (market.includes("B")) return "/data/supermarket_B.csv";
  if (market.includes("C")) return "/data/supermarket_C.csv";
  return "/data/supermarket_A.csv";
};

export const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSupermarket, setSelectedSupermarket] = useState(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState("");

  // ------------------------------------------------------------
  // CSV LOADING FOR ANALYTICS
  // ------------------------------------------------------------
  const [csvData, setCsvData] = useState<any[]>([]);

  useEffect(() => {
    const file = getCSVForMarket(selectedSupermarket);

    const load = async () => {
      const res = await fetch(file);
      const text = await res.text();

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvData(results.data);
        },
      });
    };

    load();
  }, [selectedSupermarket]);

  // ------------------------------------------------------------
  // TRENDING PRODUCTS (TOP 10)
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
  // CURRENTLY IN DEMAND (LAST 14 DAYS)
  // ------------------------------------------------------------
  const recentDemand = useMemo(() => {
    if (!csvData.length) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const filtered = csvData.filter((row) => {
      const date = new Date(row.Date);
      return date >= cutoff;
    });

    const grouped = Object.values(
      filtered.reduce((acc: any, row: any) => {
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
  // SUPABASE LOGIC FOR INVENTORY / INCOMING
  // ------------------------------------------------------------

  // Incoming = transfer_date exists AND date is null
  const { data: incomingData } = useQuery({
    queryKey: ["incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .is("date", null)
        .not("transfer_date", "is", null);

      if (error) throw error;
      return data ?? [];
    },
  });

  const [incoming, setIncoming] = useState<any[]>([]);
  useEffect(() => setIncoming(incomingData || []), [incomingData]);

  // Accepted = date IS NOT NULL
  const { data: inventoryData } = useQuery({
    queryKey: ["inventory", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("date", "is", null)
        .order("date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const [inventory, setInventory] = useState<any[]>([]);
  useEffect(() => setInventory(inventoryData || []), [inventoryData]);

  // ------------------------------------------------------------
  // ACCEPT ITEM
  // ------------------------------------------------------------
  const handleAccept = async (id: string) => {
    await supabase
      .from("supermarket_stock")
      .update({ date: new Date().toISOString() })
      .eq("id", id);

    setIncoming((prev) => prev.filter((i) => i.id !== id));
    qc.invalidateQueries();
  };

  // ------------------------------------------------------------
  // REJECT ITEM
  // ------------------------------------------------------------
  const handleReject = async (id: string) => {
    await supabase.from("supermarket_stock").delete().eq("id", id);
    setIncoming((prev) => prev.filter((i) => i.id !== id));
  };

  // ------------------------------------------------------------
  // SHIP TO LOCAL MARKET
  // ------------------------------------------------------------
  const handleShipToLocal = async (item: any) => {
    const choice = prompt("Send to:", LOCAL_MARKETS[0]);
    if (!choice) return;

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
    };

    await supabase.from("localmarket_stock").insert([payload]);
    await supabase.from("supermarket_stock").delete().eq("id", item.id);
    setInventory((prev) => prev.filter((i) => i.id !== item.id));
  };

  // ------------------------------------------------------------
  // EXPIRING SOON
  // ------------------------------------------------------------
  const expiringSoon = useMemo(() => {
    const now = Date.now();

    return inventory
      .filter((it: any) => {
        const diff =
          (new Date(it.expiry_date).getTime() - now) /
          (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      })
      .slice(0, 10);
  }, [inventory]);

  // ------------------------------------------------------------
  // RENDER UI
  // ------------------------------------------------------------

  return (
    <div className="space-y-6 p-4">
      {/* SELECT SUPERMARKET */}
      <div className="flex gap-4 items-center">
        <h3>Select Supermarket:</h3>
        <select
          value={selectedSupermarket}
          onChange={(e) => setSelectedSupermarket(e.target.value)}
          className="p-2 rounded border"
        >
          {SUPERMARKETS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT SIDE */}
        <div className="lg:col-span-2 space-y-6">

          {/* CURRENTLY IN DEMAND */}
          <Card>
            <CardHeader>
              <CardTitle>Currently in Demand (last 14 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {recentDemand.length === 0 ? (
                <p>No data</p>
              ) : (
                <ol className="list-decimal ml-5">
                  {recentDemand.map((i: any, idx) => (
                    <li key={idx}>
                      {i.product_name} — {i.total}
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
                      <Button onClick={() => handleAccept(item.id)}><Check /></Button>
                      <Button variant="destructive" onClick={() => handleReject(item.id)}><X /></Button>
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
                className="w-full border p-2 rounded mb-4"
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
              {inventory.length === 0 ? (
                <p>No inventory</p>
              ) : (
                inventory.map((item) => (
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
          <Card>
            <CardHeader>
              <CardTitle>Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p>No expiring items</p>
              ) : (
                expiringSoon.map((it) => (
                  <div key={it.id} className="p-3 bg-red-100 rounded mb-2 flex justify-between">
                    <div>
                      <p className="font-semibold text-red-600">{it.product_name}</p>
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

          {/* TRENDING PRODUCTS */}
          <Card>
            <CardHeader>
              <CardTitle>Trending Products</CardTitle>
            </CardHeader>
            <CardContent>
              {trending.length === 0 ? (
                <p>No data</p>
              ) : (
                trending.map((item: any, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>{item.product_name}</span>
                    <span className="font-bold">{item.total}</span>
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
