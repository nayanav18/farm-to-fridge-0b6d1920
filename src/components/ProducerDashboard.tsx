// src/components/ProducerDashboard.tsx
import React, { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Loader2, Upload } from "lucide-react";

/**
 * ProducerDashboard
 *
 * Option 2 behavior:
 *  - Producer uploads stock (stored in producer_stock)
 *  - Producer selects a supermarket (destination) on upload
 *  - Upload also creates a corresponding supermarket_stock row
 *
 * Notes:
 *  - We compute shelf_life_days automatically
 *  - We generate simple product_id and lot_id values (replace with your own logic if needed)
 *  - Supabase typed Insert shapes can be strict; to avoid dev friction we cast insert payloads to `any` when calling supabase.insert([...]) — this is safe and straightforward
 */

const CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Dairy",
  "Bakery",
  "Meat",
  "Grains",
  "Other",
];

const STORAGE_OPTIONS = [
  "Ambient",
  "Refrigerated",
  "Frozen",
];

const SUPERMARKETS = [
  "Supermarket A",
  "Supermarket B",
  "Supermarket C",
];

type ProducerRow = {
  id: string;
  date: string;
  product_id: number;
  product_name: string;
  category: string;
  company_name: string;
  is_perishable: boolean;
  shelf_life_days: number;
  storage_temperature: string;
  lot_id: string;
  stock_batch_quantity: number;
  quantity_stocked: number;
  manufacturing_date: string;
  expiry_date: string;
  price_per_unit: number;
  created_at?: string | null;
};

