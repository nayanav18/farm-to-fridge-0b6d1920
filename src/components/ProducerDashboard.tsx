// src/components/ProducerDashboard.tsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Upload, Package } from "lucide-react";

/* Small helpers and options */
const CATEGORY_OPTIONS = ["Vegetables", "Fruits", "Dairy", "Grains", "Meat", "Beverages", "Packaged", "Other"];
const STORAGE_TEMPS = ["Frozen", "Chilled", "Ambient"];

const DEFAULT_FORM = {
  product_name: "",
  category: CATEGORY_OPTIONS[0],
  quantity: "",
  price_per_unit: "",
  shelf_life_days: "",
  manufacturing_date: "",
  expiry_date: "",
  storage_temperature: STORAGE_TEMPS[2],
  company_name: "",
  is_perishable: false,
};

const genRandomProductId = () => Math.floor(100000 + Math.random() * 900000); // 6-digit
const genLotId = () => `LOT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

const ProducerDashboard: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: producerStock = [], isLoading } = useQuery({
    queryKey: ["producer-stock"],
    queryFn: async () => {
      const res = await supabase.from("producer_stock").select("*").order("created_at", { ascending: false });
      if ((res as any)?.error) throw (res as any).error;
      return ((res as any)?.data ?? []) as any[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: any) => {
      // Cast to any to avoid strict Postgrest overload errors in TS
      const res = await (supabase as any).from("producer_stock").insert([payload]);
      if (res?.error) throw res.error;
      return res;
    },
    onSuccess: () => {
      toast({ title: "Stock uploaded", description: "Producer stock added." });
      queryClient.invalidateQueries({ queryKey: ["producer-stock"] });
      setForm(DEFAULT_FORM);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err?.message ?? "Unknown", variant: "destructive" });
    },
  });

  const handleChange = (key: keyof typeof DEFAULT_FORM, value: string | boolean) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();

    if (!form.product_name.trim()) {
      toast({ title: "Validation", description: "Product name required", variant: "destructive" });
      return;
    }
    const qty = Number(form.quantity);
    const price = Number(form.price_per_unit);
    if (!qty || qty <= 0) {
      toast({ title: "Validation", description: "Invalid quantity", variant: "destructive" });
      return;
    }
    if (!price || isNaN(price)) {
      toast({ title: "Validation", description: "Invalid price", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const payload = {
      // auto-generate required DB fields
      product_id: genRandomProductId(),
      product_name: form.product_name.trim(),
      category: form.category,
      company_name: form.company_name.trim() || "Producer",
      is_perishable: !!form.is_perishable,
      shelf_life_days: Number(form.shelf_life_days) || 0,
      storage_temperature: form.storage_temperature,
      lot_id: genLotId(),
      stock_batch_quantity: qty,
      quantity_stocked: qty,
      manufacturing_date: form.manufacturing_date || new Date().toISOString().slice(0, 10),
      expiry_date: form.expiry_date || new Date(Date.now() + (Number(form.shelf_life_days || 0) * 24 * 60 * 60 * 1000)).toISOString().slice(0,10),
      price_per_unit: price,
      date: new Date().toISOString().slice(0, 10),
    };

    try {
      await uploadMutation.mutateAsync(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="bg-primary text-primary-foreground rounded-t-md p-6">
          <div className="flex items-center gap-3">
            <Upload className="h-6 w-6" />
            <div>
              <CardTitle className="text-lg text-primary-foreground">Upload Stock</CardTitle>
              <CardDescription className="text-primary-foreground/90">Auto-generated product & lot IDs — improved green UI</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="bg-primary/5 p-6 rounded-b-md">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Product Name</Label>
              <Input value={form.product_name} onChange={(e) => handleChange("product_name", e.target.value)} placeholder="e.g. Tomatoes" />
            </div>

            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => handleChange("category", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => handleChange("quantity", e.target.value)} placeholder="Units" />
            </div>

            <div>
              <Label>Price per Unit (₹)</Label>
              <Input type="number" step="0.01" value={form.price_per_unit} onChange={(e) => handleChange("price_per_unit", e.target.value)} placeholder="e.g. 2.50" />
            </div>

            <div>
              <Label>Shelf Life (days)</Label>
              <Input type="number" value={form.shelf_life_days} onChange={(e) => handleChange("shelf_life_days", e.target.value)} />
            </div>

            <div>
              <Label>Manufacturing Date</Label>
              <Input type="date" value={form.manufacturing_date} onChange={(e) => handleChange("manufacturing_date", e.target.value)} />
            </div>

            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => handleChange("expiry_date", e.target.value)} />
            </div>

            <div>
              <Label>Storage Temperature</Label>
              <Select value={form.storage_temperature} onValueChange={(v) => handleChange("storage_temperature", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_TEMPS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name} onChange={(e) => handleChange("company_name", e.target.value)} placeholder="Producer / Farm" />
            </div>

            <div className="md:col-span-2 flex items-center gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={form.is_perishable} onChange={(e) => handleChange("is_perishable", e.target.checked)} />
                <span>Is perishable?</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={submitting}>
                {submitting ? "Uploading..." : "Upload Stock"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5" />
            <div>
              <CardTitle>Stock History</CardTitle>
              <CardDescription>Recently uploaded producer batches</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center">Loading...</div>
          ) : producerStock.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No stock uploaded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Storage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {producerStock.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell>{row.quantity_stocked ?? row.stock_batch_quantity ?? "-"}</TableCell>
                      <TableCell>₹{Number(row.price_per_unit ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : "N/A"}</TableCell>
                      <TableCell>{row.company_name}</TableCell>
                      <TableCell>{row.storage_temperature}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProducerDashboard;