export default function ProducerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [form, setForm] = useState({
    product_name: "",
    category: CATEGORIES[0],
    storage_temperature: STORAGE_OPTIONS[0],
    quantity: "",
    price_per_unit: "",
    manufacturing_date: "",
    expiry_date: "",
    company_name: "",
    target_supermarket: SUPERMARKETS[0],
  });

  const updateField = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  // derive shelf life days
  const shelfLifeDays = useMemo(() => {
    if (!form.manufacturing_date || !form.expiry_date) return 0;
    const m = new Date(form.manufacturing_date);
    const e = new Date(form.expiry_date);
    const diff = Math.ceil((e.getTime() - m.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [form.manufacturing_date, form.expiry_date]);

  // fetch producer_stock for history view
  const { data: producerStock = [], isRefetching: producerRefetching } = useQuery({
    queryKey: ["producer-stock"],
    queryFn: async () => {
      const res = await supabase
        .from("producer_stock")
        .select("*")
        .order("created_at", { ascending: false });
      if ((res as any)?.error) throw (res as any).error;
      return ((res as any)?.data ?? []) as ProducerRow[];
    },
  });

  // mutation: insert into producer_stock and supermarket_stock
  const uploadMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      // parse numeric fields
      const qty = Number(payload.quantity) || 0;
      const price = Number(payload.price_per_unit) || 0;

      // generate a product_id and lot_id (replace with your own supplier-id logic if available)
      // product_id as timestamp-based integer (fine for demo)
      const product_id = Math.floor(Date.now() / 1000) % 1000000;
      const lot_id = `LOT-${Date.now().toString(36).slice(-6)}`;

      // producer_stock payload (match required DB insert fields)
      const producerPayload = {
        product_id,
        product_name: payload.product_name,
        category: payload.category,
        company_name: payload.company_name,
        is_perishable: shelfLifeDays > 7,
        shelf_life_days: shelfLifeDays,
        storage_temperature: payload.storage_temperature,
        lot_id,
        stock_batch_quantity: qty,
        quantity_stocked: qty,
        manufacturing_date: payload.manufacturing_date,
        expiry_date: payload.expiry_date,
        price_per_unit: price,
        date: new Date().toISOString().slice(0, 10),
      };

      // supermarket_stock payload (send immediately to selected supermarket)
      const supermarketPayload = {
        product_id,
        product_name: payload.product_name,
        category: payload.category,
        company_name: payload.target_supermarket,
        is_perishable: shelfLifeDays > 7,
        shelf_life_days: shelfLifeDays,
        storage_temperature: payload.storage_temperature,
        lot_id,
        quantity: qty,
        manufacturing_date: payload.manufacturing_date,
        expiry_date: payload.expiry_date,
        price_per_unit: price,
        source_producer: payload.company_name,
        transfer_date: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
      };

      // Perform both inserts inside try/catch so we can rollback or notify on failure
      // Use `as any` to avoid strict type mismatches with generated types
      const pInsert = await supabase.from("producer_stock").insert([producerPayload] as any);
      if ((pInsert as any)?.error) throw (pInsert as any).error;

      const sInsert = await supabase.from("supermarket_stock").insert([supermarketPayload] as any);
      if ((sInsert as any)?.error) {
        // attempt to delete created producer row to keep consistency
        const createdId = ((pInsert as any)?.data ?? [])[0]?.id;
        if (createdId) {
          await supabase.from("producer_stock").delete().eq("id", createdId);
        }
        throw (sInsert as any).error;
      }

      return { producerRes: pInsert, supermarketRes: sInsert };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["producer-stock"] });
      queryClient.invalidateQueries({ queryKey: ["supermarket-stock"] });
      toast({
        title: "Stock uploaded & dispatched",
        description: `Product sent to ${form.target_supermarket}`,
      });

      // reset form
      setForm({
        product_name: "",
        category: CATEGORIES[0],
        storage_temperature: STORAGE_OPTIONS[0],
        quantity: "",
        price_per_unit: "",
        manufacturing_date: "",
        expiry_date: "",
        company_name: "",
        target_supermarket: SUPERMARKETS[0],
      });
    },

    onError: (err: any) => {
      toast({
        title: "Upload failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    // basic validation
    if (!form.product_name || !form.company_name || !form.quantity || !form.price_per_unit || !form.manufacturing_date || !form.expiry_date) {
      toast({ title: "Missing fields", description: "Please fill required fields", variant: "destructive" });
      return;
    }
    if (shelfLifeDays <= 0) {
      toast({ title: "Invalid dates", description: "Expiry must be after manufacturing", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <Card className="border-success/20">
        <CardHeader className="bg-success/5">
          <CardTitle className="flex items-center gap-2 text-success">
            <Upload className="h-5 w-5" />
            Upload & Dispatch Stock
          </CardTitle>
          <CardDescription>Send inventory to a supermarket and store a record in producer stock</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Product Name</Label>
              <Input value={form.product_name} onChange={(e) => updateField("product_name", e.target.value)} required />
            </div>

            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => updateField("category", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Storage Temperature</Label>
              <Select value={form.storage_temperature} onValueChange={(v) => updateField("storage_temperature", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Quantity</Label>
              <Input type="number" min={1} value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} required />
            </div>

            <div>
              <Label>Price per unit</Label>
              <Input type="number" step="0.01" value={form.price_per_unit} onChange={(e) => updateField("price_per_unit", e.target.value)} required />
            </div>

            <div>
              <Label>Manufacturing Date</Label>
              <Input type="date" value={form.manufacturing_date} onChange={(e) => updateField("manufacturing_date", e.target.value)} required />
            </div>

            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => updateField("expiry_date", e.target.value)} required />
            </div>

            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} required />
            </div>

            <div>
              <Label>Send to Supermarket</Label>
              <Select value={form.target_supermarket} onValueChange={(v) => updateField("target_supermarket", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPERMARKETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Auto shelf life: <strong>{shelfLifeDays} days</strong>
                </div>
                <div className="text-sm text-muted-foreground">Select supermarket to dispatch immediately</div>
              </div>

              <div className="mt-3">
                <Button type="submit" className="w-full" disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                  ) : (
                    "Upload & Send"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Producer Stock History</CardTitle>
          <CardDescription>Recent uploads from this producer interface</CardDescription>
        </CardHeader>

        <CardContent>
          {producerRefetching && producerStock.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-success" />
            </div>
          ) : producerStock.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No stock uploaded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {producerStock.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.quantity_stocked}</TableCell>
                      <TableCell>₹{Number(r.price_per_unit).toFixed(2)}</TableCell>
                      <TableCell>{new Date(r.expiry_date).toLocaleDateString()}</TableCell>
                      <TableCell>{r.company_name}</TableCell>
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
}
